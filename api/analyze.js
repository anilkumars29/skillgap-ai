export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { resume, jobDescription } = req.body;

  if (!resume || !jobDescription) {
    return res.status(400).json({ error: 'Resume and job description are required.' });
  }

  // ── ADD YOUR GEMINI API KEY IN VERCEL ENVIRONMENT VARIABLES ──
  // Go to Vercel Dashboard → Your Project → Settings → Environment Variables
  // Add a variable named: GEMINI_API_KEY
  // Value: your Google AI Studio API key
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    return res.status(500).json({ error: 'API key not configured. Please add GEMINI_API_KEY in Vercel environment variables.' });
  }

  const prompt = `You are an expert career coach and ATS (Applicant Tracking System) specialist. Analyse the provided resume against the job description.

Return ONLY a valid JSON object with this exact structure (no markdown, no explanation, no code blocks, just pure JSON):

{
  "matchScore": <number 0-100>,
  "verdict": "<one sentence verdict about the match>",
  "matchedSkills": ["skill1", "skill2"],
  "missingSkills": ["skill1", "skill2"],
  "roadmap": [
    {
      "skill": "<skill name>",
      "why": "<why this skill matters for this specific job>",
      "resource": "<specific free resource to learn this>",
      "priority": "<High | Medium | Low>"
    }
  ],
  "tips": [
    "<specific actionable resume improvement tip 1>",
    "<specific actionable resume improvement tip 2>",
    "<specific actionable resume improvement tip 3>",
    "<specific actionable resume improvement tip 4>"
  ]
}

Rules:
- matchScore should reflect how well the resume matches the JD (0 = no match, 100 = perfect match)
- matchedSkills: skills/tools/technologies mentioned in BOTH resume and JD
- missingSkills: skills/tools/technologies required by JD but NOT in resume
- roadmap: only for missing skills, ordered by priority (High first), max 8 items
- tips: specific actionable advice to improve the resume for THIS job, not generic advice
- Keep skill names concise (e.g. "React.js" not "Experience with React.js framework")
- resource should be specific (e.g. "freeCodeCamp React Course" not just "YouTube")

RESUME:
${resume}

JOB DESCRIPTION:
${jobDescription}`;

  try {
    const geminiResponse = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.3,
            maxOutputTokens: 2000,
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

    // Strip markdown code blocks if Gemini adds them
    content = content.replace(/```json/g, '').replace(/```/g, '').trim();

    // Parse JSON safely
    let result;
    try {
      result = JSON.parse(content);
    } catch (parseErr) {
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        result = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error('Failed to parse AI response. Please try again.');
      }
    }

    return res.status(200).json(result);

  } catch (err) {
    console.error('Analysis error:', err.message);
    return res.status(500).json({ error: err.message || 'Analysis failed. Please try again.' });
  }
}
