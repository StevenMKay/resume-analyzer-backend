import OpenAI from "openai";

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

function cors(res) {
  res.setHeader("Access-Control-Allow-Origin", "https://www.careersolutionsfortoday.com");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Access-Control-Max-Age", "86400");
}

function safeJsonParse(text, fallback) {
  try { return JSON.parse(text); } catch { return fallback; }
}

export default async function handler(req, res) {
  cors(res);

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    const input = req.body || {};
    if (!input.jobTitle || !String(input.jobTitle).trim()) {
      return res.status(400).json({ error: "jobTitle is required." });
    }

    const lengthGuide = {
      Concise: "Keep it concise (roughly 250–450 words).",
      Standard: "Keep it standard length (roughly 450–800 words).",
      Detailed: "Make it detailed (roughly 800–1200 words)."
    }[input.length] || "Keep it standard length.";

    const prompt = `
You are an expert HR/Recruiting writer.
Create a modern ATS-friendly job description with headings + bullets.

Tone: ${input.tone || "Professional"}
${lengthGuide}

Inputs:
Job title: ${input.jobTitle}
Company: ${input.company || "N/A"}
Location: ${input.location || "N/A"}
Employment type: ${input.employmentType || "N/A"}
Seniority: ${input.seniority || "N/A"}
Must skills: ${input.mustSkills || "N/A"}
Nice skills: ${input.niceSkills || "N/A"}
Responsibilities: ${input.responsibilities || "N/A"}
Team mission: ${input.teamMission || "N/A"}

Return JSON only:
{
  "job_description": "string",
  "ats_keywords": ["..."],
  "clarity_notes": ["..."]
}
    `.trim();

    const response = await client.responses.create({
      model: "gpt-5.2",
      reasoning: { effort: "low" },
      input: prompt
    });

    return res.status(200).json(safeJsonParse(response.output_text || "{}", {}));
  } catch (err) {
    console.error("generate-jd error:", err);
    return res.status(500).json({ error: err.message || "Server error" });
  }
}
