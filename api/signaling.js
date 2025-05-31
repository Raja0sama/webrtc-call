// api/signaling.js - Fresh Simple Room Management v3.0

// Simple room storage: { roomCode: { members: [id1, id2], messages: [...] } }
const rooms = {};

export default function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method === 'POST') {
    handleMessage(req, res);
  } else if (req.method === 'GET') {
    getMessages(req, res);
  } else {
    res.status(405).json({ error: 'Method not allowed' });
  }
}

function handleMessage(req, res) {
  try {
    const { type, room, clientId, ...data } = req.body;
    
    if (!room || !clientId) {
      return res.status(400).json({ error: 'Missing room or clientId' });
    }

    // Create room if doesn't exist
    if (!rooms[room]) {
      rooms[room] = {
        members: [],
        messages: [],
        created: Date.now()
      };
      console.log(`🏠 Created room: ${room}`);
    }

    const roomData = rooms[room];

    switch (type) {
      case 'join-room':
        // Add member if not already in room
        if (!roomData.members.includes(clientId)) {
          roomData.members.push(clientId);
          console.log(`👤 ${data.username} joined room ${room} (${roomData.members.length}/2)`);
        }

        const isHost = roomData.members.length === 1;
        
        // If second person joins, notify first person
        if (roomData.members.length === 2) {
          roomData.messages.push({
            type: 'peer-joined',
            from: clientId,
            memberCount: 2
          });
          console.log(`🤝 Room ${room} now has 2 members - starting connection`);
        }
        
        res.json({
          success: true,
          isHost,
          memberCount: roomData.members.length
        });
        break;
        
      case 'offer':
      case 'answer':
      case 'ice-candidate':
        // Add message to room
        roomData.messages.push({
          type,
          from: clientId,
          ...data
        });
        console.log(`📨 Added ${type} to room ${room}`);
        res.json({ success: true });
        break;
        
      default:
        res.status(400).json({ error: 'Unknown message type' });
    }
    
  } catch (error) {
    console.error('❌ Message handling error:', error);
    res.status(500).json({ error: 'Server error' });
  }
}

function getMessages(req, res) {
  try {
    const { room, clientId, index } = req.query;
    
    if (!room || !clientId) {
      return res.status(400).json({ error: 'Missing room or clientId' });
    }

    // Return empty if room doesn't exist
    if (!rooms[room]) {
      return res.json({ messages: [], nextIndex: 0 });
    }

    const roomData = rooms[room];
    const startIndex = parseInt(index) || 0;
    
    // Get new messages (excluding own messages)
    const newMessages = roomData.messages
      .slice(startIndex)
      .filter(msg => msg.from !== clientId);

    res.json({ 
      messages: newMessages, 
      nextIndex: roomData.messages.length 
    });
    
  } catch (error) {
    console.error('❌ Get messages error:', error);
    res.status(500).json({ error: 'Server error' });
  }
}

// Cleanup empty rooms every 5 minutes
setInterval(() => {
  const now = Date.now();
  Object.keys(rooms).forEach(roomCode => {
    const room = rooms[roomCode];
    // Remove rooms older than 30 minutes or empty
    if (now - room.created > 30 * 60 * 1000 || room.members.length === 0) {
      delete rooms[roomCode];
      console.log(`🧹 Cleaned up room: ${roomCode}`);
    }
  });
}, 5 * 60 * 1000);