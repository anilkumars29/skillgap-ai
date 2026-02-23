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

Return ONLY this JSON structure, nothing else:

{
  "matchScore": 75,
  "verdict": "Your verdict here",
  "matchedSkills": ["skill1", "skill2"],
  "missingSkills": ["skill1", "skill2"],
  "roadmap": [
    {
      "skill": "Skill Name",
      "why": "Why it matters",
      "resource": "Free resource to learn",
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
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.2,
            maxOutputTokens: 2000,
            responseMimeType: "application/json"
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

    if (!geminiData.candidates || !geminiData.candidates[0]) {
      return res.status(500).json({
        error: 'No candidates in response',
        debug: JSON.stringify(geminiData).substring(0, 300)
      });
    }

    let content = geminiData.candidates[0].content.parts[0].text.trim();

    // Strip markdown if present
    content = content
      .replace(/^```json\n?/i, '')
      .replace(/^```\n?/i, '')
      .replace(/\n?```$/i, '')
      .trim();

    try {
      const result = JSON.parse(content);
      return res.status(200).json(result);
    } catch (e) {
      return res.status(500).json({
        error: 'JSON parse failed',
        rawContent: content.substring(0, 500)
      });
    }

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
