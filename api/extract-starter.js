// api/extract-starter.js

function cors(res) {
  res.setHeader("Access-Control-Allow-Origin", "https://www.careersolutionsfortoday.com");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Access-Control-Max-Age", "86400");
}

function safeJsonParse(text, fallback) {
  try { return JSON.parse(text); } catch { return fallback; }
}

async function callOpenAI({ prompt, tools }) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("Missing OPENAI_API_KEY environment variable");

  const body = {
    model: "gpt-5.2",
    input: prompt,
    reasoning: { effort: "low" }
  };

  // Enable web search when requested
  if (tools) body.tools = tools;

  const r = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`
    },
    body: JSON.stringify(body)
  });

  const data = await r.json().catch(() => ({}));
  if (!r.ok) {
    const msg = data?.error?.message || `OpenAI request failed (${r.status})`;
    throw new Error(msg);
  }

  // Responses API returns output_text in many cases; fallback to assembling text
  const outputText =
    data.output_text ||
    (Array.isArray(data.output)
      ? data.output
          .flatMap(o => o?.content || [])
          .map(c => c?.text)
          .filter(Boolean)
          .join("\n")
      : "");

  return outputText || "";
}

export default async function handler(req, res) {
  cors(res);

  // ✅ Preflight must be OK
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

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

      const text = await callOpenAI({ prompt });
      const parsed = safeJsonParse(text, {});
      return res.status(200).json(parsed);
    }

    // starterMode === "web"
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
  "sources": [{"title":"...", "url":"..."}]
}
    `.trim();

    const text = await callOpenAI({
      prompt,
      tools: [{ type: "web_search" }]
    });

    const parsed = safeJsonParse(text, {
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

  } catch (err) {
    console.error("extract-starter error:", err);
    return res.status(500).json({ error: err.message || "Server error" });
  }
}
