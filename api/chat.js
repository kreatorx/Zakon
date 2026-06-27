export default async function handler(req, res) {
  // Eksplicitno rukovanje CORS-om unutar koda za svaki slučaj
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization');

  // Ako je preflight zahtjev, odmah prekidamo i vraćamo usmjeravanje
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = process.env.OPEN_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'OPEN_API_KEY nije podešen u Vercel Environment Variables.' });
  }

  try {
    const { messages, response_format, temperature } = req.body;

    const openAiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: 'gpt-5.4',
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
