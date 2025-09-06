import React, { useRef, useState } from "react";
import { Button, SafeAreaView, Text, View, TextInput } from "react-native";
import {
  mediaDevices,
  RTCPeerConnection,
  RTCSessionDescription,
  RTCIceCandidate,
} from "react-native-webrtc";

// ✅ Set this to your Vercel URL (no trailing slash)
const SERVER_BASE_URL = "https://realtime-vercel-proxy.vercel.app";

export default function App() {
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const dcRef = useRef<RTCDataChannel | null>(null);
  const [status, setStatus] = useState<"idle" | "connecting" | "connected">("idle");
  const [log, setLog] = useState("Ready.");
  const [instructions, setInstructions] = useState(
    "You are a concise, friendly voice coach. Keep answers short."
  );

  const appendLog = (s: string) => setLog((l) => l + "\n" + s);

  async function start() {
    if (status !== "idle") return;
    setStatus("connecting");
    appendLog("Requesting ephemeral token…");

    // 1) Get ephemeral Realtime token from your Vercel server
    const tokenRes = await fetch(`${SERVER_BASE_URL}/api/session`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        // Optional: send dynamic session options (instructions/voice) to your server route
        instructions
      }),
    });
    if (!tokenRes.ok) {
      setStatus("idle");
      return appendLog("Failed to get token: " + (await tokenRes.text()));
    }
    const token = await tokenRes.json();
    const clientSecret = token?.client_secret?.value;
    if (!clientSecret) {
      setStatus("idle");
      return appendLog("Token missing client_secret.value");
    }

    // 2) Capture microphone
    const local = await mediaDevices.getUserMedia({ audio: true, video: false });

    // 3) Create RTCPeerConnection, add outgoing audio
    const pc = new RTCPeerConnection({
      iceServers: [{ urls: ["stun:stun.l.google.com:19302"] }],
    });
    pcRef.current = pc;

    local.getTracks().forEach((t) => pc.addTrack(t, local));

    // 4) Handle incoming audio (react-native-webrtc auto-plays)
    pc.ontrack = () => appendLog("🔊 Remote audio track received.");

    // 5) Optional data channel for tool calls / text events
    const dc = pc.createDataChannel("oai-events");
    dcRef.current = dc;
    dc.onopen = () => appendLog("🟢 Data channel open.");
    dc.onmessage = (e) => appendLog("DC ⇦ " + e.data);

    // 6) Create SDP offer
    const offer = await pc.createOffer({ offerToReceiveAudio: true, offerToReceiveVideo: false });
    await pc.setLocalDescription(offer);

    // 7) Exchange SDP with OpenAI Realtime using the ephemeral token
    const r = await fetch("https://api.openai.com/v1/realtime?model=gpt-realtime", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${clientSecret}`,
        "Content-Type": "application/sdp",
      },
      body: offer.sdp,
    });

    if (!r.ok) {
      setStatus("idle");
      return appendLog("Realtime SDP exchange failed: " + (await r.text()));
    }

    const answerSdp = await r.text();
    await pc.setRemoteDescription(new RTCSessionDescription({ type: "answer", sdp: answerSdp }));
    setStatus("connected");
    appendLog("✅ Connected. Speak normally; the model will talk back.");
  }

  async function stop() {
    setStatus("idle");
    try {
      dcRef.current?.close();
    } catch {}
    try {
      pcRef.current?.getSenders().forEach((s) => s.track && s.track.stop());
      pcRef.current?.close();
    } catch {}
    pcRef.current = null;
    dcRef.current = null;
    appendLog("⏹️ Stopped.");
  }

  return (
    <SafeAreaView style={{ flex: 1, padding: 16, gap: 12 }}>
      <Text style={{ fontSize: 22, fontWeight: "700" }}>Realtime Voice (Expo)</Text>

      <Text style={{ marginTop: 6 }}>Session instructions (optional):</Text>
      <TextInput
        value={instructions}
        onChangeText={setInstructions}
        style={{
          borderWidth: 1, borderColor: "#ccc", borderRadius: 8, padding: 8,
          minHeight: 40
        }}
        placeholder="System prompt for this session"
      />

      <View style={{ flexDirection: "row", gap: 12, marginTop: 10 }}>
        <Button title={status === "connected" ? "Connected" : "Start"} onPress={start} disabled={status !== "idle"} />
        <Button title="Stop" onPress={stop} />
      </View>

      <Text style={{ marginTop: 16, fontWeight: "600" }}>Log</Text>
      <View style={{ flex: 1, backgroundColor: "#111", padding: 10, borderRadius: 8 }}>
        <Text style={{ color: "#ddd", fontFamily: "monospace" }}>{log}</Text>
      </View>

      <Text style={{ opacity: 0.7, marginTop: 8 }}>
        Tip: iOS won’t play audio if the ringer is off. Turn the ringer on when testing.
      </Text>
    </SafeAreaView>
  );
}
