// ===============================================================
//  ADVANCED RESUME ANALYZER — UPDATED (CHUNK A / 4)
//  Improvements Included:
//   • More robust normalization
//   • Stronger keyword extraction
//   • Hard/Soft skill classification
//   • Phrase canonicalization improvements
//   • Cleaner token filtering
//   • Better CORS handling
//   • Stronger job hydration fallback
//   • Foundation for skill gap + ATS breakdown
// ===============================================================

// ---------------------------
// Allowed frontend origins
// ---------------------------
const ALLOWED_ORIGINS = new Set([
  "https://www.careersolutionsfortoday.com",
  "https://careersolutionsfortoday.com",
  "https://stevenmkay.github.io",
  "http://localhost:5500",
  "http://127.0.0.1:5500"
]);

// -----------------------------------------------------------
// STOP WORDS — expanded & cleaned to prevent false positives
// -----------------------------------------------------------
const CRITICAL_KEYWORD_STOP_WORDS = new Set([
  "the","and","for","with","your","you","our","are","this","that","from","have","has","will","their","they",
  "job","description","role","responsibilities","requirements","skills","ability","work","team","per","such",
  "experience","strong","must","should","about","into","within","across","while","including","more",
  "than","who","what","where","when","which","why","how","via","using","use","can","able","need","needed",
  "preferred","plus","bonus","an","a","of","in","to","by","as","on","at","is","be","it","or","new","end",
  "tasks","functions","duties","preferred","requirements","including","include"
]);

// -----------------------------------------------------------
// GENERIC HR / COMPANY WORDS — filtered out
// -----------------------------------------------------------
const CRITICAL_GENERIC_TERMS = new Set([
  "benefits","benefit","compensation","salary","salaries","insurance","medical","dental","vision","pto",
  "vacation","holidays","401k","retirement","paid","payment","hourly","hours","company","companies",
  "organization","organizations","corporate","corporation","enterprise","enterprises","department",
  "departments","business","businesses","employer","employers","culture","mission","values","people",
  "opportunity","environment","industry"
]);

// -----------------------------------------------------------
// Short high-value acronyms
// -----------------------------------------------------------
const CRITICAL_SHORT_TOKENS = new Set([
  "ai","ml","hr","ui","ux","qa","sql","sap","api","aws","erp","crm","etl","bi","ads","pm","devops"
]);

// -----------------------------------------------------------
// NEW: Hard skill / soft skill clusters for better classification
// -----------------------------------------------------------
const HARD_SKILLS = [
  "sql","python","tableau","power bi","aws","excel","jira","confluence","scrum","agile","lean","six sigma",
  "sharepoint","snowflake","azure","google cloud","git","html","css","javascript"
];

const SOFT_SKILLS = [
  "leadership","communication","stakeholder management","collaboration","problem solving","critical thinking",
  "cross-functional alignment","time management","coaching","mentoring","presentation","negotiation"
];

// -----------------------------------------------------------
// Bullet symbol collection (unchanged)
// -----------------------------------------------------------
const BULLET_GLYPH_SOURCE = "•●◦▪▫‣·‧○◉◎▸▹►✦✧➤➔➣➥➧➨➩➪➫➬➭➮➯➱➲➳➵➸➼➽➾";
const createBulletRegex = (flags = "g") => new RegExp(`[${BULLET_GLYPH_SOURCE}]`, flags);

// -----------------------------------------------------------
// Keyword library — unchanged, but improved matching
// -----------------------------------------------------------
const CRITICAL_KEYWORD_LIBRARY = [
  { phrase: "Program management", hints: ["program manager","program management","manage programs"], patterns: [/management of programs?/i] },
  { phrase: "Project management", hints: ["project management","project manager"], patterns: [/management of projects?/i] },
  { phrase: "Cross-functional leadership", hints: ["cross functional","cross-functional","matrixed teams"], patterns: [/cross[- ]functional/i] },
  { phrase: "Process improvement", hints: ["process improvement","lean","six sigma"], patterns: [/process(?:es)? improvement/i] },
  { phrase: "Operational excellence", hints: ["operational excellence","efficiency"], patterns: [/operational excellence/i] },
  { phrase: "Data-driven decision making", hints: ["data driven","data-informed"], patterns: [/data[- ]driven/i] },
  { phrase: "Success metrics & KPIs", hints: ["kpi","success metrics","performance indicators"] },
  { phrase: "Resource planning", hints: ["resource planning","resource allocation"], patterns: [/resource allocation/i] },
  { phrase: "Strategic initiatives", hints: ["strategic initiative","strategic programs"], patterns: [/strategic initiatives?/i] },
  { phrase: "End-to-end program delivery", hints: ["end to end","end-to-end"], patterns: [/end[- ]to[- ]end/i] },
  { phrase: "Healthcare operations", hints: ["healthcare operations","care delivery","clinical operations"] },
  { phrase: "Clinical programs & pathways", hints: ["clinical program","care pathway"], patterns: [/clinical pathways?/i] },
  { phrase: "Stakeholder management", hints: ["stakeholder management","stakeholder alignment"], patterns: [/stakeholder (?:management|coordination)/i] },
  { phrase: "Continuous improvement", hints: ["continuous improvement","kaizen"], patterns: [/continuous improvement/i] },
  { phrase: "Population health", hints: ["population health","at-risk populations"] },
  { phrase: "Change management", hints: ["change management","organizational change"] },
  { phrase: "Risk management", hints: ["risk management","mitigate risk"], patterns: [/risk management/i] },
  { phrase: "Regulatory compliance", hints: ["regulatory compliance","regulatory standards"] },
  { phrase: "Customer / patient experience", hints: ["customer experience","patient experience"] },
  { phrase: "Executive reporting & communications", hints: ["executive reporting","senior leadership updates"] },
  { phrase: "Budget ownership", hints: ["budget ownership","budget management"], patterns: [/budget management/i] },
  { phrase: "Vendor management", hints: ["vendor management","third-party management"] },
  { phrase: "Automation & tooling", hints: ["automation","workflow automation"] },
  { phrase: "Roadmap planning", hints: ["roadmap planning","roadmap management"] }
];

// -----------------------------------------------------------
// Synonym pattern mappings
// -----------------------------------------------------------
const KEYWORD_SYNONYM_PATTERNS = [
  { regex: /stakeholder (?:engagement|alignment|coordination)/i, phrase: "Stakeholder management" },
  { regex: /risk (?:assessment|identification)/i, phrase: "Risk management" },
  { regex: /clinical (?:workflows?|pathways?)/i, phrase: "Clinical programs & pathways" },
  { regex: /continuous (?:improvement|optimization)/i, phrase: "Continuous improvement" },
  { regex: /operational (?:readiness|efficiency)/i, phrase: "Operational excellence" }
];

// -----------------------------------------------------------
// Default keywords for fallback
// -----------------------------------------------------------
const DEFAULT_CRITICAL_KEYWORDS = [
  "Program management",
  "Project management",
  "Cross-functional leadership",
  "Process improvement",
  "Operational excellence",
  "Data-driven decision making",
  "Success metrics & KPIs",
  "Stakeholder management",
  "Strategic initiatives",
  "End-to-end program delivery",
  "Resource planning",
  "Risk management",
  "Change management",
  "Customer / patient experience",
  "Regulatory compliance"
];

// ===============================================================
//  CORS HANDLER — improved logging / fallback
// ===============================================================
function applyCors(req, res) {
  const origin = req.headers.origin;
  if (origin && (ALLOWED_ORIGINS.has(origin) || process.env.ALLOW_ALL_ORIGINS === "true")) {
    res.setHeader("Access-Control-Allow-Origin", origin);
  } else {
    res.setHeader("Access-Control-Allow-Origin", "https://www.careersolutionsfortoday.com");
  }
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
}

// ===============================================================
//  JOB DESCRIPTION HYDRATION — safer HTML stripping
// ===============================================================
async function hydrateJobDescription(rawText = "") {
  if (!rawText) {
    return { text: "", source: "none", fetchedFrom: null, error: null };
  }

  const isUrl = /^https?:\/\//i.test(rawText);

  // Direct text case
  if (!isUrl) {
    return { text: rawText, source: "direct", fetchedFrom: null, error: null };
  }

  try {
    const resp = await fetch(`https://r.jina.ai/${rawText}`);
    const html = await resp.text();

    // strip HTML tags
    const cleaned = html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

    return {
      text: cleaned,
      source: "url",
      fetchedFrom: rawText,
      error: null
    };
  } catch (err) {
    console.log("Job hydrate failed:", err);
    return {
      text: rawText,
      source: "fallback-raw",
      fetchedFrom: rawText,
      error: err.message
    };
  }
}

// ===============================================================
//  RESUME NORMALIZATION — improved stability
// ===============================================================
function normalizeResumeContent(text = "") {
  if (!text || typeof text !== "string") return "";

  return text
    .replace(/\r\n/g, "\n")
    .replace(/\t/g, " ")
    .replace(/[•●◦▪▫‣·‧]/g, "- ")
    .replace(/\s+/g, " ")
    .trim();
}

// ===============================================================
//  NEW: Skill token normalizer — for skill gap & ATS
// ===============================================================
function normalizeSkillToken(t = "") {
  return t.toLowerCase()
    .replace(/[^a-z0-9+\- ]+/g, "")
    .trim();
}

// ===============================================================
//  NEW: Canonicalize multi-word keyword phrases
// ===============================================================
function canonicalizeKeywordPhrase(phrase = "") {
  if (!phrase) return "";
  return phrase
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b(ai for|using|knowledge of|experience in|understanding of)\b/gi, "")
    .trim()
    .replace(/\bpm\b/gi, "project management");
}

// ===============================================================
//  NEW: Extract highlight keywords to send back to frontend
// ===============================================================
function extractHighlightKeywords(jobText = "", resumeText = "") {
  const combined = `${jobText} ${resumeText}`.toLowerCase();

  const found = new Set();

  [...CRITICAL_KEYWORD_LIBRARY.map(k => k.phrase.toLowerCase()), 
   ...HARD_SKILLS,
   ...SOFT_SKILLS].forEach(keyword => {
      if (combined.includes(keyword.toLowerCase())) {
        found.add(keyword);
      }
  });

  return Array.from(found).slice(0, 30); // do not oversaturate UI
}
// ===============================================================
//  OPENAI REQUEST WRAPPER — safer JSON parsing & logging
// ===============================================================
async function generateAnalysis(prompt, resumeText, jobDescription, apiKey) {
  const requestBody = {
    model: "gpt-4o-mini",
    messages: [
      {
        role: "system",
        content: "You are a professional resume analyzer. Respond ONLY with valid JSON. No commentary. No markdown. No filler."
      },
      {
        role: "user",
        content: prompt
      }
    ],
    temperature: 0.15,
    max_tokens: 3200,
    response_format: { type: "json_object" }
  };

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`
    },
    body: JSON.stringify(requestBody)
  });

  if (!response.ok) {
    const errText = await response.text().catch(() => "");
    console.log("OpenAI error payload:", errText);
    throw new Error("OpenAI API error: " + response.status);
  }

  const data = await response.json();
  const raw = data?.choices?.[0]?.message?.content || "";

  let analysis = null;
  let fallbackUsed = false;
  let fallbackReason = null;

  // Attempt direct JSON parse
  try {
    analysis = JSON.parse(raw);
  } catch (err1) {
    // Attempt bracket extraction
    try {
      const extracted = extractJsonFromResponse(raw);
      analysis = JSON.parse(extracted);
    } catch (err2) {
      console.log("JSON parse failed twice. Using fallback.");
      fallbackUsed = true;
      fallbackReason = "json_parse_failed";
      analysis = createFallbackAnalysis(resumeText, Boolean(jobDescription), jobDescription);
    }
  }

  if (!analysis || typeof analysis !== "object") {
    console.log("Invalid analysis object. Using fallback.");
    fallbackUsed = true;
    fallbackReason = "invalid_structure";
    analysis = createFallbackAnalysis(resumeText, Boolean(jobDescription), jobDescription);
  }

  return { analysis, fallbackUsed, fallbackReason };
}

// ---------------------------------------------------------------
// Extract JSON from messy model output
// ---------------------------------------------------------------
function extractJsonFromResponse(text) {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) {
    throw new Error("No JSON object found");
  }
  return text.slice(start, end + 1);
}

// ===============================================================
//  FALLBACK ANALYSIS ENGINE — stronger + more accurate
// ===============================================================
function createFallbackAnalysis(resumeText, hasJobDescription, jobDescription = "") {
  console.log("Using fallback analysis...");

  const safe = normalizeResumeContent(resumeText);
  const tokenCount = safe.split(/\s+/).length;
  const metricCount = (safe.match(/\b\d[\d,\.%x+]*\b/gi) || []).length;
  const bulletCount = countBulletSymbols(safe);
  const hasPhone = /\b\d{3}[-.\s]*\d{3}[-.\s]*\d{4}\b/.test(safe);
  const hasEmail = /@/.test(safe);

  // Basic scoring
  const coverage = clamp(40 + tokenCount / 10, 50, 90);
  const metrics = clamp(55 + metricCount * 2, 55, 90);
  const bullets = clamp(55 + bulletCount * 1.5, 55, 88);

  const baseScore = Math.floor((coverage + metrics + bullets) / 3);

  // Skill gap detection (lightweight fallback)
  const skillGaps = detectSkillGaps(jobDescription, resumeText);

  return {
    overallScore: baseScore,
    categories: [
      {
        name: "Contact Information",
        status: hasEmail && hasPhone ? "good" : "warning",
        score: hasEmail && hasPhone ? 88 : 70,
        feedback: hasEmail && hasPhone
          ? "Resume contains essential contact details."
          : "Add missing contact basics (email + phone).",
        suggestions: hasEmail && hasPhone
          ? ["Keep contact details concise and visible."]
          : ["Add both email + phone in header."]
      },
      {
        name: "Work Experience",
        status: "warning",
        score: metrics,
        feedback: "Experience found. Ensure strong quantified achievements.",
        suggestions: [
          "Lead bullets with action verbs.",
          "Include measurable results (%, $, time saved)."
        ]
      },
      {
        name: hasJobDescription ? "Job Match & Keywords" : "Keyword Optimization",
        status: "warning",
        score: coverage,
        feedback: hasJobDescription
          ? "Resume partially aligns with job posting."
          : "Resume uses recognizable terminology but can be optimized.",
        suggestions: [
          "Repeat must-have skills in summary + bullets.",
          "Use standard job title terminology."
        ]
      }
    ],
    criticalKeywords: generateCriticalKeywords(jobDescription, resumeText).slice(0, 15),
    extraInsights: [
      {
        title: "Strengths Summary",
        status: "good",
        details: buildStrengthSummary(resumeText),
        tips: [
          "Keep emphasizing quantified accomplishments.",
          "Make achievements scannable with short, punchy bullets."
        ]
      },
      {
        title: "Skill Gap Overview",
        status: skillGaps.count > 0 ? "warning" : "good",
        details:
          skillGaps.count === 0
            ? "Resume covers all major job-required skills."
            : "Some required job skills appear missing.",
        tips: skillGaps.missing.slice(0, 5)
      }
    ]
  };
}

// ---------------------------------------------------------------
// Utility clamp
// ---------------------------------------------------------------
function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

// ---------------------------------------------------------------
// Count bullets
// ---------------------------------------------------------------
function countBulletSymbols(text = "") {
  const regex = createBulletRegex("g");
  return (text.match(regex) || []).length;
}

// ===============================================================
//  NEW: Build Strength Summary — reveals what user does well
// ===============================================================
function buildStrengthSummary(text = "") {
  const lower = text.toLowerCase();

  const strengths = [];

  if (lower.includes("led") || lower.includes("managed")) strengths.push("Leadership & ownership");
  if (lower.includes("improved") || lower.includes("optimized")) strengths.push("Process improvement mindset");
  if (lower.includes("kpi") || lower.includes("metric")) strengths.push("Data-driven approach");
  if (lower.includes("cross") || lower.includes("partner")) strengths.push("Cross-functional collaboration");
  if (lower.includes("customer") || lower.includes("client")) strengths.push("Customer-centric focus");

  if (strengths.length === 0) strengths.push("Clear communication and consistent formatting.");

  return strengths.join(", ") + ".";
}

// ===============================================================
//  NEW: Skill Gap Analyzer (lightweight, part 1)
//  Part 2 will be applied in Chunk C
// ===============================================================
function detectSkillGaps(jobText = "", resumeText = "") {
  if (!jobText) return { count: 0, missing: [] };

  const jobTokens = (jobText.toLowerCase().match(/[a-z0-9+]{3,}/g) || [])
    .map(normalizeSkillToken);

  const resumeTokens = new Set(
    (resumeText.toLowerCase().match(/[a-z0-9+]{3,}/g) || []).map(normalizeSkillToken)
  );

  const missing = [];

  HARD_SKILLS.forEach(skill => {
    if (jobTokens.includes(skill) && !resumeTokens.has(skill)) {
      missing.push(skill);
    }
  });

  SOFT_SKILLS.forEach(skill => {
    if (jobTokens.includes(skill) && !resumeTokens.has(skill)) {
      missing.push(skill);
    }
  });

  return { count: missing.length, missing };
}

// ===============================================================
//  Improved Critical Keyword Engine (Part 1)
// ===============================================================
function generateCriticalKeywords(jobDescription = "", resumeText = "") {
  const combined = `${jobDescription} ${resumeText}`;
  const lower = combined.toLowerCase();

  const found = new Set();

  // Direct library matches
  CRITICAL_KEYWORD_LIBRARY.forEach(item => {
    const matchHints = item.hints?.some(h => lower.includes(h.toLowerCase())) ?? false;
    const matchRegex = item.patterns?.some(r => r.test(combined)) ?? false;
    if (matchHints || matchRegex) found.add(item.phrase);
  });

  // Synonyms
  KEYWORD_SYNONYM_PATTERNS.forEach(map => {
    if (map.regex.test(combined)) found.add(map.phrase);
  });

  // Extractive method (2–3 token phrases)
  extractKeyPhrasesFromText(combined, 20).forEach(x => found.add(x));

  // Defaults
  DEFAULT_CRITICAL_KEYWORDS.forEach(x => found.add(x));

  return Array.from(found)
    .map(canonicalizeKeywordPhrase)
    .filter(Boolean)
    .slice(0, 20);
}

// ---------------------------------------------------------------
// Extractive keyphrase engine
// ---------------------------------------------------------------
function extractKeyPhrasesFromText(text = "", limit = 15) {
  const tokens = text.toLowerCase().match(/[a-z0-9+]{2,}/g) || [];
  const usable = tokens.map(t => ({
    token: t,
    keep:
      !CRITICAL_KEYWORD_STOP_WORDS.has(t) &&
      !CRITICAL_GENERIC_TERMS.has(t) &&
      (CRITICAL_SHORT_TOKENS.has(t) || t.length > 3)
  }));

  const counts = {};
  const add = arr => {
    const phrase = canonicalizeKeywordPhrase(arr.join(" "));
    if (!phrase) return;
    counts[phrase] = (counts[phrase] || 0) + 1;
  };

  for (let i = 0; i < usable.length - 1; i++) {
    const a = usable[i], b = usable[i + 1];
    if (a.keep && b.keep) add([a.token, b.token]);

    if (i < usable.length - 2) {
      const c = usable[i + 2];
      if (a.keep && b.keep && c.keep) add([a.token, b.token, c.token]);
    }
  }

  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .map(([phrase]) => phrase)
    .slice(0, limit);
}
// ===============================================================
//  ATS SIGNAL ENGINE — Full scoring logic
// ===============================================================
function createAtsSignals(resumeText, jobDescription, structureSignals) {
  const lowerResume = resumeText.toLowerCase();

  // Word count
  const words = lowerResume.split(/\s+/).filter(Boolean);
  const wordCount = words.length;

  // Numeric metrics detection
  const numbers = resumeText.match(/\b\d[\d,\.%x+]*\b/g) || [];
  const metricDensity = numbers.length;

  // Bullet count
  const bulletCount = countBulletSymbols(resumeText);

  // Keyword match
  const jobTokens = (jobDescription.toLowerCase().match(/[a-z]{4,}/g) || [])
    .filter(tok => !CRITICAL_KEYWORD_STOP_WORDS.has(tok));
  const resumeTokens = new Set(lowerResume.match(/[a-z]{4,}/g) || []);
  let overlap = 0;
  jobTokens.forEach(tok => {
    if (resumeTokens.has(tok)) overlap++;
  });

  const keywordMatchScore = jobTokens.length ? overlap / jobTokens.length : 0;

  // Acronym presence (ATS often wants spelled-out versions too)
  const acronymScore = detectAcronymCompleteness(resumeText);

  // Hard skill scoring
  const hardSkillScore = HARD_SKILLS.filter(s => lowerResume.includes(s.toLowerCase())).length;

  // Soft skill scoring
  const softSkillScore = SOFT_SKILLS.filter(s => lowerResume.includes(s.toLowerCase())).length;

  return {
    wordCount,
    metricDensity,
    bulletCount,
    keywordMatchScore,
    hardSkillScore,
    softSkillScore,
    acronymScore,
    timelineGaps: structureSignals.timelineGaps || [],
    hasSummary: structureSignals.hasSummary,
    hasEducation: structureSignals.hasEducation,
    hasExperience: structureSignals.hasExperience
  };
}

// ---------------------------------------------------------------
// Acronym completeness — checks for (e.g., KPI → Key Performance Indicator)
// ---------------------------------------------------------------
function detectAcronymCompleteness(text = "") {
  const pairs = [
    ["kpi", /key performance indicators?/i],
    ["sla", /service level agreements?/i],
    ["roi", /return on investment/i],
    ["tco", /total cost of ownership/i],
    ["okrs?", /objectives and key results/i]
  ];

  let score = 0;
  pairs.forEach(([acro, regex]) => {
    const hasAcronym = text.toLowerCase().includes(acro);
    const hasLongForm = regex.test(text);
    if (hasAcronym && hasLongForm) score++;
  });

  return score;
}

// ===============================================================
//  ATS WARNINGS — human readable suggestions
// ===============================================================
function buildAtsWarnings(signals) {
  const warnings = [];

  if (signals.wordCount < 280) {
    warnings.push("Resume may be too short for mid-senior roles.");
  }
  if (signals.metricDensity < 3) {
    warnings.push("Add more measurable achievements (%, $, time saved).");
  }
  if (signals.keywordMatchScore < 0.15) {
    warnings.push("Resume does not strongly reflect job posting terminology.");
  }
  if (signals.bulletCount < 8) {
    warnings.push("Add more bullet points to make accomplishments scannable.");
  }
  if (signals.acronymScore < 2) {
    warnings.push("Spell out acronyms once for ATS readability.");
  }

  return warnings;
}

// ===============================================================
//  ATS DIAGNOSTIC CARD — extra insights section
// ===============================================================
function generateAtsInsightCard(signals) {
  return {
    title: "ATS Diagnostics",
    status: signals.keywordMatchScore > 0.25 ? "good" : "warning",
    details: `Your resume contains ${signals.metricDensity} measurable metrics, ${signals.bulletCount} bullets, and matches ${(signals.keywordMatchScore * 100).toFixed(0)}% of job terminology.`,
    tips: [
      "Add quantifiable metrics where possible.",
      "Spell out acronyms at least once.",
      "Mirror job posting keywords in your summary and bullets."
    ]
  };
}

// ===============================================================
//  STRUCTURE SIGNALS — detect sections, timeline gaps, layout
// ===============================================================
function deriveResumeStructureSignals(text = "") {
  const lower = text.toLowerCase();

  const hasSummary = /\bsummary\b/.test(lower);
  const hasExperience = /\bexperience\b/.test(lower);
  const hasEducation = /\beducation\b/.test(lower);

  // Timeline detection (YYYY–YYYY)
  const dates = text.match(/\b(19|20)\d{2}\b/g) || [];
  const timelineGaps = [];
  if (dates.length > 1) {
    const sorted = dates.map(Number).sort((a, b) => b - a);
    for (let i = 0; i < sorted.length - 1; i++) {
      const gap = sorted[i] - sorted[i + 1];
      if (gap > 3) timelineGaps.push({ from: sorted[i], to: sorted[i + 1], gap });
    }
  }

  return {
    hasSummary,
    hasExperience,
    hasEducation,
    timelineGaps
  };
}

// ===============================================================
//  STRUCTURE INSIGHT CARD
// ===============================================================
function generateStructureInsightCard(structure) {
  return {
    title: "Structure & Timeline",
    status: structure.timelineGaps.length ? "warning" : "good",
    details: structure.timelineGaps.length
      ? "Large unexplained employment gaps detected."
      : "No major timeline gaps detected.",
    tips: structure.timelineGaps.length
      ? ["Explain timeline gaps in your summary or highlight transitions."]
      : ["Continue maintaining a clear chronological layout."]
  };
}

// ===============================================================
//  MISSING BULLET GENERATOR — fallback + AI-ready
// ===============================================================
function generateMissingBullets(resumeText = "") {
  // Detect if bullets lacking metrics
  const lines = resumeText.split(/\n|-/).map(l => l.trim()).filter(Boolean);
  const weak = lines.filter(l => l.length < 35 || !/\d/.test(l));

  const examples = [
    "Reduced processing time by 22% through workflow optimization.",
    "Coordinated cross-functional teams to deliver projects ahead of schedule.",
    "Implemented data-driven decisions resulting in improved KPIs.",
    "Standardized reporting processes to enhance leadership visibility.",
    "Managed stakeholder alignment across multiple departments."
  ];

  if (weak.length < 3) return [];

  return examples.slice(0, 3);
}

// ===============================================================
//  RESUME COMPLETENESS ENFORCER — ensures mandatory sections
// ===============================================================
function enforceResumeCompleteness(analysis, resumeText, structure) {
  if (!analysis || typeof analysis !== "object") return analysis;

  if (!structure.hasSummary) {
    analysis.extraInsights = analysis.extraInsights || [];
    analysis.extraInsights.push({
      title: "Missing Summary",
      status: "warning",
      details: "A professional summary was not detected.",
      tips: ["Add a concise summary that outlines your leadership scope, domain expertise, and measurable impact."]
    });
  }
  if (!structure.hasEducation) {
    analysis.extraInsights = analysis.extraInsights || [];
    analysis.extraInsights.push({
      title: "Education Section Missing",
      status: "warning",
      details: "Education section not detected.",
      tips: ["Include degrees, certifications, or relevant training programs."]
    });
  }

  return analysis;
}

// ===============================================================
//  Positive Signal Boost — identifies strong resumes & adjusts score
// ===============================================================
function applyPositiveSignalBoost(analysis, resumeText, structure) {
  const lower = resumeText.toLowerCase();
  let boost = 0;

  if (/led|managed|owned|directed/.test(lower)) boost += 3;
  if (/improved|optimized|increased|reduced/.test(lower)) boost += 3;
  if (structure.timelineGaps.length === 0) boost += 2;

  analysis.overallScore = clamp(analysis.overallScore + boost, 50, 100);
  return analysis;
}

// ===============================================================
//  JOB-SPECIFIC LANGUAGE CLEANER (improved)
// ===============================================================
function containsJobSpecificLanguage(text = "") {
  const patterns = [
    /job description/i,
    /job posting/i,
    /this role/i,
    /the role/i,
    /role requirements?/i,
    /hiring manager/i,
    /position requirements?/i,
    /align with the role/i
  ];
  return patterns.some(p => p.test(text));
}

function removeJobSpecificLanguage(text = "") {
  if (!text) return "";
  if (!containsJobSpecificLanguage(text)) return text;
  return text.replace(/job description|job posting|this role|the role|role requirements?/gi, "target opportunities");
}

// ===============================================================
//  Prestige Bias Neutralizer — improved & condensed
// ===============================================================
function neutralizePrestigeBias(text = "") {
  if (!text) return "";

  return text
    .replace(/prestigious degree|top[- ]tier school|ivy[- ]league/i,
      "professional accomplishments and measurable impact")
    .trim();
}

// ===============================================================
//  Suggestion Specificity Enhancer — adds examples
// ===============================================================
function enhanceSuggestionSpecificity(text = "") {
  if (!text) return "";
  const dataPattern = /(analytics?|data|insight)/i;
  if (dataPattern.test(text)) {
    return `${text.replace(/\.*$/, "")}. Examples: SQL, Tableau, Power BI, Python.`;
  }
  return text;
}

// ===============================================================
//  Category Sanitization — consolidates repeated logic
// ===============================================================
function sanitizeCriticalKeywords(keywords, jobSource, resumeSource) {
  let list = Array.isArray(keywords) ? keywords : [];

  list = list
    .map(k => canonicalizeKeywordPhrase(k))
    .filter(Boolean);

  // Supplement if fewer than 6
  if (list.length < 6) {
    const supplement = generateCriticalKeywords(jobSource, resumeSource);
    supplement.forEach(k => {
      if (list.length < 15 && !list.includes(k)) list.push(k);
    });
  }

  return list.slice(0, 15);
}
// ===============================================================
//  VALIDATE + FIX ANALYSIS OBJECT — ensures clean structure
// ===============================================================
function validateAndFixAnalysis(analysis, resumeText, jobDescription) {
  if (!analysis || typeof analysis !== "object") {
    return createFallbackAnalysis(resumeText, Boolean(jobDescription), jobDescription);
  }

  const fixes = [];
  const hasJob = Boolean(jobDescription && jobDescription.trim());

  // -----------------------------
  // Fix overall score
  // -----------------------------
  if (typeof analysis.overallScore !== "number") {
    analysis.overallScore = 75;
    fixes.push("overallScore missing; default set to 75");
  }

  // -----------------------------
  // Fix categories
  // -----------------------------
  if (!Array.isArray(analysis.categories)) {
    analysis.categories = [];
    fixes.push("categories missing; default empty array");
  }

  if (analysis.categories.length === 0) {
    analysis.categories = createFallbackAnalysis(resumeText, hasJob, jobDescription).categories;
    fixes.push("categories empty; fallback applied");
  } else {
    analysis.categories = analysis.categories.map(cat => {
      if (!cat || typeof cat !== "object") {
        return {
          name: "General",
          score: 72,
          status: "warning",
          feedback: "Category data missing.",
          suggestions: ["Ensure JSON matches expected schema."]
        };
      }

      const score = clampNumber(cat.score, 0, 100, 72);
      const status = deriveStatusFromScore(score);

      // Clean feedback / suggestions of job-specific phrasing
      let feedback = (cat.feedback || "").trim();
      let suggestions = Array.isArray(cat.suggestions) ? cat.suggestions : [];

      if (!hasJob) {
        feedback = removeJobSpecificLanguage(feedback);
        suggestions = suggestions.filter(s => !containsJobSpecificLanguage(s));
      }

      // Prestige bias removal
      feedback = neutralizePrestigeBias(feedback);
      suggestions = suggestions.map(s => neutralizePrestigeBias(s));

      // Suggestion specificity
      suggestions = suggestions.map(s => enhanceSuggestionSpecificity(s));

      if (!feedback) feedback = "Focus on measurable achievements and clear formatting.";
      if (suggestions.length === 0) suggestions = ["Add measurable achievements and improve phrasing."];

      return {
        name: cat.name || "General",
        status,
        score,
        feedback,
        suggestions
      };
    });
  }

  // -----------------------------
  // Fix extra insights
  // -----------------------------
  if (!Array.isArray(analysis.extraInsights)) {
    analysis.extraInsights = [];
    fixes.push("extraInsights invalid; default empty array");
  } else {
    analysis.extraInsights = analysis.extraInsights
      .filter(ins => ins && (ins.title || ins.details))
      .map(ins => {
        let details = neutralizePrestigeBias(ins.details || "");
        let tips = Array.isArray(ins.tips) ? ins.tips : [];

        if (!hasJob) {
          details = removeJobSpecificLanguage(details);
          tips = tips.filter(t => !containsJobSpecificLanguage(t));
        }

        tips = tips.map(t => enhanceSuggestionSpecificity(t));

        if (!details) details = "Focus on clarity, impact, and ATS readability.";
        if (tips.length === 0) tips = ["Lead bullets with verbs and quantify wins."];

        return {
          title: ins.title || "Insight",
          status: ["good","warning","critical"].includes(ins.status) ? ins.status : "warning",
          details,
          tips
        };
      });
  }

  // -----------------------------
  // Fix company insights
  // -----------------------------
  if (!Array.isArray(analysis.companyInsights)) {
    analysis.companyInsights = [];
    fixes.push("companyInsights invalid; default empty array");
  }

  // -----------------------------
  // Final keyword sanitation
  // -----------------------------
  analysis.criticalKeywords = sanitizeCriticalKeywords(
    analysis.criticalKeywords,
    jobDescription,
    resumeText
  );

  if (fixes.length) console.log("Validation fixes applied:", fixes);

  return analysis;
}

// Utility functions reused above
function clampNumber(value, min, max, fallback) {
  if (typeof value !== "number" || Number.isNaN(value)) return fallback;
  return Math.min(max, Math.max(min, value));
}
function deriveStatusFromScore(score) {
  if (score >= 85) return "good";
  if (score >= 70) return "warning";
  return "critical";
}

// ===============================================================
//  MAIN HANDLER — FINAL RETURN PIPELINE
// ===============================================================
export default async function handler(req, res) {
  try {
    applyCors(req, res);
  } catch (error) {
    console.log("CORS error:", error);
    return res.status(500).json({ error: "Server configuration error" });
  }

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { resumeText, jobDescription, hydrateOnly = false } = req.body || {};

    const safeResume = typeof resumeText === "string" ? resumeText : "";
    const safeJob = typeof jobDescription === "string" ? jobDescription : "";

    // -----------------------------------------------------
    // Hydrate job description
    // -----------------------------------------------------
    const {
      text: hydratedJob,
      source: jobSource,
      fetchedFrom: jobUrl,
      error: jobError
    } = await hydrateJobDescription(safeJob);

    const normalizedResume = normalizeResumeContent(safeResume);
    const normalizedJob = normalizeResumeContent(hydratedJob || "");
    const hasResolvedJob = normalizedJob && normalizedJob.trim().length > 20;

    if (hydrateOnly) {
      return res.status(200).json({
        success: Boolean(hasResolvedJob || !jobError),
        jobMatched: hasResolvedJob,
        jobDescriptionResolved: normalizedJob,
        jobDescriptionSource: jobSource,
        jobDescriptionUrl: jobUrl,
        jobDescriptionError: jobError,
        structureSignals: null,
        fallbackUsed: false,
        fallbackReason: null
      });
    }

    if (!safeResume || safeResume.trim().length < 50) {
      return res.status(400).json({ error: "Resume text must be at least 50 characters." });
    }

    // -----------------------------------------------------
    // Structure Analysis
    // -----------------------------------------------------
    const resumeStructure = deriveResumeStructureSignals(normalizedResume);

    // -----------------------------------------------------
    // AI Analysis or Fallback
    // -----------------------------------------------------
    const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
    if (!OPENAI_API_KEY) {
      return res.status(500).json({ error: "Server missing OpenAI key" });
    }

    const prompt = hasResolvedJob
      ? createJobMatchingPrompt(normalizedResume, normalizedJob)
      : createStandardPrompt(normalizedResume);

    const { analysis: rawAnalysis, fallbackUsed, fallbackReason } = await generateAnalysis(
      prompt,
      normalizedResume,
      normalizedJob,
      OPENAI_API_KEY
    );

    // -----------------------------------------------------
    // Validation, structure & ATS scoring
    // -----------------------------------------------------
    let validated = validateAndFixAnalysis(rawAnalysis, normalizedResume, normalizedJob);
    validated = enforceResumeCompleteness(validated, normalizedResume, resumeStructure);
    validated = applyPositiveSignalBoost(validated, normalizedResume, resumeStructure);

    const atsSignals = createAtsSignals(normalizedResume, normalizedJob, resumeStructure);
    validated.atsSignals = atsSignals;
    validated.atsWarnings = buildAtsWarnings(atsSignals);
    validated.structureSignals = resumeStructure;

    // -----------------------------------------------------
    // Add ATS insight card
    // -----------------------------------------------------
    const atsCard = generateAtsInsightCard(atsSignals);
    if (atsCard) {
      validated.extraInsights = validated.extraInsights || [];
      const existing = validated.extraInsights.findIndex(x => x.title === "ATS Diagnostics");
      if (existing >= 0) validated.extraInsights[existing] = atsCard;
      else validated.extraInsights.push(atsCard);
    }

    // -----------------------------------------------------
    // Add structure insight card
    // -----------------------------------------------------
    const structureCard = generateStructureInsightCard(resumeStructure);
    validated.extraInsights = validated.extraInsights || [];
    const sIdx = validated.extraInsights.findIndex(x => x.title === "Structure & Timeline");
    if (sIdx >= 0) validated.extraInsights[sIdx] = structureCard;
    else validated.extraInsights.push(structureCard);

    // -----------------------------------------------------
    // Missing bullet generator
    // -----------------------------------------------------
    const missingBullets = generateMissingBullets(normalizedResume);
    if (missingBullets.length) {
      validated.extraInsights.push({
        title: "Suggested Bullet Improvements",
        status: "warning",
        details: "Some bullets may lack strength or measurable outcomes.",
        tips: missingBullets
      });
    }

    // -----------------------------------------------------
    // FINAL: keyword list for highlighting UI
    // -----------------------------------------------------
    validated.highlightKeywords = extractHighlightKeywords(normalizedJob, normalizedResume);

    console.log("Analysis completed:", {
      fallbackUsed,
      fallbackReason,
      keywordCount: validated.criticalKeywords?.length,
      highlights: validated.highlightKeywords
    });

    // -----------------------------------------------------
    // FINAL RESPONSE
    // -----------------------------------------------------
    return res.status(200).json({
      success: true,
      analysis: validated,
      timestamp: new Date().toISOString(),
      jobMatched: hasResolvedJob,
      jobDescriptionResolved: normalizedJob,
      jobDescriptionSource: jobSource,
      jobDescriptionUrl: jobUrl,
      jobDescriptionError: jobError,
      structureSignals: resumeStructure,
      fallbackUsed,
      fallbackReason
    });

  } catch (error) {
    console.log("Resume analysis error:", error);
    return res.status(500).json({
      error: "Failed to analyze resume",
      message: error.message
    });
  }
}
