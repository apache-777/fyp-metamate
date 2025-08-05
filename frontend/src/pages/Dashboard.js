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
  const [isListening, setIsListening] = useState(false);
  const [username, setUsername] = useState("");
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [avatar, setAvatar] = useState(
    "https://i.ibb.co/2kR8bQn/avatar-placeholder.png"
  );
  const [peerUsername, setPeerUsername] = useState("");
  const [recognition, setRecognition] = useState(null);

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
      setWs(null); // Clear the WebSocket reference when closed
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
      startVideoCall(socket);
    }
    if (data.type === "username") {
      console.log("Received peer username:", data.username);
      setPeerUsername(data.username);
    }
    if (data.type === "offer") {
      console.log("Received offer from peer");
      handleReceiveOffer(data.offer, socket);
    }
    if (data.type === "answer") {
      console.log("Received answer from peer");
      handleReceiveAnswer(data.answer);
    }
    if (data.type === "candidate") {
      console.log("Received ICE candidate from peer");
      handleReceiveCandidate(data.candidate);
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

  // WebRTC setup and signaling
  const startVideoCall = async (socket) => {
    console.log("Starting video call...");
    setStatus("Starting video...");
    setInCall(false);

    // Reset video elements
    if (localVideoRef.current) {
      localVideoRef.current.srcObject = null;
    }
    if (remoteVideoRef.current) {
      remoteVideoRef.current.srcObject = null;
    }

    try {
      console.log("Getting user media...");
      const localStream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true,
      });
      console.log("Local stream obtained:", localStream);
      localStreamRef.current = localStream;
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = localStream;
        console.log("Local video srcObject set");
      }
      // Setup peer connection
      console.log("Creating RTCPeerConnection...");
      const pc = new window.RTCPeerConnection({
        iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
      });
      pcRef.current = pc;
      console.log("RTCPeerConnection created");

      // Add local tracks
      console.log("Adding local tracks to peer connection...");
      localStream.getTracks().forEach((track) => {
        console.log("Adding track:", track.kind);
        pc.addTrack(track, localStream);
      });

      // ICE candidate handling
      pc.onicecandidate = (event) => {
        if (event.candidate && socket) {
          console.log("Sending ICE candidate");
          socket.send(
            JSON.stringify({ type: "candidate", candidate: event.candidate })
          );
        }
      };

      // Remote stream handling
      pc.ontrack = (event) => {
        console.log("Remote track received:", event.streams[0]);
        console.log("Remote track kind:", event.track.kind);
        if (remoteVideoRef.current) {
          console.log("Remote video element found, setting srcObject");
          remoteVideoRef.current.srcObject = event.streams[0];
          console.log("Remote video srcObject set");
          // Force video to play
          remoteVideoRef.current
            .play()
            .catch((e) => console.log("Video play error:", e));
        } else {
          console.log("Remote video element not found!");
        }
        setInCall(true);
        setStatus("In call");
      };

      // Add connection state change handler
      pc.onconnectionstatechange = () => {
        console.log("Connection state changed:", pc.connectionState);
        if (pc.connectionState === "connected") {
          console.log("WebRTC connection established!");
        }
      };

      // Create and send offer
      console.log("Creating offer...");
      const offer = await pc.createOffer();
      console.log("Offer created:", offer);
      await pc.setLocalDescription(offer);
      console.log("Local description set");

      // Check WebSocket state and send offer
      const currentSocket = socket;
      if (currentSocket && currentSocket.readyState === WebSocket.OPEN) {
        console.log("Sending offer via WebSocket");
        currentSocket.send(JSON.stringify({ type: "offer", offer }));
        console.log("Offer sent");
      } else {
        console.error(
          "WebSocket not available or not open. ReadyState:",
          currentSocket ? currentSocket.readyState : "null"
        );
        setStatus("WebSocket connection lost. Please try again.");
        return;
      }
    } catch (err) {
      console.error("Error in startVideoCall:", err);
      setStatus("Could not start video: " + err.message);
    }
  };

  const handleReceiveOffer = async (offer, socket) => {
    console.log("Received offer, creating answer...");
    setStatus("Received offer, creating answer...");

    // Clean up any existing peer connection
    if (pcRef.current) {
      console.log("Cleaning up existing peer connection");
      pcRef.current.close();
      pcRef.current = null;
    }

    const pc = new window.RTCPeerConnection({
      iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
    });
    pcRef.current = pc;
    console.log("New peer connection created for offer");

    // Add local stream
    if (!localStreamRef.current) {
      console.log("Getting local stream for offer handling...");
      const localStream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true,
      });
      localStreamRef.current = localStream;
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = localStream;
        console.log("Local video srcObject set in offer handling");
      }
    }

    console.log("Adding local tracks to peer connection...");
    localStreamRef.current.getTracks().forEach((track) => {
      console.log("Adding track:", track.kind);
      pc.addTrack(track, localStreamRef.current);
    });

    pc.onicecandidate = (event) => {
      if (event.candidate && socket) {
        console.log("Sending ICE candidate from offer handler");
        socket.send(
          JSON.stringify({ type: "candidate", candidate: event.candidate })
        );
      }
    };

    pc.ontrack = (event) => {
      console.log(
        "Remote track received in handleReceiveOffer:",
        event.streams[0]
      );
      if (remoteVideoRef.current) {
        remoteVideoRef.current.srcObject = event.streams[0];
        console.log("Remote video srcObject set in handleReceiveOffer");
        // Force video to play
        remoteVideoRef.current
          .play()
          .catch((e) => console.log("Video play error:", e));
      }
      setInCall(true);
      setStatus("In call");
    };

    // Add connection state change handler
    pc.onconnectionstatechange = () => {
      console.log(
        "Connection state changed in offer handler:",
        pc.connectionState
      );
      if (pc.connectionState === "connected") {
        console.log("WebRTC connection established in offer handler!");
      }
    };

    try {
      console.log("Setting remote description...");
      await pc.setRemoteDescription(new RTCSessionDescription(offer));
      console.log("Remote description set successfully");

      console.log("Creating answer...");
      const answer = await pc.createAnswer();
      console.log("Answer created:", answer);

      console.log("Setting local description...");
      await pc.setLocalDescription(answer);
      console.log("Local description set successfully");

      if (socket && socket.readyState === WebSocket.OPEN) {
        console.log("Sending answer via WebSocket");
        socket.send(JSON.stringify({ type: "answer", answer }));
        console.log("Answer sent");
      } else {
        console.error("WebSocket not available to send answer");
      }
    } catch (err) {
      console.error("Error in handleReceiveOffer:", err);
      setStatus("Error handling offer: " + err.message);
    }
  };

  const handleReceiveAnswer = async (answer) => {
    console.log("Received answer, connecting...");
    if (pcRef.current) {
      try {
        console.log("Current connection state:", pcRef.current.connectionState);
        console.log("Current signaling state:", pcRef.current.signalingState);

        // Only set remote description if we're in the right state
        if (pcRef.current.signalingState === "have-local-offer") {
          await pcRef.current.setRemoteDescription(
            new RTCSessionDescription(answer)
          );
          console.log("Remote description set successfully");
          setInCall(true);
          setStatus("In call");
        } else {
          console.log(
            "Ignoring answer - wrong signaling state:",
            pcRef.current.signalingState
          );
        }
      } catch (err) {
        console.error("Error setting remote description:", err);
        setStatus("Connection error: " + err.message);
      }
    } else {
      console.log("No peer connection available for answer");
    }
  };

  const handleReceiveCandidate = async (candidate) => {
    try {
      if (pcRef.current && pcRef.current.remoteDescription) {
        console.log("Adding ICE candidate...");
        await pcRef.current.addIceCandidate(new RTCIceCandidate(candidate));
        console.log("ICE candidate added successfully");
      } else {
        console.log(
          "Ignoring ICE candidate - no peer connection or remote description"
        );
      }
    } catch (err) {
      console.error("Error adding ICE candidate:", err);
      // Don't show error to user for ICE candidate issues
    }
  };

  // Cleanup on disconnect or logout
  const cleanupCall = () => {
    console.log("Cleaning up call resources...");
    setInCall(false);
    setPeerUsername("");

    // Stop speech recognition if active
    if (recognition) {
      recognition.stop();
      setRecognition(null);
    }
    setIsListening(false);
    setShowSubtitle(false);

    // Clean up peer connection
    if (pcRef.current) {
      console.log("Closing peer connection...");
      pcRef.current.close();
      pcRef.current = null;
    }

    // Stop all local media tracks
    if (localStreamRef.current) {
      console.log("Stopping local media tracks...");
      localStreamRef.current.getTracks().forEach((track) => {
        console.log("Stopping track:", track.kind);
        track.stop();
      });
      localStreamRef.current = null;
    }

    // Clear video elements
    if (localVideoRef.current) {
      console.log("Clearing local video srcObject");
      localVideoRef.current.srcObject = null;
    }
    if (remoteVideoRef.current) {
      console.log("Clearing remote video srcObject");
      remoteVideoRef.current.srcObject = null;
    }

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

  // Test speech recognition support
  const testSpeechRecognition = () => {
    console.log("Testing speech recognition support...");
    console.log("User Agent:", navigator.userAgent);
    console.log("Protocol:", window.location.protocol);
    console.log("Hostname:", window.location.hostname);
    console.log(
      "webkitSpeechRecognition available:",
      "webkitSpeechRecognition" in window
    );
    console.log("SpeechRecognition available:", "SpeechRecognition" in window);

    if (
      navigator.userAgent.match(
        /Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i
      )
    ) {
      console.log("Mobile device detected");
    } else {
      console.log("Desktop device detected");
    }
  };

  // Speech-to-text (STT) using Web Speech API
  const startStt = () => {
    if (!connected) {
      setStatus("Cannot start speech-to-text: No user connected.");
      return;
    }

    // Check if we're on HTTPS (required for mobile)
    if (
      window.location.protocol !== "https:" &&
      window.location.hostname !== "localhost"
    ) {
      alert(
        "Speech recognition requires HTTPS on mobile devices. Please use HTTPS or localhost."
      );
      return;
    }

    // Check for speech recognition support
    if (
      !("webkitSpeechRecognition" in window) &&
      !("SpeechRecognition" in window)
    ) {
      alert(
        "Speech recognition not supported on this device/browser. Please try Chrome, Safari, or Edge."
      );
      return;
    }

    // Use the appropriate speech recognition API
    const SpeechRecognition =
      window.SpeechRecognition || window.webkitSpeechRecognition;
    const recognition = new SpeechRecognition();

    // Configure for mobile compatibility
    recognition.lang = "en-US";
    recognition.continuous = false; // Stop after one recognition
    recognition.interimResults = false; // Only get final results
    recognition.maxAlternatives = 1;

    // Mobile-specific settings
    if (
      navigator.userAgent.match(
        /Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i
      )
    ) {
      // Mobile-specific configuration
      recognition.continuous = false;
      recognition.interimResults = false;
    }

    // Handle successful recognition
    recognition.onresult = (event) => {
      const transcript = event.results[0][0].transcript;
      setSubtitle(transcript);
      const currentWs = ws;
      if (currentWs && currentWs.readyState === WebSocket.OPEN) {
        currentWs.send(JSON.stringify({ type: "stt", text: transcript }));
      }
    };

    // Handle errors
    recognition.onerror = (event) => {
      console.error("Speech recognition error:", event.error);
      setIsListening(false);
      setShowSubtitle(false);

      // Mobile-specific error handling
      if (event.error === "not-allowed") {
        setStatus(
          "Microphone access denied. Please allow microphone access in your browser settings."
        );
        alert(
          "Please allow microphone access in your browser settings and try again."
        );
      } else if (event.error === "no-speech") {
        setStatus("No speech detected. Please try again.");
      } else if (event.error === "network") {
        setStatus("Network error. Please check your internet connection.");
      } else if (event.error === "service-not-allowed") {
        setStatus(
          "Speech recognition service not available. Please try again later."
        );
      } else {
        setStatus(`Speech recognition error: ${event.error}`);
        console.log("Full error event:", event);
      }
    };

    // Handle when recognition ends
    recognition.onend = () => {
      console.log("Speech recognition ended");
      setIsListening(false);
      setShowSubtitle(false);
      setStatus("Speech recognition completed");
    };

    // Handle when recognition starts
    recognition.onstart = () => {
      console.log("Speech recognition started");
      setIsListening(true);
      setShowSubtitle(true);
      setStatus("Listening for speech...");
    };

    try {
      recognition.start();
      setRecognition(recognition);
    } catch (error) {
      console.error("Error starting speech recognition:", error);
      setStatus("Failed to start speech recognition. Please try again.");
      setIsListening(false);
      setShowSubtitle(false);
    }
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
          <button
            onClick={startStt}
            disabled={isListening}
            style={{
              backgroundColor: isListening ? "#cccccc" : "#4fc3f7",
              color: "white",
              cursor: isListening ? "not-allowed" : "pointer",
            }}
          >
            {isListening ? "Listening..." : "Start Speech-to-Text"}
          </button>
          <button
            onClick={testSpeechRecognition}
            style={{
              backgroundColor: "#666",
              color: "white",
              marginLeft: "0.5rem",
              fontSize: "0.8rem",
              padding: "0.5rem",
            }}
          >
            Debug STT
          </button>
          {subtitle && <div className="subtitle">{subtitle}</div>}
        </div>
      </div>
    </>
  );
}
