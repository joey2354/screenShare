function openScreenSharePopup() {
    // Check if popup already exists
    if (document.getElementById('screenSharePopup')) {
        return;
    }

    let currentUserId = null;
    let currentUsername = null;
    let activePresenters = [];
    let refreshInterval = null;
    let isDragging = false;
    let isMinimized = false;
    let currentX;
    let currentY;
    let initialX;
    let initialY;
    let xOffset = 0;
    let yOffset = 0;
    let isSharing = false;

    // Create popup container
    const popup = document.createElement('div');
    popup.id = 'screenSharePopup';
    popup.style.cssText = `
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        background: rgba(17, 24, 39, 0.98);
        border-radius: 0.75rem;
        padding: 1.5rem;
        box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.5);
        border: 2px solid #10b981;
        width: 400px;
        max-height: 600px;
        z-index: 10000;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif;
        display: flex;
        flex-direction: column;
        transition: all 0.3s ease;
        cursor: move;
    `;

    // Create header with close button
    const header = document.createElement('div');
    header.style.cssText = `
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 1rem;
        flex-shrink: 0;
        cursor: move;
        user-select: none;
    `;

    const title = document.createElement('h1');
    title.textContent = 'Screen Share';
    title.style.cssText = `
        font-size: 1.5rem;
        font-weight: bold;
        background: linear-gradient(to right, #10b981, #34d399);
        -webkit-background-clip: text;
        -webkit-text-fill-color: transparent;
        background-clip: text;
        margin: 0;
        pointer-events: none;
    `;

    const headerButtons = document.createElement('div');
    headerButtons.style.cssText = `
        display: flex;
        gap: 0.5rem;
    `;

    const minimizeBtn = document.createElement('button');
    minimizeBtn.textContent = '−';
    minimizeBtn.style.cssText = `
        background: none;
        border: none;
        color: #fbbf24;
        font-size: 1.5rem;
        cursor: pointer;
        padding: 0;
        width: 25px;
        height: 25px;
        line-height: 1;
        transition: color 0.2s;
    `;
    minimizeBtn.onmouseover = () => minimizeBtn.style.color = '#fef3c7';
    minimizeBtn.onmouseout = () => minimizeBtn.style.color = '#fbbf24';
    minimizeBtn.onclick = (e) => {
        e.stopPropagation();
        toggleMinimize();
    };

    const closeBtn = document.createElement('button');
    closeBtn.textContent = '×';
    closeBtn.style.cssText = `
        background: none;
        border: none;
        color: #10b981;
        font-size: 2rem;
        cursor: pointer;
        padding: 0;
        width: 30px;
        height: 30px;
        line-height: 1;
        transition: color 0.2s;
    `;
    closeBtn.onmouseover = () => closeBtn.style.color = '#f87171';
    closeBtn.onmouseout = () => closeBtn.style.color = '#10b981';
    closeBtn.onclick = (e) => {
        e.stopPropagation();
        if (refreshInterval) {
            clearInterval(refreshInterval);
        }
        popup.remove();
    };

    headerButtons.appendChild(minimizeBtn);
    headerButtons.appendChild(closeBtn);
    header.appendChild(title);
    header.appendChild(headerButtons);

    // Player info
    const playerInfo = document.createElement('div');
    playerInfo.style.cssText = `
        text-align: center;
        color: #9ca3af;
        margin-bottom: 1rem;
        font-size: 0.875rem;
        flex-shrink: 0;
    `;
    playerInfo.innerHTML = 'Logged in as: <span id="shareUsername" style="color: #10b981; font-weight: bold;">Loading...</span>';

    // Share Screen Button
    const shareBtn = document.createElement('button');
    shareBtn.id = 'shareScreenBtn';
    shareBtn.innerHTML = '📺 Share My Screen';
    shareBtn.style.cssText = `
        width: 100%;
        padding: 1rem;
        font-size: 1.125rem;
        font-weight: bold;
        border: none;
        border-radius: 0.375rem;
        background: linear-gradient(to right, #10b981, #059669);
        color: #fff;
        cursor: pointer;
        transition: transform 0.2s, box-shadow 0.2s;
        margin-bottom: 1rem;
        flex-shrink: 0;
    `;
    shareBtn.onmouseover = () => {
        if (!shareBtn.disabled) {
            shareBtn.style.transform = 'translateY(-2px)';
            shareBtn.style.boxShadow = '0 10px 20px rgba(16, 185, 129, 0.3)';
        }
    };
    shareBtn.onmouseout = () => {
        shareBtn.style.transform = 'translateY(0)';
        shareBtn.style.boxShadow = 'none';
    };
    shareBtn.onclick = handleShareScreen;

    // Shareable URL Section (hidden by default)
    const shareUrlSection = document.createElement('div');
    shareUrlSection.id = 'shareUrlSection';
    shareUrlSection.style.cssText = `
        display: none;
        background: #1f2937;
        border: 2px solid #10b981;
        border-radius: 0.5rem;
        padding: 1rem;
        margin-bottom: 1rem;
        flex-shrink: 0;
    `;

    const shareUrlLabel = document.createElement('div');
    shareUrlLabel.textContent = '🔗 Share this link with viewers:';
    shareUrlLabel.style.cssText = `
        color: #10b981;
        font-size: 0.875rem;
        margin-bottom: 0.5rem;
        font-weight: 600;
    `;

    const urlContainer = document.createElement('div');
    urlContainer.style.cssText = `
        display: flex;
        gap: 0.5rem;
        align-items: center;
    `;

    const urlInput = document.createElement('input');
    urlInput.type = 'text';
    urlInput.id = 'shareableUrl';
    urlInput.readOnly = true;
    urlInput.style.cssText = `
        flex: 1;
        padding: 0.5rem;
        border: 1px solid #374151;
        border-radius: 0.375rem;
        background: #111827;
        color: #d1d5db;
        font-size: 0.75rem;
        font-family: monospace;
    `;

    const copyBtn = document.createElement('button');
    copyBtn.innerHTML = '📋';
    copyBtn.title = 'Copy to clipboard';
    copyBtn.style.cssText = `
        padding: 0.5rem 1rem;
        border: none;
        border-radius: 0.375rem;
        background: linear-gradient(to right, #3b82f6, #2563eb);
        color: white;
        font-size: 1.25rem;
        cursor: pointer;
        transition: transform 0.2s;
    `;
    copyBtn.onmouseover = () => copyBtn.style.transform = 'scale(1.05)';
    copyBtn.onmouseout = () => copyBtn.style.transform = 'scale(1)';
    copyBtn.onclick = () => {
        urlInput.select();
        document.execCommand('copy');
        
        // Show feedback
        const originalText = copyBtn.innerHTML;
        copyBtn.innerHTML = '✓';
        copyBtn.style.background = 'linear-gradient(to right, #10b981, #059669)';
        setTimeout(() => {
            copyBtn.innerHTML = originalText;
            copyBtn.style.background = 'linear-gradient(to right, #3b82f6, #2563eb)';
        }, 1500);
        
        showStatus('URL copied to clipboard!');
    };

    urlContainer.appendChild(urlInput);
    urlContainer.appendChild(copyBtn);
    shareUrlSection.appendChild(shareUrlLabel);
    shareUrlSection.appendChild(urlContainer);

    // Stop Sharing Button (hidden by default)
    const stopSharingBtn = document.createElement('button');
    stopSharingBtn.id = 'stopSharingBtn';
    stopSharingBtn.innerHTML = '⏹️ Stop Sharing';
    stopSharingBtn.style.cssText = `
        display: none;
        width: 100%;
        padding: 1rem;
        font-size: 1.125rem;
        font-weight: bold;
        border: none;
        border-radius: 0.375rem;
        background: linear-gradient(to right, #ef4444, #dc2626);
        color: #fff;
        cursor: pointer;
        transition: transform 0.2s, box-shadow 0.2s;
        margin-bottom: 1rem;
        flex-shrink: 0;
    `;
    stopSharingBtn.onmouseover = () => {
        stopSharingBtn.style.transform = 'translateY(-2px)';
        stopSharingBtn.style.boxShadow = '0 10px 20px rgba(239, 68, 68, 0.3)';
    };
    stopSharingBtn.onmouseout = () => {
        stopSharingBtn.style.transform = 'translateY(0)';
        stopSharingBtn.style.boxShadow = 'none';
    };
    stopSharingBtn.onclick = () => {
        // Hide URL section and stop button
        shareUrlSection.style.display = 'none';
        stopSharingBtn.style.display = 'none';
        shareBtn.style.display = 'block';
        isSharing = false;
        showStatus('Screen sharing stopped');
    };

    // Test API Button
    const testBtn = document.createElement('button');
    testBtn.innerHTML = '🔧 Test API Connection';
    testBtn.style.cssText = `
        width: 100%;
        padding: 0.75rem;
        font-size: 0.875rem;
        font-weight: 600;
        border: 2px solid #374151;
        border-radius: 0.375rem;
        background: transparent;
        color: #9ca3af;
        cursor: pointer;
        transition: all 0.2s;
        margin-bottom: 1rem;
        flex-shrink: 0;
    `;
    testBtn.onmouseover = () => {
        testBtn.style.borderColor = '#10b981';
        testBtn.style.color = '#10b981';
    };
    testBtn.onmouseout = () => {
        testBtn.style.borderColor = '#374151';
        testBtn.style.color = '#9ca3af';
    };
    testBtn.onclick = async () => {
        testBtn.textContent = '🔄 Testing...';
        testBtn.disabled = true;
        await fetchActivePresenters();
        testBtn.textContent = '🔧 Test API Connection';
        testBtn.disabled = false;
    };

    // Manual Watch Section
    const manualWatchSection = document.createElement('div');
    manualWatchSection.style.cssText = `
        background: #1f2937;
        border: 2px solid #374151;
        border-radius: 0.5rem;
        padding: 1rem;
        margin-bottom: 1.5rem;
        flex-shrink: 0;
    `;

    const manualWatchLabel = document.createElement('label');
    manualWatchLabel.textContent = 'Watch Specific User';
    manualWatchLabel.style.cssText = `
        display: block;
        color: #d1d5db;
        font-size: 0.875rem;
        margin-bottom: 0.5rem;
        font-weight: 600;
    `;

    const manualInputContainer = document.createElement('div');
    manualInputContainer.style.cssText = `
        display: flex;
        gap: 0.5rem;
    `;

    const userIdInput = document.createElement('input');
    userIdInput.type = 'number';
    userIdInput.id = 'manualUserId';
    userIdInput.placeholder = 'Enter User ID';
    userIdInput.style.cssText = `
        flex: 1;
        padding: 0.5rem;
        border: 1px solid #374151;
        border-radius: 0.375rem;
        background: #111827;
        color: #d1d5db;
        font-size: 0.875rem;
    `;

    const manualWatchBtn = document.createElement('button');
    manualWatchBtn.textContent = '👁️ Watch';
    manualWatchBtn.style.cssText = `
        padding: 0.5rem 1rem;
        border: none;
        border-radius: 0.375rem;
        background: linear-gradient(to right, #3b82f6, #2563eb);
        color: white;
        font-size: 0.875rem;
        font-weight: 600;
        cursor: pointer;
        transition: transform 0.2s;
    `;
    manualWatchBtn.onmouseover = () => manualWatchBtn.style.transform = 'scale(1.05)';
    manualWatchBtn.onmouseout = () => manualWatchBtn.style.transform = 'scale(1)';
    manualWatchBtn.onclick = () => {
        const targetId = userIdInput.value.trim();
        if (targetId) {
            watchUser(targetId);
        } else {
            showError('Please enter a user ID');
        }
    };

    manualInputContainer.appendChild(userIdInput);
    manualInputContainer.appendChild(manualWatchBtn);
    manualWatchSection.appendChild(manualWatchLabel);
    manualWatchSection.appendChild(manualInputContainer);

    // Live users section
    const liveSection = document.createElement('div');
    liveSection.style.cssText = `
        flex: 1;
        min-height: 0;
        display: flex;
        flex-direction: column;
    `;

    const liveHeader = document.createElement('div');
    liveHeader.style.cssText = `
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 0.75rem;
        flex-shrink: 0;
    `;

    const liveTitle = document.createElement('h2');
    liveTitle.textContent = '🔴 Live Now';
    liveTitle.style.cssText = `
        font-size: 1rem;
        font-weight: bold;
        color: #d1d5db;
        margin: 0;
    `;

    const statusSpan = document.createElement('span');
    statusSpan.id = 'liveStatus';
    statusSpan.style.cssText = `
        font-size: 0.75rem;
        color: #6b7280;
    `;

    liveHeader.appendChild(liveTitle);
    liveHeader.appendChild(statusSpan);

    const liveUsersContainer = document.createElement('div');
    liveUsersContainer.id = 'liveUsersContainer';
    liveUsersContainer.style.cssText = `
        flex: 1;
        min-height: 0;
        overflow-y: auto;
        padding-right: 0.5rem;
    `;

    // Custom scrollbar styling
    const style = document.createElement('style');
    style.textContent = `
        #liveUsersContainer::-webkit-scrollbar {
            width: 6px;
        }
        #liveUsersContainer::-webkit-scrollbar-track {
            background: #1f2937;
            border-radius: 3px;
        }
        #liveUsersContainer::-webkit-scrollbar-thumb {
            background: #374151;
            border-radius: 3px;
        }
        #liveUsersContainer::-webkit-scrollbar-thumb:hover {
            background: #4b5563;
        }
    `;
    document.head.appendChild(style);

    liveSection.appendChild(liveHeader);
    liveSection.appendChild(liveUsersContainer);

    // Error display
    const error = document.createElement('div');
    error.id = 'shareError';
    error.style.cssText = `
        display: none;
        background: #7f1d1d;
        border: 1px solid #dc2626;
        color: #fca5a5;
        padding: 0.75rem;
        border-radius: 0.375rem;
        margin-top: 1rem;
        font-size: 0.875rem;
        flex-shrink: 0;
    `;

    // Assemble popup
    popup.appendChild(header);
    popup.appendChild(playerInfo);
    popup.appendChild(shareBtn);
    popup.appendChild(shareUrlSection);
    popup.appendChild(stopSharingBtn);
    //popup.appendChild(testBtn);
    //popup.appendChild(manualWatchSection);
    popup.appendChild(liveSection);
    popup.appendChild(error);
    document.body.appendChild(popup);

    // Dragging functionality
    header.addEventListener('mousedown', dragStart);
    document.addEventListener('mousemove', drag);
    document.addEventListener('mouseup', dragEnd);

    function dragStart(e) {
        if (e.target === closeBtn || e.target === minimizeBtn) return;
        
        initialX = e.clientX - xOffset;
        initialY = e.clientY - yOffset;
        isDragging = true;
        popup.style.cursor = 'grabbing';
    }

    function drag(e) {
        if (isDragging) {
            e.preventDefault();
            currentX = e.clientX - initialX;
            currentY = e.clientY - initialY;
            xOffset = currentX;
            yOffset = currentY;
            popup.style.transform = `translate(calc(-50% + ${currentX}px), calc(-50% + ${currentY}px))`;
        }
    }

    function dragEnd() {
        isDragging = false;
        popup.style.cursor = 'move';
    }

    function toggleMinimize() {
        isMinimized = !isMinimized;
        if (isMinimized) {
            popup.style.height = 'auto';
            popup.style.maxHeight = 'none';
            playerInfo.style.display = 'none';
            shareBtn.style.display = 'none';
            shareUrlSection.style.display = 'none';
            stopSharingBtn.style.display = 'none';
            testBtn.style.display = 'none';
            manualWatchSection.style.display = 'none';
            liveSection.style.display = 'none';
            error.style.display = 'none';
            minimizeBtn.textContent = '+';
        } else {
            popup.style.maxHeight = '600px';
            playerInfo.style.display = 'block';
            if (isSharing) {
                shareUrlSection.style.display = 'block';
                stopSharingBtn.style.display = 'block';
            } else {
                shareBtn.style.display = 'block';
            }
            testBtn.style.display = 'block';
            manualWatchSection.style.display = 'block';
            liveSection.style.display = 'flex';
            minimizeBtn.textContent = '−';
        }
    }

    // Helper functions
    function showError(message) {
        error.textContent = '❌ ' + message;
        error.style.display = 'block';
        setTimeout(() => {
            error.style.display = 'none';
        }, 5000);
    }

    function clearError() {
        error.style.display = 'none';
    }

    function showStatus(message) {
        statusSpan.textContent = message;
    }
    
    function showLoginRequired() {
        playerInfo.innerHTML = '<span style="color: #ef4444; font-weight: bold;">⚠️ Not logged in</span>';
        shareBtn.disabled = true;
        shareBtn.style.opacity = '0.5';
        shareBtn.style.cursor = 'not-allowed';
        
        // Create login form
        const loginForm = document.createElement('div');
        loginForm.id = 'loginFormContainer';
        loginForm.style.cssText = `
            background: #1f2937;
            border: 2px solid #374151;
            border-radius: 0.5rem;
            padding: 1rem;
            margin-bottom: 1rem;
        `;
        
        loginForm.innerHTML = `
            <form id="screenShareLoginForm">
                <div style="margin-bottom: 0.75rem;">
                    <label style="display: block; color: #d1d5db; font-size: 0.875rem; margin-bottom: 0.25rem; font-weight: 600;">Username</label>
                    <input type="text" id="loginUsername" required style="width: 100%; padding: 0.5rem; border: 1px solid #374151; border-radius: 0.375rem; background: #111827; color: #d1d5db; font-size: 0.875rem;">
                </div>
                <div style="margin-bottom: 0.75rem;">
                    <label style="display: block; color: #d1d5db; font-size: 0.875rem; margin-bottom: 0.25rem; font-weight: 600;">Password</label>
                    <input type="password" id="loginPassword" required style="width: 100%; padding: 0.5rem; border: 1px solid #374151; border-radius: 0.375rem; background: #111827; color: #d1d5db; font-size: 0.875rem;">
                </div>
                <button type="submit" style="width: 100%; padding: 0.75rem; border: none; border-radius: 0.375rem; background: linear-gradient(to right, #10b981, #059669); color: white; font-weight: 600; cursor: pointer; transition: transform 0.2s;">
                    🔐 Login to Gamble Galaxy
                </button>
            </form>
        `;
        
        // Insert login form before the error div
        error.parentNode.insertBefore(loginForm, error);
        
        // Handle login form submission
        document.getElementById('screenShareLoginForm').addEventListener('submit', async (e) => {
            e.preventDefault();
            await handleLogin();
        });
    }
    
    async function handleLogin() {
        const username = document.getElementById('loginUsername').value;
        const password = document.getElementById('loginPassword').value;
        
        clearError();
        error.textContent = 'Logging in...';
        error.style.color = '#10b981';
        error.style.display = 'block';
        
        try {
            const response = await fetch('https://gamble-galaxy.com/login.php', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                },
                body: `login=${encodeURIComponent(username)}&password=${encodeURIComponent(password)}`
            });
            
            // Check if login was successful by trying to get user info
            const userCheckResponse = await fetch('contest_get_user_id.php');
            const userData = await userCheckResponse.json();
            
            if (userData.success) {
                // Login successful - reload the popup
                error.textContent = 'Login successful! Reloading...';
                error.style.color = '#10b981';
                setTimeout(() => {
                    popup.remove();
                    openScreenSharePopup();
                }, 1000);
            } else {
                showError('Login failed. Please check your credentials.');
            }
        } catch (err) {
            showError('Error during login: ' + err.message);
        }
    }

    // Fetch logged-in user info
    async function checkLogin() {
        try {
            const response = await fetch('contest_get_user_id.php');
            const data = await response.json();
            
            if (data.success) {
                currentUserId = data.user_id;
                currentUsername = data.username;
                document.getElementById('shareUsername').textContent = currentUsername;
                
                // Start fetching active presenters
                fetchActivePresenters();
                
                // Auto-refresh every 5 seconds
                refreshInterval = setInterval(fetchActivePresenters, 5000);
            } else {
                // Not logged in - show login screen
                showLoginRequired();
            }
        } catch (err) {
            showError('Error checking login: ' + err.message);
            showLoginRequired();
        }
    }

    // Fetch active presenters from API
    async function fetchActivePresenters() {
        clearError();
        showStatus('Checking for live users...');
        
        try {
            // Use PHP proxy to avoid CORS issues
            const response = await fetch('screen_share_get_active.php', {
                method: 'GET',
                headers: {
                    'Accept': 'application/json'
                }
            });
            
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            
            const data = await response.json();
            console.log('Active presenters response:', data);
            
            // Check if we have presenters array
            if (data.presenters && Array.isArray(data.presenters)) {
                activePresenters = data.presenters;
                renderLiveUsers();
                
                if (activePresenters.length === 0) {
                    showStatus('No users are currently sharing');
                } else {
                    showStatus(`${activePresenters.length} user(s) live • Auto-refreshing...`);
                }
            } else if (data.success === false) {
                showError('API error: ' + (data.message || 'Unknown error'));
                showStatus('Failed to load live users');
                activePresenters = [];
                renderLiveUsers();
            } else {
                showError('Unexpected API response format');
                showStatus('Failed to parse response');
                activePresenters = [];
                renderLiveUsers();
            }
        } catch (err) {
            showError('Cannot reach screen share service: ' + err.message);
            showStatus('Service offline or connection error');
            console.error('Fetch error:', err);
            
            activePresenters = [];
            renderLiveUsers();
        }
    }

    // Render live users list
    function renderLiveUsers() {
        const container = document.getElementById('liveUsersContainer');
        
        if (activePresenters.length === 0) {
            container.innerHTML = `
                <div style="
                    text-align: center;
                    color: #6b7280;
                    padding: 2rem;
                    font-size: 0.875rem;
                ">
                    No users are currently sharing their screen
                </div>
            `;
            return;
        }

        const html = activePresenters.map(presenter => {
            const isCurrentUser = String(presenter.userId) === String(currentUserId);
            const displayName = presenter.username || `User ${presenter.userId}`;
            
            return `
                <div style="
                    background: ${isCurrentUser ? '#1f2937' : '#111827'};
                    border: 1px solid ${isCurrentUser ? '#10b981' : '#374151'};
                    border-radius: 0.5rem;
                    padding: 0.75rem;
                    margin-bottom: 0.5rem;
                    ${isCurrentUser ? 'border-width: 2px;' : ''}
                ">
                    <div style="display: flex; justify-content: space-between; align-items: center;">
                        <div style="flex: 1;">
                            <div style="
                                font-weight: bold;
                                color: ${isCurrentUser ? '#10b981' : '#d1d5db'};
                                font-size: 0.875rem;
                                margin-bottom: 0.25rem;
                            ">
                                ${isCurrentUser ? '🟢 You' : '🔴 ' + escapeHtml(displayName)}
                            </div>
                            <div style="
                                color: #9ca3af;
                                font-size: 0.75rem;
                            ">
                                👁️ ${presenter.viewerCount} viewer(s)
                            </div>
                        </div>
                        ${!isCurrentUser ? `
                            <button 
                                onclick="watchUser(${presenter.userId}, '${escapeHtml(displayName)}')"
                                style="
                                    background: linear-gradient(to right, #3b82f6, #2563eb);
                                    color: white;
                                    border: none;
                                    padding: 0.5rem 1rem;
                                    border-radius: 0.375rem;
                                    font-size: 0.75rem;
                                    font-weight: 600;
                                    cursor: pointer;
                                    transition: transform 0.2s;
                                "
                                onmouseover="this.style.transform='scale(1.05)'"
                                onmouseout="this.style.transform='scale(1)'"
                            >
                                👁️ Watch
                            </button>
                        ` : ''}
                    </div>
                </div>
            `;
        }).join('');

        container.innerHTML = html;
    }

    // Helper to escape HTML
    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    // Handle share screen button click
    function handleShareScreen() {
        if (!currentUserId || !currentUsername) {
            showError('User information not loaded');
            return;
        }

        // Generate the shareable viewer URL pointing to Render
        const viewerUrl = `https://screenshare-jbdh.onrender.com/?userId=0&username=Viewer&action=join&targetUser=${currentUserId}`;
        
        // Show the URL section
        document.getElementById('shareableUrl').value = viewerUrl;
        shareUrlSection.style.display = 'block';
        stopSharingBtn.style.display = 'block';
        shareBtn.style.display = 'none';
        isSharing = true;
        
        showStatus('✅ Now sharing! Send the link to viewers.');

        // Navigate to screen share with create action
        const screenShareUrl = `https://screenshare-jbdh.onrender.com/?userId=${currentUserId}&username=${encodeURIComponent(currentUsername)}&action=create`;
        window.open(screenShareUrl, '_blank', 'width=1200,height=800');
    }

    // Global function to watch a user (called from inline onclick)
    window.watchUser = function(targetUserId, targetUsername) {
        if (!currentUserId || !currentUsername) {
            showError('User information not loaded');
            return;
        }

        // Open dedicated viewer window pointing to Render
        const url = `https://screenshare-jbdh.onrender.com/?userId=${currentUserId}&username=${encodeURIComponent(currentUsername)}&action=join&targetUser=${targetUserId}`;
        window.open(url, `viewer_${targetUserId}`, 'width=1200,height=800,resizable=yes,scrollbars=no');
    };

    // Initialize
    checkLogin();
}
