# Backend Server

This is a simple WebSocket server for video call matchmaking in the MetaMate application.

## Features

- WebSocket server for real-time video call matchmaking
- Automatic pairing of users for video calls
- Message relay between connected peers
- Health check endpoint

## Setup

1. Install dependencies:
```bash
npm install
```

2. Start the server:
```bash
node index.js
```

The server will run on port 5000 by default.

## API Endpoints

- `GET /api/health` - Health check endpoint

## WebSocket Events

The WebSocket server handles the following message types:
- `match` - Sent when two users are paired
- `waiting` - Sent when a user is waiting for a match
- `offer` - WebRTC offer from one peer to another
- `answer` - WebRTC answer from one peer to another
- `candidate` - ICE candidate exchange
- `chat` - Text chat messages
- `tts` - Text-to-speech messages
- `stt` - Speech-to-text messages
- `username` - Username exchange between peers
- `partner_disconnected` - Notification when a peer disconnects

## Dependencies

- express - Web server framework
- cors - Cross-origin resource sharing
- ws - WebSocket server
- dotenv - Environment variable management

## Notes

- This backend only handles WebSocket connections for video call matchmaking
- Authentication and user management are handled by Firebase in the frontend
- No database is required as all user data is stored in Firebase Firestore 