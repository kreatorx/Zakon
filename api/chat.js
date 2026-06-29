export default async function handler(req, res) {
  console.log('=== CHAT HANDLER POZVAN ===');
  console.log('Method:', req.method);
  console.log('Model:', req.body?.model);

  // CORS headers
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { messages, response_format, temperature, model } = req.body || {};

    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({ error: 'Messages su obavezni i moraju biti niz.' });
    }

    const izabraniModel = (model || 'gemini-1.5-flash').toLowerCase().trim();
    console.log('Izabrani model:', izabraniModel);

    // ====================== GEMINI ======================
    if (izabraniModel.includes('gemini')) {
      const geminiKey = process.env.GEMINI_API_KEY;

      if (!geminiKey) {
        console.error('GREŠKA: GEMINI_API_KEY nije postavljen!');
        return res.status(500).json({ error: 'GEMINI_API_KEY nije podešen u Vercel Environment Variables.' });
      }

      // Konverzija OpenAI → Gemini format
      const geminiContents = [];
      let systemInstruction = "Ti si pravni AI asistent. Odgovori na pitanje isključivo na osnovu priloženog konteksta zakona FBiH.";

      for (const msg of messages) {
        if (msg.role === 'system') {
          systemInstruction = msg.content;
        } else {
          const role = msg.role === 'assistant' ? 'model' : 'user';
          geminiContents.push({
            role,
            parts: [{ text: msg.content }]
          });
        }
      }

      // Mora postojati barem jedan user message
      if (geminiContents.length === 0) {
        return res.status(400).json({ error: 'Nema korisničkih poruka za Gemini.' });
      }

      let systemText = systemInstruction;
      if (response_format?.type === 'json_object') {
        systemText += "\n\nVAŽNO: Odgovor mora biti ISKLJUČIVO validan JSON objekat. Bez ikakvog teksta van JSON-a, bez markdown oznaka poput ```json.";
      }

      // Koristi tačan model string — ukloni sve razmake
      // Primjer: "gemini-1.5-flash", "gemini-2.0-flash", "gemini-1.5-pro"
      const geminiModelString = izabraniModel.replace(/\s+/g, '-');

      const payload = {
        system_instruction: {
          parts: [{ text: systemText }]
        },
        contents: geminiContents,
        generationConfig: {
          temperature: temperature ?? 0.1,
          maxOutputTokens: 4096,
          topP: 0.95,
          topK: 40
        }
      };

      const url = `https://generativelanguage.googleapis.com/v1beta/models/${geminiModelString}:generateContent?key=${geminiKey}`;
      console.log('Gemini URL (bez key-a):', url.replace(geminiKey, 'HIDDEN'));

      const geminiResponse = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const geminiData = await geminiResponse.json();

      if (!geminiResponse.ok) {
        console.error('Gemini API greška:', JSON.stringify(geminiData));
        return res.status(geminiResponse.status).json({
          error: geminiData.error?.message || 'Gemini API greška',
          details: geminiData
        });
      }

      const tekstOdgovora = geminiData.candidates?.[0]?.content?.parts?.[0]?.text || '';

      return res.status(200).json({
        choices: [{
          message: { role: 'assistant', content: tekstOdgovora },
          finish_reason: 'stop',
          index: 0
        }],
        usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
        model: geminiModelString
      });
    }

    // ====================== OPENAI ======================
    const openAiKey = process.env.OPEN_API_KEY;

    if (!openAiKey) {
      return res.status(500).json({ error: 'OPEN_API_KEY nije podešen u Vercel Environment Variables.' });
    }

    const openAiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${openAiKey}`
      },
      body: JSON.stringify({
        model: model || 'gpt-4o-mini',
        messages,
        response_format,
        temperature: temperature ?? 0.1
      })
    });

    const data = await openAiResponse.json();
    return res.status(openAiResponse.status).json(data);

  } catch (error) {
    console.error('SERVER GREŠKA:', error.message);
    console.error(error.stack);
    return res.status(500).json({
      error: 'Internal Server Error',
      message: error.message
    });
  }
}
