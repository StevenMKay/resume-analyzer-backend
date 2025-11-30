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

Structure your response with these sections:
1. Summary - Brief overview of what the formula does
2. Step-by-Step Breakdown - Detailed explanation of each part
3. Practical Example - How it would work with real data
4. Tips - Usage tips and best practices

Use clear formatting with headers and bullet points."""

            user_prompt = f"""Explain the following Excel formula in detail:

Formula: {formula}

Provide a comprehensive explanation that helps someone understand not just what it does, but why and how to use it effectively."""
            
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
