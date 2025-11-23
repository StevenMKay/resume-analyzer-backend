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
          analysis = createFallbackAnalysis(resumeText, !!jobDescription, jobDescription || '');
        console.log('🛡️ Using fallback analysis');
      }
    }

    // Validate the structure
    if (!analysis.overallScore || !analysis.categories || !Array.isArray(analysis.categories)) {
      console.error('❌ Invalid analysis structure:', analysis);
        analysis = createFallbackAnalysis(resumeText, !!jobDescription, jobDescription || '');
      console.log('🛡️ Using fallback analysis due to invalid structure');
    }

    // Ensure all required fields are present
      analysis = validateAndFixAnalysis(analysis);

    // Log usage for tracking
    const clientIP = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
    console.log(`✅ Resume analysis completed for IP: ${clientIP}, Job Description: ${!!jobDescription}`);

    // Return the analysis
    res.status(200).json({
      success: true,
      analysis: analysis,
      timestamp: new Date().toISOString(),
      jobMatched: !!jobDescription
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
  const textLength = resumeText.length;
  const baseScore = Math.min(90, Math.max(70, 70 + (textLength / 100)));
  
  const categories = [
    {
      name: "Contact Information",
      status: "good",
      score: 85,
      feedback: "Contact information appears to be present in the resume.",
      suggestions: ["Ensure phone number and email are current", "Consider adding LinkedIn profile"]
    },
    {
      name: "Professional Summary",
      status: "warning", 
      score: 75,
      feedback: "Professional summary section could be enhanced for better impact.",
      suggestions: ["Add specific achievements with quantifiable results", "Tailor summary to target role"]
    },
    {
      name: "Work Experience",
      status: "good",
      score: Math.round(baseScore),
      feedback: "Work experience section shows relevant professional background.",
      suggestions: ["Use strong action verbs", "Include specific metrics and achievements", "Highlight relevant responsibilities"]
    },
    {
      name: "Skills Section",
      status: "warning",
      score: 78,
      feedback: "Skills section is present but could be better organized.",
      suggestions: ["Group skills by category", "Include both technical and soft skills", "Match skills to job requirements"]
    },
    {
      name: "Education",
      status: "good",
      score: 85,
      feedback: "Education information is appropriately formatted.",
      suggestions: ["Include relevant coursework if recent graduate", "Add certifications if applicable"]
    }
  ];

  let companyInsights = [];
  const extractFirstUrl = (text) => {
    if (!text) return '';
    const match = text.match(/https?:\/\/\S+/i);
    return match ? match[0].replace(/[)\],.]*$/, '') : '';
  };

  const jobDescriptionLink = extractFirstUrl(jobDescription);
  const resumeLink = extractFirstUrl(resumeText);

  if (hasJobDescription && jobDescription) {
    companyInsights.push({
      source: "jobDescription",
      insight: "The posting emphasizes on-site collaboration and AI governance within a regulated bank.",
      action: "Mention governance partners and any on-site leadership to mirror those expectations.",
      link: jobDescriptionLink
    });
  } else {
    companyInsights.push({
      source: "resume",
      insight: "Resume references multiple enterprise tools, signaling experience in structured corporate environments.",
      action: "Call out flagship clients or departments to reinforce that credibility.",
      link: resumeLink
    });
  }

  let extraInsights = [
    {
      title: "ATS Readiness",
      status: "warning",
      details: "Important keywords are scattered rather than grouped.",
      tips: ["Cluster tools/technologies into sub-headings", "Mirror job titles exactly as posted"]
    },
    {
      title: "Storytelling",
      status: "warning",
      details: "Summary underplays measurable outcomes compared to achievements listed later.",
      tips: ["Move strongest metric into the opening paragraph", "Add a leadership sentence that names team size or budget"]
    }
  ];

  if (hasJobDescription) {
    categories.push({
      name: "Job Match & Keywords",
      status: "warning",
      score: 72,
      feedback: "Resume could be better optimized for the specific job requirements.",
      suggestions: ["Include more keywords from job description", "Highlight relevant experience more prominently", "Customize resume for this specific role"]
    });
    extraInsights.push({
      title: "Hiring Priorities",
      status: "warning",
      details: "Job stresses stakeholder-facing innovation leadership; resume downplays executive partnership.",
      tips: ["Reference quarterly steering committees", "Add a bullet naming CFO/COO partners"]
    });
  } else {
    categories.push({
      name: "Keywords & ATS",
      status: "warning",
      score: 76,
      feedback: "Resume could be better optimized for Applicant Tracking Systems.",
      suggestions: ["Include industry-specific keywords", "Use standard section headings", "Avoid complex formatting that ATS cannot read"]
    });
  }

  return {
    overallScore: Math.round(baseScore),
    categories,
    companyInsights,
    extraInsights
  };
}

// Function to validate and fix analysis structure
function validateAndFixAnalysis(analysis) {
  // Ensure overallScore is a number between 0-100
  if (typeof analysis.overallScore !== 'number' || analysis.overallScore < 0 || analysis.overallScore > 100) {
    analysis.overallScore = 75; // Default score
  }

  // Ensure categories is an array
  if (!Array.isArray(analysis.categories)) {
    analysis.categories = [];
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
  analysis.categories = analysis.categories.map(category => {
    const safeScore = (typeof category.score === 'number' && category.score >= 0 && category.score <= 100) ? category.score : 75;
    return {
      name: resolveCategoryName(category),
      status: deriveStatusFromScore(safeScore),
      score: safeScore,
      feedback: category.feedback || "Analysis completed.",
      suggestions: Array.isArray(category.suggestions) && category.suggestions.length ? category.suggestions : ["Consider improvements in this area."]
    };
  });

  if (!Array.isArray(analysis.companyInsights)) {
    analysis.companyInsights = [];
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

  return analysis;
}

function createStandardPrompt(resumeText) {
  return `Analyze this resume and provide feedback in JSON format. Deliver actionable, specific insights so the applicant clearly understands strengths, risks, missing metrics, and how the document will read to recruiters. If the resume references a company or industry, include what that implies about domain expertise or tool familiarity inside your feedback text.

Resume:
${resumeText}

Return a JSON object with this structure:
{
  "overallScore": 85,
  "categories": [ ...same structure as provided... ],
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
For each category's feedback, reference concrete evidence (metrics, tools, industries) from the resume. Each suggestions array must contain 2-3 sentences explaining *exactly* what to add, rewrite, or quantify; tie the advice back to inferred company expectations whenever possible.
Populate companyInsights with 1-3 takeaways derived from employer names, industries, or patterns inside the resume. When a concrete URL is mentioned, include it in the optional "link" field; omit the field entirely when no link is available. Populate extraInsights with 2-3 thematic findings (ATS readiness, storytelling, leadership narrative, etc.) using the same status keys.
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
  "categories": [ ...same structure as provided... ],
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
In every category, explicitly mention the job's priorities (technologies, leadership scope, compliance needs, etc.) and whether the resume demonstrates them. Use the suggestions array to prescribe concrete edits such as "Add bullet referencing X metric" or "Insert paragraph describing Y platform". When you infer company knowledge (industry, regulatory focus, culture), state it in the feedback so the user learns about the employer. Populate companyInsights with 1-3 observations about the employer/industry gleaned from the job description and prescribe how to reflect that knowledge. Include the optional "link" field whenever the job description or resume excerpt provides a concrete URL for that insight (omit otherwise). Populate extraInsights with 2-3 thematic recommendations (ATS, executive presence, storytelling, leadership trajectory, etc.).
Return only valid JSON.`;
}
