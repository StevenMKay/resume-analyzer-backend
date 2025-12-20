// SORA Storyboard Prompt Generator API
// Uses OpenAI to generate randomized travel video storyboards

const ALLOWED_ORIGINS = new Set([
  'https://www.careersolutionsfortoday.com',
  'https://careersolutionsfortoday.com',
  'https://stevenmkay.github.io',
  'http://localhost:5500',
  'http://127.0.0.1:5500'
]);

// Fixed host anchor - NEVER changes
const HOST_ANCHOR = `The subject is the same recurring woman in every video: a realistic but slightly stylized young woman in her late 20s, with soft symmetrical facial features, calm expressive eyes, natural makeup, and a warm, approachable presence. She has long dark brown hair worn loose with subtle movement in the wind. Her face shape, proportions, and overall appearance remain perfectly consistent across all scenes and episodes. She appears intelligent, grounded, and authentic — not a model, not exaggerated. She NEVER looks at the camera — she is always filmed candidly from behind, from the side, or at a distance as if a travel companion is documenting her journey without her posing. Her movements are natural and unscripted — walking, exploring, pausing to take in views, touching surfaces, looking out at landscapes. She is unaware of being filmed or simply comfortable ignoring the camera.`;

// Audio and visual style - NEVER changes
const AUDIO_STYLE = `Soft ambient cinematic music throughout, calm and inspirational, minimal instrumentation, slow build, no vocals. 

VOICEOVER: The same woman's voice in every video — recorded at home after returning from her trip. Her voice is soft, slightly breathy, with a gentle rasp that feels lived-in. She speaks slowly, with natural pauses between thoughts, as if the memories are coming back to her in real-time. Slight smile in her voice. American accent, late 20s, educated but not pretentious. She sounds like she's curled up on a couch with a warm drink, sharing something meaningful with someone she trusts. Never rushed, never performative, never "presenter voice." Intimate, like an audio diary or a late-night conversation.`;
const VISUAL_STYLE = `Realistic but slightly stylized visuals to avoid uncanny valley. Natural colors, soft contrast, subtle film grain. Documentary-style cinematography as if filmed by a travel companion. NO on-camera dialogue, NO lip-sync, NO direct eye contact with camera, NO text overlays. The woman never acknowledges the camera — she is simply living the moment while being observed.`;

export default async function handler(req, res) {
  try {
    applyCors(req, res);
  } catch (err) {
    console.error('CORS configuration error:', err);
    res.status(500).json({ error: 'Server configuration error' });
    return;
  }

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    const { theme, customLocation } = req.body || {};
    
    const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
    if (!OPENAI_API_KEY) {
      res.status(500).json({ error: 'Server configuration error - API key missing' });
      return;
    }

    // Generate randomized but educational content using OpenAI
    const storyboardContent = await generateStoryboardContent(theme, customLocation, OPENAI_API_KEY);
    
    // Build the complete SORA prompt
    const soraPrompt = buildSoraPrompt(storyboardContent);
    
    // Build JSON output for Zapier/webhook compatibility
    const webhookPayload = {
      success: true,
      timestamp: new Date().toISOString(),
      location: storyboardContent.location,
      fact1: storyboardContent.fact1,
      fact2: storyboardContent.fact2,
      timeOfDay: storyboardContent.timeOfDay,
      weather: storyboardContent.weather,
      voiceoverLines: storyboardContent.voiceoverLines,
      soraPrompt: soraPrompt,
      estimatedDuration: '12-15 seconds'
    };

    res.status(200).json(webhookPayload);
  } catch (error) {
    console.error('SORA storyboard generation error:', error);
    res.status(500).json({ error: 'Failed to generate storyboard', message: error.message });
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

async function generateStoryboardContent(theme, customLocation, apiKey) {
  const themePrompt = theme ? `Focus on ${theme} themed locations.` : '';
  const locationHint = customLocation ? `Consider using or be inspired by: ${customLocation}.` : '';
  
  const prompt = `You are a travel documentary content creator. Generate content for a 12-15 second YouTube short video about a unique, real-world location.

${themePrompt}
${locationHint}

Provide a JSON response with these exact fields:
{
  "location": "[Specific real location name - be precise, e.g., 'Iceland's Reynisfjara Black Sand Beach' or 'Japan's Arashiyama Bamboo Grove']",
  "fact1": "[What makes this place visually/geologically unique - keep under 15 words]",
  "fact2": "[Why it exists or what created it - educational, under 15 words]",
  "timeOfDay": "[golden hour/blue hour/midday/dawn/dusk - pick one that suits the location]",
  "weather": "[specific atmospheric condition - e.g., 'soft overcast with gentle mist', 'clear with wispy clouds', 'light fog rolling in']",
  "voiceoverLines": {
    "line1": "This is [location short name].",
    "line2": "It's one of the most [adjective] places on Earth.",
    "line3": "What you're seeing here is [fact1 rephrased naturally].",
    "line4": "It exists because [fact2 rephrased naturally].",
    "line5": "Places like this change how you think."
  },
  "hostClothing": "[appropriate travel outfit for this specific location and weather - e.g., 'warm earth-toned sweater and windbreaker' or 'light linen shirt and hiking pants']",
  "environmentDetails": "[2-3 specific visual details that make this location recognizable]"
}

Make the content:
- Educational and factually accurate
- Inspiring and slightly poetic
- Specific to real geography/history
- Varied in location type (mix of beaches, mountains, forests, deserts, etc.)

JSON only, no markdown.`;

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: 'You are a travel content expert. Return valid JSON only.' },
        { role: 'user', content: prompt }
      ],
      temperature: 0.9,
      max_tokens: 800,
      response_format: { type: 'json_object' }
    })
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => null);
    throw new Error(`OpenAI API Error: ${errorData?.error?.message || response.statusText}`);
  }

  const data = await response.json();
  const content = JSON.parse(data.choices[0].message.content);
  
  return content;
}

function buildSoraPrompt(content) {
  const {
    location,
    fact1,
    fact2,
    timeOfDay,
    weather,
    voiceoverLines,
    hostClothing,
    environmentDetails
  } = content;

  // Build the host description with location-appropriate clothing
  const hostDescription = HOST_ANCHOR + ` She wears ${hostClothing || 'practical, stylish travel clothing appropriate to the environment'}.`;

  return `🎬 SORA STORYBOARD — TRAVEL SHORT (MAX 15 seconds)

═══════════════════════════════════════════════════════════
🔑 CHARACTER ANCHOR (SAME WOMAN IN EVERY VIDEO)
═══════════════════════════════════════════════════════════
${hostDescription}

═══════════════════════════════════════════════════════════
🎙 VOICEOVER STYLE (HER VOICE — SAME IN EVERY VIDEO)
═══════════════════════════════════════════════════════════
Recorded at home, not on location. Her voice is soft, slightly breathy, with a gentle rasp that feels lived-in. She speaks slowly with natural pauses — as if the memories are coming back to her in real-time. There's a slight smile in her voice. American accent, late 20s, educated but warm. She sounds like she's curled up on a couch, sharing something meaningful with someone she trusts. Never rushed. Never "presenter voice." Intimate, like an audio diary or a late-night conversation with a close friend.

═══════════════════════════════════════════════════════════
🟦 SHOT 1 — ESTABLISHING (2s)
═══════════════════════════════════════════════════════════
Purpose: Instantly communicate where we are and stop the scroll.

Wide cinematic establishing shot of ${location}. ${timeOfDay} lighting with ${weather}. ${environmentDetails || 'The environment is immediately recognizable through natural landmarks and atmosphere.'} Subtle environmental motion. No people visible yet.

🎙 Voiceover (Line 1):
"${voiceoverLines.line1}"

═══════════════════════════════════════════════════════════
🟦 SHOT 2 — SHE APPEARS IN THE LANDSCAPE (3s)
═══════════════════════════════════════════════════════════
Purpose: Introduce the recurring woman + human scale.

FILMED FROM BEHIND OR SIDE: The woman walks naturally into the landscape of ${location}. She does NOT look at the camera — she is simply exploring, filmed candidly by an unseen travel companion. Wind subtly moves her hair and clothing. She might pause to look at something in the distance.

🎙 Voiceover (Line 2):
"${voiceoverLines.line2}"

═══════════════════════════════════════════════════════════
🟦 SHOT 3 — DISCOVERY MOMENT (4s)
═══════════════════════════════════════════════════════════
Purpose: Deliver value (education) through her experience.

FILMED FROM BEHIND OR SIDE: Medium shot of the woman near a defining feature of ${location}. She reaches out to touch a surface, crouches to examine something, or simply stands taking it in. She is unaware of or ignoring the camera — lost in the moment. Camera movement is smooth, observational, documentary-style.

🎙 Voiceover (Line 3):
"${voiceoverLines.line3}"

═══════════════════════════════════════════════════════════
🟦 SHOT 4 — CONTEMPLATION (3s)
═══════════════════════════════════════════════════════════
Purpose: Emotional hook (why this place matters).

FILMED FROM BEHIND: The woman stands still, looking out at the vast landscape. We see her from behind or at an angle — her silhouette against ${location}. She is simply present, breathing it in. The moment feels private and unposed.

🎙 Voiceover (Line 4):
"${voiceoverLines.line4}"

═══════════════════════════════════════════════════════════
🟦 SHOT 5 — WALKING AWAY / LOOP SHOT (3s)
═══════════════════════════════════════════════════════════
Purpose: Retention + seamless loop.

FILMED FROM BEHIND: Wide shot similar to Shot 1, but now with the woman walking slowly into the landscape, away from camera. Her figure becomes smaller against the vast environment. This mirrors Shot 1 for seamless looping.

🎙 Voiceover (Line 5):
"${voiceoverLines.line5}"

═══════════════════════════════════════════════════════════
🎼 AUDIO (GLOBAL)
═══════════════════════════════════════════════════════════
${AUDIO_STYLE}

═══════════════════════════════════════════════════════════
🎥 VISUAL STYLE (GLOBAL)
═══════════════════════════════════════════════════════════
${VISUAL_STYLE}

═══════════════════════════════════════════════════════════
📋 VARIABLES USED
═══════════════════════════════════════════════════════════
• Location: ${location}
• Fact 1: ${fact1}
• Fact 2: ${fact2}
• Time of Day: ${timeOfDay}
• Weather: ${weather}`;
}
