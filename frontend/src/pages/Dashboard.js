import React, { useState, useRef, useEffect } from "react";
import { auth, db } from "../firebase";
import { doc, getDoc } from "firebase/firestore";
import { useNavigate } from "react-router-dom";
import AgoraRTC from "agora-rtc-sdk-ng";

const BACKEND_URL =
  process.env.REACT_APP_BACKEND_URL || "http://localhost:5000";
const WS_URL = process.env.REACT_APP_WS_URL || "ws://localhost:5000";
const AGORA_APP_ID =
  process.env.REACT_APP_AGORA_APP_ID || "351aac62ef584247ae1b29ba21a82624";

export default function Dashboard({ onLogout }) {
  const [connected, setConnected] = useState(false);
  const [status, setStatus] = useState("Not connected");
  const [ws, setWs] = useState(null);
  const [chat, setChat] = useState([]);
  const [message, setMessage] = useState("");
  const [ttsText, setTtsText] = useState("");
  const [subtitle, setSubtitle] = useState("");
  const [inCall, setInCall] = useState(false);
  const [showSubtitle, setShowSubtitle] = useState(false);
  const [username, setUsername] = useState("");
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [avatar, setAvatar] = useState(
    "https://i.ibb.co/2kR8bQn/avatar-placeholder.png"
  );
  const [peerUsername, setPeerUsername] = useState("");

  // Agora refs
  const agoraEngine = useRef(null);
  const localAudioTrack = useRef(null);
  const localVideoTrack = useRef(null);
  const localVideoRef = useRef();
  const remoteVideoRef = useRef();

  const navigate = useNavigate();

  useEffect(() => {
    const fetchUsername = async () => {
      if (auth.currentUser) {
        const userDoc = await getDoc(doc(db, "users", auth.currentUser.uid));
        if (userDoc.exists()) {
          setUsername(userDoc.data().username);
          if (userDoc.data().avatar) setAvatar(userDoc.data().avatar);
        }
      }
    };
    fetchUsername();
  }, []);

  // Initialize Agora client
  const initializeAgora = async () => {
    try {
      // Create Agora client
      agoraEngine.current = AgoraRTC.createClient({
        mode: "rtc",
        codec: "vp8",
      });

      // Set up event handlers
      agoraEngine.current.on("user-published", handleUserPublished);
      agoraEngine.current.on("user-unpublished", handleUserUnpublished);
      agoraEngine.current.on("user-joined", handleUserJoined);
      agoraEngine.current.on("user-left", handleUserLeft);

      console.log("Agora client initialized successfully");
    } catch (error) {
      console.error("Error initializing Agora client:", error);
      setStatus("Failed to initialize video client");
    }
  };

  // Handle when a user publishes their stream
  const handleUserPublished = async (user, mediaType) => {
    console.log("User published:", user.uid, mediaType);

    // Subscribe to the remote user
    await agoraEngine.current.subscribe(user, mediaType);

    if (mediaType === "video") {
      // Display remote video
      if (remoteVideoRef.current) {
        user.videoTrack.play(remoteVideoRef.current);
      }
    }
    if (mediaType === "audio") {
      // Play remote audio
      user.audioTrack.play();
    }
  };

  // Handle when a user unpublishes their stream
  const handleUserUnpublished = (user) => {
    console.log("User unpublished:", user.uid);
  };

  // Handle when a user joins the channel
  const handleUserJoined = (user) => {
    console.log("User joined:", user.uid);
    setStatus("Peer joined the call");
  };

  // Handle when a user leaves the channel
  const handleUserLeft = (user) => {
    console.log("User left:", user.uid);
    setStatus("Peer left the call");
    setInCall(false);
    setPeerUsername("");

    // Clear remote video
    if (remoteVideoRef.current) {
      remoteVideoRef.current.srcObject = null;
    }
  };

  // Join Agora channel
  const joinChannel = async (channelName, uid) => {
    try {
      console.log("Joining Agora channel:", channelName);
      setStatus("Joining video call...");

      // Join the channel
      await agoraEngine.current.join(AGORA_APP_ID, channelName, null, uid);
      console.log("Successfully joined Agora channel");

      // Create and publish local tracks
      await createAndPublishTracks();

      setInCall(true);
      setStatus("In call");
    } catch (error) {
      console.error("Error joining Agora channel:", error);
      setStatus("Failed to join video call");
    }
  };

  // Create and publish local audio/video tracks
  const createAndPublishTracks = async () => {
    try {
      // Create local audio track
      localAudioTrack.current = await AgoraRTC.createMicrophoneAudioTrack();

      // Create local video track
      localVideoTrack.current = await AgoraRTC.createCameraVideoTrack();

      // Play local video
      if (localVideoRef.current) {
        localVideoTrack.current.play(localVideoRef.current);
      }

      // Publish tracks to the channel
      await agoraEngine.current.publish([
        localAudioTrack.current,
        localVideoTrack.current,
      ]);

      console.log("Local tracks published successfully");
    } catch (error) {
      console.error("Error creating/publishing tracks:", error);
      setStatus("Failed to start camera/microphone");
    }
  };

  // Leave Agora channel
  const leaveChannel = async () => {
    try {
      if (agoraEngine.current) {
        // Unpublish local tracks
        if (localAudioTrack.current) {
          localAudioTrack.current.close();
          localAudioTrack.current = null;
        }
        if (localVideoTrack.current) {
          localVideoTrack.current.close();
          localVideoTrack.current = null;
        }

        // Leave the channel
        await agoraEngine.current.leave();
        console.log("Left Agora channel");
      }

      setInCall(false);
      setStatus("Left video call");

      // Clear video elements
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = null;
      }
      if (remoteVideoRef.current) {
        remoteVideoRef.current.srcObject = null;
      }
    } catch (error) {
      console.error("Error leaving Agora channel:", error);
    }
  };

  // WebSocket connect and matchmaking
  const startMatchmaking = async () => {
    // Ensure any existing WebSocket is properly closed
    if (ws) {
      console.log("Closing existing WebSocket connection");
      ws.close();
      setWs(null);
    }

    // Reset all states
    setConnected(false);
    setStatus("Not connected");
    setPeerUsername("");
    setChat([]);
    setSubtitle("");
    setInCall(false);

    // Initialize Agora client
    await initializeAgora();

    // Small delay to ensure cleanup is complete
    await new Promise((resolve) => setTimeout(resolve, 100));

    console.log("Starting WebSocket connection to:", WS_URL);
    const socket = new window.WebSocket(WS_URL);
    setStatus("Connecting...");
    socket.onopen = () => {
      console.log("WebSocket connected successfully");
      setStatus("Connected, waiting for match...");
    };
    socket.onerror = (error) => {
      console.error("WebSocket error:", error);
      setStatus("WebSocket connection error");
    };
    socket.onclose = (event) => {
      console.log("WebSocket closed:", event.code, event.reason);
      setStatus("WebSocket connection closed");
      setWs(null);
    };
    socket.onmessage = (event) => {
      console.log("WebSocket message received:", event.data);
      if (typeof event.data === "string") {
        const data = JSON.parse(event.data);
        handleWsData(data, socket);
      } else if (event.data instanceof Blob) {
        event.data.text().then((text) => {
          const data = JSON.parse(text);
          handleWsData(data, socket);
        });
      }
    };
    setWs(socket);
  };

  // Helper to handle parsed WebSocket data
  function handleWsData(data, socket) {
    console.log("Processing WebSocket data:", data);
    if (data.type === "waiting") {
      console.log("Waiting for another user...");
      setStatus("Waiting for another user...");
    }
    if (data.type === "match") {
      console.log("Match found! Starting video call...");
      setStatus("Matched! Starting video call...");
      setConnected(true);
      // Send our username to the peer
      if (socket && socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({ type: "username", username: username }));
      }
      // Join Agora channel with the provided channel name
      if (data.channelName) {
        joinChannel(
          data.channelName,
          data.uid || Math.floor(Math.random() * 100000)
        );
      }
    }
    if (data.type === "username") {
      console.log("Received peer username:", data.username);
      setPeerUsername(data.username);
    }
    if (data.type === "chat") {
      setChat((prev) => [...prev, { from: "peer", text: data.text }]);
    }
    if (data.type === "tts") {
      // Play received TTS text as speech
      const utter = new window.SpeechSynthesisUtterance(data.text);
      window.speechSynthesis.speak(utter);
    }
    if (data.type === "stt") {
      setSubtitle(data.text);
    }
    if (data.type === "partner_disconnected") {
      console.log("Partner disconnected");
      setStatus("Partner disconnected.");
      setConnected(false);
      setSubtitle("");
      setPeerUsername("");
      cleanupCall();
    }
  }

  // Cleanup on disconnect or logout
  const cleanupCall = async () => {
    console.log("Cleaning up call resources...");
    setInCall(false);
    setPeerUsername("");

    // Leave Agora channel
    await leaveChannel();

    console.log("Call cleanup completed");
  };

  // Cleanup on component unmount
  useEffect(() => {
    return () => {
      cleanupCall();
      if (ws) ws.close();
    };
    // eslint-disable-next-line
  }, []);

  // Send chat message
  const sendMessage = () => {
    const currentWs = ws;
    if (currentWs && currentWs.readyState === WebSocket.OPEN && message) {
      currentWs.send(JSON.stringify({ type: "chat", text: message }));
      setChat((prev) => [...prev, { from: "me", text: message }]);
      setMessage("");
    }
  };

  // Send TTS text
  const sendTts = () => {
    const currentWs = ws;
    if (currentWs && currentWs.readyState === WebSocket.OPEN && ttsText) {
      currentWs.send(JSON.stringify({ type: "tts", text: ttsText }));
      setTtsText("");
    }
  };

  // Speech-to-text (STT) using Web Speech API
  const startStt = () => {
    if (!connected) {
      setStatus("Cannot start speech-to-text: No user connected.");
      return;
    }
    setShowSubtitle(true);
    if (!("webkitSpeechRecognition" in window)) {
      alert("Speech recognition not supported");
      return;
    }
    const recognition = new window.webkitSpeechRecognition();
    recognition.lang = "en-US";
    recognition.onresult = (event) => {
      const transcript = event.results[0][0].transcript;
      setSubtitle(transcript);
      const currentWs = ws;
      if (currentWs && currentWs.readyState === WebSocket.OPEN) {
        currentWs.send(JSON.stringify({ type: "stt", text: transcript }));
      }
    };
    recognition.start();
  };

  return (
    <>
      <nav className="navbar">
        <div className="navbar-left">
          <img
            src="https://i.ibb.co/x8mCkJ50/logo.png"
            alt="MetaMate Logo"
            className="navbar-logo"
          />
          <span className="navbar-title">
            <span className="meta">Meta</span>
            <span className="mate">Mate</span>
          </span>
        </div>
        <div className="navbar-right">
          <div
            className="navbar-user-box"
            onClick={() => setDropdownOpen((v) => !v)}
          >
            <img src={avatar} alt="avatar" className="navbar-avatar" />
            <span className="navbar-username">{username}</span>
            <span className="navbar-dropdown-icon">▼</span>
            {dropdownOpen && (
              <div className="navbar-dropdown-menu">
                <div
                  className="navbar-dropdown-item"
                  onClick={() => {
                    setDropdownOpen(false);
                    navigate("/profile");
                  }}
                >
                  Update User Profile
                </div>
              </div>
            )}
          </div>
          <button
            className="navbar-logout"
            onClick={() => {
              cleanupCall();
              onLogout();
            }}
          >
            Logout
          </button>
        </div>
      </nav>
      <div className="dashboard-container">
        <h2>Video Call Dashboard</h2>
        <div>
          Status:{" "}
          {status === "In call" && peerUsername
            ? `In call with ${peerUsername}`
            : status}
        </div>
        <div
          style={{
            display: "flex",
            gap: "1rem",
            justifyContent: "center",
            marginTop: "1rem",
          }}
        >
          {!connected && <button onClick={startMatchmaking}>Start</button>}
          {connected && (
            <button
              onClick={() => {
                console.log("Stopping video call...");
                // Notify partner about disconnection
                if (ws && ws.readyState === WebSocket.OPEN) {
                  ws.send(JSON.stringify({ type: "partner_disconnected" }));
                }

                cleanupCall();
                if (ws) {
                  ws.close();
                  setWs(null);
                }
                setConnected(false);
                setStatus("Not connected");
                setPeerUsername("");
                setChat([]);
                setSubtitle("");
                setInCall(false);
              }}
            >
              Stop
            </button>
          )}
        </div>
        {/* Video area */}
        <div className="video-area pip-area">
          <video
            ref={remoteVideoRef}
            autoPlay
            playsInline
            className="remote-video"
          />
          <video
            ref={localVideoRef}
            autoPlay
            muted
            playsInline
            className="local-video-pip"
          />
        </div>
        {inCall && (
          <div className="in-call-indicator">You are in a video call</div>
        )}
        {/* Chat */}
        <div className="chat-area">
          <div className="chat-messages">
            {chat.map((msg, i) => (
              <div
                key={i}
                className={msg.from === "me" ? "my-msg" : "peer-msg"}
              >
                {msg.text}
              </div>
            ))}
          </div>
          <input
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Type a message"
          />
          <button onClick={sendMessage}>Send</button>
        </div>
        {/* TTS */}
        <div className="tts-area">
          <input
            value={ttsText}
            onChange={(e) => setTtsText(e.target.value)}
            placeholder="Text to speak to the other person"
          />
          <button onClick={sendTts}>Send TTS</button>
        </div>
        {/* STT */}
        <div className="stt-area">
          <button onClick={startStt}>Start Speech-to-Text</button>
          {subtitle && <div className="subtitle">{subtitle}</div>}
        </div>
      </div>
    </>
  );
}
