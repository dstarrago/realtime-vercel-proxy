// api/ask.ts  (Vercel Serverless Function)
import OpenAI from "openai";

export default async function handler(req: any, res: any) {
  if (req.method !== "POST") return res.status(405).end();

  const { question } = req.body || {};
  if (!question) return res.status(400).json({ error: "Missing question" });

  try {
    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });
    const vectorStoreId = process.env.VECTOR_STORE_ID!;
    if (!vectorStoreId) return res.status(500).json({ error: "Missing VECTOR_STORE_ID" });

    // ✅ Responses API + File Search — pass the store ID inside the tool item
    const r = await client.responses.create({
      model: "gpt-4o-mini",
      input: question,
      tools: [
        { type: "file_search", vector_store_ids: [vectorStoreId] }
      ]
    });

    const text = (r as any).output_text ?? JSON.stringify(r);
    res.status(200).json({ answer: text });
  } catch (err: any) {
    res.status(500).json({ error: String(err?.message || err) });
  }
}
