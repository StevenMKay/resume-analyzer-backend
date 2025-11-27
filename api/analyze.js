// Advanced resume analyzer backend with ATS diagnostics and keyword enrichment
const ALLOWED_ORIGINS = new Set([
  'https://www.careersolutionsfortoday.com',
  'https://careersolutionsfortoday.com',
  'https://stevenmkay.github.io',
  'http://localhost:5500',
  'http://127.0.0.1:5500'
]);

const CRITICAL_KEYWORD_STOP_WORDS = new Set([
  'the','and','for','with','your','you','our','are','this','that','from','have','has','will','their','they',
  'job','description','role','responsibilities','requirements','skills','ability','work','team','per','such',
  'experience','strong','must','should','about','into','within','across','while','including','more',
  'than','who','what','where','when','which','why','how','via','using','use','can','able','need','needed',
  'preferred','plus','bonus','an','a','of','in','to','by','as','on','at','is','be','it','or','new','end'
]);

const CRITICAL_GENERIC_TERMS = new Set([
  'benefits','benefit','compensation','salary','salaries','insurance','medical','dental','vision','pto',
  'vacation','holidays','401k','retirement','paid','payment','hourly','hours','company','companies',
  'organization','organizations','corporate','corporation','enterprise','enterprises','department',
  'departments','business','businesses','employer','employers','culture','mission','values','people'
]);

const CRITICAL_SHORT_TOKENS = new Set(['ai','ml','hr','ui','ux','qa','sql','sap','api','aws','erp','crm','etl','bi','ads','pm','devops']);

const CRITICAL_KEYWORD_LIBRARY = [
  { phrase: 'Program management', hints: ['program manager', 'program management', 'manage programs'], patterns: [/management of programs?/i] },
  { phrase: 'Project management', hints: ['project management', 'project manager'], patterns: [/management of projects?/i] },
  { phrase: 'Cross-functional leadership', hints: ['cross functional', 'cross-functional', 'matrixed teams'], patterns: [/lead(?:ing|ership) cross[- ]functional/i] },
  { phrase: 'Process improvement', hints: ['process improvement', 'process optimize', 'lean', 'six sigma'], patterns: [/improvement of processes?/i] },
  { phrase: 'Operational excellence', hints: ['operational excellence', 'operational efficiency'], patterns: [/operations? excellence/i] },
  { phrase: 'Data-driven decision making', hints: ['data driven', 'data-driven', 'data informed'], patterns: [/decisions? driven by data/i] },
  { phrase: 'Success metrics & KPIs', hints: ['kpi', 'success metrics', 'performance indicators'] },
  { phrase: 'Resource planning', hints: ['resource planning', 'resource allocation'], patterns: [/allocation of resources?/i] },
  { phrase: 'Strategic initiatives', hints: ['strategic initiative', 'strategic programs', 'strategic roadmap'] },
  { phrase: 'End-to-end program delivery', hints: ['end to end', 'end-to-end'], patterns: [/delivery of programs? end to end/i] },
  { phrase: 'Healthcare operations', hints: ['healthcare operations', 'care delivery', 'clinical operations'] },
  { phrase: 'Clinical programs & pathways', hints: ['clinical program', 'care pathway', 'clinical pathways'] },
  { phrase: 'Stakeholder management', hints: ['stakeholder management', 'stakeholder alignment', 'stakeholder engagement'], patterns: [/management of stakeholders?/i, /stakeholder (?:relationships?|coordination)/i] },
  { phrase: 'Continuous improvement', hints: ['continuous improvement', 'kaizen'] },
  { phrase: 'Population health', hints: ['population health', 'at-risk populations'] },
  { phrase: 'Change management', hints: ['change management', 'organizational change'] },
  { phrase: 'Risk management', hints: ['risk management', 'mitigate risk'], patterns: [/management of risks?/i] },
  { phrase: 'Regulatory compliance', hints: ['regulatory compliance', 'regulatory standards', 'compliance controls'] },
  { phrase: 'Customer / patient experience', hints: ['customer experience', 'patient experience'], patterns: [/experience of (?:patients|customers)/i] },
  { phrase: 'Executive reporting & communications', hints: ['executive reporting', 'executive updates', 'senior leadership updates'] },
  { phrase: 'Budget ownership', hints: ['budget ownership', 'budget management'], patterns: [/management of budgets?/i] },
  { phrase: 'Vendor management', hints: ['vendor management', 'partner management', 'third-party management'] },
  { phrase: 'Automation & tooling', hints: ['automation', 'tooling strategy', 'workflow automation'] },
  { phrase: 'Roadmap planning', hints: ['roadmap planning', 'roadmap management'] }
];

const KEYWORD_SYNONYM_PATTERNS = [
  { regex: /management of stakeholders?/i, phrase: 'Stakeholder management' },
  { regex: /stakeholder (?:engagement|relationships?|coordination|buy[- ]in)/i, phrase: 'Stakeholder management' },
  { regex: /management of risks?/i, phrase: 'Risk management' },
  { regex: /management of change/i, phrase: 'Change management' },
  { regex: /management of vendors?/i, phrase: 'Vendor management' },
  { regex: /management of budgets?/i, phrase: 'Budget ownership' },
  { regex: /management of partnerships?/i, phrase: 'Partner management' },
  { regex: /care pathways?/i, phrase: 'Clinical programs & pathways' },
  { regex: /population health/i, phrase: 'Population health' },
  { regex: /patient experience/i, phrase: 'Customer / patient experience' },
  { regex: /customer experience/i, phrase: 'Customer / patient experience' },
  { regex: /regulatory (?:compliance|readiness)/i, phrase: 'Regulatory compliance' },
  { regex: /operational readiness/i, phrase: 'Operational readiness' },
  { regex: /governance (?:forums?|models?)/i, phrase: 'Governance & controls' }
];

const DEFAULT_CRITICAL_KEYWORDS = [
  'Program management',
  'Project management',
  'Cross-functional leadership',
  'Process improvement',
  'Operational excellence',
  'Operational readiness',
  'Data-driven decision making',
  'Success metrics & KPIs',
  'Stakeholder management',
  'Strategic initiatives',
  'End-to-end program delivery',
  'Resource planning',
  'Continuous improvement',
  'Risk management',
  'Change management',
  'Regulatory compliance',
  'Customer / patient experience',
  'Executive reporting & communications',
  'Population health',
  'Vendor management',
  'Budget ownership',
  'Partner management',
  'Governance & controls'
];

export default async function handler(req, res) {
  try {
    applyCors(req, res);
  } catch (err) {
    console.error('CORS configuration error:', err);
    res.status(500).json({ error: 'Server configuration error' });
    return;
  }

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    const { resumeText, jobDescription } = req.body || {};
    const safeResume = typeof resumeText === 'string' ? resumeText : '';
    const safeJob = typeof jobDescription === 'string' ? jobDescription : '';

    if (!safeResume || safeResume.trim().length < 50) {
      res.status(400).json({ error: 'Resume text is required and must be at least 50 characters' });
      return;
    }

    const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
    if (!OPENAI_API_KEY) {
      res.status(500).json({ error: 'Server configuration error' });
      return;
    }

    const prompt = safeJob && safeJob.trim().length > 20
      ? createJobMatchingPrompt(safeResume, safeJob)
      : createStandardPrompt(safeResume);

    const { analysis, fallbackUsed, fallbackReason } = await generateAnalysis(prompt, safeResume, safeJob, OPENAI_API_KEY);

    const validated = enforceResumeCompleteness(
      validateAndFixAnalysis(analysis, safeResume, safeJob),
      safeResume
    );

    const atsSignals = createAtsSignals(safeResume, safeJob);
    validated.atsSignals = atsSignals;
    validated.atsWarnings = buildAtsWarnings(atsSignals);

    const atsInsightCard = generateAtsInsightCard(atsSignals);
    if (atsInsightCard) {
      if (!Array.isArray(validated.extraInsights)) {
        validated.extraInsights = [];
      }
      const existingIndex = validated.extraInsights.findIndex(card => card.title === 'ATS Diagnostics');
      if (existingIndex >= 0) {
        validated.extraInsights[existingIndex] = atsInsightCard;
      } else {
        validated.extraInsights.push(atsInsightCard);
      }
    }

    res.status(200).json({
      success: true,
      analysis: validated,
      timestamp: new Date().toISOString(),
      jobMatched: Boolean(safeJob),
      fallbackUsed,
      fallbackReason
    });
  } catch (error) {
    console.error('Resume analysis error:', error);
    res.status(500).json({ error: 'Failed to analyze resume', message: error.message });
  }
}

function applyCors(req, res) {
  const origin = req.headers.origin;
  if (origin && (ALLOWED_ORIGINS.has(origin) || process.env.ALLOW_ALL_ORIGINS === 'true')) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  } else {
    res.setHeader('Access-Control-Allow-Origin', 'https://www.careersolutionsfortoday.com');
  }
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
}

async function generateAnalysis(prompt, resumeText, jobDescription, apiKey) {
  const requestBody = {
    model: 'gpt-4o-mini',
    messages: [
      {
        role: 'system',
        content: 'You are a professional resume analyzer. Respond with valid JSON only—no commentary.'
      },
      {
        role: 'user',
        content: prompt
      }
    ],
    temperature: 0.2,
    max_tokens: 3000,
    response_format: { type: 'json_object' }
  };

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify(requestBody)
  });

  if (!response.ok) {
    const errorData = await safeJson(response);
    throw new Error(`OpenAI API Error: ${errorData?.error?.message || response.statusText || 'Unknown error'}`);
  }

  const data = await response.json();
  const aiResponse = data.choices?.[0]?.message?.content || '';

  let analysis;
  let fallbackUsed = false;
  let fallbackReason = null;

  try {
    analysis = JSON.parse(aiResponse);
  } catch (parseError) {
    try {
      analysis = JSON.parse(extractJsonFromResponse(aiResponse));
    } catch (extractError) {
      fallbackUsed = true;
      fallbackReason = 'json_parse_failed';
      analysis = createFallbackAnalysis(resumeText, Boolean(jobDescription), jobDescription);
    }
  }

  if (!analysis || typeof analysis !== 'object') {
    fallbackUsed = true;
    fallbackReason = fallbackReason || 'invalid_analysis_structure';
    analysis = createFallbackAnalysis(resumeText, Boolean(jobDescription), jobDescription);
  }

  return { analysis, fallbackUsed, fallbackReason };
}

function safeJson(response) {
  return response.json().catch(() => null);
}

function extractJsonFromResponse(text) {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) {
    throw new Error('No JSON object found');
  }
  return text.slice(start, end + 1);
}

function createFallbackAnalysis(resumeText, hasJobDescription, jobDescription = '') {
  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
  const safeText = typeof resumeText === 'string' ? resumeText : '';
  const safeJobText = typeof jobDescription === 'string' ? jobDescription : '';
  const wordCount = safeText.trim().split(/\s+/).filter(Boolean).length;
  const bulletCount = countBulletSymbols(safeText);
  const metricMatches = (safeText.match(/\b\d{1,3}(?:[,\.]\d{3})*(?:%|\+|x)?/gi) || []).length;
  const hasEmail = /@/.test(safeText);
  const hasPhone = /\b\d{3}[-.\s]*\d{3}[-.\s]*\d{4}\b/.test(safeText);
  const linksInResume = (safeText.match(/https?:\/\/\S+/gi) || []).length;

  const coverageScore = clamp((wordCount / 400) * 20, 0, 20);
  const metricsScore = clamp(metricMatches * 2.5, 0, 20);
  const structureScore = clamp(bulletCount * 2, 0, 20);
  const alignmentScore = hasJobDescription ? clamp(compareJobKeywords(safeJobText, safeText) * 100, 0, 20) : clamp((linksInResume > 0 ? 6 : 0) + metricsScore * 0.3, 0, 20);
  const overallScore = clamp(55 + coverageScore + metricsScore + structureScore + alignmentScore, 55, 93);

  const categories = [
    makeFallbackCategory('Contact Information', hasEmail && hasPhone ? 'good' : 'warning', hasEmail && hasPhone ? 88 : 71, hasEmail && hasPhone ? 'Header contains email and phone.' : 'Contact block missing either email or phone.', [
      hasEmail ? 'Make sure the email is placed near the name.' : 'Add a professional email address near the header.',
      hasPhone ? 'Include a clean North-American phone format (###-###-####).' : 'Add a reachable phone number; recruiters expect both email and phone.'
    ].filter(Boolean)),
    makeFallbackCategory('Professional Summary', overallScore > 80 ? 'good' : 'warning', clamp(overallScore + 2, 60, 92), 'Summary detected. Ensure it highlights scale, scope, and impact.', ['Add 1-2 quantified wins in the first 3 lines.', 'Mention domain expertise or tools tied to your most recent roles.']),
    makeFallbackCategory('Work Experience', overallScore > 82 ? 'good' : 'warning', clamp(overallScore - 3, 58, 90), 'Experience section detected. Use bullet verbs plus metrics.', ['Keep bullet length under 40 words.', 'Lead with action verb + measurable outcome.']),
    makeFallbackCategory('Skills Section', 'warning', 74, 'Skills present but can be grouped into tech, tools, leadership for scanners.', [
      'Group into Technical / Tools / Leadership clusters.',
      hasJobDescription ? 'Mirror the job posting keywords.' : 'Highlight the tools, platforms, and leadership strengths that fit your target roles.'
    ]),
    makeFallbackCategory('Education', 'warning', 72, 'Education present—ensure graduation years are current.', ['Add certifications or licenses relevant to the target job.']),
  ];

  if (hasJobDescription) {
    categories.push(
      makeFallbackCategory(
        'Job Match & Keywords',
        'warning',
        70,
        'Ensure the resume echoes critical phrases from the job description and stays ATS-safe.',
        [
          'Spell out acronyms once (e.g., Key Performance Indicators (KPIs)).',
          'Repeat the job’s must-have tools or leadership themes in both summary and bullets.'
        ]
      )
    );
  } else {
    categories.push(
      makeFallbackCategory(
        'Keyword Optimization',
        'warning',
        72,
        'Prioritize high-value skills and technologies so the resume scans well even without a specific job posting.',
        [
          'Cluster related skills and move the most marketable ones to the top of the list.',
          'Use universally recognized role titles and ATS-friendly phrasing (no graphics or tables).' 
        ]
      )
    );
  }

  const extraInsights = [
    {
      title: 'Resume Completeness',
      status: overallScore > 80 ? 'good' : 'warning',
      details: hasEmail && hasPhone ? 'Contact basics detected. Continue reinforcing measurable outcomes.' : 'Add a complete contact block with phone + professional email.',
      tips: ['Keep total length near 650-750 words for mid-senior roles.', 'Use consistent bullet symbols and tense.']
    }
  ];

  return {
    overallScore,
    categories,
    companyInsights: [],
    extraInsights,
    criticalKeywords: generateCriticalKeywords(safeJobText, safeText).slice(0, 15)
  };
}

function makeFallbackCategory(name, status, score, feedback, suggestions) {
  return { name, status, score, feedback, suggestions };
}

function compareJobKeywords(jobText, resumeText) {
  const jobTokens = (jobText.toLowerCase().match(/[a-z]{4,}/g) || []).filter(token => !CRITICAL_KEYWORD_STOP_WORDS.has(token));
  const resumeTokens = new Set(resumeText.toLowerCase().match(/[a-z]{4,}/g) || []);
  if (!jobTokens.length) {
    return 0;
  }
  const uniqueJob = Array.from(new Set(jobTokens));
  let overlap = 0;
  uniqueJob.forEach(token => {
    if (resumeTokens.has(token)) {
      overlap += 1;
    }
  });
  return overlap / uniqueJob.length;
}

function validateAndFixAnalysis(analysis, resumeText, jobDescription) {
  if (!analysis || typeof analysis !== 'object') {
    return createFallbackAnalysis(resumeText, Boolean(jobDescription), jobDescription);
  }

  const fixes = [];

  if (typeof analysis.overallScore !== 'number') {
    analysis.overallScore = 78;
    fixes.push('overallScore missing; defaulted to 78.');
  }

  if (!Array.isArray(analysis.categories)) {
    analysis.categories = [];
    fixes.push('categories missing; defaulted to empty array.');
  }

  if (!analysis.categories.length) {
    analysis.categories = createFallbackAnalysis(resumeText, Boolean(jobDescription), jobDescription).categories;
    fixes.push('categories empty; fallback categories applied.');
  } else {
    analysis.categories = analysis.categories.map(category => {
      if (!category || typeof category !== 'object') {
        return makeFallbackCategory('General', 'warning', 72, 'Category data missing.', ['Ensure JSON matches schema.']);
      }

      const safeScore = clampNumber(category.score, 0, 100, 72);
      const status = deriveStatusFromScore(safeScore);
      const suggestions = Array.isArray(category.suggestions)
        ? category.suggestions.filter(item => typeof item === 'string' && item.trim().length)
        : [];

      return {
        name: category.name || 'General',
        status,
        score: safeScore,
        scoreExplanation: category.scoreExplanation || category.feedback || '',
        feedback: (category.feedback || '').trim() || 'No detailed feedback provided.',
        suggestions: suggestions.length ? suggestions : ['Provide at least two actionable suggestions for this category.']
      };
    });
  }

  if (!Array.isArray(analysis.extraInsights)) {
    analysis.extraInsights = [];
    fixes.push('extraInsights invalid; defaulted to empty array.');
  } else {
    analysis.extraInsights = analysis.extraInsights
      .filter(item => typeof item === 'object' && ((item.title || '').trim().length || (item.details || '').trim().length))
      .map(item => ({
        title: (item.title || 'Insight').trim(),
        status: ['good', 'warning', 'critical'].includes(item.status) ? item.status : 'warning',
        details: (item.details || '').trim(),
        tips: Array.isArray(item.tips) ? item.tips.filter(tip => typeof tip === 'string' && tip.trim().length) : []
      }));
  }

  if (!Array.isArray(analysis.companyInsights)) {
    analysis.companyInsights = [];
    fixes.push('companyInsights invalid; defaulted to empty array.');
  }

  analysis.criticalKeywords = sanitizeCriticalKeywords(analysis.criticalKeywords, jobDescription, resumeText);

  if (fixes.length) {
    console.log('Analysis validation fixes applied:', fixes);
  }

  return analysis;
}

function clampNumber(value, min, max, fallback = min) {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, value));
}

function deriveStatusFromScore(score) {
  if (score >= 85) return 'good';
  if (score >= 70) return 'warning';
  return 'critical';
}

function sanitizeCriticalKeywords(keywords, jobSource, resumeSource) {
  let list = Array.isArray(keywords) ? keywords : [];
  list = list
    .map(item => typeof item === 'string' ? item.trim() : '')
    .filter(item => item.length > 0);

  if (list.length < 5) {
    const supplements = generateCriticalKeywords(jobSource, resumeSource);
    supplements.forEach(keyword => {
      if (list.length < 15 && !list.includes(keyword)) {
        list.push(keyword);
      }
    });
  }

  return list.slice(0, 15);
}

function generateCriticalKeywords(jobDescription = '', resumeText = '') {
  const source = `${jobDescription || ''}\n${resumeText || ''}`;
  const lowerSource = source.toLowerCase();
  const keywords = [];

  const addKeyword = phrase => {
    const canonical = canonicalizeKeywordPhrase(phrase);
    if (canonical && !keywords.includes(canonical)) {
      keywords.push(canonical);
    }
  };

  CRITICAL_KEYWORD_LIBRARY.forEach(entry => {
    const hintMatch = (entry.hints || []).some(hint => lowerSource.includes(hint.toLowerCase()));
    const patternMatch = (entry.patterns || []).some(pattern => pattern.test(source));
    if (hintMatch || patternMatch) {
      addKeyword(entry.phrase);
    }
  });

  KEYWORD_SYNONYM_PATTERNS.forEach(mapping => {
    if (mapping.regex.test(source)) {
      addKeyword(mapping.phrase);
    }
  });

  extractKeyPhrasesFromText(jobDescription || resumeText, 25).forEach(addKeyword);
  DEFAULT_CRITICAL_KEYWORDS.forEach(addKeyword);

  return keywords.slice(0, 20);
}

function extractKeyPhrasesFromText(text = '', limit = 15) {
  if (!text || typeof text !== 'string') {
    return [];
  }

  const tokens = text.toLowerCase().match(/\b[a-z0-9+]{2,}\b/g);
  if (!tokens) {
    return [];
  }

  const processed = tokens.map(token => ({
    token,
    keep: shouldKeepCriticalToken(token)
  }));

  const counts = {};
  const addPhrase = phraseTokens => {
    const phrase = phraseTokens.join(' ');
    counts[phrase] = (counts[phrase] || 0) + 1;
  };

  for (let i = 0; i < processed.length - 1; i++) {
    const first = processed[i];
    const second = processed[i + 1];
    if (first.keep && second.keep) {
      addPhrase([first.token, second.token]);
    }
    if (i < processed.length - 2) {
      const third = processed[i + 2];
      if (first.keep && second.keep && third.keep) {
        addPhrase([first.token, second.token, third.token]);
      }
    }
  }

  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1] || b[0].length - a[0].length)
    .map(([phrase]) => canonicalizeKeywordPhrase(phrase))
    .filter(Boolean)
    .slice(0, limit);
}

function shouldKeepCriticalToken(token) {
  if (!token) {
    return false;
  }
  if (CRITICAL_KEYWORD_STOP_WORDS.has(token) || CRITICAL_GENERIC_TERMS.has(token)) {
    return false;
  }
  if (CRITICAL_SHORT_TOKENS.has(token)) {
    return true;
  }
  return token.length >= 4;
}

function canonicalizeKeywordPhrase(raw = '') {
  if (!raw) {
    return '';
  }
  const trimmed = raw.trim();
  if (!trimmed) {
    return '';
  }
  for (const mapping of KEYWORD_SYNONYM_PATTERNS) {
    if (mapping.regex.test(trimmed)) {
      return mapping.phrase;
    }
  }
  return toTitleCase(trimmed.replace(/\s+/g, ' '));
}

function toTitleCase(text = '') {
  return text.toLowerCase().replace(/\b([a-z])/g, (_, char) => char.toUpperCase());
}

function countBulletSymbols(text = '') {
  if (!text || typeof text !== 'string') {
    return 0;
  }

  const lineStartPattern = /(?:^|[\r\n\u2028\u2029])\s*(?:[-*•●◦▪▫‣]|\d+\.)/g;
  const bulletCharPattern = /[•●◦▪▫‣\u2022\u2023\u2043\u25CF\u25CB\u25A0\u25AA\u25AB\u25E6]/g;

  const lineMatches = text.match(lineStartPattern) || [];
  const inlineMatches = text.match(bulletCharPattern) || [];

  if (lineMatches.length) {
    return lineMatches.length;
  }

  return inlineMatches.length;
}

function enforceResumeCompleteness(analysis, resumeText = '') {
  const text = typeof resumeText === 'string' ? resumeText : '';
  const wordCount = text.trim().split(/\s+/).filter(Boolean).length;
  const hasEmail = /@/.test(text);
  const hasPhone = /\b\d{3}[-.\s]*\d{3}[-.\s]*\d{4}\b/.test(text);
  const hasSections = /(experience|summary|education|skills)/i.test(text);
  const bulletCount = countBulletSymbols(text);

  let penalty = 0;
  const tips = [];

  if (wordCount < 150) {
    penalty += 30;
    tips.push('Expand the resume beyond a short paragraph—target at least 400 words.');
  } else if (wordCount < 250) {
    penalty += 20;
    tips.push('Add more depth; hiring teams expect multi-section resumes.');
  }

  if (!hasEmail || !hasPhone) {
    penalty += 8;
    tips.push('Include both an email address and phone number in the header.');
  }

  if (!hasSections) {
    penalty += 10;
    tips.push('Add clear headings such as Summary, Experience, Skills, and Education.');
  }

  if (bulletCount < 3) {
    penalty += 7;
    tips.push('Use bullet points to describe achievements—paragraphs alone are hard to scan.');
  }

  if (!penalty) {
    return analysis;
  }

  analysis.overallScore = Math.max(25, analysis.overallScore - penalty);

  if (!Array.isArray(analysis.extraInsights)) {
    analysis.extraInsights = [];
  }

  analysis.extraInsights.unshift({
    title: 'Resume Completeness',
    status: penalty >= 25 ? 'critical' : 'warning',
    details: 'Detected missing fundamentals (length, contact info, standard sections, or bullet formatting).',
    tips: tips.length ? tips : ['Add standard resume sections and contact details before running another analysis.']
  });

  return analysis;
}

function createStandardPrompt(resumeText) {
  return `Analyze this resume and provide feedback in JSON format. Deliver actionable insights about strengths, risks, missing metrics, and recruiter perception. Respond with JSON only.

Resume Text:
"""
${resumeText}
"""

Return JSON with keys: overallScore (0-100), categories (array of name, status, score, feedback, suggestions[]), companyInsights (array), extraInsights (array), criticalKeywords (array of 15 phrases), and include specific ATS-related tips.`;
}

function createJobMatchingPrompt(resumeText, jobDescription) {
  return `Analyze this resume AGAINST the provided job description. Return JSON only with the same schema as before (overallScore, categories, companyInsights, extraInsights, criticalKeywords). Highlight keyword gaps, measurable wins, and ATS alignment.

Resume Text:
"""
${resumeText}
"""

Job Description:
"""
${jobDescription}
"""`;
}

function createAtsSignals(resumeText, jobDescription) {
  const rawResume = typeof resumeText === 'string' ? resumeText : '';
  const rawJob = typeof jobDescription === 'string' ? jobDescription : '';
  const safeResume = rawResume.toLowerCase();
  const safeJob = rawJob.toLowerCase();
  const hasJobDescription = rawJob.trim().length > 0;
  const signals = {
    tablesDetected: /<table|\btable\b/i.test(resumeText),
    imagesDetected: /<img|\.(png|jpg|jpeg|gif)\b/i.test(resumeText),
    columnsDetected: /column/i.test(resumeText),
    pdfIndicators: /adobe|acrobat|pdf/i.test(resumeText),
    keywordOverlap: hasJobDescription ? compareJobKeywords(safeJob, safeResume) : 0,
    metricsCount: (rawResume.match(/\b\d{1,3}(?:[,\.]\d{3})*(?:%|\+|x)?/gi) || []).length,
    bulletSymbols: countBulletSymbols(rawResume),
    uppercaseSections: (rawResume.match(/\n[A-Z\s]{6,}\n/g) || []).length,
    hasJobDescription
  };
  return signals;
}

function buildAtsWarnings(signals) {
  const warnings = [];
  if (signals.tablesDetected) warnings.push('Tables detected—ATS may skip table content.');
  if (signals.imagesDetected) warnings.push('Images/logos offer no text for ATS. Replace with plain text.');
  if (signals.columnsDetected) warnings.push('Multi-column layouts can scramble reading order.');
  if (signals.hasJobDescription && signals.keywordOverlap < 0.3) {
    warnings.push('Fewer than 30% of job keywords echoed in resume.');
  }
  if (signals.metricsCount < 3) warnings.push('Add more quantified achievements (numbers or KPIs).');
  if (signals.bulletSymbols < 4) warnings.push('Use bullet points for scannability (4+ recommended).');
  return warnings;
}

function generateAtsInsightCard(signals) {
  if (!signals) {
    return null;
  }

  const hasJob = Boolean(signals.hasJobDescription);
  const detailParts = [];
  if (hasJob) {
    detailParts.push(`Keyword overlap ${(signals.keywordOverlap * 100).toFixed(0)}%`);
  }
  detailParts.push(`metrics ${signals.metricsCount}`);
  detailParts.push(`bullets ${signals.bulletSymbols}`);

  let status;
  if (hasJob) {
    status = signals.keywordOverlap >= 0.45 ? 'good' : signals.keywordOverlap >= 0.25 ? 'warning' : 'critical';
  } else if (signals.metricsCount >= 3 && signals.bulletSymbols >= 4) {
    status = 'good';
  } else if (signals.metricsCount >= 2 || signals.bulletSymbols >= 2) {
    status = 'warning';
  } else {
    status = 'critical';
  }

  return {
    title: 'ATS Diagnostics',
    status,
    details: detailParts.join(', '),
    tips: buildAtsWarnings(signals)
  };
}

