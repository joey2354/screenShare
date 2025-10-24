// WebSocket and WebRTC configuration
// Auto-detect WebSocket URL based on current page location
const WS_URL = window.location.protocol === 'https:' 
    ? `wss://${window.location.host}` 
    : `ws://${window.location.host}`;

const ICE_SERVERS = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
    ]
};

// Global variables
let ws = null;
let localStream = null;
let localAudioStream = null;
let peerConnections = {};
let roomId = null;
let username = null;
let isPresenter = false;
let userId = null;
let isMicActive = false;

// DOM elements
const usernameInput = document.getElementById('username');
const roomIdInput = document.getElementById('roomId');
const connectBtn = document.getElementById('connectBtn');
const shareBtn = document.getElementById('shareBtn');
const stopBtn = document.getElementById('stopBtn');
const micBtn = document.getElementById('micBtn');
const remoteVideo = document.getElementById('remoteVideo');
const remoteAudio = document.getElementById('remoteAudio');
const connectionStatus = document.getElementById('connectionStatus');
const roleStatus = document.getElementById('roleStatus');
const roomStatus = document.getElementById('roomStatus');
const viewerCount = document.getElementById('viewerCount');
const viewerList = document.getElementById('viewerList');
const viewerListContainer = document.getElementById('viewerListContainer');
const videoTitle = document.getElementById('videoTitle');

// Parse URL parameters on page load
window.addEventListener('DOMContentLoaded', () => {
    const urlParams = new URLSearchParams(window.location.search);
    const userIdParam = urlParams.get('userId');
    const actionParam = urlParams.get('action');
    const targetUserParam = urlParams.get('targetUser');

    if (userIdParam) {
        userId = userIdParam;
        username = `User_${userId}`;
        usernameInput.value = username;

        if (actionParam === 'create') {
            // Auto-create room for this user
            roomId = `room_${userId}`;
            roomIdInput.value = roomId;
            
            // Show message
            showAutoMessage(`Creating screen share room for User ${userId}...`);
            
            // Auto-connect after a brief delay
            setTimeout(() => {
                connectToRoom();
            }, 500);
        } else if (actionParam === 'join' && targetUserParam) {
            // Auto-join target user's room
            roomId = `room_${targetUserParam}`;
            roomIdInput.value = roomId;
            
            // Show message
            showAutoMessage(`Joining User ${targetUserParam}'s screen share...`);
            
            // Auto-connect after a brief delay
            setTimeout(() => {
                connectToRoom();
            }, 500);
        }
    }
});

// Show auto-connection message
function showAutoMessage(message) {
    const infoBox = document.querySelector('.info-box');
    if (infoBox) {
        const autoMsg = document.createElement('p');
        autoMsg.style.color = '#2196f3';
        autoMsg.style.fontWeight = 'bold';
        autoMsg.textContent = `🔄 ${message}`;
        infoBox.insertBefore(autoMsg, infoBox.firstChild);
        
        // Remove after 3 seconds
        setTimeout(() => {
            autoMsg.remove();
        }, 3000);
    }
}

// Event listeners
connectBtn.addEventListener('click', connectToRoom);
shareBtn.addEventListener('click', startScreenShare);
stopBtn.addEventListener('click', stopScreenShare);
if (micBtn) {
    micBtn.addEventListener('click', toggleMicrophone);
}

// Connect to room
async function connectToRoom() {
    username = usernameInput.value.trim();
    roomId = roomIdInput.value.trim();

    if (!username || !roomId) {
        alert('Please enter both your name and a room ID');
        return;
    }

    // Request microphone permission early so we can receive viewer audio
    try {
        console.log('🎤 Requesting microphone permission for audio reception...');
        const tempStream = await navigator.mediaDevices.getUserMedia({ 
            audio: {
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: true
            }
        });
        // Stop the temp stream immediately - we just needed permission
        tempStream.getTracks().forEach(track => track.stop());
        console.log('✅ Microphone permission granted');
    } catch (error) {
        console.warn('⚠️ Microphone permission denied - you won\'t be able to use audio features:', error);
        // Continue anyway - they can still screen share without audio
    }

    // Connect to WebSocket server
    console.log('Connecting to:', WS_URL);
    ws = new WebSocket(WS_URL);

    ws.onopen = () => {
        console.log('Connected to signaling server');
        updateConnectionStatus('online');
        
        // Join room
        sendMessage({
            type: 'join',
            roomId: roomId,
            username: username
        });

        connectBtn.disabled = true;
        shareBtn.disabled = false;
        usernameInput.disabled = true;
        roomIdInput.disabled = true;
    };

    ws.onmessage = async (event) => {
        const message = JSON.parse(event.data);
        await handleSignalingMessage(message);
    };

    ws.onerror = (error) => {
        console.error('WebSocket error:', error);
        alert('Failed to connect to server');
    };

    ws.onclose = () => {
        console.log('Disconnected from signaling server');
        updateConnectionStatus('offline');
        cleanup();
    };
}

// Handle signaling messages
async function handleSignalingMessage(message) {
    console.log('Received message:', message.type);

    switch (message.type) {
        case 'joined':
            roomStatus.textContent = roomId;
            updateViewerList(message.users);
            break;

        case 'user-joined':
            console.log('User joined:', message.username);
            updateViewerList(message.users);
            
            // If we're the presenter, create connection for new viewer
            if (isPresenter && localStream) {
                await createPeerConnection(message.userId, true);
            }
            break;

        case 'user-left':
            console.log('User left:', message.username);
            updateViewerList(message.users);
            
            if (peerConnections[message.userId]) {
                peerConnections[message.userId].close();
                delete peerConnections[message.userId];
            }
            break;

        case 'presenter-started':
            if (!isPresenter) {
                roleStatus.textContent = 'Viewer';
                videoTitle.textContent = `📺 Watching ${message.presenterName}'s Screen`;
                await createPeerConnection(message.presenterId, false);
            }
            break;

        case 'presenter-stopped':
            if (!isPresenter) {
                roleStatus.textContent = 'Viewer';
                videoTitle.textContent = '📺 Screen Share (Waiting for presenter...)';
                remoteVideo.srcObject = null;
                if (remoteAudio) remoteAudio.srcObject = null;
                
                if (peerConnections[message.presenterId]) {
                    peerConnections[message.presenterId].close();
                    delete peerConnections[message.presenterId];
                }
            }
            break;

        case 'offer':
            await handleOffer(message);
            break;

        case 'answer':
            await handleAnswer(message);
            break;

        case 'ice-candidate':
            await handleIceCandidate(message);
            break;

        case 'error':
            alert(message.message);
            break;
    }
}

// Create peer connection
async function createPeerConnection(peerId, isInitiator) {
    console.log(`Creating peer connection with ${peerId}, initiator: ${isInitiator}`);

    const pc = new RTCPeerConnection(ICE_SERVERS);
    peerConnections[peerId] = pc;

    // Add local stream tracks if we're the presenter
    if (isPresenter && localStream) {
        localStream.getTracks().forEach(track => {
            pc.addTrack(track, localStream);
            console.log('Added video track to peer connection');
        });
    }

    // Add audio track if microphone is active
    if (isPresenter && localAudioStream) {
        localAudioStream.getTracks().forEach(track => {
            pc.addTrack(track, localAudioStream);
            console.log('Added audio track to peer connection');
        });
    }

    // Handle incoming stream (for viewers)
    pc.ontrack = (event) => {
        console.log('Received remote track:', event.track.kind);
        
        if (event.track.kind === 'video') {
            remoteVideo.srcObject = event.streams[0];
        } else if (event.track.kind === 'audio' && remoteAudio) {
            remoteAudio.srcObject = event.streams[0];
            console.log('Audio track connected');
        }
    };

    // Handle ICE candidates
    pc.onicecandidate = (event) => {
        if (event.candidate) {
            sendMessage({
                type: 'ice-candidate',
                candidate: event.candidate,
                to: peerId,
                roomId: roomId
            });
        }
    };

    // Handle connection state changes
    pc.onconnectionstatechange = () => {
        console.log(`Connection state with ${peerId}: ${pc.connectionState}`);
        
        if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed') {
            pc.close();
            delete peerConnections[peerId];
        }
    };

    // Create and send offer if we're the initiator
    if (isInitiator) {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        
        sendMessage({
            type: 'offer',
            offer: offer,
            to: peerId,
            roomId: roomId
        });
    }

    return pc;
}

// Handle offer
async function handleOffer(message) {
    const pc = await createPeerConnection(message.from, false);
    
    await pc.setRemoteDescription(new RTCSessionDescription(message.offer));
    
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    
    sendMessage({
        type: 'answer',
        answer: answer,
        to: message.from,
        roomId: roomId
    });
}

// Handle answer
async function handleAnswer(message) {
    const pc = peerConnections[message.from];
    if (pc) {
        await pc.setRemoteDescription(new RTCSessionDescription(message.answer));
    }
}

// Handle ICE candidate
async function handleIceCandidate(message) {
    const pc = peerConnections[message.from];
    if (pc) {
        await pc.addIceCandidate(new RTCIceCandidate(message.candidate));
    }
}

// Start screen sharing
async function startScreenShare() {
    try {
        // Request screen capture
        localStream = await navigator.mediaDevices.getDisplayMedia({
            video: {
                cursor: 'always'
            },
            audio: false
        });

        // Display own screen locally
        remoteVideo.srcObject = localStream;
        videoTitle.textContent = '📺 Your Screen (Broadcasting)';

        // Handle when user stops sharing via browser UI
        localStream.getVideoTracks()[0].onended = () => {
            stopScreenShare();
        };

        // Update UI
        isPresenter = true;
        roleStatus.textContent = 'Presenter';
        shareBtn.disabled = true;
        stopBtn.disabled = false;
        if (micBtn) micBtn.disabled = false;

        // Notify server
        sendMessage({
            type: 'start-presenting',
            roomId: roomId
        });

        console.log('Screen sharing started');
    } catch (error) {
        console.error('Error starting screen share:', error);
        alert('Failed to start screen sharing. Please make sure you granted permission.');
    }
}

// Toggle microphone
async function toggleMicrophone() {
    if (!isMicActive) {
        // Turn microphone ON
        try {
            localAudioStream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true
                }
            });

            console.log('🎤 Microphone enabled');

            // Add audio track to all existing peer connections
            if (isPresenter) {
                Object.values(peerConnections).forEach(pc => {
                    localAudioStream.getTracks().forEach(track => {
                        pc.addTrack(track, localAudioStream);
                    });
                });

                // Renegotiate all connections
                await renegotiateAllConnections();
            }

            isMicActive = true;
            if (micBtn) {
                micBtn.textContent = '🎤 Mic On';
                micBtn.classList.add('mic-active');
            }

        } catch (error) {
            console.error('Microphone error:', error);
            alert('Could not access microphone. Please check permissions.');
        }
    } else {
        // Turn microphone OFF
        if (localAudioStream) {
            localAudioStream.getTracks().forEach(track => {
                track.stop();

                // Remove track from all peer connections
                Object.values(peerConnections).forEach(pc => {
                    const senders = pc.getSenders();
                    const audioSender = senders.find(s => s.track === track);
                    if (audioSender) {
                        pc.removeTrack(audioSender);
                    }
                });
            });
            localAudioStream = null;

            // Renegotiate all connections
            if (isPresenter) {
                await renegotiateAllConnections();
            }
        }

        isMicActive = false;
        if (micBtn) {
            micBtn.textContent = '🎤 Mic Off';
            micBtn.classList.remove('mic-active');
        }
        console.log('🔇 Microphone disabled');
    }
}

// Renegotiate all peer connections
async function renegotiateAllConnections() {
    const promises = Object.entries(peerConnections).map(async ([peerId, pc]) => {
        try {
            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);

            sendMessage({
                type: 'offer',
                offer: offer,
                to: peerId,
                roomId: roomId
            });

            console.log(`📤 Sent renegotiation offer to ${peerId}`);
        } catch (error) {
            console.error(`Renegotiation error with ${peerId}:`, error);
        }
    });

    await Promise.all(promises);
}

// Stop screen sharing
function stopScreenShare() {
    if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
        localStream = null;
    }

    // Stop microphone if active
    if (localAudioStream) {
        localAudioStream.getTracks().forEach(track => track.stop());
        localAudioStream = null;
        isMicActive = false;
        if (micBtn) {
            micBtn.textContent = '🎤 Mic Off';
            micBtn.classList.remove('mic-active');
            micBtn.disabled = true;
        }
    }

    // Close all peer connections
    Object.values(peerConnections).forEach(pc => pc.close());
    peerConnections = {};

    // Update UI
    remoteVideo.srcObject = null;
    if (remoteAudio) remoteAudio.srcObject = null;
    videoTitle.textContent = '📺 Screen Share';
    isPresenter = false;
    roleStatus.textContent = 'Viewer';
    shareBtn.disabled = false;
    stopBtn.disabled = true;

    // Notify server
    if (ws && ws.readyState === WebSocket.OPEN) {
        sendMessage({
            type: 'stop-presenting',
            roomId: roomId
        });
    }

    console.log('Screen sharing stopped');
}

// Update viewer list
function updateViewerList(users) {
    viewerCount.textContent = users.length;
    viewerList.innerHTML = '';
    
    if (users.length > 0) {
        viewerListContainer.style.display = 'block';
        users.forEach(user => {
            const div = document.createElement('div');
            div.className = 'viewer-item';
            div.textContent = `${user.username}${user.isPresenter ? ' 🎥 (Presenting)' : ''}`;
            viewerList.appendChild(div);
        });
    } else {
        viewerListContainer.style.display = 'none';
    }
}

// Update connection status
function updateConnectionStatus(status) {
    if (status === 'online') {
        connectionStatus.textContent = 'Connected';
        connectionStatus.className = 'status-value status-online';
    } else {
        connectionStatus.textContent = 'Disconnected';
        connectionStatus.className = 'status-value status-offline';
    }
}

// Send message via WebSocket
function sendMessage(message) {
    if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(message));
    }
}

// Cleanup on disconnect
function cleanup() {
    if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
        localStream = null;
    }

    if (localAudioStream) {
        localAudioStream.getTracks().forEach(track => track.stop());
        localAudioStream = null;
        isMicActive = false;
    }

    Object.values(peerConnections).forEach(pc => pc.close());
    peerConnections = {};

    remoteVideo.srcObject = null;
    if (remoteAudio) remoteAudio.srcObject = null;
    connectBtn.disabled = false;
    shareBtn.disabled = true;
    stopBtn.disabled = true;
    if (micBtn) {
        micBtn.disabled = true;
        micBtn.textContent = '🎤 Mic Off';
        micBtn.classList.remove('mic-active');
    }
    usernameInput.disabled = false;
    roomIdInput.disabled = false;
    roleStatus.textContent = '-';
    roomStatus.textContent = '-';
    viewerCount.textContent = '0';
    viewerListContainer.style.display = 'none';
    isPresenter = false;
}

// Handle page unload
window.addEventListener('beforeunload', () => {
    if (ws) {
        ws.close();
    }
    cleanup();
});
