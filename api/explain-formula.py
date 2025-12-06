import os
import json
from openai import OpenAI
from http.server import BaseHTTPRequestHandler

# Initialize OpenAI client
client = OpenAI(api_key=os.environ.get("OPENAI_API_KEY"))

# Allowed frontend origins
ALLOWED_ORIGINS = {
    "https://www.careersolutionsfortoday.com",
    "https://careersolutionsfortoday.com",
    "https://stevenmkay.github.io",
    "http://localhost:5500",
    "http://127.0.0.1:5500"
}

def set_cors_headers(handler, origin):
    """Attach proper CORS headers."""
    if origin in ALLOWED_ORIGINS:
        handler.send_header("Access-Control-Allow-Origin", origin)
    else:
        # Safe fallback
        handler.send_header("Access-Control-Allow-Origin", "https://www.careersolutionsfortoday.com")

    handler.send_header("Access-Control-Allow-Methods", "POST, OPTIONS")
    handler.send_header("Access-Control-Allow-Headers", "Content-Type")


def safe_json(response):
    """Safely parse JSON without crashing on invalid responses."""
    try:
        return response.json()
    except Exception:
        return None


class handler(BaseHTTPRequestHandler):

    def do_OPTIONS(self):
        origin = self.headers.get("Origin")
        self.send_response(200)
        set_cors_headers(self, origin)
        self.end_headers()

    def do_POST(self):
        origin = self.headers.get("Origin")

        try:
            # --- Read client request ---
            content_length = int(self.headers.get("Content-Length", 0))
            raw_body = self.rfile.read(content_length).decode("utf-8")

            try:
                data = json.loads(raw_body)
            except json.JSONDecodeError:
                return self.respond_json(400, origin, {
                    "success": False,
                    "error": "Invalid JSON in request body."
                })

            formula = data.get("formula", "").strip()

            # --- Validation ---
            if not formula or len(formula) < 3:
                return self.respond_json(400, origin, {
                    "success": False,
                    "error": "A valid Excel formula is required."
                })

            if len(formula) > 2000:
                return self.respond_json(400, origin, {
                    "success": False,
                    "error": "Formula is too long to analyze."
                })

            # Ensure formula starts with "=" but don't double-add
            if not formula.startswith("="):
                formula = "=" + formula

            # --- Build prompts ---
            system_prompt = (
                "You are an Excel tutor that explains formulas in friendly, plain English.\n"
                "Format output using:\n"
                "- Section titles followed by a colon\n"
                "- Numbered main points (1. 2. 3.)\n"
                "- Indented sub-points using exactly 3 leading spaces + '-'\n"
                "- No markdown formatting, no bold, no special symbols\n\n"
                "Indented example:\n"
                "1. First step\n"
                "   - Sub explanation\n"
                "   - More detail\n"
            )

            user_prompt = (
                f"Explain this Excel formula:\n\n{formula}\n\n"
                "Provide the following sections:\n"
                "1. What It Does\n"
                "2. How It Works (use indented sub-bullets)\n"
                "3. Example with sample data (indented sub-bullets)\n"
                "4. Tips (indented sub-bullets)\n\n"
                "NO markdown. Use only plain text with clean indentation."
            )

            # --- NEW RESPONSES API CALL ---
            openai_response = client.responses.create(
                model="gpt-4.1-mini",
                input=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt}
                ],
                temperature=0.3,
                max_output_tokens=1000
            )

            # Extract text safely
            try:
                explanation = (
                    openai_response.output[0]
                    .content[0]
                    .text
                    .strip()
                )
            except Exception:
                return self.respond_json(502, origin, {
                    "success": False,
                    "error": "OpenAI returned an unexpected response format."
                })

            # --- Return successful response ---
            return self.respond_json(200, origin, {
                "success": True,
                "explanation": explanation
            })

        except Exception as e:
            # Your server logs receive the real error
            print("SERVER ERROR:", str(e))

            # The client receives a safe message
            return self.respond_json(500, origin, {
                "success": False,
                "error": "Internal server error. Please try again later."
            })

    def respond_json(self, status, origin, payload):
        """Utility for sending JSON responses with proper CORS."""
        self.send_response(status)
        set_cors_headers(self, origin)
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(json.dumps(payload).encode())
