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

  // ✅ Preflight must return CORS headers + 200
  if (req.method === "OPTIONS") return res.status(200).end();

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { starterMode, jobTitle, jobPaste } = req.body || {};

    if (!starterMode || !["paste", "web"].includes(starterMode)) {
      return res.status(400).json({ error: "starterMode must be 'paste' or 'web'." });
    }

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

      return res.status(200).json(safeJsonParse(response.output_text || "{}", {}));
    }

    // starterMode === "web"
    if (!jobTitle || !String(jobTitle).trim()) {
      return res.status(400).json({ error: "jobTitle is required for web mode." });
    }

    const prompt = `
Research this role using web search and return starter fields to prefill a JD form.

ROLE:
- Job title: ${jobTitle}

OUTPUT (JSON only):
{
  "jobTitle": "${jobTitle}",
  "seniority": "Entry|Mid|Senior|Lead|Manager|Director|",
  "mustSkills": "comma-separated string",
  "niceSkills": "comma-separated string",
  "responsibilities": "bullet ideas separated by newlines",
  "teamMission": "1-3 sentences",
  "ats_keywords": ["..."],
  "sources": [{"title":"...", "url":"..."}]
}
      `.trim();

    const response = await client.responses.create({
      model: "gpt-5.2",
      reasoning: { effort: "low" },
      input: prompt,
      tools: [{ type: "web_search" }],
      include: ["web_search_call.action.sources"]
    });

    return res.status(200).json(
      safeJsonParse(response.output_text || "{}", {
        jobTitle,
        seniority: "",
        mustSkills: "",
        niceSkills: "",
        responsibilities: "",
        teamMission: "",
        ats_keywords: [],
        sources: []
      })
    );

  } catch (err) {
    console.error("extract-starter error:", err);
    return res.status(500).json({ error: err.message || "Server error" });
  }
}
