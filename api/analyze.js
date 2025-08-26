// /api/analyze.js  —— Vercel Serverless（ESM）
export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') {
    return res.status(405).json({ error: { message: 'Only POST allowed' } });
  }

  // 1) 穩健解析 body：處理字串/物件/未解析（讀取 stream）
  let payload = {};
  try {
    if (typeof req.body === 'string') {
      payload = JSON.parse(req.body);
    } else if (req.body && typeof req.body === 'object') {
      payload = req.body;
    } else {
      let raw = '';
      await new Promise((resolve, reject) => {
        req.on('data', (c) => (raw += c));
        req.on('end', resolve);
        req.on('error', reject);
      });
      payload = raw ? JSON.parse(raw) : {};
    }
  } catch (e) {
    return res.status(400).json({ error: { message: 'Invalid JSON body', details: String(e?.message || e) } });
  }

  const prompt = payload?.prompt;
  if (!prompt) return res.status(400).json({ error: { message: 'Missing prompt' } });

  // 2) 讀取金鑰（在專案層級設定 GEMINI_API_KEY，改完要 Redeploy）
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return res.status(500).json({ error: { message: 'GEMINI_API_KEY not set' } });

  // 3) 呼叫 Gemini 2.5 Pro（也可改成 'gemini-2.5-flash'）
  const MODEL = 'gemini-2.5-pro';
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;

  try {
    const upstream = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey,
      },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }]}],
        generationConfig: { responseMimeType: 'application/json', temperature: 0.7 }
      })
    });

    const data = await upstream.json().catch(() => ({}));

    if (!upstream.ok) {
      return res.status(upstream.status).json({
        error: { message: data?.error?.message || 'Upstream error', status: upstream.status },
        details: data
      });
    }

    // 4) 取回文字（可能多個 part，串起來）
    const text = (data?.candidates?.[0]?.content?.parts || [])
      .map(p => p?.text || '')
      .join('');

    // 5) 包成 OpenAI-like（前端不用改解析）
    return res.status(200).json({
      choices: [{ message: { content: text } }],
      provider: 'gemini',
      model: MODEL
    });
  } catch (err) {
    return res.status(500).json({
      error: { message: err?.message || 'Server error', name: err?.name }
    });
  }
}
