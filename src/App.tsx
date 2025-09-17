// src/App.tsx
import React, { useRef, useState, useEffect } from "react";
import {
  Button,
  SafeAreaView,
  Text,
  View,
  TextInput,
  ScrollView,
} from "react-native";
import {
  mediaDevices,
  RTCPeerConnection,
  RTCSessionDescription,
  RTCDataChannel,
} from "react-native-webrtc";
import InCallManager from "react-native-incall-manager";
import { VolumeManager } from "react-native-volume-manager";

// ✅ Set this to your deployed Vercel URL (no trailing slash)
const SERVER_BASE_URL = "https://realtime-vercel-proxy.vercel.app";

export default function App() {
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const dcRef = useRef<RTCDataChannel | null>(null);

  const [status, setStatus] = useState<"idle" | "connecting" | "connected">(
    "idle"
  );
  const [log, setLog] = useState<string>("Ready.");
  const [instructions, setInstructions] = useState<string>(
    "You are a concise, friendly voice coach. Keep answers short."
  );

  function appendLog(line: string) {
    setLog((prev) => prev + "\n" + line);
  }

  // Wire up a data channel and send a first "talk" request
  function setupDc(channel: RTCDataChannel) {
    dcRef.current = channel;

    channel.onopen = () => {
      appendLog("🟢 Data channel open.");
      // Kickstart a spoken response so you immediately hear audio
      channel.send(
        JSON.stringify({
          type: "response.create",
          response: {
            modalities: ["text", "audio"],
            instructions: "Say a short hello and tell me you can hear me."          
          },
        })
      );
      channel.send(JSON.stringify({ type: "response.create" }));
    };

    channel.onmessage = (ev) => {
      // You can parse JSON here for tool calls, etc.
      appendLog("DC ⇦ " + String(ev.data));
    };

    channel.onerror = (e) => appendLog("DC error: " + String(e));
    channel.onclose = () => appendLog("DC closed.");
  }

  async function start() {
    if (status !== "idle") return;
    setStatus("connecting");
    appendLog("Requesting ephemeral token…");

    // 1) Get an ephemeral Realtime session token from your server.
    //    (Make sure your /api/session sets turn_detection + audio modalities.)
    let clientSecret: string | undefined;
    try {
      const res = await fetch(`${SERVER_BASE_URL}/api/session`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ instructions }), // optional: pass dynamic instructions
      });
      if (!res.ok) {
        const txt = await res.text();
        appendLog("Token error: " + txt);
        setStatus("idle");
        return;
      }
      const token = await res.json();
      clientSecret = token?.client_secret?.value;
      if (!clientSecret) {
        appendLog("Token missing client_secret.value");
        setStatus("idle");
        return;
      }
    } catch (err) {
      appendLog("Token fetch failed: " + String(err));
      setStatus("idle");
      return;
    }

    // 2) Capture microphone
    let localStream: MediaStream | null = null;
    try {
      localStream = await mediaDevices.getUserMedia({
        audio: true,
        video: false,
      });
    } catch (err) {
      appendLog("Mic permission / getUserMedia failed: " + String(err));
      setStatus("idle");
      return;
    }

    // 3) Create RTCPeerConnection
    const pc = new RTCPeerConnection({
      iceServers: [{ urls: ["stun:stun.l.google.com:19302"] }],
    });
    pcRef.current = pc;

    // Add outgoing (mic) tracks
    localStream.getTracks().forEach((t) => pc.addTrack(t, localStream!));

    // Incoming audio will auto-play via react-native-webrtc
    pc.ontrack = () => {
      appendLog("🔊 Remote audio track received.");
      InCallManager.start({ media: "audio" });
      InCallManager.setForceSpeakerphoneOn(true);      
    };

    // Helpful connection logs
    pc.oniceconnectionstatechange = () =>
      appendLog("ICE state: " + pc.iceConnectionState);
    pc.onconnectionstatechange = () =>
      appendLog("PC state: " + pc.connectionState);

    // 4) Create a client data channel BEFORE creating the offer
    const dc = pc.createDataChannel("oai-events");
    setupDc(dc);

    // Also handle the server opening its own channel
    pc.ondatachannel = (ev) => {
      appendLog("🔌 Server opened data channel: " + ev.channel.label);
      setupDc(ev.channel);
    };

    // 5) Offer/Answer with Realtime
    try {
      const offer = await pc.createOffer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: false,
      });
      await pc.setLocalDescription(offer);

      const r = await fetch(
        "https://api.openai.com/v1/realtime?model=gpt-realtime",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${clientSecret}`,
            "Content-Type": "application/sdp",
          },
          body: offer.sdp,
        }
      );

      if (!r.ok) {
        const txt = await r.text();
        appendLog("SDP exchange failed: " + txt);
        setStatus("idle");
        try {
          pc.close();
        } catch {}
        pcRef.current = null;
        return;
      }

      const answerSdp = await r.text();
      await pc.setRemoteDescription(
        new RTCSessionDescription({ type: "answer", sdp: answerSdp })
      );

      setStatus("connected");
      appendLog("✅ Connected. Speak normally; the model should talk back.");

      // Route audio to loudspeaker and use the right audio mode
      InCallManager.start({ media: "audio" });
      InCallManager.setForceSpeakerphoneOn(true);
      const v = await VolumeManager.getVolume();
      await VolumeManager.showNativeVolumeUI({ enabled: true }); // show overlay
      await VolumeManager.setVolume(1.0, { type: 'call', showUI: true, playSound: true });
      console.log('System volume (type, value):', v.type, v.volume.toFixed(2));

    } catch (err) {
      appendLog("Offer/Answer error: " + String(err));
      setStatus("idle");
      try {
        pc.close();
      } catch {}
      pcRef.current = null;
    }
  }

  async function stop() {
    setStatus("idle");
    try { InCallManager.stop(); } catch {}
    try {
      dcRef.current?.close();
    } catch {}
    try {
      // Stop mic tracks
      const senders = pcRef.current?.getSenders() ?? [];
      senders.forEach((s) => {
        try {
          s.track && s.track.stop();
        } catch {}
      });
      pcRef.current?.close();
    } catch {}
    pcRef.current = null;
    dcRef.current = null;
    appendLog("⏹️ Stopped.");
  }

  async function askAndSpeak(q: string) {
    const r = await fetch(`${SERVER_BASE_URL}/api/ask`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question: q }),
    });
    const { answer } = await r.json();

    // Push the answer into the conversation, then ask the model to speak it:
    dcRef.current?.send(JSON.stringify({
      type: "conversation.item.create",
      item: { type: "message", role: "user", content: [{ type: "input_text", text: answer }] }
    }));
    dcRef.current?.send(JSON.stringify({
      type: "response.create",
      response: { modalities: ["audio", "text"] }
    }));
  }


  // Cleanup on unmount
  useEffect(() => {
    return () => {
      try { InCallManager.stop(); } catch {}
      try {
        dcRef.current?.close();
      } catch {}
      try {
        pcRef.current?.getSenders().forEach((s) => s.track && s.track.stop());
        pcRef.current?.close();
      } catch {}
      pcRef.current = null;
      dcRef.current = null;
    };
  }, []);

  return (
    <SafeAreaView style={{ flex: 1, padding: 16, gap: 12 }}>
      <Text style={{ fontSize: 22, fontWeight: "700" }}>Realtime Voice (Expo)</Text>

      <Text style={{ marginTop: 8 }}>Session instructions (optional):</Text>
      <TextInput
        value={instructions}
        onChangeText={setInstructions}
        style={{
          borderWidth: 1,
          borderColor: "#ccc",
          borderRadius: 8,
          padding: 8,
          minHeight: 40,
        }}
        placeholder="System prompt for this session"
      />

      <View style={{ flexDirection: "row", gap: 12, marginTop: 12 }}>
        <Button
          title={status === "connected" ? "Connected" : "Start"}
          onPress={start}
          disabled={status !== "idle"}
        />
        <Button title="Stop" onPress={stop} />
        <Button title="Ask (KB)" onPress={() => askAndSpeak(
          "From our knowledge base, list 3 representative topics/rows from Quest_subjects and cite the column names."
          )} 
        />
      </View>

      <Text style={{ marginTop: 16, fontWeight: "600" }}>Log</Text>
      <View
        style={{
          flex: 1,
          backgroundColor: "#111",
          padding: 10,
          borderRadius: 8,
        }}
      >
        <ScrollView>
          <Text style={{ color: "#ddd", fontFamily: "monospace" }}>{log}</Text>
        </ScrollView>
      </View>

      <Text style={{ opacity: 0.7, marginTop: 8 }}>
        Tip: iOS won’t play audio if the ringer is off. Turn the ringer on when
        testing. Also ensure your server’s /api/session enables turn detection
        and audio modalities.
      </Text>
    </SafeAreaView>
  );
}
