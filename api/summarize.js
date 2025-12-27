import OpenAI from "openai"; // Import the OpenAI SDK for server-side use

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY }); // Create OpenAI client using server env var (secure)

export default async function handler(req, res) { // Export Vercel serverless function handler
  res.setHeader("Access-Control-Allow-Origin", "*"); // Allow requests from any origin (simple for testing)
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS"); // Allow POST calls and OPTIONS preflight
  res.setHeader("Access-Control-Allow-Headers", "Content-Type"); // Allow JSON content-type header

  if (req.method === "OPTIONS") return res.status(204).end(); // End CORS preflight quickly
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" }); // Only allow POST requests

  const { text } = req.body || {}; // Read the 'text' field from JSON body safely
  if (!text || typeof text !== "string") return res.status(400).json({ error: "Missing text" }); // Validate required input
  if (text.length > 12000) return res.status(400).json({ error: "Too much text—paste less." }); // Prevent overly large payloads

  try { // Start protected block for API call
    const response = await client.responses.create({ // Call OpenAI Responses API
      model: "gpt-4.1-mini", // Use a fast/cost-effective model for summaries
      input: [ // Provide messages array
        { // Start system message
          role: "system", // System message sets rules/format
          content: // Instructions for formatting and behavior
            "Summarize the pasted data for a general audience.\n" + // Main goal
            "Return exactly these sections:\n" + // Force predictable structure
            "1) Summary (3–6 bullets)\n" + // Section 1
            "2) Key takeaways (3 bullets)\n" + // Section 2
            "3) Context (2–4 sentences)\n" + // Section 3
            "If the input looks like a table/CSV, mention trends and outliers." // Table guidance
        }, // End system message
        { // Start user message
          role: "user", // User message contains the pasted data
          content: `Summarize and add context for this data:\n\n${text}` // Provide the pasted content to the model
        } // End user message
      ] // End input array
    }); // End API call

    return res.status(200).json({ output: response.output_text }); // Return model output to frontend
  } catch (e) { // Catch any errors
    console.error(e); // Log error to Vercel logs
    return res.status(500).json({ error: "Summarization failed." }); // Send user-friendly error
  } // End try/catch
} // End handler
