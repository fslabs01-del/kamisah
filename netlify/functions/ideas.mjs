import { guard } from './lib/guard.mjs';
const MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
const reply = (data, status = 200) => new Response(JSON.stringify(data), {
  status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }
});
const CATEGORIES = {
  film: 'Film AI, animasi, survival, sci-fi',
  recap: 'Alur cerita, film recap, thriller',
  misteri: 'Misteri, investigasi, konspirasi yang diberi label spekulasi jika belum terbukti',
  fakta: 'Fakta sains, psikologi, biologi; hindari klaim palsu dan tandai hal yang perlu diverifikasi',
  tutorial: 'Tutorial editing, produksi konten, hook dan storytelling'
};
export default async (request) => {
  if (request.method !== 'POST') return reply({ error: 'Gunakan metode POST.' }, 405);
  const g = await guard(request, 'ideas', 30, 3600);
  if (g instanceof Response) return g;
  const key = process.env.GEMINI_API_KEY;
  if (!key) return reply({ error: 'Layanan AI belum dikonfigurasi oleh admin.' }, 503);
  let body;
  try { body = await request.json(); } catch { return reply({ error: 'Data permintaan tidak valid.' }, 400); }
  const category = String(body.category || 'all');
  if (category !== 'all' && !Object.hasOwn(CATEGORIES, category)) return reply({ error: 'Kategori tidak valid.' }, 400);
  const categoryText = category === 'all' ? Object.values(CATEGORIES).join('; ') : CATEGORIES[category];
  const avoid = String(body.avoid || '').slice(0, 1500);
  const prompt = `Buat SATU ide konten video yang segar, spesifik, dan layak diproduksi. Kategori: ${categoryText}. Bahasa Indonesia alami. Jangan memakai formula template generik, jangan meniru ide contoh yang sama, dan jangan membuat klaim faktual palsu. ${avoid ? `Hindari kemiripan dengan ide sebelumnya berikut: ${avoid}` : ''}\nKembalikan JSON valid saja dengan properti: cat (salah satu film, recap, misteri, fakta, tutorial), tag (label singkat), hook (judul/hook kuat), synopsis (sinopsis spesifik 1-3 kalimat), script (naskah hook/voice-over 1-3 kalimat).`;
  try {
    const upstream = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(MODEL)}:generateContent`, {
      method: 'POST', headers: { 'content-type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: prompt }] }], generationConfig: { temperature: 0.95, maxOutputTokens: 700, responseMimeType: 'application/json' } })
    });
    const data = await upstream.json().catch(() => ({}));
    if (!upstream.ok) return reply({ error: data?.error?.message || `Layanan AI merespons HTTP ${upstream.status}.` }, upstream.status === 429 ? 429 : 502);
    const raw = (data?.candidates?.[0]?.content?.parts || []).map(p => p.text || '').join('').trim();
    let idea;
    try { idea = JSON.parse(raw); } catch { return reply({ error: 'AI mengembalikan format ide yang tidak valid. Coba lagi.' }, 502); }
    const allowed = new Set(['film', 'recap', 'misteri', 'fakta', 'tutorial']);
    if (!idea || !allowed.has(idea.cat) || !idea.tag || !idea.hook || !idea.synopsis || !idea.script) return reply({ error: 'Hasil ide belum lengkap. Coba lagi.' }, 502);
    return reply({ idea: { cat: idea.cat, tag: String(idea.tag).slice(0, 100), hook: String(idea.hook).slice(0, 600), synopsis: String(idea.synopsis).slice(0, 1600), script: String(idea.script).slice(0, 1600) }, model: MODEL });
  } catch { return reply({ error: 'Tidak dapat menghubungi layanan AI. Coba lagi.' }, 502); }
};
