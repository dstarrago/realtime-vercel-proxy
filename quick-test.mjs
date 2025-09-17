import OpenAI from "openai";

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const VECTOR_STORE_ID = "vs_68c9c96deac0819183be68d9e5fb0ebd"; // paste the id if not set

const question = "What columns exist in Quest_subjects, and give 2 example entries?";

const r = await client.responses.create({
  model: "gpt-4o-mini",
  input: question,
  tools: [{ type: "file_search" }],
  tool_resources: { file_search: { vector_store_ids: [VECTOR_STORE_ID] } }
});

console.log("\nANSWER:\n", (r).output_text || JSON.stringify(r, null, 2));
