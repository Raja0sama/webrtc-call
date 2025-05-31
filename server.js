// server.js
const server = Bun.serve({
  port: 3000,
  fetch(req, server) {
    const url = new URL(req.url);
    
    // WebSocket upgrade for signaling
    if (url.pathname === "/ws") {
      const success = server.upgrade(req);
      if (success) return undefined;
    }
    
    // Serve the HTML file
    if (url.pathname === "/" || url.pathname === "/index.html") {
      return new Response(htmlContent, {
        headers: { "Content-Type": "text/html" }
      });
    }
    
    return new Response("Not Found", { status: 404 });
  },
  
  websocket: {
    message(ws, message) {
      try {
        const data = JSON.parse(message);
        handleSignalingMessage(ws, data);
      } catch (error) {
        console.error("Invalid message:", error);
      }
    },
    
    open(ws) {
      console.log("Client connected");
    },
    
    close(ws) {
      // Remove client from any rooms
      for (const [roomId, room] of rooms.entries()) {
        room.clients = room.clients.filter(client => client !== ws);
        if (room.clients.length === 0) {
          rooms.delete(roomId);
        }
      }
      console.log("Client disconnected");
    }
  }
});

// In-memory room management
const rooms = new Map();

function handleSignalingMessage(ws, data) {
  const { type, room, ...payload } = data;
  
  switch (type) {
    case 'join-room':
      joinRoom(ws, room, payload.username);
      break;
      
    case 'offer':
    case 'answer':
    case 'ice-candidate':
      relayToOtherPeer(ws, room, { type, ...payload });
      break;
      
    default:
      console.log("Unknown message type:", type);
  }
}

function joinRoom(ws, roomId, username) {
  if (!rooms.has(roomId)) {
    rooms.set(roomId, { clients: [], roomId });
  }
  
  const room = rooms.get(roomId);
  
  // Don't allow more than 2 clients per room
  if (room.clients.length >= 2) {
    ws.send(JSON.stringify({ type: 'error', message: 'Room is full' }));
    return;
  }
  
  room.clients.push(ws);
  ws.room = roomId;
  ws.username = username;
  
  console.log(`${username} joined room ${roomId} (${room.clients.length}/2)`);
  
  // Notify client they joined successfully
  ws.send(JSON.stringify({ 
    type: 'room-joined', 
    roomId,
    isHost: room.clients.length === 1,
    peersInRoom: room.clients.length 
  }));
  
  // If this is the second person, notify both that they can start connecting
  if (room.clients.length === 2) {
    room.clients.forEach(client => {
      client.send(JSON.stringify({ 
        type: 'peer-joined', 
        peersInRoom: 2 
      }));
    });
  }
}

function relayToOtherPeer(senderWs, roomId, message) {
  const room = rooms.get(roomId);
  if (!room) return;
  
  // Send to the other peer in the room
  room.clients.forEach(client => {
    if (client !== senderWs) {
      client.send(JSON.stringify(message));
    }
  });
}

// HTML content with WebSocket signaling
const htmlContent = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Elden Ring Voice Call</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }

        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif;
            background: #000;
            color: #fff;
            min-height: 100vh;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            background-image: 
                radial-gradient(circle at 25% 25%, #1a1a1a 0%, transparent 50%),
                radial-gradient(circle at 75% 75%, #0a0a0a 0%, transparent 50%);
        }

        .container {
            max-width: 500px;
            width: 90%;
            background: rgba(26, 26, 26, 0.8);
            border: 1px solid #333;
            border-radius: 12px;
            padding: 2rem;
            backdrop-filter: blur(20px);
            box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
        }

        .header {
            text-align: center;
            margin-bottom: 2rem;
        }

        .title {
            font-size: 1.5rem;
            font-weight: 600;
            margin-bottom: 0.5rem;
            background: linear-gradient(135deg, #fff, #888);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            background-clip: text;
        }

        .subtitle {
            color: #888;
            font-size: 0.9rem;
        }

        .room-section {
            margin-bottom: 2rem;
        }

        .input-group {
            margin-bottom: 1rem;
        }

        label {
            display: block;
            margin-bottom: 0.5rem;
            color: #ccc;
            font-size: 0.9rem;
        }

        input {
            width: 100%;
            padding: 0.75rem;
            background: #111;
            border: 1px solid #333;
            border-radius: 6px;
            color: #fff;
            font-size: 1rem;
            transition: border-color 0.2s;
        }

        input:focus {
            outline: none;
            border-color: #0070f3;
            box-shadow: 0 0 0 2px rgba(0, 112, 243, 0.1);
        }

        .button {
            width: 100%;
            padding: 0.75rem;
            background: #0070f3;
            color: #fff;
            border: none;
            border-radius: 6px;
            font-size: 1rem;
            font-weight: 500;
            cursor: pointer;
            transition: all 0.2s;
            margin-bottom: 0.5rem;
        }

        .button:hover {
            background: #0051a2;
            transform: translateY(-1px);
        }

        .button:disabled {
            background: #333;
            cursor: not-allowed;
            transform: none;
        }

        .button.secondary {
            background: #333;
            border: 1px solid #555;
        }

        .button.secondary:hover {
            background: #444;
        }

        .button.danger {
            background: #dc2626;
        }

        .button.danger:hover {
            background: #b91c1c;
        }

        .status {
            text-align: center;
            margin: 1rem 0;
            padding: 0.75rem;
            border-radius: 6px;
            font-size: 0.9rem;
        }

        .status.connecting {
            background: rgba(251, 191, 36, 0.1);
            color: #fbbf24;
            border: 1px solid rgba(251, 191, 36, 0.2);
        }

        .status.connected {
            background: rgba(34, 197, 94, 0.1);
            color: #22c55e;
            border: 1px solid rgba(34, 197, 94, 0.2);
        }

        .status.error {
            background: rgba(220, 38, 38, 0.1);
            color: #dc2626;
            border: 1px solid rgba(220, 38, 38, 0.2);
        }

        .call-controls {
            display: flex;
            gap: 0.5rem;
            margin-top: 1rem;
        }

        .control-btn {
            flex: 1;
            padding: 0.5rem;
            border: none;
            border-radius: 6px;
            cursor: pointer;
            font-size: 0.9rem;
            transition: all 0.2s;
        }

        .mute-btn {
            background: #333;
            color: #fff;
        }

        .mute-btn:hover {
            background: #444;
        }

        .mute-btn.muted {
            background: #dc2626;
        }

        .hidden {
            display: none;
        }

        .room-code {
            background: #111;
            border: 1px solid #333;
            padding: 1rem;
            border-radius: 6px;
            margin: 1rem 0;
            text-align: center;
            font-family: 'Courier New', monospace;
            font-size: 1.1rem;
            letter-spacing: 2px;
        }

        .copy-btn {
            background: #333;
            color: #fff;
            border: 1px solid #555;
            padding: 0.25rem 0.5rem;
            border-radius: 4px;
            cursor: pointer;
            font-size: 0.8rem;
            margin-left: 0.5rem;
        }

        .connection-info {
            background: rgba(0, 112, 243, 0.1);
            border: 1px solid rgba(0, 112, 243, 0.2);
            padding: 0.75rem;
            border-radius: 6px;
            margin: 1rem 0;
            font-size: 0.9rem;
            color: #60a5fa;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1 class="title">Elden Ring Voice Call</h1>
            <p class="subtitle">Quick P2P voice chat for Night Reign</p>
        </div>

        <div id="setup-screen">
            <div class="room-section">
                <div class="input-group">
                    <label for="username">Your Name</label>
                    <input type="text" id="username" placeholder="Enter your name" />
                </div>
                
                <button class="button" onclick="createRoom()">Create Room</button>
                <button class="button secondary" onclick="showJoinRoom()">Join Room</button>
                
                <div id="join-section" class="hidden">
                    <div class="input-group" style="margin-top: 1rem;">
                        <label for="room-id">Room Code</label>
                        <input type="text" id="room-id" placeholder="Enter room code" />
                    </div>
                    <button class="button" onclick="joinRoom()">Join Room</button>
                </div>
            </div>
        </div>

        <div id="room-screen" class="hidden">
            <div id="room-info">
                <div class="room-code">
                    <span>Room: </span>
                    <span id="current-room"></span>
                    <button class="copy-btn" onclick="copyRoomCode()">Copy</button>
                </div>
            </div>

            <div id="connection-info" class="connection-info">
                Connected to signaling server ✓
            </div>

            <div id="status" class="status connecting">Connecting...</div>

            <div id="call-controls" class="call-controls hidden">
                <button class="control-btn mute-btn" id="mute-btn" onclick="toggleMute()">🔊 Unmuted</button>
                <button class="control-btn danger" onclick="endCall()">End Call</button>
            </div>

            <button class="button secondary" onclick="leaveRoom()">Leave Room</button>
        </div>
    </div>

    <script>
        let ws = null;
        let localStream = null;
        let peerConnection = null;
        let currentRoom = null;
        let isMuted = false;
        let isHost = false;
        let username = '';

        // Connect to WebSocket signaling server
        function connectSignaling() {
            const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
            const wsUrl = protocol + '//' + window.location.host + '/ws';
            
            ws = new WebSocket(wsUrl);
            
            ws.onopen = () => {
                console.log('Connected to signaling server');
            };
            
            ws.onmessage = (event) => {
                const data = JSON.parse(event.data);
                handleSignalingMessage(data);
            };
            
            ws.onclose = () => {
                console.log('Disconnected from signaling server');
                updateStatus('error', 'Lost connection to signaling server');
            };
            
            ws.onerror = (error) => {
                console.error('WebSocket error:', error);
                updateStatus('error', 'Failed to connect to signaling server');
            };
        }

        async function createRoom() {
            username = document.getElementById('username').value.trim();
            if (!username) {
                alert('Please enter your name');
                return;
            }

            currentRoom = Math.random().toString(36).substring(2, 8).toUpperCase();
            isHost = true;
            
            connectSignaling();
            await initializeCall();
            showRoomScreen();
        }

        function showJoinRoom() {
            document.getElementById('join-section').classList.remove('hidden');
        }

        async function joinRoom() {
            username = document.getElementById('username').value.trim();
            const roomId = document.getElementById('room-id').value.trim().toUpperCase();
            
            if (!username || !roomId) {
                alert('Please enter your name and room code');
                return;
            }

            currentRoom = roomId;
            isHost = false;
            
            connectSignaling();
            await initializeCall();
            showRoomScreen();
        }

        function showRoomScreen() {
            document.getElementById('setup-screen').classList.add('hidden');
            document.getElementById('room-screen').classList.remove('hidden');
            document.getElementById('current-room').textContent = currentRoom;
            
            updateStatus('connecting', 'Joining room...');
        }

        async function initializeCall() {
            try {
                // Get user media
                localStream = await navigator.mediaDevices.getUserMedia({ audio: true });
                
                // Create peer connection
                peerConnection = new RTCPeerConnection({
                    iceServers: [
                        { urls: 'stun:stun.l.google.com:19302' },
                        { urls: 'stun:stun1.l.google.com:19302' }
                    ]
                });

                // Add local stream
                localStream.getTracks().forEach(track => {
                    peerConnection.addTrack(track, localStream);
                });

                // Handle remote stream
                peerConnection.ontrack = (event) => {
                    updateStatus('connected', 'Connected! Voice chat active');
                    document.getElementById('call-controls').classList.remove('hidden');
                };

                // Handle ICE candidates
                peerConnection.onicecandidate = (event) => {
                    if (event.candidate && ws.readyState === WebSocket.OPEN) {
                        ws.send(JSON.stringify({
                            type: 'ice-candidate',
                            room: currentRoom,
                            candidate: event.candidate
                        }));
                    }
                };

                // Handle connection state
                peerConnection.onconnectionstatechange = () => {
                    console.log('Connection state:', peerConnection.connectionState);
                    if (peerConnection.connectionState === 'failed') {
                        updateStatus('error', 'Connection failed. Try refreshing.');
                    }
                };

                // Join room via WebSocket
                setTimeout(() => {
                    if (ws.readyState === WebSocket.OPEN) {
                        ws.send(JSON.stringify({
                            type: 'join-room',
                            room: currentRoom,
                            username: username
                        }));
                    }
                }, 500);

            } catch (error) {
                console.error('Error initializing call:', error);
                updateStatus('error', 'Failed to access microphone');
            }
        }

        async function handleSignalingMessage(data) {
            console.log('Received:', data.type);
            
            try {
                switch (data.type) {
                    case 'room-joined':
                        isHost = data.isHost;
                        if (data.peersInRoom === 1) {
                            updateStatus('connecting', 'Waiting for someone to join...');
                        }
                        break;
                        
                    case 'peer-joined':
                        updateStatus('connecting', 'Peer joined! Establishing connection...');
                        if (!isHost) {
                            // Guest creates offer
                            setTimeout(createOffer, 1000);
                        }
                        break;
                        
                    case 'offer':
                        await peerConnection.setRemoteDescription(new RTCSessionDescription(data.offer));
                        const answer = await peerConnection.createAnswer();
                        await peerConnection.setLocalDescription(answer);
                        
                        ws.send(JSON.stringify({
                            type: 'answer',
                            room: currentRoom,
                            answer: answer
                        }));
                        break;
                        
                    case 'answer':
                        await peerConnection.setRemoteDescription(new RTCSessionDescription(data.answer));
                        break;
                        
                    case 'ice-candidate':
                        await peerConnection.addIceCandidate(new RTCIceCandidate(data.candidate));
                        break;
                        
                    case 'error':
                        updateStatus('error', data.message);
                        break;
                }
            } catch (error) {
                console.error('Error handling signaling message:', error);
            }
        }

        async function createOffer() {
            try {
                const offer = await peerConnection.createOffer();
                await peerConnection.setLocalDescription(offer);
                
                ws.send(JSON.stringify({
                    type: 'offer',
                    room: currentRoom,
                    offer: offer
                }));
            } catch (error) {
                console.error('Error creating offer:', error);
            }
        }

        function updateStatus(type, message) {
            const status = document.getElementById('status');
            status.className = \`status \${type}\`;
            status.textContent = message;
        }

        function toggleMute() {
            if (localStream) {
                const audioTrack = localStream.getAudioTracks()[0];
                if (audioTrack) {
                    audioTrack.enabled = !audioTrack.enabled;
                    isMuted = !audioTrack.enabled;
                    
                    const muteBtn = document.getElementById('mute-btn');
                    if (isMuted) {
                        muteBtn.textContent = '🔇 Muted';
                        muteBtn.classList.add('muted');
                    } else {
                        muteBtn.textContent = '🔊 Unmuted';
                        muteBtn.classList.remove('muted');
                    }
                }
            }
        }

        function copyRoomCode() {
            navigator.clipboard.writeText(currentRoom).then(() => {
                const btn = document.querySelector('.copy-btn');
                const original = btn.textContent;
                btn.textContent = 'Copied!';
                setTimeout(() => btn.textContent = original, 1000);
            });
        }

        function endCall() {
            cleanup();
            location.reload();
        }

        function leaveRoom() {
            cleanup();
            location.reload();
        }

        function cleanup() {
            if (localStream) {
                localStream.getTracks().forEach(track => track.stop());
                localStream = null;
            }
            
            if (peerConnection) {
                peerConnection.close();
                peerConnection = null;
            }
            
            if (ws) {
                ws.close();
                ws = null;
            }
        }

        // Cleanup on page unload
        window.addEventListener('beforeunload', cleanup);
    </script>
</body>
</html>`;

console.log("🎮 Elden Ring Voice Call Server running on http://localhost:3000");
console.log("📡 WebSocket signaling ready for P2P connections");