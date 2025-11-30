import os
import json
import openai
from http.server import BaseHTTPRequestHandler

# Initialize OpenAI
openai.api_key = os.environ.get('OPENAI_API_KEY')

class handler(BaseHTTPRequestHandler):
    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', 'https://www.careersolutionsfortoday.com')
        self.send_header('Access-Control-Allow-Methods', 'POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()

    def do_POST(self):
        try:
            # Read request body
            content_length = int(self.headers.get('Content-Length', 0))
            body = self.rfile.read(content_length)
            data = json.loads(body.decode('utf-8'))

            # Get formula
            formula = data.get('formula', '').strip()

            if not formula or len(formula) < 3:
                self.send_error(400, 'A valid formula is required')
                return

            # Create prompt for OpenAI
            system_prompt = """You are an Excel tutor that explains formulas in friendly, plain English.

Structure your response in clear sections with proper indentation for readability:
- Start each section with a clear title followed by a colon
- Use numbered lists (1. 2. 3.) for main points
- Use indented sub-bullets (   - ) with 3 spaces for details under numbered items
- Use regular bullet points (-) for standalone lists
- Write in short, clear paragraphs
- Do NOT use markdown formatting (no **, ###, or ___)
- Keep it conversational and easy to understand

IMPORTANT FORMATTING:
When explaining steps under numbered items, indent sub-bullets like this:
1. First main point
   - Sub-detail about first point
   - Another sub-detail
2. Second main point
   - Sub-detail about second point

Organize your response into these sections:
1. What It Does - Brief overview
2. How It Works - Step-by-step breakdown of each part (use indented sub-bullets for each component)
3. Example - Real-world example with sample data (use indented sub-bullets for steps)
4. Tips - Best practices and common uses (use indented sub-bullets for each tip detail)"""

            user_prompt = f"""Explain this Excel formula in simple, clear language:

{formula}

Please explain:
1. What the formula does (1-2 sentences)
2. How each part works (break it down step by step with indented sub-bullets)
3. A practical example with sample data (show steps with indented sub-bullets)
4. Helpful tips for using it (use indented sub-bullets for details)

Use simple formatting with proper indentation - no bold, no markdown symbols. Just clear text with numbered lists and indented sub-bullets (   - with 3 spaces)."""

            # Call OpenAI
            response = openai.chat.completions.create(
                model="gpt-4o-mini",
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt}
                ],
                temperature=0.3,
                max_tokens=1000
            )

            explanation = response.choices[0].message.content.strip()

            # Send response
            response_data = {
                'success': True,
                'explanation': explanation
            }

            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', 'https://www.careersolutionsfortoday.com')
            self.end_headers()
            self.wfile.write(json.dumps(response_data).encode())

        except json.JSONDecodeError:
            self.send_response(400)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', 'https://www.careersolutionsfortoday.com')
            self.end_headers()
            error_response = {'success': False, 'error': 'Invalid JSON'}
            self.wfile.write(json.dumps(error_response).encode())

        except Exception as e:
            self.send_response(500)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', 'https://www.careersolutionsfortoday.com')
            self.end_headers()
            error_response = {'success': False, 'error': str(e)}
            self.wfile.write(json.dumps(error_response).encode())
