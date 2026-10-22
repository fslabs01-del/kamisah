// Penjaga bersama untuk fungsi AI: wajib login (jika Supabase dipasang) + batas pemakaian per pengguna.
// Jika Supabase BELUM dipasang: hanya batas per IP (best-effort, per instance server; bukan perlindungan penuh).
const SU = process.env.SUPABASE_URL, SK = process.env.SUPABASE_SERVICE_ROLE_KEY;
const sbf = (p, i = {}) => fetch(SU + p, { ...i, headers: { apikey: SK, authorization: 'Bearer ' + SK, 'content-type': 'application/json', ...(i.headers || {}) } });
export const json = (d, s = 200) => new Response(JSON.stringify(d), { status: s, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });
const mem = new Map();

// Mengembalikan { uid } bila boleh lanjut, atau Response (401/429/503) bila ditolak.
export async function guard(req, key, max, secs) {
  if (SU && SK) {
    const t = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
    if (!t) return json({ error: 'Silakan masuk dulu untuk memakai fitur ini.' }, 401);
    const r = await sbf('/auth/v1/user', { headers: { authorization: 'Bearer ' + t } });
    const uid = r.ok ? (await r.json()).id : null;
    if (!uid) return json({ error: 'Sesi tidak valid. Masuk ulang.' }, 401);
    const h = await sbf('/rest/v1/rpc/hit_limit', { method: 'POST', body: JSON.stringify({ p_user: uid, p_key: key, p_max: max, p_secs: secs }) });
    if (!h.ok) return json({ error: 'Pembatas permintaan belum siap (jalankan supabase/schema-3.sql).' }, 503);
    if ((await h.json()) === false) return json({ error: 'Terlalu banyak permintaan. Coba lagi nanti.' }, 429);
    return { uid };
  }
  const ip = req.headers.get('x-nf-client-connection-ip') || (req.headers.get('x-forwarded-for') || '?').split(',')[0].trim();
  const k = key + '|' + ip, now = Date.now(), a = (mem.get(k) || []).filter((x) => now - x < secs * 1000);
  if (a.length >= max) return json({ error: 'Terlalu banyak permintaan. Coba lagi nanti.' }, 429);
  a.push(now); mem.set(k, a); if (mem.size > 5000) mem.clear();
  return { uid: null };
}
