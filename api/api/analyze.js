// /api/analyze.js  —— Vercel Serverless（CommonJS 版）
module.exports = async (req, res) => {
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') {
    return res.status(405).json({ error: { message: '僅支援 POST' } });
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
  catch { return res.status(400).json({ error: { message: '請傳遞 JSON body' } }); }

  const prompt = body.prompt;
  if (!prompt) return res.status(400).json({ error: { message: '缺少 prompt' } });

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return res.status(500).json({ error: { message: 'GEMINI_API_KEY 未設定' } });

  // 模型可改：'gemini-2.5-pro' / 'gemini-2.5-flash' / 'gemini-2.5-flash-lite' 等
  // 官方 model code 一覽見文件。 
  const MODEL = 'gemini-2.5-flash';

  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;

  try {
    const upstream = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // Google API 用 x-goog-api-key 帶金鑰（非 Bearer）
        'x-goog-api-key': apiKey
      },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }]}], // Gemini 的請求結構：contents -> parts -> text
        // 讓模型直接輸出 JSON（前端更好 parse）
        generationConfig: { responseMimeType: 'application/json', temperature: 0.7 }
      })
    });

    const data = await upstream.json().catch(() => ({}));

    if (!upstream.ok) {
      return res.status(upstream.status).json({
        error: {
          message: data?.error?.message || '上游 API 失敗',
          status: upstream.status
        },
        details: data
      });
    }

    // 取出文字（candidates[].content.parts[].text）
    const text = (data?.candidates?.[0]?.content?.parts || [])
      .map(p => p.text || '')
      .join('');

    // 包成 OpenAI-like 結構，前端就不用改
    return res.status(200).json({
      choices: [{ message: { content: text } }],
      provider: 'gemini',
      model: MODEL
    });
  } catch (err) {
    return res.status(500).json({ error: { message: err?.message || '伺服器內部錯誤' } });
  }
};
