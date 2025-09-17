// scripts/ingest_one.mjs
import OpenAI from "openai";
import fs from "node:fs";
const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const FILE_PATH = "./knowledge/Quest_subjects.md"; // ⬅️ use the MD
const VECTOR_STORE_NAME = "culturalquest-knowledge";

const main = async () => {
  const vs = await client.vectorStores.create({ name: VECTOR_STORE_NAME });
  const batch = await client.vectorStores.fileBatches.uploadAndPoll(
    vs.id,
    { files: [fs.createReadStream(FILE_PATH)] }
  );
  console.log("Vector store id:", vs.id);
  console.log("Batch status:", batch.status, batch.file_counts);
};
main().catch(e => { console.error(e); process.exit(1); });
