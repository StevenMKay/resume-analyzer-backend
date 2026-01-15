// api/generate-jd.js

function cors(res) {
  res.setHeader("Access-Control-Allow-Origin", "https://www.careersolutionsfortoday.com");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Access-Control-Max-Age", "86400");
}

function safeJsonParse(text, fallback) {
  try { return JSON.parse(text); } catch { return fallback; }
}

async function callOpenAI(prompt) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("Missing OPENAI_API_KEY environment variable");

  const r = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: "gpt-5.2",
      input: prompt,
      reasoning: { effort: "low" }
    })
  });

  const data = await r.json().catch(() => ({}));
  if (!r.ok) {
    const msg = data?.error?.message || `OpenAI request failed (${r.status})`;
    throw new Error(msg);
  }

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

    const text = await callOpenAI(prompt);
    const parsed = safeJsonParse(text, {});
    return res.status(200).json(parsed);

  } catch (err) {
    console.error("generate-jd error:", err);
    return res.status(500).json({ error: err.message || "Server error" });
  }
}
