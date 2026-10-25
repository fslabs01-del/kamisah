import { guard } from './lib/guard.mjs';
const MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash';

export default async (request) => {
  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Gunakan metode POST.' }), {
      status: 405,
      headers: { 'content-type': 'application/json; charset=utf-8', 'allow': 'POST' }
    });
  }

  const g = await guard(request, 'story', 20, 3600); if (g instanceof Response) return g;
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return new Response(JSON.stringify({ error: 'Layanan AI belum dikonfigurasi oleh admin.' }), {
      status: 503,
      headers: { 'content-type': 'application/json; charset=utf-8' }
    });
  }

  let body;
  try { body = await request.json(); }
  catch {
    return new Response(JSON.stringify({ error: 'Data permintaan tidak valid.' }), { status: 400, headers: { 'content-type': 'application/json; charset=utf-8' } });
  }

  const mode = String(body.mode || 'recap').slice(0, 40);
  const input = String(body.input || '').trim().slice(0, 8000);
  if (!input) return new Response(JSON.stringify({ error: 'Topik cerita wajib diisi.' }), { status: 400, headers: { 'content-type': 'application/json; charset=utf-8' } });

  const prompt = mode === 'film'
    ? `Kamu adalah showrunner, penulis skenario film, script supervisor, dan perancang shot profesional. Tulis dalam Bahasa Indonesia yang alami. Materi dan spesifikasi film dari pengguna: ${input}\n\nSusun dokumen pra-produksi yang spesifik dan dapat digunakan tim produksi. Gunakan judul dan bagian yang jelas: A) JUDUL DAN LOGLINE; B) SINOPSIS; C) KARAKTER UTAMA DAN PENDUKUNG, masing-masing dengan ciri wajah, rambut, kostum awal, kepribadian, tujuan, dan aturan konsistensi; D) STRUKTUR BABAK, tujuan, konflik, dan perubahan karakter; E) DAFTAR ADEGAN BERURUTAN, setiap adegan berisi nomor, lokasi, waktu/cuaca, aksi, karakter yang hadir, kondisi kostum/properti, dan durasi perkiraan; F) BREAKDOWN 8 SHOT PERTAMA, setiap shot berisi nomor shot, adegan, durasi, ukuran shot/sudut kamera/gerakan kamera, aksi visual yang dapat difilmkan, dialog jika diperlukan, kondisi kontinuitas, dan prompt video mandiri; G) ATURAN KONTINUITAS KARAKTER, LOKASI, PROPERTI, DAN ALUR WAKTU; H) RENCANA PRODUKSI DAN CATATAN RISIKO.\nJangan mengklaim video sudah dibuat, shot sudah lolos pemeriksaan, atau durasi final sudah pasti. Durasi adalah estimasi naskah; durasi final ditentukan oleh klip yang dipakai di timeline. Hindari pengulangan dan buat setiap shot berbeda secara visual.`
    : `Kamu adalah penulis naskah video profesional yang menulis dalam Bahasa Indonesia alami.\nMode cerita: ${mode}\nMateri dari pengguna: ${input}\n\nBuat hasil yang spesifik terhadap materi pengguna, bukan template generik. Gunakan format:\n1. JUDUL VIRAL\n2. HOOK 3 DETIK PERTAMA\n3. ALUR CERITA 3 BABAK (pengenalan, konflik, penyelesaian/plot twist)\n4. NASKAH VOICEOVER per scene, siap didubbing\n5. PROMPT VISUAL AI per scene, konsisten dengan karakter dan lokasi\n6. CATATAN PRODUKSI singkat.\nUntuk dokumenter/fakta, jangan menyajikan rumor sebagai fakta; tandai klaim yang perlu diverifikasi. Jangan menambahkan label atau penjelasan tentang dirimu.`;

  try {
    const upstream = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(MODEL)}:generateContent`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-goog-api-key': apiKey },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.8, maxOutputTokens: mode === 'film' ? 7000 : 3500 }
      })
    });
    const result = await upstream.json().catch(() => ({}));
    if (!upstream.ok) {
      const safeMessage = result?.error?.message || `Layanan AI merespons dengan status ${upstream.status}.`;
      return new Response(JSON.stringify({ error: safeMessage }), { status: upstream.status === 429 ? 429 : 502, headers: { 'content-type': 'application/json; charset=utf-8' } });
    }
    const text = (result?.candidates?.[0]?.content?.parts || []).map(part => part.text || '').join('\n').trim();
    if (!text) return new Response(JSON.stringify({ error: 'Layanan AI tidak mengembalikan teks. Coba lagi.' }), { status: 502, headers: { 'content-type': 'application/json; charset=utf-8' } });
    return new Response(JSON.stringify({ text, model: MODEL }), {
      status: 200,
      headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }
    });
  } catch {
    return new Response(JSON.stringify({ error: 'Tidak dapat menghubungi layanan AI. Periksa koneksi dan coba lagi.' }), { status: 502, headers: { 'content-type': 'application/json; charset=utf-8' } });
  }
};
