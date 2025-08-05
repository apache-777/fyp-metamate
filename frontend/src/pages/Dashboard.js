import React, { useState, useRef, useEffect } from "react";
import { auth, db } from "../firebase";
import { doc, getDoc } from "firebase/firestore";
import { useNavigate } from "react-router-dom";
import { BACKEND_URL, WS_URL } from "../config";

export default function Dashboard({ onLogout }) {
  const [connected, setConnected] = useState(false);
  const [status, setStatus] = useState("Not connected");
  const [ws, setWs] = useState(null);
  const [chat, setChat] = useState([]);
  const [message, setMessage] = useState("");
  const [ttsText, setTtsText] = useState("");
  const [subtitle, setSubtitle] = useState("");
  const [inCall, setInCall] = useState(false);
  const localVideoRef = useRef();
  const remoteVideoRef = useRef();
  const pcRef = useRef();
  const localStreamRef = useRef();
  const isCallerRef = useRef(false);
  const [showSubtitle, setShowSubtitle] = useState(false);
  const [username, setUsername] = useState("");
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [avatar, setAvatar] = useState(
    "https://i.ibb.co/2kR8bQn/avatar-placeholder.png"
  );
  const [peerUsername, setPeerUsername] = useState("");
  const [connectionLogs, setConnectionLogs] = useState([]);

  const navigate = useNavigate();

  // Enhanced logging function
  const logConnection = (message, data = null) => {
    const timestamp = new Date().toISOString();
    const logEntry = { timestamp, message, data };
    console.log(`[${timestamp}] ${message}`, data || "");
    setConnectionLogs((prev) => [...prev.slice(-19), logEntry]); // Keep last 20 logs
  };

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

  // WebSocket connect and matchmaking
  const startMatchmaking = async () => {
    logConnection("=== STARTING MATCHMAKING PROCESS ===");

    // Ensure any existing WebSocket is properly closed
    if (ws) {
      logConnection("Closing existing WebSocket connection");
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
    setConnectionLogs([]);

    // Small delay to ensure cleanup is complete
    await new Promise((resolve) => setTimeout(resolve, 100));

    logConnection("WebSocket URL:", WS_URL);
    logConnection("Creating new WebSocket connection...");

    try {
      const socket = new window.WebSocket(WS_URL);
      setStatus("Connecting...");

      socket.onopen = () => {
        logConnection("✅ WebSocket connected successfully");
        logConnection("WebSocket readyState:", socket.readyState);
        setStatus("Connected, waiting for match...");
      };

      socket.onerror = (error) => {
        logConnection("❌ WebSocket error:", error);
        setStatus("WebSocket connection error");
      };

      socket.onclose = (event) => {
        logConnection("🔌 WebSocket closed:", {
          code: event.code,
          reason: event.reason,
          wasClean: event.wasClean,
        });
        setStatus("WebSocket connection closed");
        setWs(null);
      };

      socket.onmessage = (event) => {
        logConnection("📨 WebSocket message received:", event.data);

        try {
          let data;
          if (typeof event.data === "string") {
            data = JSON.parse(event.data);
          } else if (event.data instanceof Blob) {
            event.data.text().then((text) => {
              const parsedData = JSON.parse(text);
              handleWsData(parsedData, socket);
            });
            return;
          }
          handleWsData(data, socket);
        } catch (error) {
          logConnection("❌ Error parsing WebSocket message:", error);
        }
      };

      setWs(socket);
      logConnection("WebSocket object created and stored");
    } catch (error) {
      logConnection("❌ Error creating WebSocket:", error);
      setStatus("Failed to create WebSocket connection");
    }
  };

  // Helper to handle parsed WebSocket data
  function handleWsData(data, socket) {
    logConnection("Processing WebSocket data:", data);

    if (data.type === "waiting") {
      logConnection("⏳ Waiting for another user...");
      setStatus("Waiting for another user...");
    }

    if (data.type === "match") {
      logConnection("🎯 Match found! Starting video call...");
      setStatus("Matched! Starting video call...");
      setConnected(true);

      // Send our username to the peer
      if (socket && socket.readyState === WebSocket.OPEN) {
        const usernameMessage = { type: "username", username: username };
        logConnection("Sending username to peer:", usernameMessage);
        socket.send(JSON.stringify(usernameMessage));
      }
      startVideoCall(socket);
    }

    if (data.type === "username") {
      logConnection("👤 Received peer username:", data.username);
      setPeerUsername(data.username);
    }

    if (data.type === "offer") {
      logConnection("📞 Received offer from peer");
      handleReceiveOffer(data.offer, socket);
    }

    if (data.type === "answer") {
      logConnection("📞 Received answer from peer");
      handleReceiveAnswer(data.answer);
    }

    if (data.type === "candidate") {
      logConnection("🧊 Received ICE candidate from peer");
      handleReceiveCandidate(data.candidate);
    }

    if (data.type === "chat") {
      setChat((prev) => [...prev, { from: "peer", text: data.text }]);
    }

    if (data.type === "tts") {
      logConnection("🔊 Playing TTS audio:", data.text);
      const utter = new window.SpeechSynthesisUtterance(data.text);
      window.speechSynthesis.speak(utter);
    }

    if (data.type === "stt") {
      setSubtitle(data.text);
    }

    if (data.type === "partner_disconnected") {
      logConnection("👋 Partner disconnected");
      setStatus("Partner disconnected.");
      setConnected(false);
      setSubtitle("");
      setPeerUsername("");
      cleanupCall();
    }
  }

  // WebRTC setup and signaling
  const startVideoCall = async (socket) => {
    logConnection("=== STARTING VIDEO CALL ===");
    setStatus("Starting video...");
    setInCall(false);

    // Reset video elements
    if (localVideoRef.current) {
      localVideoRef.current.srcObject = null;
      logConnection("Cleared local video srcObject");
    }
    if (remoteVideoRef.current) {
      remoteVideoRef.current.srcObject = null;
      logConnection("Cleared remote video srcObject");
    }

    try {
      logConnection("🎥 Getting user media...");
      const constraints = {
        video: {
          width: { ideal: 1280 },
          height: { ideal: 720 },
          facingMode: "user",
        },
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      };

      logConnection("Media constraints:", constraints);
      const localStream = await navigator.mediaDevices.getUserMedia(
        constraints
      );
      logConnection("✅ Local stream obtained:", localStream);
      logConnection(
        "Local stream tracks:",
        localStream.getTracks().map((t) => ({
          kind: t.kind,
          enabled: t.enabled,
          readyState: t.readyState,
        }))
      );

      localStreamRef.current = localStream;

      if (localVideoRef.current) {
        localVideoRef.current.srcObject = localStream;
        logConnection("✅ Local video srcObject set");

        // Ensure local video plays
        localVideoRef.current
          .play()
          .then(() => {
            logConnection("✅ Local video playing successfully");
          })
          .catch((e) => {
            logConnection("❌ Local video play error:", e);
          });
      } else {
        logConnection("❌ Local video element not found!");
      }

      // Setup peer connection
      logConnection("🔗 Creating RTCPeerConnection...");
      const pc = new window.RTCPeerConnection({
        iceServers: [
          { urls: "stun:stun.l.google.com:19302" },
          { urls: "stun:stun1.l.google.com:19302" },
          { urls: "stun:stun2.l.google.com:19302" },
        ],
        iceCandidatePoolSize: 10,
      });
      pcRef.current = pc;
      logConnection("✅ RTCPeerConnection created");

      // Add local tracks
      logConnection("➕ Adding local tracks to peer connection...");
      localStream.getTracks().forEach((track) => {
        logConnection("Adding track:", {
          kind: track.kind,
          enabled: track.enabled,
        });
        pc.addTrack(track, localStream);
      });

      // ICE candidate handling
      pc.onicecandidate = (event) => {
        if (event.candidate && socket) {
          logConnection("🧊 ICE candidate generated:", event.candidate);
          socket.send(
            JSON.stringify({ type: "candidate", candidate: event.candidate })
          );
        } else if (!event.candidate) {
          logConnection("✅ ICE gathering complete");
        }
      };

      // ICE connection state changes
      pc.oniceconnectionstatechange = () => {
        logConnection(
          "🧊 ICE connection state changed:",
          pc.iceConnectionState
        );
        if (pc.iceConnectionState === "connected") {
          logConnection("✅ ICE connection established!");
        } else if (pc.iceConnectionState === "failed") {
          logConnection("❌ ICE connection failed");
        }
      };

      // ICE gathering state changes
      pc.onicegatheringstatechange = () => {
        logConnection("🧊 ICE gathering state changed:", pc.iceGatheringState);
      };

      // Remote stream handling
      pc.ontrack = (event) => {
        logConnection("📹 Remote track received:", event.streams[0]);
        logConnection("Remote track details:", {
          kind: event.track.kind,
          enabled: event.track.enabled,
          readyState: event.track.readyState,
          streams: event.streams.length,
        });

        if (remoteVideoRef.current) {
          logConnection("✅ Remote video element found, setting srcObject");
          remoteVideoRef.current.srcObject = event.streams[0];
          logConnection("✅ Remote video srcObject set");

          // Force video to play
          remoteVideoRef.current
            .play()
            .then(() => {
              logConnection("✅ Remote video playing successfully");
            })
            .catch((e) => {
              logConnection("❌ Remote video play error:", e);
            });
        } else {
          logConnection("❌ Remote video element not found!");
        }
        setInCall(true);
        setStatus("In call");
      };

      // Connection state change handler
      pc.onconnectionstatechange = () => {
        logConnection("🔗 Connection state changed:", pc.connectionState);
        if (pc.connectionState === "connected") {
          logConnection("✅ WebRTC connection established!");
        } else if (pc.connectionState === "failed") {
          logConnection("❌ WebRTC connection failed");
        } else if (pc.connectionState === "disconnected") {
          logConnection("🔌 WebRTC connection disconnected");
        }
      };

      // Signaling state change handler
      pc.onsignalingstatechange = () => {
        logConnection("📡 Signaling state changed:", pc.signalingState);
      };

      // Create and send offer
      logConnection("📤 Creating offer...");
      const offer = await pc.createOffer();
      logConnection("✅ Offer created:", offer);

      await pc.setLocalDescription(offer);
      logConnection("✅ Local description set");

      // Check WebSocket state and send offer
      const currentSocket = socket;
      if (currentSocket && currentSocket.readyState === WebSocket.OPEN) {
        logConnection("📤 Sending offer via WebSocket");
        currentSocket.send(JSON.stringify({ type: "offer", offer }));
        logConnection("✅ Offer sent");
      } else {
        logConnection(
          "❌ WebSocket not available or not open. ReadyState:",
          currentSocket ? currentSocket.readyState : "null"
        );
        setStatus("WebSocket connection lost. Please try again.");
        return;
      }
    } catch (err) {
      logConnection("❌ Error in startVideoCall:", err);
      setStatus("Could not start video: " + err.message);
    }
  };

  const handleReceiveOffer = async (offer, socket) => {
    logConnection("📞 === HANDLING RECEIVED OFFER ===");
    setStatus("Received offer, creating answer...");

    // Clean up any existing peer connection
    if (pcRef.current) {
      logConnection("🧹 Cleaning up existing peer connection");
      pcRef.current.close();
      pcRef.current = null;
    }

    const pc = new window.RTCPeerConnection({
      iceServers: [
        { urls: "stun:stun.l.google.com:19302" },
        { urls: "stun:stun1.l.google.com:19302" },
        { urls: "stun:stun2.l.google.com:19302" },
      ],
      iceCandidatePoolSize: 10,
    });
    pcRef.current = pc;
    logConnection("✅ New peer connection created for offer");

    // Add local stream
    if (!localStreamRef.current) {
      logConnection("🎥 Getting local stream for offer handling...");
      const localStream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 1280 },
          height: { ideal: 720 },
          facingMode: "user",
        },
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      localStreamRef.current = localStream;
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = localStream;
        logConnection("✅ Local video srcObject set in offer handling");
      }
    }

    logConnection("➕ Adding local tracks to peer connection...");
    localStreamRef.current.getTracks().forEach((track) => {
      logConnection("Adding track:", {
        kind: track.kind,
        enabled: track.enabled,
      });
      pc.addTrack(track, localStreamRef.current);
    });

    pc.onicecandidate = (event) => {
      if (event.candidate && socket) {
        logConnection(
          "🧊 ICE candidate generated in offer handler:",
          event.candidate
        );
        socket.send(
          JSON.stringify({ type: "candidate", candidate: event.candidate })
        );
      }
    };

    pc.oniceconnectionstatechange = () => {
      logConnection(
        "🧊 ICE connection state changed in offer handler:",
        pc.iceConnectionState
      );
    };

    pc.ontrack = (event) => {
      logConnection(
        "📹 Remote track received in handleReceiveOffer:",
        event.streams[0]
      );
      if (remoteVideoRef.current) {
        remoteVideoRef.current.srcObject = event.streams[0];
        logConnection("✅ Remote video srcObject set in handleReceiveOffer");
        remoteVideoRef.current
          .play()
          .then(() => {
            logConnection("✅ Remote video playing in offer handler");
          })
          .catch((e) => {
            logConnection("❌ Remote video play error in offer handler:", e);
          });
      }
      setInCall(true);
      setStatus("In call");
    };

    pc.onconnectionstatechange = () => {
      logConnection(
        "🔗 Connection state changed in offer handler:",
        pc.connectionState
      );
    };

    pc.onsignalingstatechange = () => {
      logConnection(
        "📡 Signaling state changed in offer handler:",
        pc.signalingState
      );
    };

    try {
      logConnection("📥 Setting remote description...");
      await pc.setRemoteDescription(new RTCSessionDescription(offer));
      logConnection("✅ Remote description set successfully");

      logConnection("📤 Creating answer...");
      const answer = await pc.createAnswer();
      logConnection("✅ Answer created:", answer);

      logConnection("📤 Setting local description...");
      await pc.setLocalDescription(answer);
      logConnection("✅ Local description set successfully");

      if (socket && socket.readyState === WebSocket.OPEN) {
        logConnection("📤 Sending answer via WebSocket");
        socket.send(JSON.stringify({ type: "answer", answer }));
        logConnection("✅ Answer sent");
      } else {
        logConnection("❌ WebSocket not available to send answer");
      }
    } catch (err) {
      logConnection("❌ Error in handleReceiveOffer:", err);
      setStatus("Error handling offer: " + err.message);
    }
  };

  const handleReceiveAnswer = async (answer) => {
    logConnection("📞 === HANDLING RECEIVED ANSWER ===");
    if (pcRef.current) {
      try {
        logConnection(
          "Current connection state:",
          pcRef.current.connectionState
        );
        logConnection("Current signaling state:", pcRef.current.signalingState);

        // Only set remote description if we're in the right state
        if (pcRef.current.signalingState === "have-local-offer") {
          await pcRef.current.setRemoteDescription(
            new RTCSessionDescription(answer)
          );
          logConnection("✅ Remote description set successfully");
          setInCall(true);
          setStatus("In call");
        } else {
          logConnection(
            "⚠️ Ignoring answer - wrong signaling state:",
            pcRef.current.signalingState
          );
        }
      } catch (err) {
        logConnection("❌ Error setting remote description:", err);
        setStatus("Connection error: " + err.message);
      }
    } else {
      logConnection("❌ No peer connection available for answer");
    }
  };

  const handleReceiveCandidate = async (candidate) => {
    try {
      if (pcRef.current && pcRef.current.remoteDescription) {
        logConnection("🧊 Adding ICE candidate...");
        await pcRef.current.addIceCandidate(new RTCIceCandidate(candidate));
        logConnection("✅ ICE candidate added successfully");
      } else {
        logConnection(
          "⚠️ Ignoring ICE candidate - no peer connection or remote description"
        );
      }
    } catch (err) {
      logConnection("❌ Error adding ICE candidate:", err);
    }
  };

  // Cleanup on disconnect or logout
  const cleanupCall = () => {
    logConnection("🧹 === CLEANING UP CALL RESOURCES ===");
    setInCall(false);
    setPeerUsername("");

    // Clean up peer connection
    if (pcRef.current) {
      logConnection("🔌 Closing peer connection...");
      pcRef.current.close();
      pcRef.current = null;
    }

    // Stop all local media tracks
    if (localStreamRef.current) {
      logConnection("🛑 Stopping local media tracks...");
      localStreamRef.current.getTracks().forEach((track) => {
        logConnection("Stopping track:", {
          kind: track.kind,
          enabled: track.enabled,
        });
        track.stop();
      });
      localStreamRef.current = null;
    }

    // Clear video elements
    if (localVideoRef.current) {
      logConnection("🧹 Clearing local video srcObject");
      localVideoRef.current.srcObject = null;
    }
    if (remoteVideoRef.current) {
      logConnection("🧹 Clearing remote video srcObject");
      remoteVideoRef.current.srcObject = null;
    }

    logConnection("✅ Call cleanup completed");
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

        {/* Connection Logs Display */}
        <div
          style={{
            background: "#f5f5f5",
            padding: "10px",
            margin: "10px 0",
            borderRadius: "5px",
            maxHeight: "200px",
            overflowY: "auto",
            fontSize: "12px",
            fontFamily: "monospace",
          }}
        >
          <strong>Connection Logs:</strong>
          {connectionLogs.map((log, index) => (
            <div key={index} style={{ margin: "2px 0" }}>
              {log.message}
            </div>
          ))}
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
                logConnection("🛑 === STOPPING VIDEO CALL ===");
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
            onLoadedMetadata={() =>
              logConnection("📹 Remote video metadata loaded")
            }
            onCanPlay={() => logConnection("📹 Remote video can play")}
            onPlay={() => logConnection("📹 Remote video started playing")}
            onError={(e) => logConnection("❌ Remote video error:", e)}
          />
          <video
            ref={localVideoRef}
            autoPlay
            muted
            playsInline
            className="local-video-pip"
            onLoadedMetadata={() =>
              logConnection("📹 Local video metadata loaded")
            }
            onCanPlay={() => logConnection("📹 Local video can play")}
            onPlay={() => logConnection("📹 Local video started playing")}
            onError={(e) => logConnection("❌ Local video error:", e)}
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
