# 🎯 API Documentation - Check Active Presenters

## Overview
The server now has API endpoints you can call from Gamble Galaxy to check who's currently sharing their screen.

---

## 📡 API Endpoints

### 1. Check if Specific User is Presenting

**Endpoint:**
```
GET /api/is-presenting?userId={USER_ID}
```

**Example:**
```
https://rouletteshare.onrender.com/api/is-presenting?userId=123
```

**Response:**
```json
{
  "userId": "123",
  "isPresenting": true,
  "roomId": "room_123",
  "viewerCount": 3
}
```

**Fields:**
- `userId` - The user ID you queried
- `isPresenting` - `true` if user is currently sharing, `false` if not
- `roomId` - The room ID (always `room_{userId}`)
- `viewerCount` - Number of people watching (0 if not presenting)

---

### 2. Get All Active Presenters

**Endpoint:**
```
GET /api/active-presenters
```

**Example:**
```
https://rouletteshare.onrender.com/api/active-presenters
```

**Response:**
```json
{
  "count": 2,
  "presenters": [
    {
      "userId": "123",
      "username": "User_123",
      "roomId": "room_123",
      "viewerCount": 3
    },
    {
      "userId": "456",
      "username": "User_456",
      "roomId": "room_456",
      "viewerCount": 1
    }
  ]
}
```

**Fields:**
- `count` - Total number of active presenters
- `presenters` - Array of presenter objects
  - `userId` - User's ID
  - `username` - User's display name
  - `roomId` - Room ID
  - `viewerCount` - Number of viewers watching

---

## 💻 Usage Examples

### JavaScript/Fetch

```javascript
// Check if specific user is presenting
async function isUserPresenting(userId) {
    const response = await fetch(`https://rouletteshare.onrender.com/api/is-presenting?userId=${userId}`);
    const data = await response.json();
    return data.isPresenting;
}

// Get all active presenters
async function getActivePresenters() {
    const response = await fetch('https://rouletteshare.onrender.com/api/active-presenters');
    const data = await response.json();
    return data.presenters;
}

// Usage
const presenting = await isUserPresenting(123);
console.log('User 123 is presenting:', presenting);

const presenters = await getActivePresenters();
console.log('Active presenters:', presenters);
```

### jQuery

```javascript
// Check if user is presenting
$.get('https://rouletteshare.onrender.com/api/is-presenting?userId=123', function(data) {
    if (data.isPresenting) {
        console.log('User is presenting!');
        console.log('Viewers:', data.viewerCount);
    }
});

// Get all active presenters
$.get('https://rouletteshare.onrender.com/api/active-presenters', function(data) {
    console.log('Total presenters:', data.count);
    data.presenters.forEach(function(presenter) {
        console.log(`${presenter.username} has ${presenter.viewerCount} viewers`);
    });
});
```

### PHP

```php
// Check if user is presenting
function isUserPresenting($userId) {
    $url = "https://rouletteshare.onrender.com/api/is-presenting?userId=" . $userId;
    $response = file_get_contents($url);
    $data = json_decode($response, true);
    return $data['isPresenting'];
}

// Get all active presenters
function getActivePresenters() {
    $url = "https://rouletteshare.onrender.com/api/active-presenters";
    $response = file_get_contents($url);
    $data = json_decode($response, true);
    return $data['presenters'];
}

// Usage
$presenting = isUserPresenting(123);
if ($presenting) {
    echo "User 123 is sharing their screen!";
}

$presenters = getActivePresenters();
echo "Total presenters: " . count($presenters);
```

---

## 🎨 UI Integration Examples

### Example 1: Add Live Badge to User List

```javascript
// Fetch active presenters every 5 seconds
setInterval(async () => {
    const data = await fetch('https://rouletteshare.onrender.com/api/active-presenters')
        .then(r => r.json());
    
    // Remove all existing badges
    document.querySelectorAll('.live-badge').forEach(badge => badge.remove());
    
    // Add live badge to active presenters
    data.presenters.forEach(presenter => {
        const userElement = document.getElementById(`user-${presenter.userId}`);
        if (userElement) {
            const badge = document.createElement('span');
            badge.className = 'live-badge';
            badge.textContent = '🔴 LIVE';
            badge.title = `${presenter.viewerCount} viewers`;
            userElement.appendChild(badge);
        }
    });
}, 5000);
```

### Example 2: Show/Hide Watch Button

```javascript
// Check before showing watch button
async function updateWatchButton(userId) {
    const response = await fetch(`https://rouletteshare.onrender.com/api/is-presenting?userId=${userId}`);
    const data = await response.json();
    
    const watchBtn = document.getElementById(`watch-btn-${userId}`);
    if (data.isPresenting) {
        watchBtn.style.display = 'inline-block';
        watchBtn.textContent = `👁️ Watch (${data.viewerCount} viewers)`;
    } else {
        watchBtn.style.display = 'none';
    }
}
```

### Example 3: Dynamic User List with Status

```html
<div id="user-list"></div>

<script>
async function renderUserList(users) {
    // Get active presenters
    const response = await fetch('https://rouletteshare.onrender.com/api/active-presenters');
    const activePresenters = await response.json();
    
    // Create a map of presenting user IDs
    const presenterMap = {};
    activePresenters.presenters.forEach(p => {
        presenterMap[p.userId] = p;
    });
    
    const userListHTML = users.map(user => {
        const presenter = presenterMap[user.id];
        const isPresenting = !!presenter;
        
        return `
            <div class="user-item">
                <span class="username">${user.name}</span>
                ${isPresenting ? `
                    <span class="live-badge">🔴 LIVE</span>
                    <span class="viewer-count">${presenter.viewerCount} viewers</span>
                    <button onclick="watchUser(${user.id})">👁️ Watch</button>
                ` : ''}
            </div>
        `;
    }).join('');
    
    document.getElementById('user-list').innerHTML = userListHTML;
}

function watchUser(userId) {
    const currentUserId = getCurrentUserId(); // Your function to get current user
    const url = `https://rouletteshare.onrender.com/?userId=${currentUserId}&action=join&targetUser=${userId}`;
    window.open(url, '_blank');
}

// Refresh every 10 seconds
setInterval(() => {
    const users = getYourUserList(); // Your function to get users
    renderUserList(users);
}, 10000);
</script>
```

---

## 🔄 Polling Recommendations

Since this is real-time data, you'll want to poll these endpoints regularly:

**Recommended Polling Intervals:**
- **User List Page:** Poll every 5-10 seconds
- **Single User Profile:** Poll every 3-5 seconds when user is viewing
- **Background Check:** Poll every 30-60 seconds for general updates

**Example Polling Setup:**
```javascript
// Poll for active presenters
let pollingInterval;

function startPolling() {
    pollingInterval = setInterval(async () => {
        try {
            const response = await fetch('https://rouletteshare.onrender.com/api/active-presenters');
            const data = await response.json();
            updateUIWithActivePresenters(data.presenters);
        } catch (error) {
            console.error('Failed to fetch presenters:', error);
        }
    }, 5000); // Poll every 5 seconds
}

function stopPolling() {
    if (pollingInterval) {
        clearInterval(pollingInterval);
    }
}

// Start when page loads
startPolling();

// Stop when user leaves page
window.addEventListener('beforeunload', stopPolling);
```

---

## 🎯 Complete Example: User List with Live Indicators

```html
<!DOCTYPE html>
<html>
<head>
    <style>
        .user-card {
            padding: 15px;
            margin: 10px 0;
            border: 1px solid #ddd;
            border-radius: 8px;
        }
        .live-badge {
            background: #ff0000;
            color: white;
            padding: 4px 8px;
            border-radius: 4px;
            font-size: 12px;
            font-weight: bold;
        }
        .watch-btn {
            background: #2196f3;
            color: white;
            border: none;
            padding: 8px 16px;
            border-radius: 4px;
            cursor: pointer;
        }
    </style>
</head>
<body>
    <h1>Gamble Galaxy Users</h1>
    <div id="user-list"></div>

    <script>
        const currentUserId = 999; // Replace with actual current user ID
        
        // Your users from Gamble Galaxy database
        const users = [
            { id: 1, name: 'Alice' },
            { id: 2, name: 'Bob' },
            { id: 123, name: 'Charlie' },
            { id: 456, name: 'David' }
        ];

        async function updateUserList() {
            try {
                // Fetch active presenters
                const response = await fetch('https://rouletteshare.onrender.com/api/active-presenters');
                const data = await response.json();
                
                // Create presenter map
                const presenterMap = {};
                data.presenters.forEach(p => {
                    presenterMap[p.userId] = p;
                });
                
                // Render user list
                const html = users.map(user => {
                    const presenter = presenterMap[user.id];
                    const isLive = !!presenter;
                    
                    return `
                        <div class="user-card">
                            <strong>${user.name}</strong>
                            ${isLive ? `
                                <span class="live-badge">🔴 LIVE</span>
                                <span>(${presenter.viewerCount} viewers)</span>
                                <button class="watch-btn" onclick="watchUser(${user.id})">
                                    👁️ Watch Screen
                                </button>
                            ` : ''}
                        </div>
                    `;
                }).join('');
                
                document.getElementById('user-list').innerHTML = html;
            } catch (error) {
                console.error('Error updating user list:', error);
            }
        }

        function watchUser(targetUserId) {
            const url = `https://rouletteshare.onrender.com/?userId=${currentUserId}&action=join&targetUser=${targetUserId}`;
            window.open(url, '_blank', 'width=1200,height=800');
        }

        // Update immediately
        updateUserList();
        
        // Update every 5 seconds
        setInterval(updateUserList, 5000);
    </script>
</body>
</html>
```

---

## ✅ Testing the API

### Test in Browser
Open these URLs directly in your browser:

1. Check specific user:
```
https://rouletteshare.onrender.com/api/is-presenting?userId=1
```

2. Get all presenters:
```
https://rouletteshare.onrender.com/api/active-presenters
```

### Test with curl
```bash
# Check specific user
curl "https://rouletteshare.onrender.com/api/is-presenting?userId=1"

# Get all presenters
curl "https://rouletteshare.onrender.com/api/active-presenters"
```

---

## 🔒 CORS Support

The API includes CORS headers (`Access-Control-Allow-Origin: *`), so you can call it from Gamble Galaxy without issues.

---

## 🚀 Next Steps

1. Upload the new `server.js` to GitHub
2. Wait for Render to deploy
3. Test the API endpoints
4. Integrate into Gamble Galaxy user list
5. Add polling to keep status updated

The API will automatically track when users start/stop presenting in real-time!
