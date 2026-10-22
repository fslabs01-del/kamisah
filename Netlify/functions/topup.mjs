// Buat tagihan QRIS dinamis. ENV: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, PAY_API_BASE, PAY_API_KEY
// "SESUAIKAN" = cocokkan dengan dokumentasi payment gateway pilihanmu (Midtrans/Xendit/dll).
const H = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' };
const reply = (d, s = 200) => new Response(JSON.stringify(d), { status: s, headers: H });
const MIN_AMOUNT = 10000;
const MAX_AMOUNT = 10000000; // batas aman aplikasi: Rp10 juta per tagihan
const SU = process.env.SUPABASE_URL, SK = process.env.SUPABASE_SERVICE_ROLE_KEY;
const sb = (path, init = {}) => fetch(SU + path, { ...init, headers: { apikey: SK, authorization: 'Bearer ' + SK, 'content-type': 'application/json', ...(init.headers || {}) } });

export default async (req) => {
  if (req.method !== 'POST') return reply({ error: 'Gunakan metode POST.' }, 405);
  const base = process.env.PAY_API_BASE, key = process.env.PAY_API_KEY;
  if (process.env.PAYMENTS_ENABLED !== 'true') return reply({ error: 'Pembayaran QRIS belum diaktifkan. Integrasi gateway perlu disesuaikan dan diuji dahulu.' }, 503);
  if (!base || !key || !SU || !SK) return reply({ error: 'Pembayaran belum dikonfigurasi.' }, 503);
  const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  const ur = token ? await sb('/auth/v1/user', { headers: { authorization: 'Bearer ' + token } }) : null;
  const uid = ur && ur.ok ? (await ur.json()).id : null;
  if (!uid) return reply({ error: 'Silakan masuk dulu.' }, 401);
  let b; try { b = await req.json(); } catch { return reply({ error: 'Data tidak valid.' }, 400); }
  const amount = Number(b.amount);
  if (!Number.isSafeInteger(amount) || amount < MIN_AMOUNT || amount > MAX_AMOUNT || amount % 100 !== 0) {
    return reply({ error: 'Nominal harus Rp10.000 sampai Rp10.000.000 dan kelipatan Rp100.' }, 400);
  }

  const ins = await sb('/rest/v1/topups', { method: 'POST', headers: { prefer: 'return=representation' }, body: JSON.stringify({ user_id: uid, amount_idr: amount, credits: amount / 100 }) });
  const row = ins.ok ? (await ins.json())[0] : null;
  if (!row) return reply({ error: 'Gagal membuat tagihan.' }, 500);
  const fail = async (m) => { await sb(`/rest/v1/topups?id=eq.${row.id}`, { method: 'PATCH', body: JSON.stringify({ status: 'failed' }) }); return reply({ error: m }, 502); };
  try {
    // SESUAIKAN: endpoint & field pembuatan QRIS. order_id = id tagihan kita (dipakai webhook untuk mencocokkan).
    const res = await fetch(base + (process.env.PAY_CREATE_PATH || '/qris'), { method: 'POST', headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' }, body: JSON.stringify({ order_id: row.id, amount }) });
    const d = await res.json().catch(() => ({}));
    const qr = d.qr_url || d.qr?.url || d.actions?.[0]?.url;
    if (!res.ok || !qr) return fail('Gateway tidak mengembalikan QRIS.');
    const exp = d.expires_at || new Date(Date.now() + 15 * 60000).toISOString();
    await sb(`/rest/v1/topups?id=eq.${row.id}`, { method: 'PATCH', body: JSON.stringify({ provider_ref: row.id, qr_url: qr, expires_at: exp }) });
    return reply({ id: row.id, qr_url: qr, expires_at: exp, credits: amount / 100 });
  } catch { return fail('Tidak dapat menghubungi gateway.'); }
};
