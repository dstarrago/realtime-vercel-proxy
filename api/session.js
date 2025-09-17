// Vercel Serverless Function: mints a short-lived OpenAI Realtime session token
module.exports = async (req, res) => {
  // --- CORS (dev-friendly). Lock down in production via ALLOWED_ORIGINS ---
  const origin = req.headers.origin || "";
  const allowList = (process.env.ALLOWED_ORIGINS || "*")
    .split(",").map(s => s.trim()).filter(Boolean);
  const allowed = allowList.includes("*") || allowList.includes(origin);
  if (allowed) {
    res.setHeader("Access-Control-Allow-Origin", origin || "*");
    res.setHeader("Vary", "Origin");
    res.setHeader("Access-Control-Allow-Methods", "POST,OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  }
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).end();

  try {
    // inside the payload you POST to /v1/realtime/sessions
    const payload = {
      model: "gpt-realtime",
      voice: "marin",
      // optional, but helpful:
      instructions: "You are a concise, friendly voice coach. Keep answers short.",
      // ensure voice in/out works automatically when you speak
      turn_detection: { type: "server_vad" },
      modalities: ["audio"],
      // these are safe defaults with WebRTC
      input_audio_format: "pcm16",
      output_audio_format: "pcm16"
    };

    const r = await fetch("https://api.openai.com/v1/realtime/sessions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });

    const text = await r.text(); // pass through JSON or error text
    res.status(r.status).send(text);
  } catch (err) {
    res.status(500).send(String(err));
  }
};
