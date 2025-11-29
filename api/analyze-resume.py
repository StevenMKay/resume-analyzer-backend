from flask import Request, jsonify
import os
import json
import openai
import re
import httpx
from io import BytesIO
from PyPDF2 import PdfReader
from docx import Document

# Initialize OpenAI
openai.api_key = os.environ.get('OPENAI_API_KEY')

def extract_text_from_pdf(file_content: bytes) -> str:
    try:
        pdf_reader = PdfReader(BytesIO(file_content))
        text = ""
        for page in pdf_reader.pages:
            text += page.extract_text() + "\n"
        return text.strip()
    except Exception as e:
        raise Exception(f"Failed to extract PDF: {str(e)}")

def extract_text_from_docx(file_content: bytes) -> str:
    try:
        doc = Document(BytesIO(file_content))
        text = "\n".join([paragraph.text for paragraph in doc.paragraphs])
        return text.strip()
    except Exception as e:
        raise Exception(f"Failed to extract DOCX: {str(e)}")

def extract_company_name(text: str) -> str:
    if not text:
        return None
    patterns = [
        r"^([A-Z][A-Za-z0-9\s&.]+?)\s+(?:is|seeks|seeking|looking for)",
        r"(?:at|join|About)\s+([A-Z][A-Za-z0-9\s&.]+?)(?:\s+is|\s+we|\s+our|,)",
        r"([A-Z][A-Za-z0-9\s&.]+?)\s+-\s+[A-Z]",
    ]
    for pattern in patterns:
        match = re.search(pattern, text, re.MULTILINE)
        if match:
            company = match.group(1).strip()
            if company not in ['We', 'Our', 'The', 'This', 'About', 'Join', 'At']:
                return company
    return None

async def fetch_company_insights(company_name: str) -> dict:
    if not company_name:
        return None
    try:
        prompt = f"""Find and provide REAL, SPECIFIC, and RECENT information about {company_name}:

1. Company culture and values
2. Interview process insights
3. Recent company news (2024-2025)
4. What employees say about working there
5. Tips for interviewing

Format as JSON:
{{
  "company_name": "{company_name}",
  "insights": ["Specific insight 1", "Specific insight 2", "Specific insight 3"],
  "research_tips": ["Tip 1", "Tip 2"],
  "sources": [
    {{"name": "Glassdoor", "url": "https://www.glassdoor.com/Reviews/{company_name.replace(' ', '-')}-Reviews-E.htm"}},
    {{"name": "LinkedIn", "url": "https://www.linkedin.com/company/{company_name.lower().replace(' ', '-')}/"}},
    {{"name": "Company Careers Page", "url": "Search for official careers page"}},
    {{"name": "Blind", "url": "https://www.teamblind.com/company/{company_name.replace(' ', '-')}/"}},
    {{"name": "News", "url": "Search for recent news"}}
  ],
  "sources_note": "Brief note about data recency"
}}"""
        
        response = openai.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": "You are a company research assistant. Provide specific, factual information."},
                {"role": "user", "content": prompt}
            ],
            temperature=0.3,
            response_format={"type": "json_object"}
        )
        return json.loads(response.choices[0].message.content)
    except:
        company_slug = company_name.lower().replace(' ', '-')
        return {
            "company_name": company_name,
            "insights": [f"Research {company_name} independently"],
            "research_tips": [f"Check Glassdoor and LinkedIn for {company_name} reviews"],
            "sources": [
                {"name": "Glassdoor", "url": f"https://www.glassdoor.com/Reviews/{company_slug}-Reviews-E.htm"},
                {"name": "LinkedIn", "url": f"https://www.linkedin.com/company/{company_slug}/"}
            ]
        }

async def analyze_with_ai(resume_text: str, job_description: str = None) -> dict:
    system_prompt = """You are an expert resume analyst. Analyze resumes and provide actionable feedback.

Return JSON:
{
  "overall_score": 75,
  "overall_summary": "Brief summary",
  "sections": [{"name": "Experience", "status": "good", "feedback": "...", "improvements": []}],
  "strengths": [],
  "weaknesses": [],
  "ats_analysis": {"score": 80, "feedback": "...", "issues": []},
  "star_stories": [{"question": "...", "situation": "...", "task": "...", "action": "...", "result": "...", "sample_answer": "..."}],
  "missing_keywords": [],
  "recommendations": []
}

IMPORTANT: Provide MINIMUM 4 STAR stories."""

    user_prompt = f"Resume:\n{resume_text}\n"
    if job_description:
        user_prompt += f"\nJob Description:\n{job_description}"
    
    response = openai.chat.completions.create(
        model="gpt-4o-mini",
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt}
        ],
        temperature=0.3,
        response_format={"type": "json_object"}
    )
    return json.loads(response.choices[0].message.content)

def handler(request: Request):
    # CORS headers
    headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
    }
    
    if request.method == 'OPTIONS':
        return ('', 204, headers)
    
    try:
        # Get form data
        resume_text = request.form.get('resume_text')
        job_description = request.form.get('job_description')
        
        # Check for file
        resume_content = None
        if 'file' in request.files:
            file = request.files['file']
            file_content = file.read()
            filename = file.filename.lower()
            
            if filename.endswith('.pdf'):
                resume_content = extract_text_from_pdf(file_content)
            elif filename.endswith('.docx'):
                resume_content = extract_text_from_docx(file_content)
            else:
                return jsonify({'error': 'Unsupported file format'}), 400, headers
        elif resume_text:
            resume_content = resume_text
        else:
            return jsonify({'error': 'No resume provided'}), 400, headers
        
        if len(resume_content.strip()) < 100:
            return jsonify({'error': 'Resume too short'}), 400, headers
        
        # Analyze resume
        import asyncio
        analysis = asyncio.run(analyze_with_ai(resume_content, job_description))
        
        # Get company insights
        if job_description:
            company_name = extract_company_name(job_description)
            if company_name:
                company_insights = asyncio.run(fetch_company_insights(company_name))
                if company_insights:
                    analysis['company_insights'] = company_insights
        
        return jsonify({
            'success': True,
            'analysis': analysis
        }), 200, headers
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500, headers
