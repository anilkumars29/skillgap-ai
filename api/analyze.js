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
Return ONLY valid JSON, no markdown, no explanation, just JSON starting with { and ending with }.

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
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-001:generateContent?key=${apiKey}`,
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

    let content = geminiData?.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!content) {
      return res.status(500).json({
        error: 'Empty response from Gemini',
        full: JSON.stringify(geminiData).substring(0, 300)
      });
    }

    content = content.trim();

    // Strip markdown code blocks
    content = content
      .replace(/^```json\s*/i, '')
      .replace(/^```\s*/i, '')
      .replace(/\s*```$/i, '')
      .trim();

    // Extract JSON between first { and last }
    const start = content.indexOf('{');
    const end = content.lastIndexOf('}');

    if (start === -1 || end === -1) {
      return res.status(500).json({
        error: 'No JSON found in response',
        raw: content.substring(0, 300)
      });
    }

    const jsonString = content.substring(start, end + 1);
    const result = JSON.parse(jsonString);
    return res.status(200).json(result);

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
