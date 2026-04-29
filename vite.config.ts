import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

const parseJsonBody = async (req: NodeJS.ReadableStream): Promise<any> => {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  if (chunks.length === 0) {
    return {};
  }

  const raw = Buffer.concat(chunks).toString('utf-8');
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
};

const sendJson = (res: any, statusCode: number, payload: unknown): void => {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(payload));
};

const createEcologyPrompt = (metrics: any): string => {
  const {
    total = 0,
    sehat = 0,
    merana = 0,
    mati = 0,
    persenSehat = 0,
    rataTinggi = 0,
    jenisTop = [],
  } = metrics || {};

  const topJenisText = Array.isArray(jenisTop) && jenisTop.length > 0
    ? jenisTop.map((item: any) => `${item.name}:${item.count}`).join(', ')
    : 'tidak ada';

  return [
    'Buat analisis ekologi paling ringkas dalam Bahasa Indonesia.',
    'Format wajib: maksimal 2 kalimat, tanpa bullet, langsung insight utama + rekomendasi singkat.',
    'Data ringkasan:',
    `- Total pohon: ${total}`,
    `- Sehat: ${sehat} (${persenSehat}%)`,
    `- Merana: ${merana}`,
    `- Mati: ${mati}`,
    `- Rata-rata tinggi: ${rataTinggi} cm`,
    `- Jenis terbanyak: ${topJenisText}`,
  ].join('\n');
};

const ecologySummaryPlugin = (deepseekApiKey: string, analysisPassword: string) => {
  const handler = async (req: any, res: any) => {
    if (req.method !== 'POST') {
      sendJson(res, 405, { error: 'Method Not Allowed' });
      return;
    }

    if (!deepseekApiKey) {
      sendJson(res, 500, { error: 'DEEPSEEK_API_KEY belum diatur di environment server.' });
      return;
    }

    const body = await parseJsonBody(req);
    const submittedPassword = typeof body?.password === 'string' ? body.password : '';
    const requiredPassword = analysisPassword || 'agungganteng';
    if (submittedPassword !== requiredPassword) {
      sendJson(res, 401, { error: 'Password analisis tidak valid.' });
      return;
    }

    const prompt = createEcologyPrompt(body?.metrics || {});

    try {
      const response = await fetch('https://api.deepseek.com/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${deepseekApiKey}`,
        },
        body: JSON.stringify({
          model: 'deepseek-chat',
          messages: [
            {
              role: 'system',
              content: 'Anda analis ekologi lapangan. Jawaban harus sangat ringkas, jelas, dan langsung actionable.',
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

      if (!response.ok) {
        const errorText = await response.text();
        sendJson(res, response.status, { error: `DeepSeek request gagal: ${errorText}` });
        return;
      }

      const result: any = await response.json();
      const summary = result?.choices?.[0]?.message?.content?.trim();

      if (!summary) {
        sendJson(res, 502, { error: 'DeepSeek tidak mengembalikan ringkasan.' });
        return;
      }

      sendJson(res, 200, { summary });
    } catch (error) {
      sendJson(res, 500, {
        error: error instanceof Error ? error.message : 'Gagal memproses analisis ekologi.',
      });
    }
  };

  return {
    name: 'ecology-summary-api',
    configureServer(server: any) {
      server.middlewares.use('/api/ecology-summary', handler);
    },
    configurePreviewServer(server: any) {
      server.middlewares.use('/api/ecology-summary', handler);
    },
  };
};

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    const deepseekApiKey = env.DEEPSEEK_API_KEY || '';
  const analysisPassword = env.ANALYSIS_PASSWORD || 'agungganteng';

    return {
      server: {
        port: 3000,
        host: '0.0.0.0',
        https: mode === 'https',
      },
      plugins: [react(), ecologySummaryPlugin(deepseekApiKey, analysisPassword)],
      define: {
        'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY),
        'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY)
      },
      optimizeDeps: {
        exclude: ['@zxing/library']
      },
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      }
    };
});
