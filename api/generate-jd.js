// api/generate-jd.js
import OpenAI from "openai";

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

function setCors(req, res) {
  const allowed = (process.env.ALLOWED_ORIGINS || "")
    .split(",")
    .map(s => s.trim())
    .filter(Boolean);

  const origin = req.headers.origin;
  const allowOrigin = allowed.length === 0
    ? (origin || "*")
    : (allowed.includes(origin) ? origin : allowed[0]);

  res.setHeader("Access-Control-Allow-Origin", allowOrigin);
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Access-Control-Max-Age", "86400");
}

function safeJsonParse(text, fallback) {
  try { return JSON.parse(text); } catch { return fallback; }
}

export default async function handler(req, res) {
  setCors(req, res);

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
Create a modern, ATS-friendly job description with clear headings and bullet points.

STYLE:
- Tone: ${input.tone || "Professional"}
- ${lengthGuide}
- Use headings like: About the Role, Responsibilities, Qualifications, Preferred, Benefits (if provided), EEO
- Avoid protected-class preferences. Include a generic EEO line.

INPUTS:
- Job title: ${input.jobTitle}
- Company: ${input.company || "N/A"}
- Location: ${input.location || "N/A"}
- Employment type: ${input.employmentType || "N/A"}
- Seniority: ${input.seniority || "N/A"}

- Must-have skills: ${input.mustSkills || "N/A"}
- Nice-to-have skills: ${input.niceSkills || "N/A"}
- Responsibilities ideas: ${input.responsibilities || "N/A"}
- Team/mission: ${input.teamMission || "N/A"}

OUTPUT (JSON only):
{
  "job_description": "string (formatted with headings + bullets)",
  "ats_keywords": ["string", "..."],
  "clarity_notes": ["string", "..."]
}
    `.trim();

    const response = await client.responses.create({
      model: "gpt-5.2",
      reasoning: { effort: "low" },
      input: prompt
    });

    const parsed = safeJsonParse(response.output_text || "{}", {});
    return res.status(200).json(parsed);

  } catch (err) {
    console.error("generate-jd error:", err);
    return res.status(500).json({ error: err.message || "Server error" });
  }
}
