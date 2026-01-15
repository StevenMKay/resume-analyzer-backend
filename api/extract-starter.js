// api/extract-starter.js
import OpenAI from "openai";

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// ✅ Adjust this to match how you handle CORS in summarize.js
function setCors(req, res) {
  const allowed = (process.env.ALLOWED_ORIGINS || "")
    .split(",")
    .map(s => s.trim())
    .filter(Boolean);

  const origin = req.headers.origin;

  // If you don't set ALLOWED_ORIGINS, allow all (simple setup)
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
    const { starterMode, jobTitle, jobPaste } = req.body || {};

    if (!starterMode || !["paste", "web"].includes(starterMode)) {
      return res.status(400).json({ error: "starterMode must be 'paste' or 'web'." });
    }

    // -------- PASTE MODE (LinkedIn works best via copy/paste) --------
    if (starterMode === "paste") {
      if (!jobPaste || !String(jobPaste).trim()) {
        return res.status(400).json({ error: "jobPaste is required for paste mode." });
      }

      const prompt = `
Extract structured starter fields from this job posting text.
Return JSON only:
{
 "jobTitle": "string or empty",
 "seniority": "Entry|Mid|Senior|Lead|Manager|Director or empty",
 "mustSkills": "comma-separated string",
 "niceSkills": "comma-separated string",
 "responsibilities": "bullet ideas separated by newlines",
 "teamMission": "1-3 sentences",
 "ats_keywords": ["..."]
}

JOB TEXT:
${jobPaste}
      `.trim();

      const response = await client.responses.create({
        model: "gpt-5.2",
        reasoning: { effort: "low" },
        input: prompt
      });

      const parsed = safeJsonParse(response.output_text || "{}", {});
      return res.status(200).json(parsed);
    }

    // -------- WEB MODE (search the internet by job title) --------
    if (starterMode === "web") {
      if (!jobTitle || !String(jobTitle).trim()) {
        return res.status(400).json({ error: "jobTitle is required for web mode." });
      }

      const prompt = `
You are helping draft a job description. Research the role using web search.

ROLE:
- Job title: ${jobTitle}

TASK:
1) Use web search to find typical responsibilities, must-have skills, nice-to-have skills, common tools/tech, ATS keywords.
2) Prefer reputable sources (company career pages, major job boards, professional orgs, respected recruiting guides).
3) Summarize in a way that can pre-fill a job description form.
4) Do not copy large chunks verbatim.

OUTPUT (JSON only):
{
  "jobTitle": "${jobTitle}",
  "seniority": "Entry|Mid|Senior|Lead|Manager|Director|",
  "mustSkills": "comma-separated string",
  "niceSkills": "comma-separated string",
  "responsibilities": "bullet ideas separated by newlines",
  "teamMission": "1-3 sentences",
  "ats_keywords": ["..."],
  "sources": [
    {"title":"...", "url":"..."}
  ]
}
      `.trim();

      const response = await client.responses.create({
        model: "gpt-5.2",
        reasoning: { effort: "low" },
        input: prompt,
        tools: [{ type: "web_search" }],
        include: ["web_search_call.action.sources"]
      });

      const parsed = safeJsonParse(response.output_text || "{}", {
        jobTitle,
        seniority: "",
        mustSkills: "",
        niceSkills: "",
        responsibilities: "",
        teamMission: "",
        ats_keywords: [],
        sources: []
      });

      return res.status(200).json(parsed);
    }

  } catch (err) {
    console.error("extract-starter error:", err);
    return res.status(500).json({ error: err.message || "Server error" });
  }
}
