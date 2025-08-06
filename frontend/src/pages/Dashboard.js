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
  const remoteStreamRef = useRef();
  const isCallerRef = useRef(false);
  const [showSubtitle, setShowSubtitle] = useState(false);
  const [username, setUsername] = useState("");
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [avatar, setAvatar] = useState(
    "https://i.ibb.co/2kR8bQn/avatar-placeholder.png"
  );
  const [peerUsername, setPeerUsername] = useState("");
  const [connectionState, setConnectionState] = useState("new");
  const [iceConnectionState, setIceConnectionState] = useState("new");
  const connectionTimeoutRef = useRef(null);
  const [iceCandidatesSent, setIceCandidatesSent] = useState(0);
  const [iceCandidatesReceived, setIceCandidatesReceived] = useState(0);

  const navigate = useNavigate();

  // Check WebRTC support
  const checkWebRTCSupport = () => {
    const support = {
      RTCPeerConnection: !!window.RTCPeerConnection,
      getUserMedia: !!(
        navigator.mediaDevices && navigator.mediaDevices.getUserMedia
      ),
      WebSocket: !!window.WebSocket,
    };

    console.log("WebRTC Support Check:", support);

    if (!support.RTCPeerConnection) {
      setStatus("WebRTC not supported in this browser");
      return false;
    }
    if (!support.getUserMedia) {
      setStatus("Camera/microphone access not supported in this browser");
      return false;
    }
    if (!support.WebSocket) {
      setStatus("WebSocket not supported in this browser");
      return false;
    }

    return true;
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

    // Check WebRTC support on component mount
    checkWebRTCSupport();
  }, []);

  // Enhanced WebRTC configuration
  const getRTCConfiguration = () => ({
    iceServers: [
      { urls: "stun:stun.l.google.com:19302" },
      { urls: "stun:stun1.l.google.com:19302" },
      { urls: "stun:stun2.l.google.com:19302" },
      { urls: "stun:stun3.l.google.com:19302" },
      { urls: "stun:stun4.l.google.com:19302" },
      // Add TURN servers for better connectivity
      {
        urls: "turn:openrelay.metered.ca:80",
        username: "openrelayproject",
        credential: "openrelayproject",
      },
      {
        urls: "turn:openrelay.metered.ca:443",
        username: "openrelayproject",
        credential: "openrelayproject",
      },
      {
        urls: "turn:openrelay.metered.ca:443?transport=tcp",
        username: "openrelayproject",
        credential: "openrelayproject",
      },
    ],
    iceCandidatePoolSize: 10,
    iceTransportPolicy: "all",
    bundlePolicy: "max-bundle",
    rtcpMuxPolicy: "require",
  });

  // Enhanced media constraints
  const getMediaConstraints = () => ({
    video: {
      width: { ideal: 1280, min: 640 },
      height: { ideal: 720, min: 480 },
      frameRate: { ideal: 30, min: 15 },
    },
    audio: {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
      sampleRate: 48000,
    },
  });

  // Create and configure peer connection
  const createPeerConnection = (socket) => {
    console.log("Creating new RTCPeerConnection with enhanced config");
    const pc = new window.RTCPeerConnection(getRTCConfiguration());

    // Add a data channel for connection testing
    try {
      const dataChannel = pc.createDataChannel("test");
      dataChannel.onopen = () => {
        console.log("✅ Data channel opened - connection is working");
        dataChannel.send("ping");
      };
      dataChannel.onmessage = (event) => {
        console.log("Data channel message received:", event.data);
      };
      dataChannel.onclose = () => {
        console.log("Data channel closed");
      };
    } catch (err) {
      console.log("Could not create data channel:", err);
    }

    // Enhanced event handlers
    pc.onconnectionstatechange = () => {
      console.log("Connection state changed:", pc.connectionState);
      setConnectionState(pc.connectionState);

      // Clear any existing timeout
      if (connectionTimeoutRef.current) {
        clearTimeout(connectionTimeoutRef.current);
        connectionTimeoutRef.current = null;
      }

      if (pc.connectionState === "connected") {
        console.log("✅ WebRTC connection established successfully!");
        setStatus("Connected - Video call active");
        setInCall(true);
      } else if (pc.connectionState === "failed") {
        console.error("❌ WebRTC connection failed");
        setStatus("Connection failed - please try again");
        cleanupCall();
      } else if (pc.connectionState === "disconnected") {
        console.log("⚠️ WebRTC connection disconnected");
        setStatus("Connection lost");
        setInCall(false);
      } else if (pc.connectionState === "connecting") {
        console.log("🔄 WebRTC connecting...");
        setStatus("Connecting to peer...");

        // Set a timeout for connection
        connectionTimeoutRef.current = setTimeout(() => {
          if (pc.connectionState === "connecting") {
            console.error("❌ Connection timeout - taking too long to connect");
            setStatus("Connection timeout - please try again");
            cleanupCall();
          }
        }, 30000); // 30 seconds timeout
      }
    };

    pc.oniceconnectionstatechange = () => {
      console.log("ICE connection state:", pc.iceConnectionState);
      setIceConnectionState(pc.iceConnectionState);

      if (pc.iceConnectionState === "connected") {
        console.log("✅ ICE connection established");
        setStatus("Network connected - establishing video call...");
      } else if (pc.iceConnectionState === "failed") {
        console.error("❌ ICE connection failed");
        setStatus("Network connection failed - trying to reconnect...");
        // Try to restart ICE
        if (pc.iceRestart) {
          console.log("Attempting ICE restart...");
          pc.restartIce();
        }
      } else if (pc.iceConnectionState === "checking") {
        console.log("🔄 ICE checking - finding best connection...");
        setStatus("Finding best connection...");
      } else if (pc.iceConnectionState === "completed") {
        console.log("✅ ICE gathering completed");
      }
    };

    pc.onicegatheringstatechange = () => {
      console.log("ICE gathering state:", pc.iceGatheringState);
      if (pc.iceGatheringState === "complete") {
        console.log("✅ ICE gathering completed");
      }
    };

    pc.onsignalingstatechange = () => {
      console.log("Signaling state:", pc.signalingState);
      if (pc.signalingState === "stable") {
        console.log("✅ Signaling state is stable");
      }
    };

    // Enhanced track handling
    pc.ontrack = (event) => {
      console.log("🎥 Remote track received:", event.track.kind);
      console.log("📺 Remote streams:", event.streams);
      console.log("Track enabled:", event.track.enabled);
      console.log("Track readyState:", event.track.readyState);

      if (event.streams && event.streams[0]) {
        const remoteStream = event.streams[0];
        console.log("Setting remote stream:", remoteStream);
        console.log(
          "Stream tracks:",
          remoteStream.getTracks().map((t) => ({
            kind: t.kind,
            enabled: t.enabled,
            readyState: t.readyState,
          }))
        );
        remoteStreamRef.current = remoteStream;

        if (remoteVideoRef.current) {
          console.log("Setting remote video srcObject");
          remoteVideoRef.current.srcObject = remoteStream;

          // Force video element to update
          remoteVideoRef.current.load();

          // Ensure video plays with multiple attempts
          const playVideo = () => {
            console.log("Attempting to play remote video...");
            console.log("Video readyState:", remoteVideoRef.current.readyState);
            console.log("Video paused:", remoteVideoRef.current.paused);
            console.log("Video ended:", remoteVideoRef.current.ended);

            remoteVideoRef.current
              .play()
              .then(() => {
                console.log("✅ Remote video started playing successfully");
                setInCall(true);
                setStatus("In call - Video active");
              })
              .catch((e) => {
                console.error("Failed to play remote video:", e);
                console.log("Video error details:", e.name, e.message);

                // Retry with different approach
                setTimeout(() => {
                  if (
                    remoteVideoRef.current &&
                    remoteVideoRef.current.srcObject
                  ) {
                    console.log("Retrying video play with load()...");
                    remoteVideoRef.current.load();
                    remoteVideoRef.current.play().catch((e2) => {
                      console.error("Retry failed:", e2);
                    });
                  }
                }, 500);
              });
          };

          remoteVideoRef.current.onloadedmetadata = () => {
            console.log("Remote video metadata loaded");
            console.log(
              "Video dimensions:",
              remoteVideoRef.current.videoWidth,
              "x",
              remoteVideoRef.current.videoHeight
            );
            playVideo();
          };

          remoteVideoRef.current.oncanplay = () => {
            console.log("Remote video can play");
            playVideo();
          };

          remoteVideoRef.current.onplay = () => {
            console.log("✅ Remote video started playing");
            setInCall(true);
            setStatus("In call - Video active");
          };

          remoteVideoRef.current.onerror = (e) => {
            console.error("Remote video error:", e);
            console.log(
              "Video error code:",
              remoteVideoRef.current.error?.code
            );
            console.log(
              "Video error message:",
              remoteVideoRef.current.error?.message
            );
          };

          remoteVideoRef.current.onloadeddata = () => {
            console.log("Remote video data loaded");
            playVideo();
          };

          // If metadata is already loaded, try to play immediately
          if (remoteVideoRef.current.readyState >= 1) {
            console.log("Video already has metadata, playing immediately");
            playVideo();
          }

          // Force a play attempt after a short delay
          setTimeout(() => {
            if (remoteVideoRef.current && remoteVideoRef.current.srcObject) {
              console.log("Forcing delayed video play attempt...");
              playVideo();
            }
          }, 2000);
        } else {
          console.error("❌ Remote video element not found!");
        }
      } else {
        console.error("❌ No remote streams in track event");
      }
    };

    // ICE candidate handling
    pc.onicecandidate = (event) => {
      if (event.candidate && socket && socket.readyState === WebSocket.OPEN) {
        console.log(
          "Sending ICE candidate:",
          event.candidate.type,
          event.candidate.protocol
        );
        setIceCandidatesSent((prev) => prev + 1);
        socket.send(
          JSON.stringify({
            type: "candidate",
            candidate: event.candidate,
          })
        );
      } else if (!event.candidate) {
        console.log("✅ ICE gathering completed - no more candidates");
      }
    };

    return pc;
  };

  // Get user media with retry logic and better error handling
  const getUserMedia = async (retries = 3) => {
    for (let i = 0; i < retries; i++) {
      try {
        console.log(`Getting user media (attempt ${i + 1}/${retries})`);
        const stream = await navigator.mediaDevices.getUserMedia(
          getMediaConstraints()
        );
        console.log("✅ User media obtained successfully:", stream);
        console.log(
          "Stream tracks:",
          stream.getTracks().map((t) => ({
            kind: t.kind,
            enabled: t.enabled,
            readyState: t.readyState,
          }))
        );
        return stream;
      } catch (err) {
        console.error(`Failed to get user media (attempt ${i + 1}):`, err);

        // Handle specific error types
        if (err.name === "NotAllowedError") {
          console.error("❌ Camera/microphone permission denied");
          setStatus(
            "Camera/microphone access denied. Please allow permissions and try again."
          );
          throw new Error("Camera/microphone permission denied");
        } else if (err.name === "NotFoundError") {
          console.error("❌ No camera/microphone found");
          setStatus("No camera or microphone found on this device.");
          throw new Error("No camera or microphone found");
        } else if (err.name === "NotReadableError") {
          console.error("❌ Camera/microphone is busy");
          setStatus(
            "Camera or microphone is busy. Please close other applications using it."
          );
          throw new Error("Camera or microphone is busy");
        }

        if (i === retries - 1) {
          setStatus("Failed to access camera/microphone: " + err.message);
          throw err;
        }
        // Wait before retry
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    }
  };

  // WebSocket connect and matchmaking
  const startMatchmaking = async () => {
    // Check WebRTC support first
    if (!checkWebRTCSupport()) {
      console.error("WebRTC not supported, cannot start matchmaking");
      return;
    }

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
    setConnectionState("new");
    setIceConnectionState("new");

    // Clean up any existing resources
    cleanupCall();

    // Small delay to ensure cleanup is complete
    await new Promise((resolve) => setTimeout(resolve, 200));

    console.log("Starting WebSocket connection to:", WS_URL);
    const socket = new window.WebSocket(WS_URL);
    setStatus("Connecting...");

    socket.onopen = () => {
      console.log("✅ WebSocket connected successfully");
      setStatus("Connected, waiting for match...");
    };

    socket.onerror = (error) => {
      console.error("❌ WebSocket error:", error);
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
      console.log("🎯 Match found! Starting video call...");
      setStatus("Matched! Starting video call...");
      setConnected(true);
      isCallerRef.current = true;

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
      console.log("📥 Received offer from peer");
      handleReceiveOffer(data.offer, socket);
    }

    if (data.type === "answer") {
      console.log("📥 Received answer from peer");
      handleReceiveAnswer(data.answer);
    }

    if (data.type === "candidate") {
      console.log("📥 Received ICE candidate from peer");
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

  // WebRTC setup and signaling - Enhanced for reliability
  const startVideoCall = async (socket) => {
    console.log("🚀 Starting video call as caller...");
    setStatus("Starting video call...");
    setInCall(false);

    try {
      // Get user media first
      const localStream = await getUserMedia();
      localStreamRef.current = localStream;

      // Set local video
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = localStream;
        console.log("✅ Local video srcObject set");
      }

      // Create peer connection
      const pc = createPeerConnection(socket);
      pcRef.current = pc;

      // Add local tracks with proper error handling
      console.log("Adding local tracks to peer connection...");
      localStream.getTracks().forEach((track) => {
        console.log(`Adding ${track.kind} track:`, track);
        try {
          pc.addTrack(track, localStream);
          console.log(`✅ ${track.kind} track added successfully`);
        } catch (err) {
          console.error(`❌ Failed to add ${track.kind} track:`, err);
        }
      });

      // Create and send offer with retry logic
      console.log("Creating offer...");
      const offer = await pc.createOffer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: true,
      });
      console.log("✅ Offer created:", offer);

      await pc.setLocalDescription(offer);
      console.log("✅ Local description set");

      // Send offer
      if (socket && socket.readyState === WebSocket.OPEN) {
        console.log("📤 Sending offer via WebSocket");
        socket.send(JSON.stringify({ type: "offer", offer }));
        console.log("✅ Offer sent successfully");
      } else {
        throw new Error("WebSocket not available to send offer");
      }
    } catch (err) {
      console.error("❌ Error in startVideoCall:", err);
      setStatus("Could not start video: " + err.message);
      cleanupCall();
    }
  };

  const handleReceiveOffer = async (offer, socket) => {
    console.log("📥 Received offer, creating answer...");
    setStatus("Received offer, creating answer...");
    isCallerRef.current = false;

    try {
      // Clean up any existing peer connection
      if (pcRef.current) {
        console.log("Cleaning up existing peer connection");
        pcRef.current.close();
        pcRef.current = null;
      }

      // Get user media first
      const localStream = await getUserMedia();
      localStreamRef.current = localStream;

      // Set local video
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = localStream;
        console.log("✅ Local video srcObject set in offer handler");
      }

      // Create new peer connection
      const pc = createPeerConnection(socket);
      pcRef.current = pc;

      // Add local tracks
      console.log("Adding local tracks to peer connection...");
      localStream.getTracks().forEach((track) => {
        console.log(`Adding ${track.kind} track:`, track);
        try {
          pc.addTrack(track, localStream);
          console.log(`✅ ${track.kind} track added successfully`);
        } catch (err) {
          console.error(`❌ Failed to add ${track.kind} track:`, err);
        }
      });

      // Handle incoming data channels
      pc.ondatachannel = (event) => {
        console.log("Incoming data channel:", event.channel.label);
        const dataChannel = event.channel;
        dataChannel.onopen = () => {
          console.log("✅ Incoming data channel opened");
        };
        dataChannel.onmessage = (event) => {
          console.log("Incoming data channel message:", event.data);
          if (event.data === "ping") {
            dataChannel.send("pong");
          }
        };
      };

      // Set remote description
      console.log("Setting remote description...");
      await pc.setRemoteDescription(new RTCSessionDescription(offer));
      console.log("✅ Remote description set successfully");

      // Create answer
      console.log("Creating answer...");
      const answer = await pc.createAnswer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: true,
      });
      console.log("✅ Answer created:", answer);

      // Set local description
      await pc.setLocalDescription(answer);
      console.log("✅ Local description set successfully");

      // Send answer
      if (socket && socket.readyState === WebSocket.OPEN) {
        console.log("📤 Sending answer via WebSocket");
        socket.send(JSON.stringify({ type: "answer", answer }));
        console.log("✅ Answer sent successfully");
      } else {
        throw new Error("WebSocket not available to send answer");
      }
    } catch (err) {
      console.error("❌ Error in handleReceiveOffer:", err);
      setStatus("Error handling offer: " + err.message);
      cleanupCall();
    }
  };

  const handleReceiveAnswer = async (answer) => {
    console.log("📥 Received answer, connecting...");

    if (!pcRef.current) {
      console.error("❌ No peer connection available for answer");
      return;
    }

    try {
      console.log("Current connection state:", pcRef.current.connectionState);
      console.log("Current signaling state:", pcRef.current.signalingState);

      // Only set remote description if we're in the right state
      if (pcRef.current.signalingState === "have-local-offer") {
        await pcRef.current.setRemoteDescription(
          new RTCSessionDescription(answer)
        );
        console.log("✅ Remote description set successfully");
        setInCall(true);
        setStatus("In call - Connecting...");
      } else {
        console.log(
          "⚠️ Ignoring answer - wrong signaling state:",
          pcRef.current.signalingState
        );
      }
    } catch (err) {
      console.error("❌ Error setting remote description:", err);
      setStatus("Connection error: " + err.message);
    }
  };

  const handleReceiveCandidate = async (candidate) => {
    try {
      if (pcRef.current && pcRef.current.remoteDescription) {
        console.log("Adding ICE candidate...");
        setIceCandidatesReceived((prev) => prev + 1);
        await pcRef.current.addIceCandidate(new RTCIceCandidate(candidate));
        console.log("✅ ICE candidate added successfully");
      } else {
        console.log(
          "⚠️ Ignoring ICE candidate - no peer connection or remote description"
        );
      }
    } catch (err) {
      console.error("❌ Error adding ICE candidate:", err);
      // Don't show error to user for ICE candidate issues
    }
  };

  // Enhanced cleanup function
  const cleanupCall = () => {
    console.log("🧹 Cleaning up call resources...");
    setInCall(false);
    setPeerUsername("");
    setConnectionState("new");
    setIceConnectionState("new");
    setIceCandidatesSent(0);
    setIceCandidatesReceived(0);

    // Clear connection timeout
    if (connectionTimeoutRef.current) {
      clearTimeout(connectionTimeoutRef.current);
      connectionTimeoutRef.current = null;
    }

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

    // Clear remote stream reference
    if (remoteStreamRef.current) {
      console.log("Clearing remote stream reference");
      remoteStreamRef.current.getTracks().forEach((track) => {
        console.log("Stopping remote track:", track.kind);
        track.stop();
      });
      remoteStreamRef.current = null;
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

    console.log("✅ Call cleanup completed");
  };

  // Force ICE restart function
  const startVideo = () => {
    console.log("Forcing ICE restart...");
    if (pcRef.current) {
      try {
        // Create a new offer with ICE restart
        pcRef.current
          .createOffer({ iceRestart: true })
          .then(async (offer) => {
            console.log("New offer with ICE restart created");
            await pcRef.current.setLocalDescription(offer);

            // Send the new offer
            if (ws && ws.readyState === WebSocket.OPEN) {
              ws.send(JSON.stringify({ type: "offer", offer }));
              console.log("ICE restart offer sent");
            }
          })
          .catch((err) => {
            console.error("Error creating ICE restart offer:", err);
          });
      } catch (err) {
        console.error("Error in forceIceRestart:", err);
      }
    }
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

        {/* Connection state indicators */}
        {connected && (
          <div style={{ margin: "10px 0", fontSize: "14px", color: "#666" }}>
            <div>Connection: {connectionState}</div>
            <div>ICE: {iceConnectionState}</div>
          </div>
        )}

        <div
          style={{
            display: "flex",
            gap: "1rem",
            justifyContent: "center",
            marginTop: "1rem",
          }}
        >
          {!connected && (
            <button onClick={startMatchmaking}>Initialize and Match</button>
          )}
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
            muted={false}
            className="remote-video"
            style={{
              backgroundColor: "#000",
              minHeight: "300px",
              width: "100%",
              objectFit: "cover",
              display: "block",
            }}
            onLoadedMetadata={() => console.log("Remote video metadata loaded")}
            onCanPlay={() => console.log("Remote video can play")}
            onPlay={() => console.log("Remote video started playing")}
            onError={(e) => console.error("Remote video error:", e)}
            onLoadedData={() => console.log("Remote video data loaded")}
            onWaiting={() => console.log("Remote video waiting")}
            onStalled={() => console.log("Remote video stalled")}
          />
          <video
            ref={localVideoRef}
            autoPlay
            muted
            playsInline
            className="local-video-pip"
            style={{
              backgroundColor: "#333",
              minHeight: "150px",
              width: "200px",
              objectFit: "cover",
            }}
            onLoadedMetadata={() => console.log("Local video metadata loaded")}
            onCanPlay={() => console.log("Local video can play")}
            onPlay={() => console.log("Local video started playing")}
            onError={(e) => console.error("Local video error:", e)}
          />
        </div>

        {/* Debug information */}
        {connected && (
          <div
            style={{
              marginTop: "10px",
              display: "flex",
              gap: "5px",
              flexWrap: "wrap",
            }}
          >
            <button
              onClick={startVideo}
              style={{
                padding: "5px 10px",
                fontSize: "11px",
                backgroundColor: "#f44336",
                color: "white",
                border: "none",
                borderRadius: "4px",
                cursor: "pointer",
              }}
            >
              Start Video
            </button>
          </div>
        )}

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
