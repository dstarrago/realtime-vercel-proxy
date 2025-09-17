// Example tool endpoint; call this from your app when the model requests it
module.exports = async (req, res) => {
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

  // Parse JSON body if present
  let body = {};
  try {
    if (req.headers["content-type"] && req.headers["content-type"].includes("application/json")) {
      body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
    }
  } catch {}

  const when = body.when || "unspecified";
  res.status(200).json({
    ok: true,
    confirmationId: "CONF-" + Math.random().toString(36).slice(2, 8),
    when
  });
};
