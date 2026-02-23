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
Return ONLY valid JSON, no markdown, no explanation, just JSON.

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
    const geminiResponse = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.1,
            maxOutputTokens: 2000
          }
        })
      }
    );

    const geminiData = await geminiResponse.json();

    if (!geminiResponse.ok) {
      return res.status(500).json({
        error: geminiData.error?.message || 'Gemini API error'
      });
    }

    // Log full structure to see what we're getting
    console.log('Gemini full response:', JSON.stringify(geminiData).substring(0, 1000));

    const candidate = geminiData?.candidates?.[0];
    if (!candidate) {
      return res.status(500).json({
        error: 'No candidate returned',
        fullResponse: JSON.stringify(geminiData).substring(0, 500)
      });
    }

    const part = candidate?.content?.parts?.[0];
    if (!part) {
      return res.status(500).json({
        error: 'No parts in candidate',
        candidate: JSON.stringify(candidate).substring(0, 500)
      });
    }

    let content = part.text.trim();
    console.log('Raw content:', content.substring(0, 500));

    // Aggressively clean
    content = content
      .replace(/^```json\s*/i, '')
      .replace(/^```\s*/i, '')
      .replace(/\s*```$/i, '')
      .trim();

    try {
      const result = JSON.parse(content);
      return res.status(200).json(result);
    } catch (e) {
      // Extract JSON between first { and last }
      const start = content.indexOf('{');
      const end = content.lastIndexOf('}');
      if (start !== -1 && end !== -1) {
        try {
          const result = JSON.parse(content.substring(start, end + 1));
          return res.status(200).json(result);
        } catch(e2) {
          return res.status(500).json({
            error: 'JSON parse failed',
            rawContent: content.substring(0, 800)
          });
        }
      }
      return res.status(500).json({
        error: 'No JSON found',
        rawContent: content.substring(0, 800)
      });
    }

  } catch (err) {
    console.error('Handler error:', err);
    return res.status(500).json({ error: err.message });
  }
}
