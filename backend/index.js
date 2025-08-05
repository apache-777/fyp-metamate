require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { WebSocketServer } = require('ws');

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors({
  origin: process.env.FRONTEND_URL || '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true
}));
app.use(express.json());

// Simple health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ message: 'Server is running', timestamp: new Date().toISOString() });
});

// Root endpoint
app.get('/', (req, res) => {
  res.json({ message: 'MetaMate Backend API', status: 'running' });
});

const server = app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
});

// WebSocket server for video call matchmaking
const wss = new WebSocketServer({ server });

let waiting = null; // store waiting client

wss.on('connection', (ws, req) => {
  console.log('New WebSocket connection from:', req.socket.remoteAddress);
  ws.isAlive = true;
  ws.on('pong', () => { ws.isAlive = true; });

  // Matchmaking logic
  if (waiting && waiting.readyState === ws.OPEN) {
    // Pair with waiting user
    ws.partner = waiting;
    waiting.partner = ws;
    waiting.send(JSON.stringify({ type: 'match' }));
    ws.send(JSON.stringify({ type: 'match' }));
    waiting = null;
    console.log('Users matched successfully');
  } else {
    waiting = ws;
    ws.send(JSON.stringify({ type: 'waiting' }));
    console.log('User waiting for match');
  }

  ws.on('message', (msg) => {
    try {
      const data = JSON.parse(msg);
      console.log('Received message type:', data.type);
      
      // Relay messages to partner
      if (ws.partner && ws.partner.readyState === ws.OPEN) {
        ws.partner.send(msg);
      }
    } catch (error) {
      console.error('Error parsing WebSocket message:', error);
    }
  });

  ws.on('close', () => {
    console.log('WebSocket connection closed');
    if (ws.partner) {
      ws.partner.send(JSON.stringify({ type: 'partner_disconnected' }));
      ws.partner.partner = null;
    }
    if (waiting === ws) waiting = null;
  });

  ws.on('error', (error) => {
    console.error('WebSocket error:', error);
  });
});

// Heartbeat for WebSocket
setInterval(() => {
  wss.clients.forEach((ws) => {
    if (!ws.isAlive) return ws.terminate();
    ws.isAlive = false;
    ws.ping();
  });
}, 30000);

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully');
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
}); 