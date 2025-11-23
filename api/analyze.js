// Enhanced backend with job description matching - FIXED VERSION
const ALLOWED_ORIGINS = new Set([
  'https://www.careersolutionsfortoday.com',
  'https://careersolutionsfortoday.com',
  'http://localhost:5500',
  'http://127.0.0.1:5500'
]);

export default async function handler(req, res) {
  // Enable CORS for production domain + local dev preview
  const origin = req.headers.origin;
  if (origin && (ALLOWED_ORIGINS.has(origin) || process.env.ALLOW_ALL_ORIGINS === 'true')) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // Handle preflight requests
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  // Only allow POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { resumeText, jobDescription } = req.body;

    // Validate input
    if (!resumeText || resumeText.trim().length < 50) {
      return res.status(400).json({ 
        error: 'Resume text is required and must be at least 50 characters' 
      });
    }

    // Get API key from environment variables
    const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
    
    if (!OPENAI_API_KEY) {
      return res.status(500).json({ error: 'Server configuration error' });
    }

    // Create enhanced prompt with job description matching
    const prompt = jobDescription && jobDescription.trim().length > 20 
      ? createJobMatchingPrompt(resumeText, jobDescription)
      : createStandardPrompt(resumeText);

    console.log('🚀 Making OpenAI API call...');
    let usedFallback = false;
    let fallbackReason = null;
    const applyFallback = (reason) => {
      usedFallback = true;
      if (!fallbackReason) {
        fallbackReason = reason;
      }
      console.log(`🛡️ Using fallback analysis (${fallbackReason})`);
      return createFallbackAnalysis(resumeText, !!jobDescription, jobDescription || '');
    };

    // Call OpenAI API with improved settings
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: 'You are a professional resume analyzer. Always respond with valid JSON only, no additional text or explanations.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.2, // Lower temperature for more consistent JSON output
        max_tokens: 3000, // Increased token limit
        response_format: { type: "json_object" } // Force JSON response format
      })
    });

    if (!response.ok) {
      const errorData = await response.json();
      console.error('OpenAI API Error:', errorData);
      throw new Error(`OpenAI API Error: ${errorData.error?.message || 'Unknown error'}`);
    }

    const data = await response.json();
    const aiResponse = data.choices[0].message.content;

    console.log('🤖 Raw AI Response:', aiResponse);

    // Enhanced JSON parsing with fallback
    let analysis;
    try {
      // Try direct parsing first
      analysis = JSON.parse(aiResponse);
    } catch (parseError) {
      console.log('❌ Direct JSON parse failed, trying to extract JSON...');
      
      // Try to extract JSON from response that might have extra text
      try {
        analysis = extractJsonFromResponse(aiResponse);
      } catch (extractError) {
        console.error('❌ JSON extraction also failed');
        console.error('Original response:', aiResponse);
        console.error('Parse error:', parseError.message);
        console.error('Extract error:', extractError.message);
        
        // Return a fallback response instead of failing
        analysis = applyFallback('json_parse_failed');
      }
    }

    // Validate the structure
    if (!analysis.overallScore || !analysis.categories || !Array.isArray(analysis.categories)) {
      console.error('❌ Invalid analysis structure:', analysis);
      analysis = applyFallback('invalid_structure');
    }

    // Ensure all required fields are present
      analysis = validateAndFixAnalysis(analysis);

    // Log usage for tracking
    const clientIP = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
    console.log(`✅ Resume analysis completed for IP: ${clientIP}, Job Description: ${!!jobDescription}, Fallback: ${usedFallback ? fallbackReason : 'none'}`);

    // Return the analysis
    res.status(200).json({
      success: true,
      analysis: analysis,
      timestamp: new Date().toISOString(),
      jobMatched: !!jobDescription,
      fallbackUsed: usedFallback,
      fallbackReason: usedFallback ? fallbackReason : null
    });

  } catch (error) {
    console.error('💥 Error in resume analysis:', error);
    console.error('Error stack:', error.stack);
    
    res.status(500).json({ 
      error: 'Failed to analyze resume',
      message: error.message 
    });
  }
}

// Function to extract JSON from a response that might have extra text
function extractJsonFromResponse(responseText) {
  // Look for JSON object boundaries
  const jsonStart = responseText.indexOf('{');
  const jsonEnd = responseText.lastIndexOf('}');
  
  if (jsonStart === -1 || jsonEnd === -1 || jsonStart >= jsonEnd) {
    throw new Error('No valid JSON object found in response');
  }
  
  const jsonString = responseText.substring(jsonStart, jsonEnd + 1);
  return JSON.parse(jsonString);
}

// Function to create a fallback analysis when AI fails
function createFallbackAnalysis(resumeText, hasJobDescription, jobDescription = '') {
  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
  const safeText = typeof resumeText === 'string' ? resumeText : '';
  const safeJobText = typeof jobDescription === 'string' ? jobDescription : '';
  const wordCount = safeText.trim().split(/\s+/).filter(Boolean).length;
  const bulletCount = (safeText.match(/(^|\n)\s*(?:[-*•]|\d+\.)/g) || []).length;
  const metricMatches = (safeText.match(/\b\d{1,3}(?:[,\.]\d{3})*(?:%|\+|x)?/gi) || []).length;
  const hasEmail = /@/.test(safeText);
  const emailMatch = safeText.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  const hasPhone = /\b\d{3}[-.\s]*\d{3}[-.\s]*\d{4}\b/.test(safeText);
  const phoneMatch = safeText.match(/\b\d{3}[-.\s]*\d{3}[-.\s]*\d{4}\b/);
  const linksInResume = (safeText.match(/https?:\/\/\S+/gi) || []).length;
  const linkedInMatch = safeText.match(/https?:\/\/(?:www\.)?linkedin\.com\/[^\s]+/i);

  const lines = safeText.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  const bulletLines = lines.filter(line => /^[-*•]|^\d+\./.test(line));
  const quoteSnippet = (text) => {
    if (!text) return '';
    const cleaned = text.trim();
    if (!cleaned) return '';
    const shortened = cleaned.length > 140 ? cleaned.slice(0, 137) + '...' : cleaned;
    return '"' + shortened.replace(/"/g, "'") + '"';
  };
  const snippetLabel = (label, value, fallback) => {
    const quoted = quoteSnippet(value);
    if (quoted) {
      return label + ' ' + quoted;
    }
    return fallback || '';
  };

  const firstLine = lines[0] || '';
  const summaryLine = lines.find(line => /(summary|profile|headline)/i.test(line)) || firstLine;
  const metricLine = bulletLines.find(line => /\d/.test(line)) || lines.find(line => /\d/.test(line)) || '';
  const leadershipLine = bulletLines.find(line => /(lead|led|managed|director|stakeholder|executive)/i.test(line)) || '';
  const skillsLine = lines.find(line => /skill/i.test(line)) || '';
  const educationLine = lines.find(line => /(education|university|college|bachelor|master|mba|certification)/i.test(line)) || '';

  const jobKeywords = hasJobDescription
    ? (safeJobText.toLowerCase().match(/[a-z]{4,}/g) || []).filter(word => !['with','that','from','this','will'].includes(word))
    : [];
  const resumeKeywords = (safeText.toLowerCase().match(/[a-z]{4,}/g) || []);
  const jobKeywordSet = new Set(jobKeywords);
  const resumeKeywordSet = new Set(resumeKeywords);
  let keywordOverlap = 0;
  if (jobKeywordSet.size) {
    jobKeywordSet.forEach(word => {
      if (resumeKeywordSet.has(word)) {
        keywordOverlap += 1;
      }
    });
  }
  const overlapRatio = jobKeywordSet.size ? keywordOverlap / jobKeywordSet.size : 0;
  const keywordAnchor = hasJobDescription && jobKeywords.length
    ? lines.find(line => new RegExp(jobKeywords.slice(0, 3).join('|'), 'i').test(line)) || ''
    : '';

  const coverageScore = clamp((wordCount / 400) * 20, 0, 20);
  const metricsScore = clamp(metricMatches * 2.5, 0, 20);
  const structureScore = clamp(bulletCount * 2, 0, 20);
  const alignmentScore = hasJobDescription
    ? clamp(overlapRatio * 100, 0, 20)
    : clamp((linksInResume > 0 ? 6 : 0) + metricsScore * 0.3, 0, 20);

  const overallScore = clamp(55 + coverageScore + metricsScore + structureScore + alignmentScore, 55, 93);

  const summaryNeedsMetrics = metricMatches < 3;
  const skillsNeedGrouping = safeText.toLowerCase().includes('skills') && !safeText.toLowerCase().includes('technical skills');

  const contactExamples = [];
  if (emailMatch) contactExamples.push(snippetLabel('Email listed as', emailMatch[0]));
  if (phoneMatch) contactExamples.push(snippetLabel('Phone number captured as', phoneMatch[0]));
  if (linkedInMatch) contactExamples.push(snippetLabel('LinkedIn link detected', linkedInMatch[0]));
  if (!contactExamples.length) {
    contactExamples.push('Contact header detected but missing an explicit phone or email snippet.');
  }

  const summaryExamples = [];
  if (summaryLine) summaryExamples.push(snippetLabel('Summary line shows', summaryLine));
  if (metricLine && metricLine !== summaryLine) summaryExamples.push(snippetLabel('Nearby metric', metricLine));
  if (!summaryExamples.length) {
    summaryExamples.push('Summary paragraph present near the top of the document.');
  }

  const experienceExamples = [];
  if (metricLine) experienceExamples.push(snippetLabel('Metric bullet', metricLine));
  if (leadershipLine && leadershipLine !== metricLine) experienceExamples.push(snippetLabel('Leadership bullet', leadershipLine));
  if (!experienceExamples.length) {
    experienceExamples.push('Experience section detected but bullets lack obvious metrics.');
  }

  const skillsExamples = [];
  if (skillsLine) skillsExamples.push(snippetLabel('Skills line includes', skillsLine));
  if (linksInResume) skillsExamples.push('Detected portfolio/LinkedIn link that can host additional skill proof.');
  if (!skillsExamples.length) {
    skillsExamples.push('Skills heading present but no clear examples captured.');
  }

  const educationExamples = [];
  if (educationLine) educationExamples.push(snippetLabel('Education line references', educationLine));
  if (!educationExamples.length) {
    educationExamples.push('Education heading detected but needs specific institution details.');
  }

  const describedEmail = hasEmail ? snippetLabel('email', emailMatch ? emailMatch[0] : '', 'an email address') : '';
  const describedPhone = hasPhone ? snippetLabel('phone', phoneMatch ? phoneMatch[0] : '', 'a phone number') : '';
  const summaryLineLabel = snippetLabel('the line', summaryLine, 'the opening sentence');
  const metricLineLabel = snippetLabel('the bullet', metricLine, 'a nearby bullet');
  const leadershipLineLabel = snippetLabel('the bullet', leadershipLine, 'a leadership bullet');
  const skillsLineLabel = snippetLabel('the skills line', skillsLine, 'the skills list');
  const educationLineLabel = snippetLabel('the line', educationLine, 'the education line');
  const keywordAnchorLabel = snippetLabel('the line', keywordAnchor || summaryLine, 'a resume line');

  const categories = [
    {
      name: "Contact Information",
      score: clamp(70 + (hasEmail ? 10 : 0) + (hasPhone ? 10 : 0) + (linksInResume ? 5 : 0), 55, 95),
      scoreExplanation: hasEmail || hasPhone
        ? `Header already includes ${([describedEmail, describedPhone].filter(Boolean).join(' and ') || 'basic contact info')}, which keeps this section credible.`
        : 'Missing either a phone number or email address drags this score down.',
      positiveExamples: contactExamples,
      feedback: hasEmail && hasPhone
        ? "Both email and phone are present; ensure the LinkedIn URL uses a clean vanity link."
        : "Contact block is missing either a phone number or email address, which can reduce recruiter trust.",
      suggestions: hasEmail && hasPhone
        ? [
            linkedInMatch ? `Shorten ${snippetLabel('LinkedIn URL', linkedInMatch[0])} to a custom slug so it looks intentional.` : "Add a vanity LinkedIn or portfolio URL next to your name so it is instantly visible.",
            "Double-check that the email and phone here match the contact info inside your ATS accounts."
          ]
        : [
            hasEmail ? "Place a direct phone number under the email so recruiters do not have to search." : "Add a professional email address under your name for immediate outreach.",
            linkedInMatch ? "Move the LinkedIn link up near the missing contact detail so all channels live together." : "Include a LinkedIn or portfolio link to give context beyond the resume PDF."
          ]
    },
    {
      name: "Professional Summary",
      score: clamp(summaryNeedsMetrics ? 68 : 80 + metricsScore * 0.3, 60, 90),
      scoreExplanation: summaryNeedsMetrics
        ? `Summary currently leans on statements such as ${summaryLineLabel} but lacks numeric proof.`
        : `Opening paragraph cites wins like ${metricLineLabel} which anchors the score.`,
      positiveExamples: summaryExamples,
      feedback: summaryNeedsMetrics
        ? "Summary reads high-level but lacks measurable indicators of scope or outcomes."
        : "Opening paragraph references tangible wins; keep those metrics front-loaded for scanners.",
      suggestions: summaryNeedsMetrics
        ? [
            summaryLine ? `Add a % or $ outcome to ${summaryLineLabel} so scanners see impact instantly.` : "Add a quantified win (%, $, #) to the first three lines of the summary.",
            metricLine ? `Lift the data point from ${metricLineLabel} into the summary to prove traction.` : "Reference the industries or platforms you support in sentence two to anchor context."
          ]
        : [
            "Bold or uppercase the job title you target to reinforce focus.",
            leadershipLine ? `Mention the stakeholder cadence from ${leadershipLineLabel} in the summary to connect leadership story.` : "Add one sentence about leadership style or stakeholder mix."
          ]
    },
    {
      name: "Work Experience",
      score: clamp(overallScore + (metricsScore * 0.4), 60, 95),
      scoreExplanation: metricLine
        ? `Detected quant detail in ${metricLineLabel}, which carries this score.`
        : 'Few bullets include explicit metrics, so the score stays moderate.',
      positiveExamples: experienceExamples,
      feedback: bulletCount >= 6
        ? "Experience section shows a healthy mix of bullets; continue tying each line to an outcome."
        : "Experience section could use more structured bullets to help scanners identify wins quickly.",
      suggestions: bulletCount >= 6
        ? [
            leadershipLine ? `Reorder the bullet ${leadershipLineLabel} so it leads with partner names (e.g., CFO, COO).` : "Group bullets so the first covers scope, the second metrics, and the third change management.",
            metricLine ? `Pair ${metricLineLabel} with why it mattered (customers, risk, dollars).` : "Reference the audience or partners (e.g., CFO, field teams) in at least one bullet."
          ]
        : [
            "Target 3-4 bullets per role that each begin with an action verb.",
            "Mirror the tense of active roles (present) vs. past roles (past) so the narrative reads clean."
          ]
    },
    {
      name: "Skills Section",
      score: clamp(skillsNeedGrouping ? 70 : 82, 55, 90),
      scoreExplanation: skillsNeedGrouping
        ? 'Skills are listed but not grouped, which limits ATS scanning.'
        : `Skills line such as ${skillsLineLabel} keeps this section in good shape.`,
      positiveExamples: skillsExamples,
      feedback: skillsNeedGrouping
        ? "Skills are listed but not grouped, making it harder for ATS to cluster keywords."
        : "Skill inventory is readable—consider highlighting the most in-demand platforms first.",
      suggestions: skillsNeedGrouping
        ? [
            skillsLine ? `Split ${skillsLineLabel} into Technical, Platforms, and Leadership subheadings.` : "Break skills into Technical, Platforms, and Leadership subheadings.",
            "Mirror the exact tools named in target job postings so ATS recognizes the match."
          ]
        : [
            "Add proficiency markers (Advanced, In Progress) sparingly for critical tools.",
            "List cloud, AI, or automation capabilities near the top of the list."
          ]
    },
    {
      name: "Education",
      score: clamp(wordCount > 600 ? 78 : 85, 60, 90),
      scoreExplanation: educationLine
        ? `Education line ${educationLineLabel} which covers the basics.`
        : 'Education header appears but needs institution and credential detail.',
      positiveExamples: educationExamples,
      feedback: wordCount > 600
        ? "Education is present—consider summarizing credentials so experience keeps the spotlight."
        : "Education is concise and should stay beneath experience for senior roles.",
      suggestions: wordCount > 600
        ? [
            "Collapse older coursework unless it reinforces current focus.",
            "Include certifications or micro-credentials near Education."
          ]
        : [
            educationLine ? `Add honors or coursework underneath ${educationLineLabel} so recruiters see focus areas.` : "Add graduation honors or capstone topics if relevant.",
            "Mention ongoing education or certificates if they support current goals."
          ]
    }
  ];

  const extractFirstUrl = (text) => {
    if (!text) return '';
    const match = text.match(/https?:\/\/\S+/i);
    return match ? match[0].replace(/[)\],.]*$/, '') : '';
  };

  const jobDescriptionLink = extractFirstUrl(safeJobText);
  const resumeLink = extractFirstUrl(safeText);

  const companyInsights = [];
  if (hasJobDescription && safeJobText) {
    companyInsights.push({
      source: "jobDescription",
      insight: "Job ad keywords such as " + (jobKeywords.slice(0, 5).join(', ') || 'compliance and transformation') + " appear repeatedly, signaling core initiatives.",
      action: "Mirror those terms in your summary and skills cluster so ATS sees immediate alignment.",
      link: jobDescriptionLink
    });
    if (overlapRatio < 0.25) {
      companyInsights.push({
        source: "jobDescription",
        insight: "Less than a quarter of job-specific phrases appear in the resume body.",
        action: "Blend employer phrasing (program names, tech stacks) directly into bullets to raise match rate.",
        link: jobDescriptionLink
      });
    } else if (keywordAnchor) {
      companyInsights.push({
        source: "jobDescription",
        insight: "Resume line " + quoteSnippet(keywordAnchor) + " already reflects the employer vocabulary.",
        action: "Reuse that phrasing in the summary and skills section to reinforce the match.",
        link: jobDescriptionLink
      });
    }
  } else {
    companyInsights.push({
      source: "resume",
      insight: resumeLink ? "Resume references an external portfolio or case study link." : "Resume leans on enterprise tooling and governance cues, implying regulated experience.",
      action: resumeLink ? "Place that link next to your name so recruiters reach it without scrolling." : "Name the top internal partners or business units served to reinforce that credibility.",
      link: resumeLink
    });
  }

  const extraInsights = [
    {
      title: "ATS Readiness",
      status: overlapRatio >= 0.35 ? "good" : "warning",
      details: overlapRatio >= 0.35
        ? "Resume echoes a healthy portion of the employer's language."
        : "Many job-specific terms are missing, lowering ATS match rate.",
      tips: overlapRatio >= 0.35
        ? ["Keep repeating the employer's highest-priority technologies in multiple sections", "Export a PDF with selectable text to retain ATS parsing"]
        : ["Scan the job ad and inject missing tool names into bullets", "Ensure headers use plain text so scanners read them"]
    },
    {
      title: "Storytelling",
      status: metricMatches >= 5 ? "good" : "warning",
      details: metricMatches >= 5
        ? "Multiple quantified wins help demonstrate traction."
        : "Achievements mention responsibilities but rarely quantify impact.",
      tips: metricMatches >= 5
        ? ["Group metrics by theme (revenue, efficiency, adoption) for faster reading", "Call out stakes—budget, customers, risk—to frame each win"]
        : ["Find even directional metrics (%, #, time saved) for each flagship project", "Name the audience or partner impacted by each result"]
    }
  ];

  if (hasJobDescription) {
    const jobPositiveExamples = [];
    if (keywordAnchor) jobPositiveExamples.push(snippetLabel('Resume line mirrors JD phrasing in', keywordAnchor));
    if (jobKeywords.length) jobPositiveExamples.push(`JD phrases detected: ${jobKeywords.slice(0, 5).join(', ')}`);
    if (!jobPositiveExamples.length) {
      jobPositiveExamples.push('Resume rarely mirrors the employer vocabulary yet.');
    }

    categories.push({
      name: "Job Match & Keywords",
      score: clamp(60 + overlapRatio * 100, 55, 92),
      scoreExplanation: overlapRatio >= 0.35
        ? `Detected overlap between JD language and ${keywordAnchorLabel}.`
        : 'Only a small portion of JD keywords appear verbatim inside the resume, limiting this score.',
      positiveExamples: jobPositiveExamples,
      feedback: overlapRatio >= 0.35
        ? "Resume mirrors a good share of the job description's phrasing."
        : "Few of the employer's keywords show up verbatim, lowering match signals.",
      suggestions: overlapRatio >= 0.35
        ? [
            "Name the stakeholder groups exactly as the job ad lists them.",
            keywordAnchor ? `Reuse the phrasing from ${snippetLabel('this line', keywordAnchor)} inside the summary and skills cluster.` : "Layer employer initiatives into your summary."
          ]
        : [
            jobKeywords.length ? `Copy 5-7 unique phrases from the job ad (e.g., ${jobKeywords.slice(0, 3).join(', ')}) into relevant bullets.` : "Pull signature phrases from the job posting into the resume bullets.",
            "Rename sections so they match the employer's taxonomy (e.g., 'Product Strategy')."
          ]
    });
    extraInsights.push({
      title: "Hiring Priorities",
      status: overlapRatio >= 0.35 ? "warning" : "critical",
      details: overlapRatio >= 0.35
        ? "Employer themes are partially addressed but could be clearer."
        : "Posting stresses initiatives that never appear in the resume.",
      tips: ["Quote an initiative or OKR verbatim", "Add a bullet referencing the internal teams noted in the ad"]
    });
  } else {
    const atsPositiveExamples = [];
    if (skillsLine) atsPositiveExamples.push(snippetLabel('Skills line already lists', skillsLine));
    if (linksInResume) atsPositiveExamples.push('External link present for deeper proof points.');
    if (!atsPositiveExamples.length) {
      atsPositiveExamples.push('Keywords detected but clustering could be stronger.');
    }

    categories.push({
      name: "Keywords & ATS",
      score: clamp(65 + metricsScore + structureScore * 0.3, 55, 90),
      scoreExplanation: skillsLine
        ? `Skills entry ${skillsLineLabel} but clustering could improve ATS scanning.`
        : 'Keywords exist in the body but not in a dedicated section, lowering the score.',
      positiveExamples: atsPositiveExamples,
      feedback: "Resume can gain more search hits by clustering tools and certifications.",
      suggestions: [
        skillsLine ? `Turn ${skillsLineLabel} into two columns so ATS can parse the clusters.` : "Create a short 'Platform Highlights' list under the summary.",
        "Add certification acronyms in all caps to boost scanability."
      ]
    });
  }

  // Derive status after scores
  categories.forEach(category => {
    category.status = category.score >= 85 ? 'good' : category.score >= 70 ? 'warning' : 'critical';
  });

  return {
    overallScore: Math.round(overallScore),
    categories,
    companyInsights,
    extraInsights
  };
}

// Function to validate and fix analysis structure
function validateAndFixAnalysis(analysis) {
  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
  const fixes = [];

  const coerceScore = (value, label, hardDefault = 75) => {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return clamp(value, 0, 100);
    }
    if (typeof value === 'string') {
      const cleaned = parseFloat(value.replace(/[^0-9.-]/g, ''));
      if (Number.isFinite(cleaned)) {
        fixes.push(`Converted ${label} from string to numeric value.`);
        return clamp(cleaned, 0, 100);
      }
    }
    fixes.push(`Replaced invalid ${label} with default score.`);
    return hardDefault;
  };

  // Ensure overallScore is a number between 0-100
  analysis.overallScore = coerceScore(analysis.overallScore, 'overallScore');

  // Ensure categories is an array
  if (!Array.isArray(analysis.categories)) {
    analysis.categories = [];
    fixes.push('Missing categories array; initialized empty list.');
  }

  const resolveCategoryName = (category = {}) => {
    return category.name || category.title || category.section || category.category || category.label || category.area || category.topic || 'Resume Section';
  };

  const deriveStatusFromScore = (score) => {
    if (typeof score !== 'number') {
      return 'warning';
    }
    if (score >= 85) return 'good';
    if (score >= 70) return 'warning';
    return 'critical';
  };

  // Validate each category
  analysis.categories = analysis.categories.map((category, index) => {
    const safeScore = coerceScore(category.score, `category[${index}].score`);
    const scoreExplanation = typeof category.scoreExplanation === 'string' && category.scoreExplanation.trim().length
      ? category.scoreExplanation.trim()
      : `Score recorded at ${safeScore}/100. Add a scoreExplanation value to clarify evidence.`;
    if (!category.scoreExplanation || !category.scoreExplanation.trim()) {
      fixes.push(`Missing scoreExplanation for category[${index}] (${resolveCategoryName(category)}). Added default.`);
    }

    const positiveExamples = Array.isArray(category.positiveExamples)
      ? category.positiveExamples
          .map(example => typeof example === 'string' ? example.trim() : '')
          .filter(text => text.length > 0)
      : [];
    if (!positiveExamples.length) {
      positiveExamples.push('Add specific resume quotes in future analyses to highlight what works.');
      fixes.push(`Missing positiveExamples for category[${index}] (${resolveCategoryName(category)}). Inserted placeholder.`);
    }

    const suggestions = Array.isArray(category.suggestions) && category.suggestions.length
      ? category.suggestions
      : ["Consider improvements in this area."];

    return {
      name: resolveCategoryName(category),
      status: deriveStatusFromScore(safeScore),
      score: safeScore,
      scoreExplanation,
      positiveExamples,
      feedback: category.feedback || "Analysis completed.",
      suggestions
    };
  });

  if (!Array.isArray(analysis.companyInsights)) {
    analysis.companyInsights = [];
    fixes.push('companyInsights field missing or invalid; defaulted to empty array.');
  } else {
    analysis.companyInsights = analysis.companyInsights
      .filter(insight => {
        const text = (insight?.insight || '').trim();
        const action = (insight?.action || '').trim();
        const link = (insight?.link || insight?.url || insight?.sourceLink || '').trim();
        return text.length > 0 || action.length > 0 || link.length > 0;
      })
      .map(insight => ({
        source: insight?.source || 'resume',
        insight: (insight?.insight || '').trim(),
        action: (insight?.action || '').trim(),
        link: (insight?.link || insight?.url || insight?.sourceLink || '').trim()
      }));
  }

  if (!Array.isArray(analysis.extraInsights)) {
    analysis.extraInsights = [];
    fixes.push('extraInsights field missing or invalid; defaulted to empty array.');
  } else {
    analysis.extraInsights = analysis.extraInsights
      .filter(item => {
        const title = (item?.title || '').trim();
        const details = (item?.details || '').trim();
        const tips = Array.isArray(item?.tips) ? item.tips.filter(tip => typeof tip === 'string' && tip.trim().length > 0) : [];
        return title.length > 0 || details.length > 0 || tips.length > 0;
      })
      .map(item => ({
        title: (item?.title || '').trim(),
        status: ['good', 'warning', 'critical'].includes(item?.status) ? item.status : 'warning',
        details: (item?.details || '').trim(),
        tips: Array.isArray(item?.tips) && item.tips.length ? item.tips.filter(tip => typeof tip === 'string' && tip.trim().length > 0) : []
      }));
  }

  if (fixes.length) {
    console.log('ℹ️ Analysis validation fixes:', fixes);
  }

  return analysis;
}

function createStandardPrompt(resumeText) {
  return `Analyze this resume and provide feedback in JSON format. Deliver actionable, specific insights so the applicant clearly understands strengths, risks, missing metrics, and how the document will read to recruiters. If the resume references a company or industry, include what that implies about domain expertise or tool familiarity inside your feedback text.

Resume:
${resumeText}

Return a JSON object with this structure:
{
  "overallScore": 85,
  "categories": [
    {
      "name": "Work Experience",
      "score": 88,
      "status": "good",
      "scoreExplanation": "Score driven by bullet \"Scaled AI governance playbooks for 14 markets\" showing quantified adoption.",
      "positiveExamples": [
        "Bullet: \"Scaled AI governance playbooks for 14 markets\"",
        "Metric: \"Reduced approval cycle 32%\""
      ],
      "feedback": "Opening bullets prove scope yet leadership story trails off in later roles.",
      "suggestions": [
        "Keep the bullet that says \"Scaled AI governance...\" but add partner names to show executive exposure.",
        "Extend \"Delivered Tableau enablement\" with the adoption number so recruiters see impact."
      ]
    }
  ],
  "companyInsights": [
    {
      "source": "resume",
      "insight": "Candidate references fintech clients which implies comfort with OCC-regulated controls.",
      "action": "Lean into that compliance language in the summary and skills list.",
      "link": "https://company.com/careers/role"
    }
  ],
  "extraInsights": [
    {
      "title": "ATS Readiness",
      "status": "warning",
      "details": "Summary never names Tableau or Salesforce even though they appear later.",
      "tips": ["Mirror core platforms in the headline", "Add a keyword cluster under Skills"]
    }
  ]
}

Status options: "good" (85+), "warning" (70-84), "critical" (<70)
Every category MUST include:
- "scoreExplanation": 1-2 sentences tying the numeric score to direct evidence from the resume.
- "positiveExamples": an array of 1-3 bullet strings quoting or paraphrasing *verbatim* fragments (3-10 words) from the resume that prove what is working.
Feedback and suggestions must cite the exact sentence or bullet they reference (use short inline quotes) and describe the edit required (add metrics, rename heading, etc.).
  Before recommending that the user add or emphasize a tool, company, or keyword, search the resume text (case-insensitive) for that term. If the term already appears, treat it as a strength and reference where it lives instead of claiming it is missing.
Populate companyInsights with 1-3 takeaways derived from employer names, industries, or patterns inside the resume. When a concrete URL is mentioned, include it in the optional "link" field; omit the field entirely when no link is available. Populate extraInsights with 2-3 thematic findings (ATS readiness, storytelling, leadership narrative, etc.) using the same status keys, again tying each detail to a quoted phrase where possible.
Return only valid JSON.`;
}

function createJobMatchingPrompt(resumeText, jobDescription) {
  return `Analyze this resume against the job description and provide targeted feedback in JSON format. Highlight where the candidate aligns or diverges from the stated role. Derive a short company intelligence snapshot from the job description (industry, mission, key initiatives) and weave that context into your feedback.

Resume:
${resumeText}

Job Description:
${jobDescription}

Return a JSON object with this structure (same keys as below):
{
  "overallScore": 80,
  "categories": [
    {
      "name": "Job Match & Keywords",
      "score": 82,
      "status": "warning",
      "scoreExplanation": "Score reflects overlap between JD phrase \"AI governance controls\" and resume bullet \"Operationalized AI controls across 14 markets\".",
      "positiveExamples": [
        "Resume bullet: \"Operationalized AI controls across 14 markets\"",
        "JD phrase matched: \"AI governance controls\""
      ],
      "feedback": "JD highlights \"on-site agile rituals\" yet resume stresses remote consulting.",
      "suggestions": [
        "Revise the bullet \"Led remote consulting pods\" to add the on-site steering cadence noted in the JD.",
        "Mirror the JD term \"regulatory partner workshops\" inside the summary."
      ]
    }
  ],
  "companyInsights": [
    {
      "source": "jobDescription",
      "insight": "Role sits in CIB Innovation, so AI governance and regulatory rigor will be scrutinized.",
      "action": "Spell out model validation or policy partners in the summary.",
      "link": "https://employer.com/job123"
    }
  ],
  "extraInsights": [
    {
      "title": "Hiring Team Priorities",
      "status": "warning",
      "details": "JD stresses on-site leadership; resume emphasizes remote consulting.",
      "tips": ["Add bullets that mention in-office agile rituals", "Call out stakeholder cadence"]
    }
  ]
}

Focus on job alignment. Status: "good" (85+), "warning" (70-84), "critical" (<70)
In every category, explicitly mention the job's priorities (technologies, leadership scope, compliance needs, etc.) and whether the resume demonstrates them. Provide "scoreExplanation" and "positiveExamples" exactly as described above, quoting both the resume and the job description when relevant. Use the suggestions array to prescribe concrete edits such as "Add bullet referencing X metric" or "Insert paragraph describing Y platform", always referencing the specific sentence to change. Before recommending that the user add or emphasize a tool, company, or keyword, search both the resume and job description text (case-insensitive) for that term—if it already appears, reference it as evidence instead of labeling it missing. When you infer company knowledge (industry, regulatory focus, culture), state it in the feedback so the user learns about the employer. Populate companyInsights with 1-3 observations about the employer/industry gleaned from the job description and prescribe how to reflect that knowledge. Include the optional "link" field whenever the job description or resume excerpt provides a concrete URL for that insight (omit otherwise). Populate extraInsights with 2-3 thematic recommendations (ATS, executive presence, storytelling, leadership trajectory, etc.) and cite the resume/JD evidence inside each detail. Return only valid JSON.`;
}
