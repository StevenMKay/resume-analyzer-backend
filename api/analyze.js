



// Enhanced backend with job description matching
export default async function handler(req, res) {
  // Enable CORS for your domain
  res.setHeader('Access-Control-Allow-Origin', 'https://stevenmkay.github.io');
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

    // Call OpenAI API
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
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.7,
        max_tokens: 2500
      })
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(`OpenAI API Error: ${errorData.error?.message || 'Unknown error'}`);
    }

    const data = await response.json();
    const aiResponse = data.choices[0].message.content;

    // Parse and validate the AI response
    let analysis;
    try {
      analysis = JSON.parse(aiResponse);
      
      // Validate the structure
      if (!analysis.overallScore || !analysis.categories) {
        throw new Error('Invalid response structure');
      }
    } catch (parseError) {
      console.error('Failed to parse AI response:', aiResponse);
      throw new Error('Failed to parse AI analysis results');
    }

    // Log usage for tracking
    const clientIP = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
    console.log(`Resume analysis completed for IP: ${clientIP}, Job Description: ${!!jobDescription}`);

    // Return the analysis
    res.status(200).json({
      success: true,
      analysis: analysis,
      timestamp: new Date().toISOString(),
      jobMatched: !!jobDescription
    });

  } catch (error) {
    console.error('Error in resume analysis:', error);
    res.status(500).json({ 
      error: 'Failed to analyze resume',
      message: error.message 
    });
  }
}

function createStandardPrompt(resumeText) {
  return `
You are an expert resume reviewer and career coach. Analyze the following resume and provide detailed feedback in JSON format.

Resume Text:
"""
${resumeText}
"""

Please analyze the resume and return a JSON object with this exact structure:
{
  "overallScore": [number between 70-100],
  "categories": [
    {
      "name": "Contact Information",
      "status": "[good/warning/critical]",
      "score": [number 0-100],
      "feedback": "[brief assessment]",
      "suggestions": ["[specific suggestion 1]", "[suggestion 2]", ...]
    },
    {
      "name": "Professional Summary",
      "status": "[good/warning/critical]", 
      "score": [number 0-100],
      "feedback": "[brief assessment]",
      "suggestions": ["[specific suggestion 1]", "[suggestion 2]", ...]
    },
    {
      "name": "Work Experience",
      "status": "[good/warning/critical]",
      "score": [number 0-100], 
      "feedback": "[brief assessment]",
      "suggestions": ["[specific suggestion 1]", "[suggestion 2]", ...]
    },
    {
      "name": "Skills Section",
      "status": "[good/warning/critical]",
      "score": [number 0-100],
      "feedback": "[brief assessment]", 
      "suggestions": ["[specific suggestion 1]", "[suggestion 2]", ...]
    },
    {
      "name": "Education",
      "status": "[good/warning/critical]",
      "score": [number 0-100],
      "feedback": "[brief assessment]",
      "suggestions": ["[specific suggestion 1]", "[suggestion 2]", ...]
    },
    {
      "name": "Keywords & ATS",
      "status": "[good/warning/critical]",
      "score": [number 0-100],
      "feedback": "[brief assessment]",
      "suggestions": ["[specific suggestion 1]", "[suggestion 2]", ...]
    }
  ]
}

Guidelines:
- "good": 85+ score, "warning": 70-84 score, "critical": below 70
- Be specific and actionable in suggestions
- Focus on modern hiring practices and ATS optimization
- Consider industry standards and best practices
- Provide concrete examples where possible

Return only the JSON object, no other text.`;
}

function createJobMatchingPrompt(resumeText, jobDescription) {
  return `
You are an expert resume reviewer and career coach. Analyze the following resume against the specific job description and provide targeted feedback in JSON format.

Resume Text:
"""
${resumeText}
"""

Job Description:
"""
${jobDescription}
"""

Please analyze how well the resume matches the job requirements and return a JSON object with this exact structure:
{
  "overallScore": [number between 70-100],
  "categories": [
    {
      "name": "Contact Information",
      "status": "[good/warning/critical]",
      "score": [number 0-100],
      "feedback": "[brief assessment]",
      "suggestions": ["[specific suggestion 1]", "[suggestion 2]", ...]
    },
    {
      "name": "Professional Summary",
      "status": "[good/warning/critical]", 
      "score": [number 0-100],
      "feedback": "[assessment focusing on job alignment]",
      "suggestions": ["[job-specific suggestions]", "[suggestion 2]", ...]
    },
    {
      "name": "Work Experience",
      "status": "[good/warning/critical]",
      "score": [number 0-100], 
      "feedback": "[assessment of experience relevance to job]",
      "suggestions": ["[job-specific experience improvements]", "[suggestion 2]", ...]
    },
    {
      "name": "Skills Section",
      "status": "[good/warning/critical]",
      "score": [number 0-100],
      "feedback": "[assessment of skills match to job requirements]", 
      "suggestions": ["[missing job-required skills]", "[skills to emphasize]", ...]
    },
    {
      "name": "Education",
      "status": "[good/warning/critical]",
      "score": [number 0-100],
      "feedback": "[assessment of education relevance to job]",
      "suggestions": ["[education-related improvements for this job]", ...]
    },
    {
      "name": "Job Match & Keywords",
      "status": "[good/warning/critical]",
      "score": [number 0-100],
      "feedback": "[assessment of overall job match and keyword optimization]",
      "suggestions": ["[specific keywords from job description to add]", "[job-specific optimizations]", ...]
    }
  ]
}

Special Instructions for Job Matching:
- Compare resume content directly against job requirements
- Identify missing keywords from the job description
- Suggest specific skills/experiences mentioned in the job posting
- Highlight gaps between resume and job requirements
- Recommend resume adjustments to better match this specific role
- "good": 85+ score, "warning": 70-84 score, "critical": below 70
- Be very specific about what's missing for THIS job
- Mention specific requirements from the job posting in suggestions

Return only the JSON object, no other text.`;
}
