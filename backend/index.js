require("dotenv").config();
const express = require("express");
const cors = require("cors");
const { WebSocketServer } = require("ws");

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(
  cors({
    origin:
      process.env.NODE_ENV === "production"
        ? [process.env.FRONTEND_URL || "https://metamate.vercel.app"]
        : "*",
    methods: ["GET", "POST", "PUT", "DELETE"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);
app.use(express.json());

// Simple health check endpoint
app.get("/api/health", (req, res) => {
  res.json({ message: "Server is running" });
});

const server = app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

// WebSocket server for video call matchmaking
const wss = new WebSocketServer({ server });

let waiting = null; // store waiting client

wss.on("connection", (ws) => {
  ws.isAlive = true;
  ws.on("pong", () => {
    ws.isAlive = true;
  });

  // Matchmaking logic
  if (waiting && waiting.readyState === ws.OPEN) {
    // Pair with waiting user
    ws.partner = waiting;
    waiting.partner = ws;
    waiting.send(JSON.stringify({ type: "match" }));
    ws.send(JSON.stringify({ type: "match" }));
    waiting = null;
  } else {
    waiting = ws;
    ws.send(JSON.stringify({ type: "waiting" }));
  }

  ws.on("message", (msg) => {
    // Relay messages to partner
    if (ws.partner && ws.partner.readyState === ws.OPEN) {
      ws.partner.send(msg);
    }
  });

  ws.on("close", () => {
    if (ws.partner) {
      ws.partner.send(JSON.stringify({ type: "partner_disconnected" }));
      ws.partner.partner = null;
    }
    if (waiting === ws) waiting = null;
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
