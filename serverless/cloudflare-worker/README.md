# Montana Ecology Summary Worker

Serverless endpoint permanen untuk analisis ekologi AI agar frontend statis tetap bisa memanggil DeepSeek dengan aman.

## Endpoint

- `POST /api/ecology-summary`
- Body:

```json
{
  "password": "agungganteng",
  "metrics": {
    "total": 120,
    "sehat": 90,
    "merana": 20,
    "mati": 10,
    "persenSehat": 75,
    "rataTinggi": 132.4,
    "jenisTop": [{ "name": "Sengon", "count": 80 }]
  }
}
```

## Deploy (Cloudflare Workers)

1. Install Wrangler:

```bash
npm i -g wrangler
```

2. Login:

```bash
wrangler login
```

3. Masuk ke folder worker:

```bash
cd serverless/cloudflare-worker
```

4. Set secret API key:

```bash
wrangler secret put DEEPSEEK_API_KEY
```

5. (Opsional) Set password lock server-side:

```bash
wrangler secret put ANALYSIS_PASSWORD
```

6. Deploy:

```bash
wrangler deploy
```

Setelah deploy, Anda akan mendapatkan URL worker, misalnya:

`https://montana-ecology-summary.<subdomain>.workers.dev/api/ecology-summary`

## Integrasi ke Frontend Production

Set env frontend saat build/deploy:

```bash
VITE_ECOLOGY_SUMMARY_API_URL=https://montana-ecology-summary.<subdomain>.workers.dev/api/ecology-summary
```

Lalu build ulang frontend.

## Domain Kustom

Jika ingin domain rapi:

- Buat route/custom domain di Cloudflare, contoh: `https://ai.montana-tech.info`
- Endpoint menjadi: `https://ai.montana-tech.info/api/ecology-summary`
- Isi env frontend:

```bash
VITE_ECOLOGY_SUMMARY_API_URL=https://ai.montana-tech.info/api/ecology-summary
```
