interface Env {
  DEEPSEEK_API_KEY: string;
  ANALYSIS_PASSWORD: string;
  ALLOWED_ORIGIN?: string;
}

type MetricsPayload = {
  total?: number;
  sehat?: number;
  merana?: number;
  mati?: number;
  persenSehat?: number;
  rataTinggi?: number;
  jenisTop?: Array<{ name: string; count: number }>;
};

const json = (body: unknown, init: ResponseInit = {}): Response => {
  const headers = new Headers(init.headers || {});
  headers.set('Content-Type', 'application/json; charset=utf-8');
  return new Response(JSON.stringify(body), { ...init, headers });
};

const buildCorsHeaders = (origin: string, env: Env): HeadersInit => {
  const allowedOrigin = env.ALLOWED_ORIGIN || 'https://camera.montana-tech.info';
  const allow = origin && origin === allowedOrigin ? origin : allowedOrigin;

  return {
    'Access-Control-Allow-Origin': allow,
    'Access-Control-Allow-Methods': 'POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    Vary: 'Origin',
  };
};

const buildPrompt = (metrics: MetricsPayload): string => {
  const total = Number(metrics.total || 0);
  const sehat = Number(metrics.sehat || 0);
  const merana = Number(metrics.merana || 0);
  const mati = Number(metrics.mati || 0);
  const persenSehat = Number(metrics.persenSehat || 0);
  const rataTinggi = Number(metrics.rataTinggi || 0);

  const jenisTop = Array.isArray(metrics.jenisTop)
    ? metrics.jenisTop.map((item) => `${item.name}:${item.count}`).join(', ')
    : 'tidak ada';

  return [
    'Buat analisis ekologi super ringkas dalam Bahasa Indonesia.',
    'Aturan: maksimal 2 kalimat, tanpa bullet, langsung insight utama + tindakan prioritas.',
    'Data ringkasan:',
    `- Total pohon: ${total}`,
    `- Sehat: ${sehat} (${persenSehat}%)`,
    `- Merana: ${merana}`,
    `- Mati: ${mati}`,
    `- Rata-rata tinggi: ${rataTinggi} cm`,
    `- Jenis terbanyak: ${jenisTop}`,
  ].join('\n');
};

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const origin = request.headers.get('Origin') || '';
    const corsHeaders = buildCorsHeaders(origin, env);

    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: corsHeaders,
      });
    }

    const url = new URL(request.url);
    if (url.pathname !== '/api/ecology-summary') {
      return json({ error: 'Not Found' }, { status: 404, headers: corsHeaders });
    }

    if (request.method !== 'POST') {
      return json({ error: 'Method Not Allowed' }, { status: 405, headers: corsHeaders });
    }

    if (!env.DEEPSEEK_API_KEY) {
      return json({ error: 'DEEPSEEK_API_KEY belum diset di Worker.' }, { status: 500, headers: corsHeaders });
    }

    try {
      const payload = (await request.json()) as { password?: string; metrics?: MetricsPayload };
      const requiredPassword = env.ANALYSIS_PASSWORD || 'agungganteng';
      const submittedPassword = typeof payload?.password === 'string' ? payload.password : '';

      if (submittedPassword !== requiredPassword) {
        return json({ error: 'Password analisis tidak valid.' }, { status: 401, headers: corsHeaders });
      }

      const prompt = buildPrompt(payload?.metrics || {});

      const deepseekResp = await fetch('https://api.deepseek.com/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${env.DEEPSEEK_API_KEY}`,
        },
        body: JSON.stringify({
          model: 'deepseek-chat',
          messages: [
            {
              role: 'system',
              content: 'Anda analis ekologi lapangan. Beri jawaban paling ringkas, jelas, dan actionable.',
            },
            {
              role: 'user',
              content: prompt,
            },
          ],
          temperature: 0.2,
          max_tokens: 120,
        }),
      });

      if (!deepseekResp.ok) {
        const errorText = await deepseekResp.text();
        return json(
          { error: `DeepSeek request gagal: ${errorText}` },
          { status: deepseekResp.status, headers: corsHeaders },
        );
      }

      const result = (await deepseekResp.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
      };

      const summary = result?.choices?.[0]?.message?.content?.trim() || '';
      if (!summary) {
        return json({ error: 'DeepSeek tidak mengembalikan ringkasan.' }, { status: 502, headers: corsHeaders });
      }

      return json({ summary }, { status: 200, headers: corsHeaders });
    } catch (error) {
      return json(
        { error: error instanceof Error ? error.message : 'Gagal memproses analisis.' },
        { status: 500, headers: corsHeaders },
      );
    }
  },
};
