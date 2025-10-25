const WebSocket = require('ws');
const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');

const PORT = process.env.PORT || 8080;

// Create HTTP server that serves static files
const server = http.createServer((req, res) => {
    const parsedUrl = url.parse(req.url, true);
    const pathname = parsedUrl.pathname;
    const query = parsedUrl.query;

    console.log('HTTP Request:', req.url);

    // API endpoint to check if a user is presenting
    if (pathname === '/api/is-presenting') {
        const userId = query.userId;
        if (!userId) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'userId parameter required' }));
            return;
        }

        const roomId = `room_${userId}`;
        const room = rooms.get(roomId);
        const isPresenting = room && room.presenter !== null;
        const viewerCount = room ? room.users.size : 0;
        let username = null;

        if (isPresenting && room) {
            const presenter = room.users.get(room.presenter);
            if (presenter) username = presenter.username;
        }

        res.writeHead(200, { 
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
        });
        res.end(JSON.stringify({
            userId,
            username,
            isPresenting,
            roomId,
            viewerCount: isPresenting ? viewerCount : 0
        }));
        return;
    }

    // API endpoint to list all active presenters
    if (pathname === '/api/active-presenters') {
        const activePresenters = [];
        rooms.forEach((room, roomId) => {
            if (room.presenter) {
                const presenter = room.users.get(room.presenter);
                if (presenter) {
                    const userId = roomId.replace('room_', '');
                    activePresenters.push({
                        userId,
                        username: presenter.username,
                        roomId,
                        viewerCount: room.users.size
                    });
                }
            }
        });

        res.writeHead(200, { 
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
        });
        res.end(JSON.stringify({
            count: activePresenters.length,
            presenters: activePresenters
        }));
        return;
    }

    // CORS preflight
    if (req.method === 'OPTIONS') {
        res.writeHead(200, {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type'
        });
        res.end();
        return;
    }

    // Static file serving
    let filePath;
    if (pathname === '/' || pathname === '/index.html') {
        filePath = path.join(__dirname, 'index.html');
    } else if (pathname === '/client.js') {
        filePath = path.join(__dirname, 'client.js');
    } else {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('404 Not Found');
        return;
    }

    fs.readFile(filePath, (err, data) => {
        if (err) {
            console.error('Error reading file:', err);
            res.writeHead(500, { 'Content-Type': 'text/plain' });
            res.end('500 Internal Server Error');
            return;
        }

        const ext = path.extname(filePath);
        const contentType = ext === '.html'
            ? 'text/html'
            : ext === '.js'
            ? 'application/javascript'
            : 'text/plain';

        res.writeHead(200, { 'Content-Type': contentType });
        res.end(data);
    });
});

// WebSocket server
const wss = new WebSocket.Server({ server });

// Data storage
const rooms = new Map(); // roomId -> { users: Map, presenter: userId, lastOffer }
const users = new Map(); // userId -> { ws, username, roomId, isPresenter }

// Utility
function generateId() {
    return Math.random().toString(36).substr(2, 9);
}

function broadcastToRoom(roomId, message, excludeUserId = null) {
    const room = rooms.get(roomId);
    if (!room) return;
    room.users.forEach((user, id) => {
        if (id !== excludeUserId && user.ws.readyState === WebSocket.OPEN) {
            user.ws.send(JSON.stringify(message));
        }
    });
}

function sendToUser(userId, message) {
    const user = users.get(userId);
    if (user && user.ws.readyState === WebSocket.OPEN) {
        user.ws.send(JSON.stringify(message));
    }
}

function getRoomUsersInfo(roomId) {
    const room = rooms.get(roomId);
    if (!room) return [];
    return Array.from(room.users.entries()).map(([id, user]) => ({
        userId: id,
        username: user.username,
        isPresenter: id === room.presenter
    }));
}

// WebSocket handlers
wss.on('connection', (ws) => {
    const userId = generateId();
    console.log(`New connection: ${userId}`);

    ws.on('message', (data) => {
        try {
            const msg = JSON.parse(data);
            handleMessage(ws, userId, msg);
        } catch (err) {
            console.error('Invalid message:', err);
        }
    });

    ws.on('close', () => handleDisconnect(userId));
    ws.on('error', (err) => console.error(`WebSocket error for ${userId}:`, err));
});

function handleMessage(ws, userId, message) {
    console.log(`Message from ${userId}:`, message.type);

    switch (message.type) {
        case 'join':
            handleJoin(ws, userId, message);
            break;

        case 'start-presenting':
            handleStartPresenting(userId, message);
            break;

        case 'stop-presenting':
            handleStopPresenting(userId, message);
            break;

        case 'offer': {
            const user = users.get(userId);
            if (user && user.isPresenter) {
                const room = rooms.get(user.roomId);
                if (room) room.lastOffer = message.offer; // cache latest offer
            }

            if (message.to) {
                sendToUser(message.to, { ...message, from: userId });
            } else {
                // broadcast offer to everyone else if no specific target
                const user = users.get(userId);
                if (user) {
                    broadcastToRoom(user.roomId, { ...message, from: userId }, userId);
                }
            }
            break;
        }

        case 'answer':
        case 'ice-candidate':
            if (message.to) {
                sendToUser(message.to, { ...message, from: userId });
            }
            break;

        default:
            console.log('Unknown message type:', message.type);
    }
}

function handleJoin(ws, userId, message) {
    const { roomId, username } = message;
    if (!roomId || !username) {
        ws.send(JSON.stringify({ type: 'error', message: 'Room ID and username required' }));
        return;
    }

    if (!rooms.has(roomId)) {
        rooms.set(roomId, { users: new Map(), presenter: null, lastOffer: null });
        console.log(`Room created: ${roomId}`);
    }

    const room = rooms.get(roomId);
    const user = { ws, username, roomId, isPresenter: false };

    room.users.set(userId, user);
    users.set(userId, user);

    console.log(`User ${username} (${userId}) joined ${roomId}`);

    ws.send(JSON.stringify({
        type: 'joined',
        roomId,
        userId,
        users: getRoomUsersInfo(roomId)
    }));

    broadcastToRoom(roomId, {
        type: 'user-joined',
        userId,
        username,
        users: getRoomUsersInfo(roomId)
    }, userId);

    // Notify about active presenter
    if (room.presenter) {
        const presenter = room.users.get(room.presenter);
        if (presenter) {
            ws.send(JSON.stringify({
                type: 'presenter-started',
                presenterId: room.presenter,
                presenterName: presenter.username
            }));
        }
    }

    // NEW: Send cached offer to new viewers
    if (room.presenter && room.lastOffer) {
        ws.send(JSON.stringify({
            type: 'offer',
            offer: room.lastOffer,
            from: room.presenter
        }));
        console.log(`📡 Sent cached offer to new viewer in ${roomId}`);
    }
}

function handleStartPresenting(userId, message) {
    const user = users.get(userId);
    if (!user) return;

    const { roomId } = message;
    const room = rooms.get(roomId);
    if (!room) return;

    if (room.presenter && room.presenter !== userId) {
        sendToUser(userId, {
            type: 'error',
            message: 'Another user is already presenting'
        });
        return;
    }

    room.presenter = userId;
    user.isPresenter = true;

    console.log(`User ${user.username} started presenting in ${roomId}`);

    broadcastToRoom(roomId, {
        type: 'presenter-started',
        presenterId: userId,
        presenterName: user.username
    });
}

function handleStopPresenting(userId, message) {
    const user = users.get(userId);
    if (!user) return;

    const { roomId } = message;
    const room = rooms.get(roomId);
    if (!room) return;

    if (room.presenter === userId) {
        room.presenter = null;
        room.lastOffer = null;
        user.isPresenter = false;

        console.log(`User ${user.username} stopped presenting in ${roomId}`);

        broadcastToRoom(roomId, {
            type: 'presenter-stopped',
            presenterId: userId
        });
    }
}

function handleDisconnect(userId) {
    const user = users.get(userId);
    if (!user) return;

    const { roomId, username, isPresenter } = user;
    const room = rooms.get(roomId);

    console.log(`User ${username} (${userId}) disconnected from ${roomId}`);

    if (room) {
        room.users.delete(userId);

        if (isPresenter && room.presenter === userId) {
            room.presenter = null;
            room.lastOffer = null;
            broadcastToRoom(roomId, {
                type: 'presenter-stopped',
                presenterId: userId
            });
        }

        broadcastToRoom(roomId, {
            type: 'user-left',
            userId,
            username,
            users: getRoomUsersInfo(roomId)
        });

        if (room.users.size === 0) {
            rooms.delete(roomId);
            console.log(`Room ${roomId} deleted (empty)`);
        }
    }

    users.delete(userId);
}

// Start server
server.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
    console.log(`HTTP: http://localhost:${PORT}`);
    console.log(`WebSocket: ws://localhost:${PORT}`);
});

// Graceful shutdown
process.on('SIGINT', () => {
    console.log('\nShutting down server...');
    wss.clients.forEach(c => c.close());
    server.close(() => {
        console.log('Server closed');
        process.exit(0);
    });
});
