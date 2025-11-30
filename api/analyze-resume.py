import os
import json
import openai
import re
from io import BytesIO
from http.server import BaseHTTPRequestHandler
from urllib.parse import parse_qs
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

def fetch_company_insights(company_name: str) -> dict:
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
    except Exception as e:
        company_slug = company_name.lower().replace(' ', '-')
        return {
            "company_name": company_name,
            "insights": [f"Research {company_name} independently for latest information"],
            "research_tips": [f"Check Glassdoor and LinkedIn for {company_name} reviews"],
            "sources": [
                {"name": "Glassdoor", "url": f"https://www.glassdoor.com/Reviews/{company_slug}-Reviews-E.htm"},
                {"name": "LinkedIn", "url": f"https://www.linkedin.com/company/{company_slug}/"},
                {"name": "Blind", "url": f"https://www.teamblind.com/company/{company_name}/"}
            ],
            "sources_note": "Please verify information independently"
        }

def analyze_with_ai(resume_text: str, job_description: str = None) -> dict:
    system_prompt = """You are an expert resume analyst. Analyze resumes and provide actionable feedback.

Return JSON with this exact structure:
{
  "overall_score": 75,
  "overall_summary": "Brief summary",
  "sections": [{"name": "Experience", "status": "good", "feedback": "...", "improvements": ["tip1", "tip2"]}],
  "strengths": ["strength1", "strength2", "strength3"],
  "weaknesses": ["weakness1", "weakness2", "weakness3"],
  "ats_analysis": {"score": 80, "feedback": "...", "issues": ["issue1", "issue2"]},
  "star_stories": [{"question": "...", "situation": "...", "task": "...", "action": "...", "result": "...", "sample_answer": "..."}],
  "missing_keywords": ["keyword1", "keyword2"],
  "recommendations": ["rec1", "rec2", "rec3"]
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

class handler(BaseHTTPRequestHandler):
    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', 'https://www.careersolutionsfortoday.com')
        self.send_header('Access-Control-Allow-Methods', 'POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()
        
    def do_POST(self):
        try:
            # Parse multipart form data
            content_type = self.headers.get('Content-Type', '')
            
            if 'multipart/form-data' not in content_type:
                self.send_error(400, 'Expected multipart/form-data')
                return
                
            # Get boundary
            boundary = content_type.split('boundary=')[1].encode()
            
            # Read body
            content_length = int(self.headers.get('Content-Length', 0))
            body = self.rfile.read(content_length)
            
            # Parse form data
            parts = body.split(b'--' + boundary)
            
            resume_text = None
            job_description = None
            resume_file_content = None
            resume_filename = None
            
            for part in parts:
                if b'Content-Disposition' in part:
                    # Extract field name
                    if b'name="resume_text"' in part:
                        resume_text = part.split(b'\r\n\r\n')[1].split(b'\r\n')[0].decode('utf-8')
                    elif b'name="job_description"' in part:
                        job_description = part.split(b'\r\n\r\n')[1].split(b'\r\n')[0].decode('utf-8')
                    elif b'name="file"' in part:
                        # Extract filename
                        filename_match = re.search(b'filename="([^"]+)"', part)
                        if filename_match:
                            resume_filename = filename_match.group(1).decode('utf-8')
                            resume_file_content = part.split(b'\r\n\r\n')[1].rsplit(b'\r\n', 1)[0]
            
            # Extract resume content
            resume_content = None
            if resume_file_content:
                filename = resume_filename.lower()
                if filename.endswith('.pdf'):
                    resume_content = extract_text_from_pdf(resume_file_content)
                elif filename.endswith('.docx'):
                    resume_content = extract_text_from_docx(resume_file_content)
                else:
                    self.send_error(400, 'Unsupported file format')
                    return
            elif resume_text:
                resume_content = resume_text
            else:
                self.send_error(400, 'No resume provided')
                return
            
            if len(resume_content.strip()) < 100:
                self.send_error(400, 'Resume too short')
                return
            
            # Analyze resume
            analysis = analyze_with_ai(resume_content, job_description)
            
            # Get company insights
            if job_description:
                company_name = extract_company_name(job_description)
                if company_name:
                    company_insights = fetch_company_insights(company_name)
                    if company_insights:
                        analysis['company_insights'] = company_insights
            
            # Send response
            response_data = {
                'success': True,
                'analysis': analysis
            }
            
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', 'https://www.careersolutionsfortoday.com')
            self.end_headers()
            self.wfile.write(json.dumps(response_data).encode())
            
        except Exception as e:
            self.send_response(500)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', 'https://www.careersolutionsfortoday.com')
            self.end_headers()
            error_response = {'error': str(e)}
            self.wfile.write(json.dumps(error_response).encode())
