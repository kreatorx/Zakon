export default async function handler(req, res) {
  console.log('=== CHAT HANDLER POZVAN ===');
  console.log('Method:', req.method);
  console.log('Model:', req.body?.model);

  // CORS Headers
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

    const izabraniModel = (model || 'gemini-flash-latest').toLowerCase().trim();

    // =========================================================================
    // 1. GEMINI FLASH LOGIKA (STRIKTNO 4 TRAŽENA MODELA)
    // =========================================================================
    if (izabraniModel.includes('gemini')) {
      const geminiKey = process.env.GEMINI_API_KEY;

      if (!geminiKey) {
        console.error('GREŠKA: GEMINI_API_KEY nije postavljen!');
        return res.status(500).json({ error: 'GEMINI_API_KEY nije podešen u Vercel Environment Variables.' });
      }

      // Konverzija OpenAI → Gemini format
      const geminiContents = [];
      let systemInstruction = "Ti si pravni AI asistent za zakonodavstvo FBiH.";

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

      let systemText = systemInstruction;
      if (response_format?.type === 'json_object') {
        systemText += "\n\nVAŽNO: Odgovor mora biti ISKLJUČIVO validan JSON objekat. Bez ikakvog teksta van JSON-a, bez markdown oznaka poput ```json.";
      }

      const payload = {
        system_instruction: { parts: [{ text: systemText }] },
        contents: geminiContents,
        generationConfig: {
          temperature: temperature ?? 0.1,
          maxOutputTokens: 4096,
          topP: 0.95,
          topK: 40
        }
      };

      // TAČNO TRAŽENA 4 MODELA BEZ IKAKVIH DODATNIH MODELA:
      const geminiModeliZaPokusaj = [
        'gemini-flash-latest',
        'gemini-3.7-flash',
        'gemini-3.6-flash',
        'gemini-3.5-flash'
      ];

      let zadnjaGreska = null;
      let uspjesanOdgovor = null;
      let modelKojiJeUspio = '';

      for (const kandidatModel of geminiModeliZaPokusaj) {
        try {
          console.log(`📡 Pokušavam Gemini model: ${kandidatModel}`);
          const url = `[https://generativelanguage.googleapis.com/v1beta/models/$](https://generativelanguage.googleapis.com/v1beta/models/$){kandidatModel}:generateContent?key=${geminiKey}`;

          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 9000); // 9 sekundi po pozivu

          const geminiResponse = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
            signal: controller.signal
          });
          clearTimeout(timeoutId);

          const resData = await geminiResponse.json();

          if (geminiResponse.ok && resData.candidates?.[0]?.content?.parts?.[0]?.text) {
            uspjesanOdgovor = resData;
            modelKojiJeUspio = kandidatModel;
            console.log(`✅ Uspješno dobijen odgovor od modela: ${kandidatModel}`);
            break;
          } else {
            const porukaGreske = resData.error?.message || `Status HTTP ${geminiResponse.status}`;
            console.warn(`⚠️ Model ${kandidatModel} nije uspio: ${porukaGreske}`);
            zadnjaGreska = porukaGreske;
          }
        } catch (err) {
          console.warn(`⚠️ Izuzetak pri pozivu ${kandidatModel}:`, err.message);
          zadnjaGreska = err.name === 'AbortError' ? 'Timeout (9s)' : err.message;
        }
      }

      if (!uspjesanOdgovor) {
        return res.status(503).json({
          error: 'Svi Gemini modeli sa liste su trenutno nedostupni.',
          details: zadnjaGreska
        });
      }

      const tekstOdgovora = uspjesanOdgovor.candidates[0].content.parts[0].text;

      return res.status(200).json({
        choices: [{
          message: { role: 'assistant', content: tekstOdgovora },
          finish_reason: 'stop',
          index: 0
        }],
        text: tekstOdgovora,
        model: modelKojiJeUspio
      });
    }

    // =========================================================================
    // 2. OPENAI GPT 5.4 (gpt-5.4-2026-03-05)
    // =========================================================================
    const openAiKey = process.env.OPENAI_API_KEY || process.env.OPEN_API_KEY;

    if (!openAiKey) {
      return res.status(500).json({ error: 'OPENAI_API_KEY nije podešen u Vercel Environment Variables.' });
    }

    const openAiModel = izabraniModel.includes('gpt') ? izabraniModel : 'gpt-5.4-2026-03-05';
    console.log(`📡 Slanje zahtjeva na OpenAI API (${openAiModel})...`);

    const openAiResponse = await fetch('[https://api.openai.com/v1/chat/completions](https://api.openai.com/v1/chat/completions)', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${openAiKey}`
      },
      body: JSON.stringify({
        model: openAiModel,
        messages,
        response_format,
        temperature: temperature ?? 0.1
      })
    });

    const data = await openAiResponse.json();

    if (!openAiResponse.ok) {
      console.error('OpenAI API Greška:', JSON.stringify(data));
      return res.status(openAiResponse.status).json(data);
    }

    if (data.choices?.[0]?.message?.content) {
      data.text = data.choices[0].message.content;
    }

    return res.status(200).json(data);

  } catch (error) {
    console.error('SERVER GREŠKA:', error.message);
    return res.status(500).json({
      error: 'Internal Server Error',
      message: error.message
    });
  }
}
