// mobile_cam_popup.js - Keep this on Render.com (GitHub)
// This file can be loaded from external sites like Gamble Galaxy
// UPDATED VERSION: Automatically detects stream type (mobile camera vs screen share)

/**
 * Opens mobile camera popup for a user
 * Can be called from any website that loads this script
 */
function openMobileCamPopup() {
    // Configuration
    const RENDER_URL = 'https://screenshare-jbdh.onrender.com';  // Your Render server
    const HOSTINGER_URL = 'https://flipadeals.com';  // Your Hostinger domain
    
    // Get user info from your Gamble Galaxy site
    fetch('https://flipadeals.com/contest_get_user_id.php', {
        credentials: 'include'  // Include cookies for session
    })
    .then(response => response.json())
    .then(data => {
        if (!data.user_id) {
            alert('Please log in to share your mobile camera');
            return;
        }

        const userId = data.user_id;
        const username = data.username || 'User';
        
        // Determine which page to open based on URL parameters
        const urlParams = new URLSearchParams(window.location.search);
        const action = urlParams.get('action');
        const targetUser = urlParams.get('targetUser');
        
        let popupUrl;
        
        if (action === 'join' && targetUser) {
            // Viewer: Need to detect stream type first!
            // Use the smart openMobileCam function instead
            openMobileCam('join', targetUser);
            return;
        } else {
            // Host: Open mobile cam page on Render
            popupUrl = `${RENDER_URL}/mobile_cam_flipadeals.html?userId=${userId}&username=${encodeURIComponent(username)}&action=create`;
        }

        // Open popup window
        const popup = window.open(
            popupUrl,
            'MobileCamWindow',
            'width=800,height=900,menubar=no,toolbar=no,location=no,status=no,scrollbars=yes,resizable=yes'
        );

        if (!popup) {
            alert('Popup blocked! Please allow popups for this site.');
        }
    })
    .catch(error => {
        console.error('Error getting user info:', error);
        alert('Error: Unable to verify login status');
    });
}

/**
 * Opens mobile camera for a specific action
 * UPDATED: Now detects stream type automatically
 * @param {string} action - 'create' or 'join'
 * @param {string} targetUser - User ID to watch (only for 'join')
 */
async function openMobileCam(action = 'create', targetUser = null) {
    const RENDER_URL = 'https://screenshare-jbdh.onrender.com';
    const HOSTINGER_URL = 'https://flipadeals.com';
    
    try {
        const response = await fetch('https://flipadeals.com/contest_get_user_id.php', {
            credentials: 'include'
        });
        const data = await response.json();
        
        if (!data.user_id) {
            alert('Please log in first');
            return;
        }

        const userId = data.user_id;
        const username = data.username || 'User';
        
        let popupUrl;
        
        if (action === 'join' && targetUser) {
            // SMART DETECTION: Check what type of stream the target user has
            const streamType = await detectStreamType(targetUser);
            
            if (!streamType.isLive) {
                alert(`User ${targetUser} is not currently streaming`);
                return;
            }
            
            // Open the correct viewer based on stream type
            if (streamType.type === 'mobile-cam') {
                // Mobile camera viewer
                popupUrl = `${HOSTINGER_URL}/mobile_cam_viewer.php?userId=${userId}&username=${encodeURIComponent(username)}&targetUser=${targetUser}`;
            } else {
                // Screen share viewer
                popupUrl = `${HOSTINGER_URL}/screen_share_viewer.php?userId=${userId}&username=${encodeURIComponent(username)}&targetUser=${targetUser}`;
            }
        } else {
            // Host: Open mobile cam page on Render
            popupUrl = `${RENDER_URL}/mobile_cam_flipdeals.html?userId=${userId}&username=${encodeURIComponent(username)}&action=create`;
        }

        const popup = window.open(
            popupUrl,
            'MobileCamWindow',
            'width=800,height=900,menubar=no,toolbar=no,location=no,status=no,scrollbars=yes,resizable=yes'
        );

        if (!popup) {
            alert('Popup blocked! Please allow popups for this site.');
        }
    } catch (error) {
        console.error('Error:', error);
        alert('Error: Unable to start mobile camera');
    }
}

/**
 * Detect what type of stream a user has
 * NEW FUNCTION: Checks both mobile camera and screen share
 * @param {string} userId - User ID to check
 * @returns {Promise} Promise with stream type info
 */
async function detectStreamType(userId) {
    const RENDER_URL = 'https://screenshare-jbdh.onrender.com';
    
    try {
        // Check mobile camera first (since this is mobile_cam_popup.js)
        const mobileResponse = await fetch(`${RENDER_URL}/api/is-presenting?userId=mobile_${userId}`);
        const mobileData = await mobileResponse.json();
        
        if (mobileData.isPresenting) {
            return {
                isLive: true,
                type: 'mobile-cam',
                viewerCount: mobileData.viewerCount,
                username: mobileData.username,
                roomId: mobileData.roomId
            };
        }

        // Check screen share
        const screenResponse = await fetch(`${RENDER_URL}/api/is-presenting?userId=${userId}`);
        const screenData = await screenResponse.json();
        
        if (screenData.isPresenting) {
            return {
                isLive: true,
                type: 'screen-share',
                viewerCount: screenData.viewerCount,
                username: screenData.username,
                roomId: screenData.roomId
            };
        }

        // Not streaming
        return {
            isLive: false,
            type: null
        };
        
    } catch (error) {
        console.error('Error detecting stream type:', error);
        return {
            isLive: false,
            type: null,
            error: error.message
        };
    }
}

/**
 * Check if a user is currently streaming mobile camera
 * @param {string} userId - User ID to check
 * @returns {Promise} Promise with streaming status
 */
async function checkUserStreamingMobileCam(userId) {
    try {
        const response = await fetch(`https://screenshare-jbdh.onrender.com/api/is-presenting?userId=mobile_${userId}`);
        const data = await response.json();
        return data;
    } catch (error) {
        console.error('Error checking mobile cam status:', error);
        return { isPresenting: false, error: error.message };
    }
}

/**
 * Get all active mobile camera streamers
 * @returns {Promise} Promise with list of active streamers
 */
async function getActiveMobileCamStreamers() {
    try {
        const response = await fetch('https://screenshare-jbdh.onrender.com/api/active-presenters');
        const data = await response.json();
        
        // Filter for mobile cam presenters only (roomId starts with mobile_room_)
        const mobileCamPresenters = data.presenters.filter(p => p.roomId.startsWith('mobile_room_'));
        
        return {
            count: mobileCamPresenters.length,
            presenters: mobileCamPresenters
        };
    } catch (error) {
        console.error('Error getting active mobile cam streamers:', error);
        return { count: 0, presenters: [], error: error.message };
    }
}

// Make functions available globally
if (typeof window !== 'undefined') {
    window.openMobileCamPopup = openMobileCamPopup;
    window.openMobileCam = openMobileCam;
    window.detectStreamType = detectStreamType;
    window.checkUserStreamingMobileCam = checkUserStreamingMobileCam;
    window.getActiveMobileCamStreamers = getActiveMobileCamStreamers;
}
