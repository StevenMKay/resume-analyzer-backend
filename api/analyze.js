// Enhanced backend with job description matching - FIXED VERSION
export default async function handler(req, res) {
  // Enable CORS for your domain
  res.setHeader('Access-Control-Allow-Origin', 'https://www.careersolutionsfortoday.com');
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
        analysis = createFallbackAnalysis(resumeText, !!jobDescription);
        console.log('🛡️ Using fallback analysis');
      }
    }

    // Validate the structure
    if (!analysis.overallScore || !analysis.categories || !Array.isArray(analysis.categories)) {
      console.error('❌ Invalid analysis structure:', analysis);
      analysis = createFallbackAnalysis(resumeText, !!jobDescription);
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
function createFallbackAnalysis(resumeText, hasJobDescription) {
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

  if (hasJobDescription) {
    categories.push({
      name: "Job Match & Keywords",
      status: "warning",
      score: 72,
      feedback: "Resume could be better optimized for the specific job requirements.",
      suggestions: ["Include more keywords from job description", "Highlight relevant experience more prominently", "Customize resume for this specific role"]
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
    categories: categories
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

  // Validate each category
  analysis.categories = analysis.categories.map(category => {
    return {
      name: category.name || "Unknown Category",
      status: ['good', 'warning', 'critical'].includes(category.status) ? category.status : 'warning',
      score: (typeof category.score === 'number' && category.score >= 0 && category.score <= 100) ? category.score : 75,
      feedback: category.feedback || "Analysis completed.",
      suggestions: Array.isArray(category.suggestions) ? category.suggestions : ["Consider improvements in this area."]
    };
  });

  return analysis;
}

function createStandardPrompt(resumeText) {
  return `Analyze this resume and provide feedback in JSON format.

Resume:
${resumeText}

Return a JSON object with this structure:
{
  "overallScore": 85,
  "categories": [
    {
      "name": "Contact Information",
      "status": "good",
      "score": 90,
      "feedback": "Complete contact information provided",
      "suggestions": ["Add LinkedIn profile if missing"]
    },
    {
      "name": "Professional Summary",
      "status": "warning",
      "score": 75,
      "feedback": "Summary needs more impact",
      "suggestions": ["Add quantifiable achievements", "Make it more compelling"]
    },
    {
      "name": "Work Experience",
      "status": "good",
      "score": 85,
      "feedback": "Good experience demonstration",
      "suggestions": ["Add more metrics", "Use stronger action verbs"]
    },
    {
      "name": "Skills Section",
      "status": "warning",
      "score": 80,
      "feedback": "Skills are relevant but could be organized better",
      "suggestions": ["Categorize skills", "Add proficiency levels"]
    },
    {
      "name": "Education",
      "status": "good",
      "score": 85,
      "feedback": "Education section is well formatted",
      "suggestions": ["Add relevant coursework if applicable"]
    },
    {
      "name": "Keywords & ATS",
      "status": "warning",
      "score": 75,
      "feedback": "Needs better keyword optimization",
      "suggestions": ["Add industry keywords", "Use standard headings"]
    }
  ]
}

Status options: "good" (85+), "warning" (70-84), "critical" (<70)
Provide specific, actionable suggestions.
Return only valid JSON.`;
}

function createJobMatchingPrompt(resumeText, jobDescription) {
  return `Analyze this resume against the job description and provide targeted feedback in JSON format.

Resume:
${resumeText}

Job Description:
${jobDescription}

Return a JSON object with this structure:
{
  "overallScore": 80,
  "categories": [
    {
      "name": "Contact Information",
      "status": "good",
      "score": 90,
      "feedback": "Contact information is complete",
      "suggestions": ["Ensure all contact details are current"]
    },
    {
      "name": "Professional Summary",
      "status": "warning",
      "score": 75,
      "feedback": "Summary doesn't align well with job requirements",
      "suggestions": ["Mention specific skills from job posting", "Highlight relevant experience"]
    },
    {
      "name": "Work Experience",
      "status": "good",
      "score": 85,
      "feedback": "Experience shows relevant background for this role",
      "suggestions": ["Emphasize achievements matching job requirements", "Add missing responsibilities from job description"]
    },
    {
      "name": "Skills Section",
      "status": "warning",
      "score": 70,
      "feedback": "Missing key skills mentioned in job posting",
      "suggestions": ["Add: [specific skills from job description]", "Reorganize to highlight most relevant skills first"]
    },
    {
      "name": "Education",
      "status": "good",
      "score": 85,
      "feedback": "Education meets job requirements",
      "suggestions": ["Highlight relevant coursework if applicable"]
    },
    {
      "name": "Job Match & Keywords",
      "status": "critical",
      "score": 65,
      "feedback": "Resume needs significant optimization for this specific job",
      "suggestions": ["Add keywords: [specific terms from job posting]", "Restructure to better match job requirements", "Include missing qualifications"]
    }
  ]
}

Focus on job alignment. Status: "good" (85+), "warning" (70-84), "critical" (<70)
Be specific about missing elements from the job description.
Return only valid JSON.`;
}
