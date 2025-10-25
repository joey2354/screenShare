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
    const usernameParam = urlParams.get('username');
    const actionParam = urlParams.get('action');
    const targetUserParam = urlParams.get('targetUser');

    if (userIdParam) {
        userId = userIdParam;
        username = usernameParam || `User_${userId}`;
        usernameInput.value = username;

        if (actionParam === 'create') {
            // Auto-create room for this user
            roomId = `room_${userId}`;
            roomIdInput.value = roomId;
            
            // Show message
            showAutoMessage(`Creating screen share room for ${username}...`);
            
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
micBtn.addEventListener('click', toggleMicrophone);

// Connect to room
function connectToRoom() {
    username = usernameInput.value.trim();
    roomId = roomIdInput.value.trim();

    if (!username || !roomId) {
        alert('Please enter both your name and a room ID');
        return;
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
        micBtn.disabled = false;
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
            if (isPresenter && (localStream || isMicActive)) {
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
                remoteAudio.srcObject = null;
                
                if (peerConnections[message.presenterId]) {
                    peerConnections[message.presenterId].close();
                    delete peerConnections[message.presenterId];
                }
            }
            break;

        case 'audio-status-changed':
            console.log(`User ${message.username} audio: ${message.hasAudio ? 'ON' : 'OFF'}`);
            updateViewerList(message.users);
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

    // Add local streams if we're the presenter
    if (isPresenter && localStream) {
        localStream.getTracks().forEach(track => {
            pc.addTrack(track, localStream);
            console.log(`Added screen track: ${track.kind}`);
        });
    }
    
    // Add microphone for BOTH presenter and viewer
    if (isMicActive && localAudioStream) {
        localAudioStream.getTracks().forEach(track => {
            pc.addTrack(track, localAudioStream);
            console.log(`Added audio track: ${track.kind}`);
        });
    }

    // Handle incoming stream
    pc.ontrack = (event) => {
        console.log('Received remote track:', event.track.kind);
        
        if (event.track.kind === 'video') {
            if (!remoteVideo.srcObject || remoteVideo.srcObject.id !== event.streams[0].id) {
                remoteVideo.srcObject = event.streams[0];
                console.log('✅ Video stream connected');
            }
        } else if (event.track.kind === 'audio') {
            // Create or update audio element for this peer
            let audioElement = document.getElementById(`audio_${peerId}`);
            if (!audioElement) {
                audioElement = document.createElement('audio');
                audioElement.id = `audio_${peerId}`;
                audioElement.autoplay = true;
                document.body.appendChild(audioElement);
            }
            audioElement.srcObject = event.streams[0];
            console.log(`✅ Audio stream connected from peer ${peerId}`);
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

    // Handle connection state
    pc.onconnectionstatechange = () => {
        console.log(`Connection state with ${peerId}: ${pc.connectionState}`);
        
        if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed') {
            console.log(`Connection with ${peerId} lost, cleaning up`);
            const audioElement = document.getElementById(`audio_${peerId}`);
            if (audioElement) {
                audioElement.remove();
            }
        }
    };

    // If we're the initiator, create and send offer
    if (isInitiator) {
        try {
            const offer = await pc.createOffer({
                offerToReceiveAudio: true,
                offerToReceiveVideo: true
            });
            await pc.setLocalDescription(offer);
            
            sendMessage({
                type: 'offer',
                offer: offer,
                to: peerId,
                roomId: roomId
            });
        } catch (error) {
            console.error('Error creating offer:', error);
        }
    }
}

// Handle incoming offer
async function handleOffer(message) {
    console.log('Handling offer from:', message.from);
    
    // Create peer connection if it doesn't exist
    if (!peerConnections[message.from]) {
        await createPeerConnection(message.from, false);
    }
    
    const pc = peerConnections[message.from];
    
    try {
        await pc.setRemoteDescription(new RTCSessionDescription(message.offer));
        
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        
        sendMessage({
            type: 'answer',
            answer: answer,
            to: message.from,
            roomId: roomId
        });
    } catch (error) {
        console.error('Error handling offer:', error);
    }
}

// Handle answer
async function handleAnswer(message) {
    const pc = peerConnections[message.from];
    if (pc) {
        try {
            await pc.setRemoteDescription(new RTCSessionDescription(message.answer));
        } catch (error) {
            console.error('Error handling answer:', error);
        }
    }
}

// Handle ICE candidate
async function handleIceCandidate(message) {
    const pc = peerConnections[message.from];
    if (pc) {
        try {
            await pc.addIceCandidate(new RTCIceCandidate(message.candidate));
        } catch (error) {
            console.error('Error adding ICE candidate:', error);
        }
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
            audio: true  // Try to capture system audio
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

// Stop screen sharing
function stopScreenShare() {
    if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
        localStream = null;
    }

    // Close all peer connections
    Object.values(peerConnections).forEach(pc => pc.close());
    peerConnections = {};

    // Update UI
    remoteVideo.srcObject = null;
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
            const audioTrack = localAudioStream.getAudioTracks()[0];
            
            for (const [peerId, pc] of Object.entries(peerConnections)) {
                // Add the track
                pc.addTrack(audioTrack, localAudioStream);
                console.log(`Added audio track to peer ${peerId}`);
                
                // Renegotiate
                try {
                    const offer = await pc.createOffer();
                    await pc.setLocalDescription(offer);
                    
                    sendMessage({
                        type: 'offer',
                        offer: offer,
                        to: peerId,
                        roomId: roomId
                    });
                } catch (error) {
                    console.error(`Error renegotiating with peer ${peerId}:`, error);
                }
            }

            isMicActive = true;
            micBtn.textContent = '🎤 Mic On';
            micBtn.classList.add('active');

            // Notify server about audio status
            sendMessage({
                type: 'audio-status',
                roomId: roomId,
                hasAudio: true
            });

        } catch (error) {
            console.error('Microphone error:', error);
            alert('Could not access microphone. Please check permissions.');
        }
    } else {
        // Turn microphone OFF
        if (localAudioStream) {
            const audioTrack = localAudioStream.getAudioTracks()[0];
            
            // Remove track from all peer connections
            for (const [peerId, pc] of Object.entries(peerConnections)) {
                const senders = pc.getSenders();
                const audioSender = senders.find(s => s.track === audioTrack);
                if (audioSender) {
                    pc.removeTrack(audioSender);
                    console.log(`Removed audio track from peer ${peerId}`);
                    
                    // Renegotiate
                    try {
                        const offer = await pc.createOffer();
                        await pc.setLocalDescription(offer);
                        
                        sendMessage({
                            type: 'offer',
                            offer: offer,
                            to: peerId,
                            roomId: roomId
                        });
                    } catch (error) {
                        console.error(`Error renegotiating with peer ${peerId}:`, error);
                    }
                }
            }
            
            // Stop the audio track
            audioTrack.stop();
            localAudioStream = null;
        }

        isMicActive = false;
        micBtn.textContent = '🎤 Mic Off';
        micBtn.classList.remove('active');

        // Notify server about audio status
        sendMessage({
            type: 'audio-status',
            roomId: roomId,
            hasAudio: false
        });
        
        console.log('🔇 Microphone disabled');
    }
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
            
            let status = '';
            if (user.isPresenter) status += ' 🎥 (Presenting)';
            if (user.hasAudio) status += ' 🎤';
            
            div.textContent = `${user.username}${status}`;
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
    }

    Object.values(peerConnections).forEach(pc => pc.close());
    peerConnections = {};
    
    // Remove all dynamically created audio elements
    document.querySelectorAll('[id^="audio_"]').forEach(el => el.remove());

    remoteVideo.srcObject = null;
    remoteAudio.srcObject = null;
    connectBtn.disabled = false;
    shareBtn.disabled = true;
    stopBtn.disabled = true;
    micBtn.disabled = true;
    usernameInput.disabled = false;
    roomIdInput.disabled = false;
    roleStatus.textContent = '-';
    roomStatus.textContent = '-';
    viewerCount.textContent = '0';
    viewerListContainer.style.display = 'none';
    isPresenter = false;
    isMicActive = false;
    micBtn.textContent = '🎤 Mic Off';
    micBtn.classList.remove('active');
}

// Handle page unload
window.addEventListener('beforeunload', () => {
    if (ws) {
        ws.close();
    }
    cleanup();
});
