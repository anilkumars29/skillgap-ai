export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { resume, jobDescription } = req.body;

  if (!resume || !jobDescription) {
    return res.status(400).json({ error: 'Resume and job description are required.' });
  }

  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    return res.status(500).json({ error: 'API key not configured. Please add GEMINI_API_KEY in Vercel environment variables.' });
  }

  const prompt = `You are an expert career coach and ATS specialist. Analyse the resume against the job description and return a JSON object.

IMPORTANT: Return ONLY raw JSON. No markdown, no backticks, no code blocks, no explanation. Start directly with { and end with }.

{
  "matchScore": <number 0-100>,
  "verdict": "<one sentence verdict>",
  "matchedSkills": ["skill1", "skill2"],
  "missingSkills": ["skill1", "skill2"],
  "roadmap": [
    {
      "skill": "<skill name>",
      "why": "<why this skill matters for this job>",
      "resource": "<specific free resource to learn this>",
      "priority": "<High | Medium | Low>"
    }
  ],
  "tips": [
    "<actionable resume tip 1>",
    "<actionable resume tip 2>",
    "<actionable resume tip 3>",
    "<actionable resume tip 4>"
  ]
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
            temperature: 0.3,
            maxOutputTokens: 2000,
            responseMimeType: "application/json"
          }
        })
      }
    );

    if (!geminiResponse.ok) {
      const errData = await geminiResponse.json();
      throw new Error(errData.error?.message || 'Gemini API error');
    }

    const geminiData = await geminiResponse.json();
    let content = geminiData.candidates[0].content.parts[0].text.trim();

    // Aggressively strip any markdown formatting Gemini might add
    content = content
      .replace(/^```json\s*/i, '')
      .replace(/^```\s*/i, '')
      .replace(/\s*```$/i, '')
      .trim();

    // Parse JSON safely
    let result;
    try {
      result = JSON.parse(content);
    } catch (parseErr) {
      // Last resort — extract anything that looks like JSON
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        result = JSON.parse(jsonMatch[0]);
      } else {
        // Log actual content for debugging
        console.error('Raw Gemini response:', content);
        throw new Error('Failed to parse AI response. Please try again.');
      }
    }

    return res.status(200).json(result);

  } catch (err) {
    console.error('Analysis error:', err.message);
    return res.status(500).json({ error: err.message || 'Analysis failed. Please try again.' });
  }
}
