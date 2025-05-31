// api/signaling.js
const rooms = new Map();

export default function handler(req, res) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const { method } = req;
  
  if (method === 'POST') {
    handleSignalingMessage(req, res);
  } else if (method === 'GET') {
    pollMessages(req, res);
  } else {
    res.status(405).json({ error: 'Method not allowed' });
  }
}

function handleSignalingMessage(req, res) {
  try {
    const { type, room, clientId, ...payload } = req.body;
    
    if (!room || !clientId) {
      return res.status(400).json({ error: 'Missing room or clientId' });
    }

    // Initialize room if it doesn't exist
    if (!rooms.has(room)) {
      rooms.set(room, {
        clients: new Set(),
        messages: [] // Simple array - that's it!
      });
    }

    const roomData = rooms.get(room);
    
    switch (type) {
      case 'join-room':
        if (roomData.clients.size >= 2) {
          return res.status(400).json({ error: 'Room is full' });
        }
        
        roomData.clients.add(clientId);
        const isHost = roomData.clients.size === 1;
        
        // If second person joins, add peer-joined message
        if (roomData.clients.size === 2) {
          roomData.messages.push({
            type: 'peer-joined',
            from: clientId,
            peersInRoom: 2
          });
        }
        
        res.json({
          success: true,
          isHost,
          peersInRoom: roomData.clients.size,
          shouldCreateOffer: !isHost && roomData.clients.size === 2
        });
        break;
        
      case 'offer':
      case 'answer':
      case 'ice-candidate':
        // Just push to array - that's it!
        roomData.messages.push({
          type,
          from: clientId,
          ...payload
        });
        
        res.json({ success: true });
        break;
        
      default:
        res.status(400).json({ error: 'Unknown message type' });
    }
    
  } catch (error) {
    console.error('Signaling error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

function pollMessages(req, res) {
  try {
    const { room, clientId, index } = req.query;
    
    if (!room || !clientId) {
      return res.status(400).json({ error: 'Missing room or clientId' });
    }

    const roomData = rooms.get(room);
    if (!roomData) {
      return res.json({ messages: [], nextIndex: 0 });
    }

    const startIndex = parseInt(index) || 0;
    
    // Get all messages from startIndex onwards, excluding messages from this client
    const messages = roomData.messages
      .slice(startIndex)
      .filter(msg => msg.from !== clientId);

    const nextIndex = roomData.messages.length;

    res.json({ messages, nextIndex });
    
  } catch (error) {
    console.error('Polling error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}