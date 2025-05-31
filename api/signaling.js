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
    
    console.log(`Received ${type} from ${clientId} in room ${room}`);
    
    if (!room || !clientId) {
      return res.status(400).json({ error: 'Missing room or clientId' });
    }

    // Initialize room if it doesn't exist
    if (!rooms.has(room)) {
      rooms.set(room, {
        clients: new Set(),
        messages: [],
        createdAt: Date.now()
      });
      console.log(`Created new room: ${room}`);
    }

    const roomData = rooms.get(room);
    console.log(`Room ${room} has ${roomData.clients.size} clients, ${roomData.messages.length} messages`);
    
    switch (type) {
      case 'join-room':
        if (roomData.clients.size >= 2) {
          return res.status(400).json({ error: 'Room is full' });
        }
        
        roomData.clients.add(clientId);
        const isHost = roomData.clients.size === 1;
        
        // If this is the second person joining, notify the first person
        if (roomData.clients.size === 2) {
          roomData.messages.push({
            id: Date.now(),
            type: 'peer-joined',
            timestamp: Date.now(),
            excludeClient: clientId,
            peersInRoom: roomData.clients.size,
            shouldCreateOffer: false // Host waits for offer
          });
        }
        
        res.json({
          success: true,
          isHost,
          peersInRoom: roomData.clients.size,
          shouldCreateOffer: !isHost && roomData.clients.size === 2 // Guest creates offer
        });
        break;
        
      case 'offer':
      case 'answer':
      case 'ice-candidate':
        // Use a sequential ID to ensure proper ordering regardless of timestamps
        const messageId = Date.now() + (roomData.messages.length * 0.001); // Ensure unique sequential IDs
        const message = {
          id: messageId,
          type,
          timestamp: messageId, // Use the same value for timestamp to ensure ordering
          excludeClient: clientId,
          ...payload
        };
        roomData.messages.push(message);
        
        // Sort messages by timestamp to ensure proper order
        roomData.messages.sort((a, b) => a.timestamp - b.timestamp);
        
        console.log(`Added ${type} message to room ${room}, messageId: ${messageId}, now has ${roomData.messages.length} messages`);
        
        res.json({ success: true, messageId });
        break;
        
      default:
        res.status(400).json({ error: 'Unknown message type' });
    }
    
    // Cleanup old messages (keep last 50)
    if (roomData.messages.length > 50) {
      roomData.messages = roomData.messages.slice(-50);
    }
    
  } catch (error) {
    console.error('Signaling error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

function pollMessages(req, res) {
  try {
    const { room, clientId, since } = req.query;
    
    if (!room || !clientId) {
      return res.status(400).json({ error: 'Missing room or clientId' });
    }

    const roomData = rooms.get(room);
    if (!roomData) {
      return res.json({ messages: [] });
    }

    const sinceTime = parseInt(since) || 0;
    console.log(`Polling from ${clientId} in room ${room}, since: ${sinceTime}, total messages in room: ${roomData.messages.length}`);
    
    // Log all messages in room for debugging
    console.log('All messages in room:', roomData.messages.map(m => ({ type: m.type, timestamp: m.timestamp, excludeClient: m.excludeClient })));
    
    // Get messages since the specified timestamp, excluding messages from this client
    const messages = roomData.messages
      .filter(msg => 
        msg.timestamp > sinceTime && 
        msg.excludeClient !== clientId
      )
      .sort((a, b) => a.timestamp - b.timestamp) // Sort by timestamp
      .map(({ excludeClient, ...msg }) => msg); // Remove excludeClient from response

    console.log(`Delivering ${messages.length} messages to ${clientId}:`, messages.map(m => ({ type: m.type, timestamp: m.timestamp })));

    res.json({ messages });
    
  } catch (error) {
    console.error('Polling error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

// Cleanup old rooms periodically (basic cleanup)
setInterval(() => {
  const now = Date.now();
  const maxAge = 30 * 60 * 1000; // 30 minutes
  
  for (const [roomId, room] of rooms.entries()) {
    if (now - room.createdAt > maxAge) {
      rooms.delete(roomId);
    }
  }
}, 5 * 60 * 1000); // Run every 5 minutes