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
        return res.status(500).json({ error: 'GEMINI_API_KEY nije podešen u Vercel Environment Variables.' });
      }

      // SIGURNO IZVLAČENJE ZADNJE PORUKE (izbjegavamo pucanje ako je niz čudan)
      let zadnjaPoruka = "Zdravo";
      if (Array.isArray(messages) && messages.length > 0) {
        const lastMsg = messages[messages.length - 1];
        zadnjaPoruka = typeof lastMsg === 'string' ? lastMsg : (lastMsg.content || lastMsg.text || "");
      }

      // Sigurno izvlačenje sistemske poruke
      let sistemPoruka = "Ti si pravni AI asistent. Odgovori na pitanje isključivo na osnovu priloženog konteksta zakona FBiH kroz jasne pasuse.";
      if (Array.isArray(messages)) {
        const foundSystem = messages.find(m => m && m.role === 'system');
        if (foundSystem && foundSystem.content) sistemPoruka = foundSystem.content;
      }

      const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${geminiKey}`;
      
      const geminiResponse = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [
            {
              role: 'user',
              parts: [{ text: `${sistemPoruka}\n\nKorisničko pitanje/kontekst:\n${zadnjaPoruka}` }]
            }
          ],
          generationConfig: {
            temperature: temperature || 0.2,
            maxOutputTokens: 1200
          }
        })
      });

      // Ako Google vrati grešku (npr. loš API ključ), pročitaj tačno šta kaže
      if (!geminiResponse.ok) {
        const errDetails = await geminiResponse.text();
        return res.status(geminiResponse.status).json({ error: 'Gemini API odbio zahtjev', details: errDetails });
      }

      const geminiData = await geminiResponse.json();
      
      // Provjera da li struktura odgovora ima očekivane podatke prije čitanja
      if (geminiData.candidates && geminiData.candidates[0]?.content?.parts[0]?.text) {
        const tekstOdgovora = geminiData.candidates[0].content.parts[0].text;

        // Vraćamo mapirano u OpenAI stilu
        return res.status(200).json({
          choices: [
            {
              message: {
                role: 'assistant',
                content: tekstOdgovora
              }
            }
          ]
        });
      } else {
        return res.status(500).json({ error: 'Gemini vratio neočekivan format', details: geminiData });
      }
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
        model: model || 'gpt-5.4',
        messages,
        response_format,
        temperature
      })
    });

    const data = await openAiResponse.json();
    return res.status(openAiResponse.status).json(data);

  } catch (error) {
    // Vraćamo tačan opis greške u JSON-u kako bi na klijentu odmah vidio šta je puklo
    return res.status(500).json({ error: 'Internal Server Error', message: error.message, stack: error.stack });
  }
}
