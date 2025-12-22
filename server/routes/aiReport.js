import express from 'express';
import { GoogleGenerativeAI } from '@google/generative-ai';

const router = express.Router();

function env(name, fallback = '') {
  const v = process.env[name];
  return v === undefined || v === '' ? fallback : v;
}

function clampInt(n, min, max, fallback) {
  const x = Number(n);
  if (!Number.isFinite(x)) return fallback;
  return Math.max(min, Math.min(max, Math.trunc(x)));
}

function clampFloat(n, min, max, fallback) {
  const x = Number(n);
  if (!Number.isFinite(x)) return fallback;
  return Math.max(min, Math.min(max, x));
}

async function callOpenAIChatCompletions({ baseUrl, apiKey, model, prompt, temperature, maxTokens }) {
  const url = `${baseUrl.replace(/\/$/, '')}/v1/chat/completions`;

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      temperature,
      max_tokens: maxTokens,
      messages: [
        {
          role: 'system',
          content:
            'Eres un/a docente tutor/a. Generas informes basados SOLO en evidencias aportadas. No inventes datos. Redacta en español, tono profesional y claro, con estructura y viñetas cuando convenga.',
        },
        { role: 'user', content: prompt },
      ],
    }),
  });

  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    const msg = txt ? `OpenAI error ${res.status}: ${txt}` : `OpenAI error ${res.status}`;
    throw Object.assign(new Error(msg), { status: 502 });
  }

  const data = await res.json();
  const content = data?.choices?.[0]?.message?.content;
  if (!content || typeof content !== 'string') {
    throw Object.assign(new Error('AI response missing content'), { status: 502 });
  }
  return content;
}

async function callGemini({ apiKey, model, prompt, temperature, maxTokens }) {
  const genAI = new GoogleGenerativeAI(apiKey);
  const m = genAI.getGenerativeModel({ model });

  const result = await m.generateContent({
    contents: [
      {
        role: 'user',
        parts: [{ text: prompt }],
      },
    ],
    generationConfig: {
      temperature,
      maxOutputTokens: maxTokens,
    },
  });

  const response = await result.response;
  const text = response.text();
  if (!text) {
    throw Object.assign(new Error('Gemini response missing content'), { status: 502 });
  }
  return text;
}

/**
 * POST /api/ai/report
 * Body: { prompt: string, model?: string }
 * Env:
 *  - OPENAI_API_KEY (optional)
 *  - GEMINI_API_KEY (optional)
 *  - OPENAI_MODEL (optional)
 *  - OPENAI_BASE_URL (optional, default https://api.openai.com)
 */
router.post('/report', async (req, res) => {
  const prompt = typeof req.body?.prompt === 'string' ? req.body.prompt : '';
  const modelOverride = typeof req.body?.model === 'string' ? req.body.model : '';

  if (!prompt || prompt.trim().length < 20) {
    return res.status(400).json({ error: 'prompt is required' });
  }

  // Keep costs and latency bounded.
  const temperature = clampFloat(env('AI_TEMPERATURE', '0.2'), 0, 1, 0.2);
  const maxTokens = clampInt(env('AI_MAX_TOKENS', '1200'), 200, 3000, 1200);

  try {
    // 1. Try Gemini if configured
    const geminiKey = env('GEMINI_API_KEY', '');
    if (geminiKey) {
      const model = modelOverride || env('GEMINI_MODEL', 'gemini-1.5-flash');
      const text = await callGemini({
        apiKey: geminiKey,
        model,
        prompt,
        temperature,
        maxTokens,
      });
      return res.json({ ok: true, text, provider: 'gemini' });
    }

    // 2. Try OpenAI if configured
    const openAiKey = env('OPENAI_API_KEY', '');
    if (openAiKey) {
      const baseUrl = env('OPENAI_BASE_URL', 'https://api.openai.com');
      const model = modelOverride || env('OPENAI_MODEL', 'gpt-4o-mini');
      const text = await callOpenAIChatCompletions({
        baseUrl,
        apiKey: openAiKey,
        model,
        prompt,
        temperature,
        maxTokens,
      });
      return res.json({ ok: true, text, provider: 'openai' });
    }

    return res.status(501).json({
      error: 'AI not configured. Set GEMINI_API_KEY or OPENAI_API_KEY on the server.',
      code: 'AI_NOT_CONFIGURED',
    });
  } catch (e) {
    const status = e?.status || 500;
    res.status(status).json({ error: e?.message || 'AI generation failed' });
  }
});

export default router;
