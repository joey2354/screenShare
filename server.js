const WebSocket = require('ws');
const http = require('http');

const PORT = 8080;

// Create HTTP server
const server = http.createServer();

// Create WebSocket server
const wss = new WebSocket.Server({ server });

// Store rooms and users
const rooms = new Map(); // roomId -> { users: Map, presenter: userId }
const users = new Map(); // userId -> { ws, username, roomId, isPresenter }

// Generate unique ID
function generateId() {
    return Math.random().toString(36).substr(2, 9);
}

// Broadcast to all users in a room except sender
function broadcastToRoom(roomId, message, excludeUserId = null) {
    const room = rooms.get(roomId);
    if (!room) return;

    room.users.forEach((user, userId) => {
        if (userId !== excludeUserId && user.ws.readyState === WebSocket.OPEN) {
            user.ws.send(JSON.stringify(message));
        }
    });
}

// Send to specific user
function sendToUser(userId, message) {
    const user = users.get(userId);
    if (user && user.ws.readyState === WebSocket.OPEN) {
        user.ws.send(JSON.stringify(message));
    }
}

// Get room users info
function getRoomUsersInfo(roomId) {
    const room = rooms.get(roomId);
    if (!room) return [];

    return Array.from(room.users.entries()).map(([userId, user]) => ({
        userId,
        username: user.username,
        isPresenter: userId === room.presenter
    }));
}

// Handle WebSocket connections
wss.on('connection', (ws) => {
    const userId = generateId();
    console.log(`New connection: ${userId}`);

    ws.on('message', (data) => {
        try {
            const message = JSON.parse(data);
            handleMessage(ws, userId, message);
        } catch (error) {
            console.error('Error parsing message:', error);
        }
    });

    ws.on('close', () => {
        handleDisconnect(userId);
    });

    ws.on('error', (error) => {
        console.error(`WebSocket error for ${userId}:`, error);
    });
});

// Handle incoming messages
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

        case 'offer':
        case 'answer':
        case 'ice-candidate':
            // Forward signaling messages
            if (message.to) {
                sendToUser(message.to, {
                    ...message,
                    from: userId
                });
            }
            break;

        default:
            console.log('Unknown message type:', message.type);
    }
}

// Handle user joining a room
function handleJoin(ws, userId, message) {
    const { roomId, username } = message;

    if (!roomId || !username) {
        ws.send(JSON.stringify({
            type: 'error',
            message: 'Room ID and username are required'
        }));
        return;
    }

    // Create room if it doesn't exist
    if (!rooms.has(roomId)) {
        rooms.set(roomId, {
            users: new Map(),
            presenter: null
        });
        console.log(`Room created: ${roomId}`);
    }

    const room = rooms.get(roomId);

    // Add user to room
    const userInfo = {
        ws,
        username,
        roomId,
        isPresenter: false
    };

    room.users.set(userId, userInfo);
    users.set(userId, userInfo);

    console.log(`User ${username} (${userId}) joined room ${roomId}`);

    // Send confirmation to user
    ws.send(JSON.stringify({
        type: 'joined',
        roomId,
        userId,
        users: getRoomUsersInfo(roomId)
    }));

    // Notify others in room
    broadcastToRoom(roomId, {
        type: 'user-joined',
        userId,
        username,
        users: getRoomUsersInfo(roomId)
    }, userId);

    // If there's an active presenter, notify the new user
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
}

// Handle user starting to present
function handleStartPresenting(userId, message) {
    const user = users.get(userId);
    if (!user) return;

    const { roomId } = message;
    const room = rooms.get(roomId);
    
    if (!room) return;

    // Check if there's already a presenter
    if (room.presenter && room.presenter !== userId) {
        sendToUser(userId, {
            type: 'error',
            message: 'Another user is already presenting in this room'
        });
        return;
    }

    room.presenter = userId;
    user.isPresenter = true;

    console.log(`User ${user.username} started presenting in room ${roomId}`);

    // Notify all users in room
    broadcastToRoom(roomId, {
        type: 'presenter-started',
        presenterId: userId,
        presenterName: user.username
    });
}

// Handle user stopping presentation
function handleStopPresenting(userId, message) {
    const user = users.get(userId);
    if (!user) return;

    const { roomId } = message;
    const room = rooms.get(roomId);
    
    if (!room) return;

    if (room.presenter === userId) {
        room.presenter = null;
        user.isPresenter = false;

        console.log(`User ${user.username} stopped presenting in room ${roomId}`);

        // Notify all users in room
        broadcastToRoom(roomId, {
            type: 'presenter-stopped',
            presenterId: userId
        });
    }
}

// Handle user disconnect
function handleDisconnect(userId) {
    const user = users.get(userId);
    if (!user) return;

    const { roomId, username, isPresenter } = user;
    const room = rooms.get(roomId);

    console.log(`User ${username} (${userId}) disconnected from room ${roomId}`);

    if (room) {
        // Remove user from room
        room.users.delete(userId);

        // If presenter disconnected, clear presenter
        if (isPresenter && room.presenter === userId) {
            room.presenter = null;
            
            broadcastToRoom(roomId, {
                type: 'presenter-stopped',
                presenterId: userId
            });
        }

        // Notify others
        broadcastToRoom(roomId, {
            type: 'user-left',
            userId,
            username,
            users: getRoomUsersInfo(roomId)
        });

        // Delete room if empty
        if (room.users.size === 0) {
            rooms.delete(roomId);
            console.log(`Room ${roomId} deleted (empty)`);
        }
    }

    users.delete(userId);
}

// Start server
server.listen(PORT, () => {
    console.log(`🚀 Signaling server running on port ${PORT}`);
    console.log(`WebSocket URL: ws://localhost:${PORT}`);
});

// Handle server errors
server.on('error', (error) => {
    console.error('Server error:', error);
});

// Graceful shutdown
process.on('SIGINT', () => {
    console.log('\nShutting down server...');
    wss.clients.forEach(client => {
        client.close();
    });
    server.close(() => {
        console.log('Server closed');
        process.exit(0);
    });
});
