// Chat AI teman curhat. ENV: GEMINI_API_KEY (opsional GEMINI_CHAT_MODEL), SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
// Percakapan TIDAK disimpan di server (riwayat hanya di perangkat pengguna dan dikirim per permintaan).
import { guard, json } from './lib/guard.mjs';
const SU = process.env.SUPABASE_URL, SK = process.env.SUPABASE_SERVICE_ROLE_KEY;
const rpc = (fn, a) => fetch(SU + '/rest/v1/rpc/' + fn, { method: 'POST', headers: { apikey: SK, authorization: 'Bearer ' + SK, 'content-type': 'application/json' }, body: JSON.stringify(a) });
const SYS = `Kamu adalah teman curhat berbahasa Indonesia yang hangat, sabar, dan natural, seperti sahabat yang baik mendengarkan. Gunakan bahasa santai yang sopan, jawaban singkat sampai sedang (biasanya 2-6 kalimat), dan tanyakan satu hal ringan jika perlu. Ikuti konteks percakapan sebelumnya. Boleh bantu soal asmara, keseharian, dan membuat prompt untuk AI. Jangan menghakimi, jangan mengaku sebagai psikolog atau dokter, dan jangan memberi diagnosis. Jika pengguna menyebut ingin menyakiti diri atau mengakhiri hidup, tanggapi dengan empati, tanyakan apakah dia aman saat ini, dorong dia menghubungi orang terdekat yang dipercaya atau layanan darurat/profesional setempat, dan tetap menemaninya bicara. Jangan memberi cara menyakiti diri atau orang lain.`;

export default async (req) => {
  if (req.method !== 'POST') return json({ error: 'Gunakan metode POST.' }, 405);
  if (!SU || !SK) return json({ error: 'Chat AI butuh akun dan kredit (Supabase belum dipasang).' }, 503);
  const key = process.env.GEMINI_API_KEY;
  if (!key) return json({ error: 'Layanan AI belum dikonfigurasi oleh admin.' }, 503);
  const g = await guard(req, 'chat', 60, 3600);
  if (g instanceof Response) return g;

  let b; try { b = await req.json(); } catch { return json({ error: 'Data tidak valid.' }, 400); }
  const id = String(b.msg_id || '');
  if (!/^[0-9a-f-]{36}$/i.test(id)) return json({ error: 'ID pesan tidak valid.' }, 400);
  const turns = [];
  for (const m of (Array.isArray(b.messages) ? b.messages.slice(-20) : [])) {
    const role = m.role === 'assistant' ? 'model' : m.role === 'user' ? 'user' : null;
    const text = String(m.content || '').trim().slice(0, 2000);
    if (!role || !text) continue;
    if (turns.length && turns[turns.length - 1].role === role) turns[turns.length - 1].parts[0].text += '\n' + text;
    else turns.push({ role, parts: [{ text }] });
  }
  if (!turns.length || turns[turns.length - 1].role !== 'user') return json({ error: 'Pesan kosong.' }, 400);

  const c = await rpc('charge_chat', { p_user: g.uid, p_msg: id });
  if (!c.ok) {
    const t = await c.text(), low = /INSUFFICIENT/.test(t);
    if (/DUPLICATE/.test(t)) return json({ error: 'Pesan ini sudah diproses.' }, 409);
    return json({ error: low ? 'Saldo kredit tidak cukup. Top-up dulu di halaman Akun.' : 'Gagal memotong kredit.' }, low ? 402 : 500);
  }
  const charged = (await c.json()) === true; // hanya refund bila request INI yang memotong kredit
  try {
    const model = process.env.GEMINI_CHAT_MODEL || process.env.GEMINI_MODEL || 'gemini-2.5-flash';
    const up = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
      method: 'POST', headers: { 'content-type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify({ systemInstruction: { parts: [{ text: SYS }] }, contents: turns, generationConfig: { temperature: 0.9, maxOutputTokens: 700 } })
    });
    const d = await up.json().catch(() => ({}));
    const text = (d?.candidates?.[0]?.content?.parts || []).map((p) => p.text || '').join('').trim();
    if (!up.ok || !text) throw new Error('kosong');
    return json({ text });
  } catch {
    if (charged) await rpc('refund_chat', { p_user: g.uid, p_msg: id });
    return json({ error: 'AI sedang bermasalah. Kredit dikembalikan, coba kirim lagi.' }, 502);
  }
};
