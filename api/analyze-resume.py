import os
import json
import re
from io import BytesIO
from http.server import BaseHTTPRequestHandler

from urllib.parse import parse_qs  # still available if you later need it
from PyPDF2 import PdfReader
from docx import Document
from openai import OpenAI

# ---------- OpenAI Client ----------

API_KEY = os.environ.get("OPENAI_API_KEY")
client = OpenAI(api_key=API_KEY) if API_KEY else None

# ---------- CORS / Domain Config ----------

ALLOWED_ORIGINS = {
    "https://www.careersolutionsfortoday.com",
    "https://careersolutionsfortoday.com",
    "https://stevenmkay.github.io",
    "http://localhost:5500",
    "http://127.0.0.1:5500",
}

def set_cors_headers(handler, origin):
    """
    Attach CORS headers. If origin isn't known, fall back to primary domain.
    """
    if origin in ALLOWED_ORIGINS:
        handler.send_header("Access-Control-Allow-Origin", origin)
    else:
        handler.send_header("Access-Control-Allow-Origin", "https://www.careersolutionsfortoday.com")

    handler.send_header("Access-Control-Allow-Methods", "POST, OPTIONS")
    handler.send_header("Access-Control-Allow-Headers", "Content-Type")


# ---------- Helpers: File Extraction ----------

def extract_text_from_pdf(file_content: bytes) -> str:
    try:
        pdf_reader = PdfReader(BytesIO(file_content))
        text = ""
        for page in pdf_reader.pages:
            page_text = page.extract_text() or ""
            text += page_text + "\n"
        return text.strip()
    except Exception as e:
        raise Exception(f"Failed to extract PDF text: {str(e)}")

def extract_text_from_docx(file_content: bytes) -> str:
    try:
        doc = Document(BytesIO(file_content))
        text = "\n".join([paragraph.text for paragraph in doc.paragraphs])
        return text.strip()
    except Exception as e:
        raise Exception(f"Failed to extract DOCX text: {str(e)}")


# ---------- Helpers: Company / Role Extraction ----------

def extract_company_name(text: str) -> str | None:
    if not text:
        return None

    patterns = [
        r"^\s*([A-Z][A-Za-z0-9\s&.'-]+?)\s+(?:is|seeks|seeking|looking for|invites|needs)",
        r"(?:at|join|About)\s+([A-Z][A-Za-z0-9\s&.'-]+?)(?:\s+is|\s+we|\s+our|,)",
        r"^\s*([A-Z][A-Za-z0-9\s&.'-]+?)\s+-\s+[A-Z]",
    ]
    disallowed = {
        "We",
        "Our",
        "The",
        "This",
        "About",
        "Join",
        "At",
        "Role",
        "Team",
        "Company",
        "Organization",
    }

    for pattern in patterns:
        match = re.search(pattern, text, re.MULTILINE)
        if match:
            company = match.group(1).strip()
            if company not in disallowed and not company.startswith("This "):
                return company

    # Fallback: look for "Company Name role"
    fallback_match = re.search(
        r"([A-Z][A-Za-z0-9&.'-]+(?:\s+[A-Z][A-Za-z0-9&.'-]+){0,3})\s+role", text
    )
    if fallback_match:
        candidate = fallback_match.group(1).strip()
        if candidate not in disallowed:
            return candidate

    return None

def extract_role_title(text: str) -> str | None:
    if not text:
        return None

    patterns = [
        (r"is\s+seeking\s+(?:an?|the)?\s*([A-Za-z0-9/&().'\-\s]+)", re.IGNORECASE),
        (r"role:\s*([A-Z][A-Za-z0-9/&().'\-\s]+)", re.IGNORECASE),
        (r"About\s+This\s+Role\s*\n\s*([A-Z][A-Za-z0-9/&().'\-\s]+)", re.IGNORECASE),
        (r"We\s+are\s+looking\s+for\s+(?:an?|the)?\s*([A-Za-z0-9/&().'\-\s]+)", re.IGNORECASE),
    ]

    for pattern, flags in patterns:
        match = re.search(pattern, text, flags)
        if match:
            role = match.group(1).strip()
            # Only keep first line and trim cruft
            role = re.split(r"[\n\r]", role)[0].strip(" .:-")
            if role and len(role.split()) <= 8:
                return role

    return None


# ---------- Helpers: OpenAI Calls (Responses API) ----------

def ensure_openai_client():
    if client is None:
        raise RuntimeError("OpenAI API key is not configured on the server.")


def fetch_company_insights(company_name: str) -> dict | None:
    if not company_name:
        return None

    ensure_openai_client()

    try:
        glassdoor_slug = company_name.replace(" ", "-")
        linkedin_slug = company_name.lower().replace(" ", "-")

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
    {{"name": "Glassdoor", "url": "https://www.glassdoor.com/Reviews/{glassdoor_slug}-Reviews-E.htm"}},
    {{"name": "LinkedIn", "url": "https://www.linkedin.com/company/{linkedin_slug}/"}},
    {{"name": "Company Careers Page", "url": "Search for official careers page"}},
    {{"name": "Blind", "url": "https://www.teamblind.com/company/{glassdoor_slug}/"}},
    {{"name": "News", "url": "Search for recent news"}}
  ],
  "sources_note": "Brief note about data recency"
}}"""

        resp = client.responses.create(
            model="gpt-4.1-mini",
            input=[
                {
                    "role": "system",
                    "content": "You are a company research assistant. Provide specific, factual information."
                },
                {"role": "user", "content": prompt},
            ],
            temperature=0.3,
            max_output_tokens=800,
            response_format={"type": "json_object"},
        )

        content = resp.output[0].content[0].text
        return json.loads(content)
    except Exception as e:
        # Fallback if OpenAI fails – still provide helpful links
        print(f"[CompanyInsights] Failed to fetch insights: {e}")
        company_slug = company_name.lower().replace(" ", "-")
        return {
            "company_name": company_name,
            "insights": [f"Research {company_name} independently for latest information."],
            "research_tips": [
                f"Check Glassdoor and LinkedIn for reviews and interview experiences at {company_name}."
            ],
            "sources": [
                {
                    "name": "Glassdoor",
                    "url": f"https://www.glassdoor.com/Reviews/{company_slug}-Reviews-E.htm",
                },
                {
                    "name": "LinkedIn",
                    "url": f"https://www.linkedin.com/company/{company_slug}/",
                },
                {
                    "name": "Blind",
                    "url": f"https://www.teamblind.com/company/{company_slug}/",
                },
            ],
            "sources_note": "OpenAI failed; please verify information independently.",
        }


def fetch_salary_and_industry_insights(company_name: str | None, role_title: str | None) -> dict | None:
    if not role_title:
        return None

    ensure_openai_client()

    try:
        target_company = company_name or "comparable employers"
        prompt = f"""Using reliable 2024-2025 compensation and labor-market data, estimate the salary range and industry outlook for the role '{role_title}' at {target_company}.

Format the answer as JSON:
{{
  "company_name": "{target_company}",
  "role_title": "{role_title}",
  "salary_range": {{"currency": "USD", "period": "annual", "low": 0, "mid": 0, "high": 0}},
  "salary_commentary": "Context on how the range was derived",
  "industry_growth_trends": ["Trend 1", "Trend 2"],
  "demand_outlook": "Summary of job-market demand and growth outlook",
  "sources": [{{"name": "Source", "url": "https://..."}}]
}}

Only provide numbers you are confident in and cite relevant public sources (Glassdoor, Levels.fyi, US BLS, etc.)."""

        resp = client.responses.create(
            model="gpt-4.1-mini",
            input=[
                {
                    "role": "system",
                    "content": "You are a compensation analyst. Provide factual salary ranges and cite sources."
                },
                {"role": "user", "content": prompt},
            ],
            temperature=0.35,
            max_output_tokens=900,
            response_format={"type": "json_object"},
        )

        content = resp.output[0].content[0].text
        return json.loads(content)
    except Exception as e:
        print(f"[SalaryInsights] Failed to fetch salary data: {e}")
        return None


def analyze_with_ai(resume_text: str, job_description: str | None = None) -> dict:
    ensure_openai_client()

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
    "recommendations": ["rec1", "rec2", "rec3"],
    "detected_company_name": "Company name inferred solely from the job description text (empty string if not found)",
    "detected_role_title": "Specific role title inferred solely from the job description text (empty string if not found)"
}

IMPORTANT: Provide MINIMUM 4 STAR stories.
If a job description is provided, carefully read ONLY that text (ignore the resume) when setting detected_company_name and detected_role_title, returning an empty string when either item cannot be found."""

    user_prompt = f"Resume:\n{resume_text}\n"
    if job_description:
        user_prompt += f"\nJob Description:\n{job_description}"

    resp = client.responses.create(
        model="gpt-4.1-mini",
        input=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ],
        temperature=0.3,
        max_output_tokens=1800,
        response_format={"type": "json_object"},
    )

    content = resp.output[0].content[0].text
    return json.loads(content)


# ---------- HTTP Handler ----------

MAX_RESUME_CHARS = 15000
MAX_JOB_DESC_CHARS = 15000

class handler(BaseHTTPRequestHandler):
    def do_OPTIONS(self):
        origin = self.headers.get("Origin")
        self.send_response(200)
        set_cors_headers(self, origin)
        self.end_headers()

    def do_POST(self):
        origin = self.headers.get("Origin")

        try:
            if client is None:
                return self._respond_json(
                    500,
                    origin,
                    {
                        "success": False,
                        "error": "Server misconfiguration: OpenAI API key is not set.",
                    },
                )

            content_type = self.headers.get("Content-Type", "")
            if "multipart/form-data" not in content_type:
                return self._respond_json(
                    400,
                    origin,
                    {
                        "success": False,
                        "error": "Expected multipart/form-data",
                    },
                )

            boundary_token = "boundary="
            if boundary_token not in content_type:
                return self._respond_json(
                    400,
                    origin,
                    {
                        "success": False,
                        "error": "Malformed multipart/form-data header (no boundary).",
                    },
                )

            boundary = content_type.split(boundary_token)[1].encode()

            content_length = int(self.headers.get("Content-Length", 0))
            body = self.rfile.read(content_length)

            parts = body.split(b"--" + boundary)

            resume_text = None
            job_description = None
            resume_file_content = None
            resume_filename = None

            for part in parts:
                part = part.strip()
                if not part or part == b"--":
                    continue

                # Separate headers and content within this part
                if b"\r\n\r\n" not in part:
                    continue

                header_block, file_data = part.split(b"\r\n\r\n", 1)
                file_data = file_data.rsplit(b"\r\n", 1)[0]  # strip final CRLF

                # Process form fields
                if b'Content-Disposition' in header_block:
                    # Resume text field
                    if b'name="resume_text"' in header_block:
                        resume_text = file_data.decode("utf-8", errors="ignore").strip()

                    # Job description field
                    elif b'name="job_description"' in header_block:
                        job_description = file_data.decode("utf-8", errors="ignore").strip()

                    # File field
                    elif b'name="file"' in header_block:
                        filename_match = re.search(b'filename="([^"]+)"', header_block)
                        if filename_match:
                            resume_filename = filename_match.group(1).decode("utf-8", errors="ignore")
                            resume_file_content = file_data

            # Determine resume content source
            resume_content = None
            if resume_file_content and resume_filename:
                lower_name = resume_filename.lower()
                if lower_name.endswith(".pdf"):
                    resume_content = extract_text_from_pdf(resume_file_content)
                elif lower_name.endswith(".docx"):
                    resume_content = extract_text_from_docx(resume_file_content)
                else:
                    return self._respond_json(
                        400,
                        origin,
                        {
                            "success": False,
                            "error": "Unsupported file format. Please upload a PDF or DOCX.",
                        },
                    )
            elif resume_text:
                resume_content = resume_text
            else:
                return self._respond_json(
                    400,
                    origin,
                    {
                        "success": False,
                        "error": "No resume provided (file or text).",
                    },
                )

            resume_content = (resume_content or "").strip()
            if len(resume_content) < 100:
                return self._respond_json(
                    400,
                    origin,
                    {
                        "success": False,
                        "error": "Resume appears too short to analyze. Please provide more detail.",
                    },
                )

            if len(resume_content) > MAX_RESUME_CHARS:
                return self._respond_json(
                    400,
                    origin,
                    {
                        "success": False,
                        "error": "Resume is too long to analyze in one request. Please trim or summarize.",
                    },
                )

            if job_description:
                job_description = job_description.strip()
                if len(job_description) > MAX_JOB_DESC_CHARS:
                    job_description = job_description[:MAX_JOB_DESC_CHARS]

            # Main AI analysis
            analysis = analyze_with_ai(resume_content, job_description)

            company_name = None
            role_title = None

            if job_description:
                company_name = extract_company_name(job_description)
                role_title = extract_role_title(job_description)

            # Use AI-detected company & role as fallback
            if isinstance(analysis, dict):
                if not company_name and analysis.get("detected_company_name"):
                    fallback_company = (analysis.get("detected_company_name") or "").strip()
                    if fallback_company:
                        company_name = fallback_company
                        print(f"[CompanyInsights] Using analyzer-detected company name: {company_name}")

                if not role_title and analysis.get("detected_role_title"):
                    fallback_role = (analysis.get("detected_role_title") or "").strip()
                    if fallback_role:
                        role_title = fallback_role
                        print(f"[SalaryInsights] Using analyzer-detected role title: {role_title}")

            # Optional: Company insights
            if job_description and company_name:
                print(f"[CompanyInsights] Extracted company name: {company_name}")
                company_insights = fetch_company_insights(company_name)
                print(f"[CompanyInsights] Insights fetched: {bool(company_insights)}")
                if company_insights and isinstance(analysis, dict):
                    analysis["company_insights"] = company_insights
            elif job_description:
                print("[CompanyInsights] No company detected in job description, skipping company insights")

            # Optional: Salary and industry insights
            if job_description:
                print(f"[SalaryInsights] Role title detected: {role_title or 'NONE'}")
                salary_insights = fetch_salary_and_industry_insights(company_name, role_title)
                print(f"[SalaryInsights] Insights fetched: {bool(salary_insights)}")
                if salary_insights and isinstance(analysis, dict):
                    analysis["salary_and_industry_insights"] = salary_insights

            # Success response
            response_data = {
                "success": True,
                "analysis": analysis,
            }
            return self._respond_json(200, origin, response_data)

        except Exception as e:
            # Log full error on server, but send a generic message to client
            print("[ResumeAnalyzer] Internal server error:", repr(e))
            return self._respond_json(
                500,
                origin,
                {
                    "success": False,
                    "error": "Internal server error while analyzing resume. Please try again.",
                },
            )

    def _respond_json(self, status_code: int, origin: str | None, payload: dict):
        self.send_response(status_code)
        set_cors_headers(self, origin)
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(json.dumps(payload).encode("utf-8"))
