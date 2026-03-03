// Vercel serverless function to proxy requests to Anthropic API
// This avoids CORS issues and keeps the API key server-side

// Increase body size limit to 10MB for base64-encoded chart screenshot uploads
export const config = {
  api: {
    bodyParser: {
      sizeLimit: '10mb',
    },
  },
}

export default async function handler(req, res) {
  // Only allow POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;

  if (!apiKey) {
    return res.status(500).json({ error: 'ANTHROPIC_API_KEY not configured — add it to Vercel environment variables' });
  }

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(req.body),
    });

    const data = await response.json();

    // Forward the response status and data
    return res.status(response.status).json(data);
  } catch (error) {
    console.error('Claude API proxy error:', error);
    return res.status(500).json({ error: 'Failed to proxy request to Claude API' });
  }
}
