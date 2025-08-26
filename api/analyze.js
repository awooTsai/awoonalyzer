// /api/analyze.js  —— Vercel Serverless（CommonJS）
module.exports = async (req, res) => {
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') {
    return res.status(405).json({ error: { message: 'Only POST allowed' } });
  }

  // 解析 JSON body（一般 Node 函式需自行處理）
  let raw = '';
  await new Promise((resolve, reject) => {
    req.on('data', (c) => (raw += c));
    req.on('end', resolve);
    req.on('error', reject);
  });
  let body = {};
  try { body = raw ? JSON.parse(raw) : {}; }
  catch { return res.status(400).json({ error: { message: 'Invalid JSON body' } }); }

  const prompt = body.prompt;
  if (!prompt) return res.status(400).json({ error: { message: 'Missing prompt' } });

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return res.status(500).json({ error: { message: 'GEMINI_API_KEY not set' } });

  const MODEL = 'gemini-2.5-pro';
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;

  try {
    const upstream = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // 用 header 帶金鑰，避免 ?key=... 暴露在 referrer/log
        'x-goog-api-key': apiKey,
      },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }]}],
        // 讓模型直接吐 JSON 字串，前端可 JSON.parse
        generationConfig: { responseMimeType: 'application/json', temperature: 0.7 },
      }),
    });

    const data = await upstream.json().catch(() => ({}));
    if (!upstream.ok) {
      return res.status(upstream.status).json({
        error: { message: data?.error?.message || 'Upstream error', status: upstream.status },
        details: data,
      });
    }

    // 取出文字（可能多個 part，串起來）
    const text = (data?.candidates?.[0]?.content?.parts || [])
      .map(p => p?.text || '')
      .join('');

    // 包成 OpenAI-like 結構，前端不用改
    return res.status(200).json({
      choices: [{ message: { content: text } }],
      provider: 'gemini',
      model: MODEL,
    });
  } catch (err) {
    return res.status(500).json({ error: { message: err?.message || 'Server error' } });
  }
};
