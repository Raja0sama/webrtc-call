// api/signaling.js - Stateless Signaling using Query Params

export default function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Simple stateless approach - just echo messages back and forth
  if (req.method === 'POST') {
    const { type, room, clientId, ...data } = req.body;
    
    console.log(`📥 ${type} from ${clientId}`);
    
    // For join-room, determine if this is host or guest based on a simple heuristic
    if (type === 'join-room') {
      // For simplicity, assume first request is host, second is guest
      const isHost = Math.random() > 0.5; // Random for demo - in real app you'd use better logic
      
      res.json({
        success: true,
        isHost,
        shouldStartOffer: !isHost // Guest starts offer
      });
      return;
    }
    
    // For other message types, just acknowledge
    res.json({ success: true });
    return;
  }

  // GET: Return messages for peer-to-peer direct exchange
  if (req.method === 'GET') {
    const { room, clientId, offer, answer, ice } = req.query;
    
    // Simple peer-to-peer exchange via URL params
    const messages = [];
    
    if (offer && offer !== 'null') {
      messages.push({
        type: 'offer',
        offer: JSON.parse(decodeURIComponent(offer))
      });
    }
    
    if (answer && answer !== 'null') {
      messages.push({
        type: 'answer', 
        answer: JSON.parse(decodeURIComponent(answer))
      });
    }
    
    if (ice && ice !== 'null') {
      messages.push({
        type: 'ice-candidate',
        candidate: JSON.parse(decodeURIComponent(ice))
      });
    }
    
    res.json({ messages });
    return;
  }

  res.status(405).json({ error: 'Method not allowed' });
}