module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { resume, jobDescription } = req.body;

  if (!resume || !jobDescription) {
    return res.status(400).json({ error: 'Resume and job description are required.' });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'API key not configured.' });
  }

  const prompt = `You are an expert career coach. Analyse the resume against the job description.
Return ONLY valid JSON with no markdown or code blocks.

{
  "matchScore": 75,
  "verdict": "Your verdict here",
  "matchedSkills": ["skill1", "skill2"],
  "missingSkills": ["skill1", "skill2"],
  "roadmap": [
    {
      "skill": "Skill Name",
      "why": "Why it matters",
      "resource": "Free resource",
      "priority": "High"
    }
  ],
  "tips": ["Tip 1", "Tip 2", "Tip 3"]
}

RESUME:
${resume}

JOB DESCRIPTION:
${jobDescription}`;

  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-001:generateContent?key=${apiKey}`;
    
    const body = {
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.1,
        maxOutputTokens: 2000,
        responseMimeType: "application/json"
      }
    };

    const geminiResponse = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });

    // Get raw text first before parsing
    const rawText = await geminiResponse.text();
    console.log('Status:', geminiResponse.status);
    console.log('Raw response first 500 chars:', rawText.substring(0, 500));

    // Parse the Gemini API response envelope
    let geminiData;
    try {
      geminiData = JSON.parse(rawText);
    } catch(e) {
      return res.status(500).json({ 
        error: 'Gemini returned non-JSON: ' + rawText.substring(0, 200)
      });
    }

    if (!geminiResponse.ok) {
      return res.status(500).json({
        error: geminiData.error?.message || 'Gemini API error ' + geminiResponse.status
      });
    }

    // Get the actual content text
    let content = geminiData?.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!content) {
      return res.status(500).json({
        error: 'No content in response',
        full: JSON.stringify(geminiData).substring(0, 400)
      });
    }

    console.log('Content first 300 chars:', content.substring(0, 300));

    // Clean and parse
    content = content
      .replace(/^```json\s*/i, '')
      .replace(/^```\s*/i, '')
      .replace(/\s*```$/i, '')
      .trim();

    const start = content.indexOf('{');
    const end = content.lastIndexOf('}');

    if (start === -1 || end === -1) {
      return res.status(500).json({
        error: 'No JSON object found',
        raw: content.substring(0, 400)
      });
    }

    const result = JSON.parse(content.substring(start, end + 1));
    return res.status(200).json(result);

  } catch (err) {
    console.error('Error:', err.message);
    return res.status(500).json({ error: err.message });
  }
}
