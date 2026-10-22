// Penerima notifikasi pembayaran. ENV: PAY_WEBHOOK_SECRET (+ SUPABASE_*).
// PENTING: skema tanda tangan tiap gateway BERBEDA. Bagian "SESUAIKAN" di bawah hanya contoh generik
// (HMAC-SHA256 dari body mentah di header x-signature) dan HARUS diganti sesuai dokumentasi gateway-mu.
// Selama PAY_WEBHOOK_SECRET kosong, semua permintaan ditolak.
import { createHmac, timingSafeEqual } from 'node:crypto';
const ok = (s = 200, m = 'ok') => new Response(m, { status: s });

export default async (req) => {
  const secret = process.env.PAY_WEBHOOK_SECRET;
  if (process.env.PAYMENTS_ENABLED !== 'true' || req.method !== 'POST' || !secret) return ok(503, 'nonaktif');
  const raw = await req.text();
  // SESUAIKAN: nama header & algoritma tanda tangan.
  const got = Buffer.from(req.headers.get('x-signature') || '', 'utf8');
  const want = Buffer.from(createHmac('sha256', secret).update(raw).digest('hex'), 'utf8');
  if (got.length !== want.length || !timingSafeEqual(got, want)) return ok(401, 'tanda tangan salah');

  let d; try { d = JSON.parse(raw); } catch { return ok(400, 'bad'); }
  const paid = ['paid', 'settlement', 'success', 'completed'].includes(String(d.status || '').toLowerCase());
  const order = String(d.order_id || ''), amount = Number(d.amount);
  if (!paid) return ok(200, 'diabaikan');
  if (!/^[0-9a-f-]{36}$/i.test(order) || !Number.isInteger(amount)) return ok(400, 'bad');
  // Nominal harus sama persis dengan tagihan; konfirmasi idempoten di database.
  const r = await fetch(process.env.SUPABASE_URL + '/rest/v1/rpc/confirm_topup', { method: 'POST',
    headers: { apikey: process.env.SUPABASE_SERVICE_ROLE_KEY, authorization: 'Bearer ' + process.env.SUPABASE_SERVICE_ROLE_KEY, 'content-type': 'application/json' },
    body: JSON.stringify({ p_ref: order, p_idr: amount }) });
  return r.ok ? ok() : ok(500, 'gagal');
};
