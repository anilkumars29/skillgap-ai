module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { resume, jobDescription } = req.body;

  if (!resume || !jobDescription) {
    return res.status(400).json({ error: 'Resume and job description are required.' });
  }

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'API key not configured.' });
  }

  const prompt = `You are an expert career coach and ATS specialist. Analyse the resume against the job description.
Return ONLY valid JSON with no markdown or code blocks, starting with { and ending with }.

{
  "matchScore": 75,
  "verdict": "One sentence verdict about the match",
  "matchedSkills": ["skill1", "skill2"],
  "missingSkills": ["skill1", "skill2"],
  "roadmap": [
    {
      "skill": "Skill Name",
      "why": "Why this skill matters for this job",
      "resource": "Specific free resource to learn this",
      "priority": "High"
    }
  ],
  "tips": [
    "Specific actionable resume tip 1",
    "Specific actionable resume tip 2",
    "Specific actionable resume tip 3",
    "Specific actionable resume tip 4"
  ]
}

Rules:
- matchScore: Calculate strictly using this formula — (matchedSkills count / total required skills in JD) * 100, then adjust by max +10 for relevant experience or education. Example: 3 matched out of 9 required = 33, not 70. Be honest and strict, do NOT inflate the score. Use precise numbers, do NOT round to multiples of 10.
- matchedSkills: skills explicitly present in BOTH resume and JD only, no implied or vague matches
- missingSkills: all skills required by JD but NOT explicitly in resume, be thorough
- roadmap: max 8 items, High priority first
- tips: specific to THIS job, not generic advice

RESUME:
${resume}

JOB DESCRIPTION:
${jobDescription}`;

  try {
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages: [
          {
            role: 'system',
            content: 'You are a career coach and ATS specialist. Always respond with valid JSON only. No markdown, no code blocks, just pure JSON starting with { and ending with }.'
          },
          { role: 'user', content: prompt }
        ],
        temperature: 0.3,
        max_tokens: 2000
      })
    });

    const rawText = await response.text();
    console.log('Groq status:', response.status);
    console.log('Raw first 300:', rawText.substring(0, 300));

    let data;
    try {
      data = JSON.parse(rawText);
    } catch(e) {
      return res.status(500).json({ error: 'Groq returned non-JSON: ' + rawText.substring(0, 200) });
    }

    if (!response.ok) {
      return res.status(500).json({ error: data.error?.message || 'Groq API error' });
    }

    let content = data.choices?.[0]?.message?.content;
    if (!content) {
      return res.status(500).json({ error: 'No content returned', full: JSON.stringify(data).substring(0, 300) });
    }

    console.log('Content first 300:', content.substring(0, 300));

    content = content
      .replace(/^```json\s*/i, '')
      .replace(/^```\s*/i, '')
      .replace(/\s*```$/i, '')
      .trim();

    const start = content.indexOf('{');
    const end = content.lastIndexOf('}');

    if (start === -1 || end === -1) {
      return res.status(500).json({ error: 'No JSON found', raw: content.substring(0, 300) });
    }

    const result = JSON.parse(content.substring(start, end + 1));
    return res.status(200).json(result);

  } catch (err) {
    console.error('Error:', err.message);
    return res.status(500).json({ error: err.message });
  }
}
