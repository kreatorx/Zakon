export default async function handler(req, res) {
  // Eksplicitno rukovanje CORS-om
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
    const { messages, response_format, temperature, model } = req.body;

    // Podrazumijevani model ako klijent ne pošalje ništa
    const izabraniModel = (model || 'gemini-1.5-flash').toLowerCase();

    // ==========================================
    // 1. OPCIJA: GOOGLE GEMINI
    // ==========================================
    if (izabraniModel.includes('gemini')) {
      const geminiKey = process.env.GEMINI_API_KEY;
      if (!geminiKey) {
        return res.status(500).json({ 
          error: 'GEMINI_API_KEY nije podešen u Vercel Environment Variables.' 
        });
      }

      // Konverzija OpenAI formata u Gemini format
      const geminiContents = [];
      let systemInstruction = "";

      for (const msg of messages) {
        if (msg.role === 'system') {
          systemInstruction = msg.content;
        } else {
          // Gemini koristi 'model' umjesto 'assistant'
          const role = msg.role === 'assistant' ? 'model' : 'user';
          geminiContents.push({
            role: role,
            parts: [{ text: msg.content }]
          });
        }
      }

      // Default system instruction ako nije definisana
      if (!systemInstruction) {
        systemInstruction = "Ti si pravni AI asistent. Odgovori na pitanje isključivo na osnovu priloženog konteksta zakona FBiH kroz jasne pasuse.";
      }

      // Priprema payload-a
      const payload = {
        contents: geminiContents,
        generationConfig: {
          temperature: temperature || 0.7,
          maxOutputTokens: 4096,
          topP: 0.95,
          topK: 40
        }
      };

      // Dodaj system_instruction (Gemini 1.5+ feature)
      if (systemInstruction) {
        let systemText = systemInstruction;
        // Ako je tražen JSON response, dodaj instrukciju u system prompt
        if (response_format?.type === 'json_object') {
          systemText += "\n\nVAŽNO: Odgovor mora biti u validnom JSON formatu. Nemoj dodavati nikakav dodatni tekst van JSON objekta.";
        }
        payload.system_instruction = {
          parts: [{ text: systemText }]
        };
      }

      // Gemini API endpoint sa dinamičkim modelom
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${izabraniModel}:generateContent?key=${geminiKey}`;

      const geminiResponse = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const geminiData = await geminiResponse.json();

      // Error handling kao OpenAI
      if (!geminiResponse.ok) {
        console.error('Gemini API greška:', geminiData);
        return res.status(geminiResponse.status).json({
          error: {
            message: geminiData.error?.message || 'Gemini API greška',
            type: 'gemini_error',
            code: geminiResponse.status
          }
        });
      }

      // Ekstrakcija odgovora iz Gemini formata
      const tekstOdgovora = geminiData.candidates?.[0]?.content?.parts?.[0]?.text || '';

      // Ako je tražen JSON, pokušaj parsirati da provjeriš validnost
      if (response_format?.type === 'json_object') {
        try {
          JSON.parse(tekstOdgovora);
        } catch (e) {
          console.warn('Gemini nije vratio validan JSON:', tekstOdgovora);
        }
      }

      // Response u OpenAI kompatibilnom formatu
      return res.status(200).json({
        choices: [{
          message: {
            role: 'assistant',
            content: tekstOdgovora
          },
          finish_reason: 'stop',
          index: 0
        }],
        usage: {
          prompt_tokens: 0,
          completion_tokens: 0,
          total_tokens: 0
        },
        model: izabraniModel
      });
    }

    // ==========================================
    // 2. OPCIJA: OPENAI
    // ==========================================
    const openAiKey = process.env.OPEN_API_KEY;
    if (!openAiKey) {
      return res.status(500).json({ error: 'OPEN_API_KEY nije podešen.' });
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
        temperature
      })
    });

    const data = await openAiResponse.json();
    return res.status(openAiResponse.status).json(data);

  } catch (error) {
    console.error('Server greška:', error);
    return res.status(500).json({ 
      error: 'Internal Server Error', 
      message: error.message, 
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined 
    });
  }
}
