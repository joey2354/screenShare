// mobile_cam_client.js - WebRTC logic for Mobile Camera Sharing

// Get URL parameters
const urlParams = new URLSearchParams(window.location.search);
const username = urlParams.get('username') || 'Anonymous';
const userIdFromUrl = urlParams.get('userId');
const roomId = `mobile_room_${userIdFromUrl}`;

// WebSocket connection
const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
const wsUrl = `${protocol}//${window.location.host}`;
let ws;
let localStream;
let audioStream;
let currentCamera = 'user'; // 'user' for front, 'environment' for back
let isMicOn = false;
let isPresenting = false;

// Peer connections for each viewer
const peerConnections = new Map(); // viewerId -> RTCPeerConnection

// ICE configuration
const iceConfiguration = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
    ]
};

// DOM elements
const cameraSelect = document.getElementById('cameraSelect');
const startBtn = document.getElementById('startBtn');
const micBtn = document.getElementById('micBtn');
const stopBtn = document.getElementById('stopBtn');
const localVideo = document.getElementById('localVideo');
const connectionStatus = document.getElementById('connectionStatus');
const cameraStatus = document.getElementById('cameraStatus');
const viewerCount = document.getElementById('viewerCount');
const shareLinkBox = document.getElementById('shareLinkBox');
const shareLink = document.getElementById('shareLink');

// Initialize
async function init() {
    console.log('Initializing Mobile Camera Share...');
    console.log('Username:', username);
    console.log('User ID:', userIdFromUrl);
    console.log('Room ID:', roomId);

    // Populate camera dropdown
    await populateCameraList();

    // Connect to WebSocket
    connectWebSocket();

    // Event listeners
    startBtn.addEventListener('click', startCamera);
    micBtn.addEventListener('click', toggleMic);
    stopBtn.addEventListener('click', stopSharing);
    cameraSelect.addEventListener('change', switchCamera);
}

// Populate camera list
async function populateCameraList() {
    try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const videoDevices = devices.filter(device => device.kind === 'videoinput');

        cameraSelect.innerHTML = '';

        if (videoDevices.length === 0) {
            cameraSelect.innerHTML = '<option value="">No cameras found</option>';
            return;
        }

        // Add front camera option
        const frontOption = document.createElement('option');
        frontOption.value = 'user';
        frontOption.textContent = '🤳 Front Camera';
        cameraSelect.appendChild(frontOption);

        // Add back camera option
        const backOption = document.createElement('option');
        backOption.value = 'environment';
        backOption.textContent = '📷 Back Camera';
        cameraSelect.appendChild(backOption);

        // If there are specific device IDs, add them too
        videoDevices.forEach((device, index) => {
            const option = document.createElement('option');
            option.value = device.deviceId;
            option.textContent = device.label || `Camera ${index + 1}`;
            cameraSelect.appendChild(option);
        });

    } catch (error) {
        console.error('Error enumerating devices:', error);
        cameraSelect.innerHTML = '<option value="">Error loading cameras</option>';
    }
}

// Connect to WebSocket
function connectWebSocket() {
    ws = new WebSocket(wsUrl);

    ws.onopen = () => {
        console.log('WebSocket connected');
        connectionStatus.textContent = 'Connected';
        connectionStatus.className = 'status-value status-online';

        // Join room
        ws.send(JSON.stringify({
            type: 'join',
            roomId: roomId,
            username: username
        }));
    };

    ws.onmessage = (event) => {
        const message = JSON.parse(event.data);
        handleMessage(message);
    };

    ws.onclose = () => {
        console.log('WebSocket disconnected');
        connectionStatus.textContent = 'Disconnected';
        connectionStatus.className = 'status-value status-offline';
        
        // Attempt to reconnect after 3 seconds
        setTimeout(connectWebSocket, 3000);
    };

    ws.onerror = (error) => {
        console.error('WebSocket error:', error);
    };
}

// Handle WebSocket messages
function handleMessage(message) {
    console.log('Received message:', message.type);

    switch (message.type) {
        case 'joined':
            console.log('Successfully joined room:', message.roomId);
            updateViewerCount(message.users);
            break;

        case 'user-joined':
            console.log('User joined:', message.username);
            updateViewerCount(message.users);
            break;

        case 'user-left':
            console.log('User left:', message.username);
            updateViewerCount(message.users);
            // Close peer connection for this user
            if (peerConnections.has(message.userId)) {
                peerConnections.get(message.userId).close();
                peerConnections.delete(message.userId);
            }
            break;

        case 'viewer-ready':
            // A viewer is ready to receive our stream
            console.log('Viewer ready:', message.from);
            if (isPresenting) {
                createPeerConnection(message.from);
            }
            break;

        case 'answer':
            handleAnswer(message);
            break;

        case 'ice-candidate':
            handleIceCandidate(message);
            break;
    }
}

// Update viewer count
function updateViewerCount(users) {
    // Count users excluding ourselves
    const count = users.filter(u => !u.isPresenter).length;
    viewerCount.textContent = count;
}

// Start camera
async function startCamera() {
    try {
        startBtn.disabled = true;
        startBtn.textContent = 'Starting...';

        // Get selected camera
        const selectedValue = cameraSelect.value;
        let constraints;

        if (selectedValue === 'user' || selectedValue === 'environment') {
            // Use facingMode
            constraints = {
                video: {
                    facingMode: selectedValue,
                    width: { ideal: 1280 },
                    height: { ideal: 720 }
                },
                audio: false // We'll add audio separately
            };
            currentCamera = selectedValue;
        } else {
            // Use specific device ID
            constraints = {
                video: {
                    deviceId: { exact: selectedValue },
                    width: { ideal: 1280 },
                    height: { ideal: 720 }
                },
                audio: false
            };
        }

        // Get video stream
        localStream = await navigator.mediaDevices.getUserMedia(constraints);
        localVideo.srcObject = localStream;

        cameraStatus.textContent = 'Camera Active';
        cameraStatus.style.color = '#4caf50';

        // Enable controls
        micBtn.disabled = false;
        stopBtn.disabled = false;
        startBtn.style.display = 'none';
        cameraSelect.disabled = false;

        // Notify server we're presenting
        isPresenting = true;
        ws.send(JSON.stringify({
            type: 'start-presenting',
            roomId: roomId
        }));

        // Show share link
        showShareLink();

        console.log('Camera started successfully');

    } catch (error) {
        console.error('Error starting camera:', error);
        alert('Error accessing camera: ' + error.message);
        startBtn.disabled = false;
        startBtn.textContent = 'Start Camera';
        cameraStatus.textContent = 'Error';
        cameraStatus.style.color = '#f44336';
    }
}

// Switch camera
async function switchCamera() {
    if (!localStream) return;

    const selectedValue = cameraSelect.value;
    let constraints;

    if (selectedValue === 'user' || selectedValue === 'environment') {
        constraints = {
            video: {
                facingMode: selectedValue,
                width: { ideal: 1280 },
                height: { ideal: 720 }
            },
            audio: false
        };
        currentCamera = selectedValue;
    } else {
        constraints = {
            video: {
                deviceId: { exact: selectedValue },
                width: { ideal: 1280 },
                height: { ideal: 720 }
            },
            audio: false
        };
    }

    try {
        // Stop current video tracks
        localStream.getVideoTracks().forEach(track => track.stop());

        // Get new stream
        const newStream = await navigator.mediaDevices.getUserMedia(constraints);
        
        // Update local video
        localVideo.srcObject = newStream;
        
        // Replace video track in all peer connections
        const newVideoTrack = newStream.getVideoTracks()[0];
        peerConnections.forEach((pc) => {
            const sender = pc.getSenders().find(s => s.track && s.track.kind === 'video');
            if (sender) {
                sender.replaceTrack(newVideoTrack);
            }
        });

        // Update local stream reference
        if (audioStream) {
            // Combine new video with existing audio
            const combinedStream = new MediaStream([
                ...newStream.getVideoTracks(),
                ...audioStream.getAudioTracks()
            ]);
            localStream = combinedStream;
        } else {
            localStream = newStream;
        }

        console.log('Camera switched successfully');
    } catch (error) {
        console.error('Error switching camera:', error);
        alert('Error switching camera: ' + error.message);
    }
}

// Toggle microphone
async function toggleMic() {
    if (!isMicOn) {
        // Turn mic on
        try {
            audioStream = await navigator.mediaDevices.getUserMedia({ audio: true });
            
            // Add audio tracks to peer connections
            const audioTrack = audioStream.getAudioTracks()[0];
            peerConnections.forEach((pc) => {
                pc.addTrack(audioTrack, audioStream);
            });

            isMicOn = true;
            micBtn.textContent = '🎤 Mic On';
            micBtn.classList.add('active');

            // Notify server about audio status
            ws.send(JSON.stringify({
                type: 'audio-status',
                roomId: roomId,
                hasAudio: true
            }));

            console.log('Microphone enabled');
        } catch (error) {
            console.error('Error accessing microphone:', error);
            alert('Error accessing microphone: ' + error.message);
        }
    } else {
        // Turn mic off
        if (audioStream) {
            audioStream.getTracks().forEach(track => track.stop());
            
            // Remove audio tracks from peer connections
            peerConnections.forEach((pc) => {
                pc.getSenders().forEach(sender => {
                    if (sender.track && sender.track.kind === 'audio') {
                        pc.removeTrack(sender);
                    }
                });
            });

            audioStream = null;
        }

        isMicOn = false;
        micBtn.textContent = '🎤 Mic Off';
        micBtn.classList.remove('active');

        // Notify server about audio status
        ws.send(JSON.stringify({
            type: 'audio-status',
            roomId: roomId,
            hasAudio: false
        }));

        console.log('Microphone disabled');
    }
}

// Stop sharing
function stopSharing() {
    // Stop all tracks
    if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
        localStream = null;
    }
    if (audioStream) {
        audioStream.getTracks().forEach(track => track.stop());
        audioStream = null;
    }

    // Clear video
    localVideo.srcObject = null;

    // Close all peer connections
    peerConnections.forEach((pc) => pc.close());
    peerConnections.clear();

    // Notify server
    isPresenting = false;
    ws.send(JSON.stringify({
        type: 'stop-presenting',
        roomId: roomId
    }));

    // Reset UI
    startBtn.disabled = false;
    startBtn.textContent = 'Start Camera';
    startBtn.style.display = 'block';
    micBtn.disabled = true;
    micBtn.textContent = '🎤 Mic Off';
    micBtn.classList.remove('active');
    stopBtn.disabled = true;
    cameraSelect.disabled = false;
    cameraStatus.textContent = 'Not Started';
    cameraStatus.style.color = '#fff';
    isMicOn = false;
    shareLinkBox.style.display = 'none';

    console.log('Stopped sharing');
}

// Create peer connection for a viewer
async function createPeerConnection(viewerId) {
    console.log('Creating peer connection for viewer:', viewerId);

    const pc = new RTCPeerConnection(iceConfiguration);
    peerConnections.set(viewerId, pc);

    // Add tracks to peer connection
    if (localStream) {
        localStream.getTracks().forEach(track => {
            pc.addTrack(track, localStream);
        });
    }

    // Handle ICE candidates
    pc.onicecandidate = (event) => {
        if (event.candidate) {
            ws.send(JSON.stringify({
                type: 'ice-candidate',
                to: viewerId,
                candidate: event.candidate
            }));
        }
    };

    // Handle connection state
    pc.onconnectionstatechange = () => {
        console.log('Peer connection state:', pc.connectionState);
    };

    // Create and send offer
    try {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);

        ws.send(JSON.stringify({
            type: 'offer',
            to: viewerId,
            offer: pc.localDescription
        }));

        console.log('Offer sent to viewer:', viewerId);
    } catch (error) {
        console.error('Error creating offer:', error);
    }
}

// Handle answer from viewer
async function handleAnswer(message) {
    const pc = peerConnections.get(message.from);
    if (!pc) {
        console.error('No peer connection found for:', message.from);
        return;
    }

    try {
        await pc.setRemoteDescription(new RTCSessionDescription(message.answer));
        console.log('Answer set for viewer:', message.from);
    } catch (error) {
        console.error('Error setting remote description:', error);
    }
}

// Handle ICE candidate from viewer
async function handleIceCandidate(message) {
    const pc = peerConnections.get(message.from);
    if (!pc) {
        console.error('No peer connection found for:', message.from);
        return;
    }

    try {
        await pc.addIceCandidate(new RTCIceCandidate(message.candidate));
        console.log('ICE candidate added for viewer:', message.from);
    } catch (error) {
        console.error('Error adding ICE candidate:', error);
    }
}

// Show share link
function showShareLink() {
    // Option 1: PHP viewer with comments (requires guest access)
    const phpViewerUrl = `https://flipadeals.com/mobile_cam_viewer.php?userId=0&username=Guest&targetUser=${userIdFromUrl}`;
    
    // Option 2: Simple Render viewer (no comments, but always works)
    const renderViewerUrl = `https://screenshare-jbdh.onrender.com/mobile_cam_viewer.html?userId=0&username=Guest&targetUser=${userIdFromUrl}`;
    
    // Use PHP viewer by default (has comments)
    const viewerUrl = phpViewerUrl;
    
    shareLink.textContent = viewerUrl;
    shareLinkBox.style.display = 'block';
    
    console.log('Share link generated:', viewerUrl);
}

// Select share link text (when user clicks on it)
function selectShareLink() {
    const range = document.createRange();
    range.selectNodeContents(shareLink);
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
    
    // Try to copy automatically when selected
    try {
        document.execCommand('copy');
        shareLink.style.outline = '2px solid #4caf50';
        setTimeout(() => {
            shareLink.style.outline = '';
        }, 1000);
    } catch (err) {
        // Silent fail - user can still manually copy the selected text
        console.log('Auto-copy on select failed:', err);
    }
}

// Copy share link - ROBUST VERSION
function copyShareLink(event) {
    const text = shareLink.textContent;
    const btn = event ? event.target : document.querySelector('.copy-btn');
    const originalText = btn.textContent;
    
    console.log('Attempting to copy:', text);
    
    // Method 1: Modern Clipboard API
    if (navigator.clipboard && window.isSecureContext) {
        navigator.clipboard.writeText(text)
            .then(() => {
                console.log('Clipboard API success');
                btn.textContent = '✓ Copied!';
                btn.style.background = '#4caf50';
                setTimeout(() => {
                    btn.textContent = originalText;
                    btn.style.background = '';
                }, 2000);
            })
            .catch(err => {
                console.error('Clipboard API failed:', err);
                fallbackCopyText(text, btn, originalText);
            });
    } else {
        console.log('Using fallback method (not secure context or no clipboard API)');
        fallbackCopyText(text, btn, originalText);
    }
}

// Fallback copy method
function fallbackCopyText(text, btn, originalText) {
    console.log('Trying fallback copy method');
    
    // Create a temporary textarea
    const textArea = document.createElement('textarea');
    textArea.value = text;
    
    // Make it invisible but accessible
    textArea.style.position = 'fixed';
    textArea.style.top = '0';
    textArea.style.left = '0';
    textArea.style.width = '2em';
    textArea.style.height = '2em';
    textArea.style.padding = '0';
    textArea.style.border = 'none';
    textArea.style.outline = 'none';
    textArea.style.boxShadow = 'none';
    textArea.style.background = 'transparent';
    
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    
    try {
        const successful = document.execCommand('copy');
        console.log('execCommand copy result:', successful);
        
        if (successful) {
            btn.textContent = '✓ Copied!';
            btn.style.background = '#4caf50';
            setTimeout(() => {
                btn.textContent = originalText;
                btn.style.background = '';
            }, 2000);
        } else {
            console.error('execCommand returned false');
            showManualCopy(text, btn, originalText);
        }
    } catch (err) {
        console.error('execCommand threw error:', err);
        showManualCopy(text, btn, originalText);
    } finally {
        document.body.removeChild(textArea);
    }
}

// Last resort - show the text for manual copy
function showManualCopy(text, btn, originalText) {
    console.log('Showing manual copy option');
    
    // Select the text in the share link div
    const range = document.createRange();
    range.selectNodeContents(shareLink);
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
    
    btn.textContent = '⚠️ Text Selected - Press Ctrl+C';
    btn.style.background = '#ff9800';
    
    setTimeout(() => {
        btn.textContent = originalText;
        btn.style.background = '';
        selection.removeAllRanges();
    }, 5000);
}

// Initialize on page load
init();
