# 🚨 DEPLOYMENT CHECKLIST - Fix 404 Error

## The Problem
Getting 404 error when visiting: https://rouletteshare.onrender.com/?userId=1&action=create

## Root Cause
The server wasn't properly parsing URL query parameters (the `?userId=1&action=create` part)

## ✅ Solution Steps

### Step 1: Verify Files on GitHub
Make sure your GitHub repository has these 4 files:
- [ ] `index.html`
- [ ] `client.js` (the NEW one with URL parameter support)
- [ ] `server.js` (the NEW one with URL parsing)
- [ ] `package.json`

### Step 2: Update server.js
Replace your `server.js` with the NEW version I just created that includes:
```javascript
const url = require('url');
const parsedUrl = url.parse(req.url);
const pathname = parsedUrl.pathname;
```

This properly separates the path from query parameters.

### Step 3: Push to GitHub
```bash
git add .
git commit -m "Fix URL parameter parsing for auto-join feature"
git push
```

### Step 4: Wait for Render to Deploy
- Go to your Render dashboard
- Watch the deployment logs
- Wait for "Deploy live" message (1-2 minutes)

### Step 5: Test Again
Try these URLs:
1. **Basic test**: https://rouletteshare.onrender.com/
   - Should show the app interface ✅
   
2. **With parameters**: https://rouletteshare.onrender.com/?userId=1&action=create
   - Should show the app interface ✅
   - Should auto-fill "User_1" and "room_1" ✅
   - Should auto-connect after 0.5 seconds ✅

## 🔍 Debugging Steps

### If still getting 404:

1. **Check Render Logs:**
   - Go to Render dashboard → Your service → Logs
   - Look for errors during deployment
   - Should see: "Server running on port XXXXX"

2. **Check File Structure on Render:**
   - In logs, look for: "HTTP Request: /client.js"
   - Should NOT say: "404 Not Found"

3. **Verify Files Exist:**
   Make sure these files are in the ROOT of your GitHub repo:
   ```
   your-repo/
   ├── index.html
   ├── client.js
   ├── server.js
   └── package.json
   ```
   
   NOT in a subfolder like:
   ```
   your-repo/
   └── src/
       ├── index.html  ❌ WRONG
       ├── client.js   ❌ WRONG
       └── server.js   ❌ WRONG
   ```

4. **Check Browser Console:**
   - Open browser DevTools (F12)
   - Go to Network tab
   - Refresh the page
   - Look for `client.js` request
   - Should be 200 OK, not 404

### Common Issues:

**Issue:** "Failed to load resource: client.js 404"
**Fix:** Make sure `client.js` is in the root of your GitHub repo

**Issue:** Page loads but doesn't auto-connect
**Fix:** Make sure you're using the NEW `client.js` with URL parameter support

**Issue:** Render logs show "Cannot find module"
**Fix:** Run `npm install` locally and make sure `package.json` has the `ws` dependency

## 📋 Quick Verification

Before considering it "fixed", verify:
- [ ] https://rouletteshare.onrender.com/ loads the interface
- [ ] https://rouletteshare.onrender.com/?userId=1&action=create loads the interface
- [ ] Auto-fills "User_1" and "room_1"
- [ ] Auto-connects within 1 second
- [ ] Can click "Start Sharing Screen" button

## 🎯 Final Test

1. Open: https://rouletteshare.onrender.com/?userId=1&action=create
2. Click "Start Sharing Screen"
3. Share your screen
4. Open NEW tab: https://rouletteshare.onrender.com/?userId=2&action=join&targetUser=1
5. Should immediately see User 1's screen!

---

## If Still Having Issues...

Check these files are EXACTLY in your GitHub root:
1. **server.js** - Must have `url.parse()` to handle query strings
2. **client.js** - Must have `window.addEventListener('DOMContentLoaded')` for URL params
3. **index.html** - Original file (no changes needed)
4. **package.json** - Must have `"ws": "^8.14.2"` in dependencies
