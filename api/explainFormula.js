const ALLOWED_ORIGINS = new Set([
  'https://www.careersolutionsfortoday.com',
  'https://careersolutionsfortoday.com',
  'https://stevenmkay.github.io',
  'http://localhost:5500',
  'http://127.0.0.1:5500'
]);

export default async function handler(req, res) {
  try {
    applyCors(req, res);
  } catch (err) {
    console.error('CORS configuration error (formula endpoint):', err);
    res.status(500).json({ success: false, error: 'Server configuration error' });
    return;
  }

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).json({ success: false, error: 'Method not allowed' });
    return;
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    res.status(500).json({ success: false, error: 'Server missing OpenAI credentials' });
    return;
  }

  try {
    const { formula } = req.body || {};
    if (!formula || typeof formula !== 'string' || formula.trim().length < 3) {
      res.status(400).json({ success: false, error: 'A valid formula is required.' });
      return;
    }

    const trimmedFormula = formula.trim();
    const userContent = `Explain the following Excel formula in structured steps.

Formula:
${trimmedFormula}
`;

    const requestBody = {
      model: 'gpt-4.1-mini',
      messages: [
        {
          role: 'system',
          content: 'You are an Excel tutor that explains formulas in friendly, plain English. Always return a short summary, a step-by-step breakdown, and at least one practical usage tip.'
        },
        {
          role: 'user',
          content: userContent
        }
      ],
      temperature: 0.2,
      max_tokens: 800
    };

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      const errorPayload = await response.json().catch(() => ({}));
      throw new Error(errorPayload?.error?.message || response.statusText || 'OpenAI request failed');
    }

    const data = await response.json();
    const explanation = data?.choices?.[0]?.message?.content?.trim();

    if (!explanation) {
      res.status(502).json({ success: false, error: 'No explanation returned from model.' });
      return;
    }

    res.status(200).json({ success: true, explanation });
  } catch (error) {
    console.error('Excel explainer error:', error);
    res.status(500).json({ success: false, error: error.message || 'Failed to explain formula' });
  }
}

function applyCors(req, res) {
  const origin = req.headers.origin;
  if (origin && (ALLOWED_ORIGINS.has(origin) || process.env.ALLOW_ALL_ORIGINS === 'true')) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  } else {
    res.setHeader('Access-Control-Allow-Origin', 'https://www.careersolutionsfortoday.com');
  }
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
}
