export default async function handler(req, res) {
  // ... CORS dio ostaje isti ...

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { messages, response_format, temperature, model } = req.body;
    const izabraniModel = (model || 'gemini-1.5-flash').toLowerCase();

    // === GEMINI ===
    if (izabraniModel.includes('gemini')) {
      const geminiKey = process.env.GEMINI_API_KEY;
      if (!geminiKey) return res.status(500).json({ error: 'Gemini key missing' });

      // ... tvoja konverzija messages u geminiContents ...

      const payload = { /* ... */ };

      const url = `https://generativelanguage.googleapis.com/v1beta/models/${izabraniModel}:generateContent?key=${geminiKey}`;
      
      const geminiResponse = await fetch(url, { method: 'POST', headers: {...}, body: JSON.stringify(payload) });
      const geminiData = await geminiResponse.json();

      if (!geminiResponse.ok) {
        console.error('Gemini error:', geminiData);
        return res.status(geminiResponse.status).json({ error: geminiData.error });
      }

      const content = geminiData.candidates?.[0]?.content?.parts?.[0]?.text || '';
      return res.json({
        choices: [{ message: { role: 'assistant', content } }],
        model: izabraniModel
      });
    }

    // === OPENAI ===
    const openAiKey = process.env.OPEN_API_KEY;
    if (!openAiKey) return res.status(500).json({ error: 'OpenAI key missing' });

    const openAiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${openAiKey}`
      },
      body: JSON.stringify({
        model: model || 'gpt-5.4',
        messages,
        response_format,
        temperature: temperature || 0.1
      })
    });

    const data = await openAiResponse.json();
    return res.status(openAiResponse.status).json(data);

  } catch (error) {
    console.error('Handler error:', error);
    return res.status(500).json({ error: error.message });
  }
}
