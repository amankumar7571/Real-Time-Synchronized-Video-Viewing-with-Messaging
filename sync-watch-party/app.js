// Global variables
let player;
let currentUser = null;
let currentRoom = null;
let isHost = false;
let lastSyncTime = 0;
let syncInterval;

// DOM elements
const welcomeScreen = document.getElementById('welcomeScreen');
const mainApp = document.getElementById('mainApp');
const roomInfo = document.getElementById('roomInfo');
const currentRoomCode = document.getElementById('currentRoomCode');
const userCount = document.getElementById('userCount');
const onlineCount = document.getElementById('onlineCount');
const usersList = document.getElementById('usersList');
const chatMessages = document.getElementById('chatMessages');
const messageInput = document.getElementById('messageInput');
const errorMessage = document.getElementById('errorMessage');

// Initialize the application
document.addEventListener('DOMContentLoaded', function() {
    initializeEventListeners();
    loadStoredState();
    
    // Listen for localStorage changes (simulating real-time events)
    window.addEventListener('storage', handleStorageEvent);
    
    // Clean up on page unload
    window.addEventListener('beforeunload', leaveRoom);
});

function initializeEventListeners() {
    // Welcome screen events
    document.getElementById('createRoomBtn').addEventListener('click', createRoom);
    document.getElementById('joinRoomBtn').addEventListener('click', joinRoom);
    document.getElementById('nickname').addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
            const roomCode = document.getElementById('roomCodeInput').value.trim();
            if (roomCode) {
                joinRoom();
            } else {
                createRoom();
            }
        }
    });
    document.getElementById('roomCodeInput').addEventListener('keypress', function(e) {
        if (e.key === 'Enter') joinRoom();
    });

    // Main app events
    document.getElementById('loadVideoBtn').addEventListener('click', loadVideo);
    document.getElementById('youtubeUrl').addEventListener('keypress', function(e) {
        if (e.key === 'Enter') loadVideo();
    });
    document.getElementById('sendMessageBtn').addEventListener('click', sendMessage);
    document.getElementById('messageInput').addEventListener('keypress', function(e) {
        if (e.key === 'Enter') sendMessage();
    });
    document.getElementById('leaveRoomBtn').addEventListener('click', leaveRoom);
}

function createRoom() {
    const nickname = document.getElementById('nickname').value.trim();
    if (!nickname) {
        showError('Please enter a nickname');
        return;
    }

    const roomCode = generateRoomCode();
    currentUser = {
        id: generateUserId(),
        nickname: nickname,
        joinedAt: Date.now()
    };

    currentRoom = {
        code: roomCode,
        host: currentUser.id,
        users: [currentUser],
        video: null,
        messages: [],
        createdAt: Date.now()
    };

    isHost = true;
    saveRoomState();
    showMainApp();
    addSystemMessage(`Room created! Share code: ${roomCode}`);
}

function joinRoom() {
    const nickname = document.getElementById('nickname').value.trim();
    const roomCode = document.getElementById('roomCodeInput').value.trim().toUpperCase();
    
    if (!nickname) {
        showError('Please enter a nickname');
        return;
    }
    
    if (!roomCode) {
        showError('Please enter a room code');
        return;
    }

    const room = getRoomFromStorage(roomCode);
    if (!room) {
        showError('Room not found');
        return;
    }

    if (room.users.length >= 4) {
        showError('Room is full (max 4 users)');
        return;
    }

    currentUser = {
        id: generateUserId(),
        nickname: nickname,
        joinedAt: Date.now()
    };

    currentRoom = room;
    currentRoom.users.push(currentUser);
    isHost = currentRoom.host === currentUser.id;

    saveRoomState();
    showMainApp();
    addSystemMessage(`${nickname} joined the room`);
    
    // Load existing video if any
    if (currentRoom.video) {
        loadYouTubeVideo(currentRoom.video.videoId, false);
    }
}

function leaveRoom() {
    if (!currentRoom || !currentUser) return;

    // Remove user from room
    currentRoom.users = currentRoom.users.filter(user => user.id !== currentUser.id);
    
    if (currentRoom.users.length === 0) {
        // Delete empty room
        localStorage.removeItem(`room_${currentRoom.code}`);
    } else {
        // If host left, assign new host
        if (isHost && currentRoom.users.length > 0) {
            currentRoom.host = currentRoom.users[0].id;
        }
        addSystemMessage(`${currentUser.nickname} left the room`);
        saveRoomState();
    }

    // Clear sync interval
    if (syncInterval) {
        clearInterval(syncInterval);
        syncInterval = null;
    }

    // Reset state
    currentUser = null;
    currentRoom = null;
    isHost = false;

    // Show welcome screen
    welcomeScreen.style.display = 'block';
    mainApp.style.display = 'none';
    roomInfo.style.display = 'none';

    // Clear forms
    document.getElementById('nickname').value = '';
    document.getElementById('roomCodeInput').value = '';
    document.getElementById('youtubeUrl').value = '';
    
    // Clear chat input and ensure placeholder is visible
    const chatInput = document.getElementById('messageInput');
    chatInput.value = '';
    chatInput.blur();
}

function loadVideo() {
    if (!isHost) {
        showError('Only the host can load videos');
        return;
    }

    const url = document.getElementById('youtubeUrl').value.trim();
    if (!url) {
        showError('Please enter a YouTube URL');
        return;
    }

    const videoId = extractVideoId(url);
    if (!videoId) {
        showError('Invalid YouTube URL');
        return;
    }

    loadYouTubeVideo(videoId, true);
}

function loadYouTubeVideo(videoId, broadcast = true) {
    if (broadcast) {
        currentRoom.video = {
            videoId: videoId,
            loadedAt: Date.now()
        };
        saveRoomState();
        broadcastEvent('video_loaded', { videoId });
    }

    // Hide placeholder
    document.getElementById('videoPlaceholder').style.display = 'none';

    // Create or update player
    if (player) {
        player.loadVideoById(videoId);
    } else {
        player = new YT.Player('player', {
            height: '100%',
            width: '100%',
            videoId: videoId,
            playerVars: {
                'playsinline': 1,
                'controls': isHost ? 1 : 0
            },
            events: {
                'onReady': onPlayerReady,
                'onStateChange': onPlayerStateChange
            }
        });
    }
}

function onYouTubeIframeAPIReady() {
    // YouTube API is ready
    console.log('YouTube API ready');
}

function onPlayerReady(event) {
    // Start sync interval for non-hosts
    if (!isHost) {
        syncInterval = setInterval(syncVideoTime, 2000);
    }
}

function onPlayerStateChange(event) {
    if (!isHost || !currentRoom) return;

    const state = event.data;
    const currentTime = player.getCurrentTime();

    switch (state) {
        case YT.PlayerState.PLAYING:
            broadcastEvent('video_play', { time: currentTime });
            break;
        case YT.PlayerState.PAUSED:
            broadcastEvent('video_pause', { time: currentTime });
            break;
    }
}

function syncVideoTime() {
    if (isHost || !player || !currentRoom.video) return;

    const currentTime = player.getCurrentTime();
    const timeDiff = Math.abs(currentTime - lastSyncTime);
    
    // Sync if difference is more than 2 seconds
    if (timeDiff > 2) {
        player.seekTo(lastSyncTime);
    }
}

function sendMessage() {
    const content = messageInput.value.trim();
    if (!content || !currentUser || !currentRoom) return;

    const message = {
        id: generateUserId(),
        sender: currentUser.nickname,
        content: content,
        timestamp: Date.now()
    };

    currentRoom.messages.push(message);
    saveRoomState();
    broadcastEvent('message_sent', message);
    displayMessage(message);
    
    // Clear input and ensure proper placeholder display
    messageInput.value = '';
    messageInput.focus();
}

function displayMessage(message) {
    const messageDiv = document.createElement('div');
    messageDiv.className = 'chat-message';
    
    const time = new Date(message.timestamp).toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit'
    });

    messageDiv.innerHTML = `
        <div class="message-header">
            <span class="message-sender">${escapeHtml(message.sender)}</span>
            <span class="message-time">${time}</span>
        </div>
        <div class="message-content">${escapeHtml(message.content)}</div>
    `;

    chatMessages.appendChild(messageDiv);
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

function addSystemMessage(content) {
    const messageDiv = document.createElement('div');
    messageDiv.className = 'system-message';
    messageDiv.textContent = content;
    chatMessages.appendChild(messageDiv);
    chatMessages.scrollTop = chatMessages.scrollHeight;

    // Also save to room messages
    if (currentRoom) {
        const systemMessage = {
            id: generateUserId(),
            sender: 'System',
            content: content,
            timestamp: Date.now(),
            isSystem: true
        };
        currentRoom.messages.push(systemMessage);
        saveRoomState();
    }
}

function updateUI() {
    if (!currentRoom) return;

    // Update room info
    currentRoomCode.textContent = currentRoom.code;
    userCount.textContent = `Users: ${currentRoom.users.length}/4`;
    onlineCount.textContent = currentRoom.users.length;

    // Update users list
    usersList.innerHTML = '';
    currentRoom.users.forEach(user => {
        const userDiv = document.createElement('div');
        userDiv.className = 'user-item';
        
        userDiv.innerHTML = `
            <div class="user-status"></div>
            <span class="user-name">${escapeHtml(user.nickname)}</span>
            ${user.id === currentRoom.host ? '<span class="user-host">HOST</span>' : ''}
        `;
        
        usersList.appendChild(userDiv);
    });

    // Update video controls visibility
    const videoControls = document.getElementById('videoControls');
    videoControls.style.display = isHost ? 'block' : 'none';
}

function showMainApp() {
    welcomeScreen.style.display = 'none';
    mainApp.style.display = 'block';
    roomInfo.style.display = 'flex';
    
    // Load existing messages
    chatMessages.innerHTML = '';
    if (currentRoom.messages) {
        currentRoom.messages.forEach(msg => {
            if (msg.isSystem) {
                addSystemMessage(msg.content);
            } else {
                displayMessage(msg);
            }
        });
    }
    
    updateUI();

    // Create player container if it doesn't exist
    if (!document.getElementById('player')) {
        const playerDiv = document.createElement('div');
        playerDiv.id = 'player';
        document.getElementById('videoContainer').appendChild(playerDiv);
    }

    // Focus on the message input for better UX
    setTimeout(() => {
        messageInput.focus();
    }, 100);
}

function handleStorageEvent(event) {
    if (!event.key || !event.key.startsWith('event_')) return;
    
    const eventData = JSON.parse(event.newValue);
    if (!eventData || eventData.roomCode !== currentRoom?.code) return;

    switch (eventData.type) {
        case 'room_updated':
            loadRoomState();
            break;
        case 'video_loaded':
            if (!isHost) {
                loadYouTubeVideo(eventData.data.videoId, false);
            }
            break;
        case 'video_play':
            if (!isHost && player) {
                player.seekTo(eventData.data.time);
                player.playVideo();
                lastSyncTime = eventData.data.time;
            }
            break;
        case 'video_pause':
            if (!isHost && player) {
                player.seekTo(eventData.data.time);
                player.pauseVideo();
                lastSyncTime = eventData.data.time;
            }
            break;
        case 'message_sent':
            if (eventData.data.sender !== currentUser?.nickname) {
                displayMessage(eventData.data);
            }
            break;
    }
}

function broadcastEvent(type, data) {
    const eventKey = `event_${Date.now()}_${Math.random()}`;
    const eventData = {
        type: type,
        data: data,
        roomCode: currentRoom?.code,
        timestamp: Date.now()
    };
    
    localStorage.setItem(eventKey, JSON.stringify(eventData));
    
    // Clean up old events
    setTimeout(() => {
        localStorage.removeItem(eventKey);
    }, 5000);
}

// Utility functions
function generateRoomCode() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let result = '';
    for (let i = 0; i < 6; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
}

function generateUserId() {
    return Date.now().toString() + Math.random().toString(36).substr(2, 9);
}

function extractVideoId(url) {
    const regex = /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&\n?#]+)/;
    const match = url.match(regex);
    return match ? match[1] : null;
}

function saveRoomState() {
    if (!currentRoom) return;
    localStorage.setItem(`room_${currentRoom.code}`, JSON.stringify(currentRoom));
    broadcastEvent('room_updated', currentRoom);
}

function loadRoomState() {
    if (!currentRoom) return;
    const stored = getRoomFromStorage(currentRoom.code);
    if (stored) {
        currentRoom = stored;
        updateUI();
    }
}

function getRoomFromStorage(roomCode) {
    const stored = localStorage.getItem(`room_${roomCode}`);
    return stored ? JSON.parse(stored) : null;
}

function loadStoredState() {
    // Clean up old rooms (older than 1 hour)
    const cutoff = Date.now() - (60 * 60 * 1000);
    Object.keys(localStorage).forEach(key => {
        if (key.startsWith('room_')) {
            const room = JSON.parse(localStorage.getItem(key));
            if (room.createdAt < cutoff) {
                localStorage.removeItem(key);
            }
        }
        if (key.startsWith('event_')) {
            localStorage.removeItem(key);
        }
    });
}

function showError(message) {
    errorMessage.textContent = message;
    errorMessage.style.display = 'block';
    setTimeout(() => {
        errorMessage.style.display = 'none';
    }, 5000);
}

function escapeHtml(unsafe) {
    return unsafe
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}