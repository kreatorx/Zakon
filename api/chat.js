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

    // Određujemo koji model koristimo (ako frontend ne pošalje ništa, stavimo gemini kao besplatni podrazumijevani)
    const izabraniModel = (model || 'gemini-1.5-flash').toLowerCase();

    // ==========================================
    // 1. OPCIJA: GOOGLE GEMINI (BESPLATNO)
    // ==========================================
    if (izabraniModel.includes('gemini')) {
      const geminiKey = process.env.GEMINI_API_KEY;
      if (!geminiKey) {
        return res.status(500).json({ error: 'GEMINI_API_KEY nije podešen u Vercel Environment Variables.' });
      }

      // Izvlačimo zadnju poruku i sistemsko uputstvo za Gemini format
      const zadnjaPoruka = messages && messages.length > 0 ? messages[messages.length - 1].content : "";
      
      // Pokušavamo izvući sistemsku poruku ako postoji u nizu, ako ne, stavljamo default
      const sistemPoruka = messages.find(m => m.role === 'system')?.content || 
        "Ti si pravni AI asistent. Odgovori na pitanje isključivo na osnovu priloženog konteksta zakona FBiH kroz jasne pasuse.";

      const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${geminiKey}`;
      
      const geminiResponse = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [
            {
              role: 'user',
              parts: [{ text: `Uputstvo: ${sistemPoruka}\n\n${zadnjaPoruka}` }]
            }
          ],
          generationConfig: {
            temperature: temperature || 0.2,
            maxOutputTokens: 1000
          }
        })
      });

      if (!geminiResponse.ok) {
        const errData = await geminiResponse.json();
        return res.status(geminiResponse.status).json({ error: 'Gemini API Error', details: errData });
      }

      const geminiData = await geminiResponse.json();
      const tekstOdgovora = geminiData.candidates[0].content.parts[0].text;

      // MAPIRANJE U OPENAI FORMAT: Pakujemo odgovor tako da frontend misli da je stigao sa OpenAI-ja
      // Na ovaj način tvoj frontend kod koji čita `choices[0].message.content` i dalje radi bez ijedne prepravke!
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
    }

    // ==========================================
    // 2. OPCIJA: OPENAI (PLAĆENO)
    // ==========================================
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
        model: model || 'gpt-4o-mini', // popravljen fallback pošto gpt-5.4 ne postoji
        messages,
        response_format,
        temperature
      })
    });

    const data = await openAiResponse.json();
    return res.status(openAiResponse.status).json(data);

  } catch (error) {
    return res.status(500).json({ error: 'Internal Server Error', details: error.message });
  }
}
