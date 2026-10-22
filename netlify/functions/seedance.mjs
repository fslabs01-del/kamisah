// KreatorHub — generate video: verifikasi login -> potong kredit di server -> panggil penyedia -> refund bila gagal.
// ENV Netlify: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SEEDANCE_API_KEY, SEEDANCE_API_BASE, VIDEO_GEN_ENABLED=true
// Opsional: SEEDANCE_CREATE_PATH (/videos), SEEDANCE_STATUS_PATH (/videos/{id})
// "SESUAIKAN" = bagian yang harus dicocokkan dengan dokumentasi penyedia API.
const H = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' };
const reply = (d, s = 200) => new Response(JSON.stringify(d), { status: s, headers: H });

// Harga RESMI ada di sini (klien hanya menampilkan). Sinkronkan dgn MODELS di video-generator.html. Angka = sementara.
const PRICE = { 'omni-flash': { per: 10 }, 'seedance-2.0-fast': { perSec: 20, maxSec: 15 } };
const RATIOS = new Set(['16:9', '9:16', '1:1']);
const MAX_IMAGE = 5000000; // batas body Netlify Functions ±6 MB
const UUID = /^[0-9a-f-]{36}$/i;

const SU = process.env.SUPABASE_URL, SK = process.env.SUPABASE_SERVICE_ROLE_KEY;
const sb = (path, init = {}) => fetch(SU + path, { ...init, headers: { apikey: SK, authorization: 'Bearer ' + SK, 'content-type': 'application/json', ...(init.headers || {}) } });
const rpc = (fn, args) => sb('/rest/v1/rpc/' + fn, { method: 'POST', body: JSON.stringify(args) });
const patchJob = (id, body) => sb(`/rest/v1/jobs?id=eq.${id}`, { method: 'PATCH', body: JSON.stringify(body) });

export default async (req) => {
  if (req.method !== 'POST') return reply({ error: 'Gunakan metode POST.' }, 405);
  if (process.env.VIDEO_GEN_ENABLED !== 'true') return reply({ error: 'Generator video belum dibuka.' }, 503);
  const key = process.env.SEEDANCE_API_KEY, base = process.env.SEEDANCE_API_BASE;
  if (!key || !base || !SU || !SK) return reply({ error: 'Backend belum dikonfigurasi.' }, 503);

  const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  if (!token) return reply({ error: 'Silakan masuk dulu.' }, 401);
  const ur = await sb('/auth/v1/user', { headers: { authorization: 'Bearer ' + token } });
  const uid = ur.ok ? (await ur.json()).id : null;
  if (!uid) return reply({ error: 'Sesi tidak valid. Masuk ulang.' }, 401);

  let b; try { b = await req.json(); } catch { return reply({ error: 'Data permintaan tidak valid.' }, 400); }
  const prov = { authorization: `Bearer ${key}`, 'content-type': 'application/json' };

  try {
    if (b.action === 'create') {
      const model = String(b.model || ''), unit = PRICE[model];
      const prompt = String(b.prompt || '').trim().slice(0, 2000), ratio = String(b.ratio || '');
      const duration = Number(b.duration);
      if (!unit) return reply({ error: 'Model belum tersedia.' }, 400);
      if (!prompt) return reply({ error: 'Prompt wajib diisi.' }, 400);
      if (!RATIOS.has(ratio)) return reply({ error: 'Rasio tidak didukung.' }, 400);
      if (unit.maxSec && (!Number.isInteger(duration) || duration < 3 || duration > unit.maxSec)) return reply({ error: `Durasi 3–${unit.maxSec} detik.` }, 400);
      const resolution = ['360p', '720p'].includes(b.resolution) ? b.resolution : undefined;
      const videoUrl = b.video_url ? String(b.video_url) : null;
      if (videoUrl && !/^https:\/\/\S{5,2000}$/.test(videoUrl)) return reply({ error: 'Tautan video tidak valid.' }, 400);
      const image = b.image ? String(b.image) : null;
      if (image && (!/^data:image\/(jpeg|png|webp);base64,/.test(image) || image.length > MAX_IMAGE)) return reply({ error: 'Gambar tidak valid atau terlalu besar.' }, 400);

      const cost = unit.per ?? unit.perSec * duration;
      const cr = await rpc('charge_credits', { p_user: uid, p_cost: cost, p_model: model });
      if (!cr.ok) { const t = await cr.text(); if (/PHONE_REQUIRED/.test(t)) return reply({ error: 'Verifikasi nomor HP dulu untuk generate.' }, 403); const low = /INSUFFICIENT/.test(t); return reply({ error: low ? 'Saldo kredit tidak cukup.' : 'Gagal memotong kredit.' }, low ? 402 : 500); }
      const jobId = await cr.json();

      try {
        // SESUAIKAN: path dan field sesuai dokumentasi penyedia.
        const res = await fetch(base + (process.env.SEEDANCE_CREATE_PATH || '/videos'), {
          method: 'POST', headers: prov,
          body: JSON.stringify({ model, prompt, aspect_ratio: ratio, ...(unit.maxSec ? { duration } : {}), ...(resolution ? { resolution } : {}), ...(image ? { image } : {}), ...(videoUrl ? { video_url: videoUrl } : {}) })
        });
        const d = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(d?.error?.message || d?.message || `Penyedia merespons HTTP ${res.status}.`);
        const pid = d.id || d.task_id || d.data?.id;
        if (!pid) throw new Error('Penyedia tidak mengembalikan ID tugas.');
        await patchJob(jobId, { provider_id: String(pid) });
        return reply({ id: jobId });
      } catch (e) {
        await rpc('refund_job', { p_job: jobId }); // kredit kembali otomatis
        return reply({ error: (e.message || 'Gagal menghubungi penyedia.') + ' Kredit dikembalikan.' }, 502);
      }
    }

    if (b.action === 'status') {
      const id = String(b.id || '');
      if (!UUID.test(id)) return reply({ error: 'ID tidak valid.' }, 400);
      const jr = await sb(`/rest/v1/jobs?id=eq.${id}&user_id=eq.${uid}&select=provider_id,status,created_at`);
      const job = jr.ok ? (await jr.json())[0] : null;
      if (!job) return reply({ error: 'Job tidak ditemukan.' }, 404);
      if (job.status === 'failed') return reply({ state: 'failed', error: 'Pembuatan video gagal. Kredit dikembalikan.' });
      if (Date.now() - Date.parse(job.created_at) > 20 * 60 * 1000 && job.status === 'processing') {
        await rpc('refund_job', { p_job: id });
        return reply({ state: 'failed', error: 'Waktu habis. Kredit dikembalikan.' });
      }
      if (!job.provider_id) return reply({ state: 'processing' });
      // SESUAIKAN: path status & nama field hasil.
      const path = (process.env.SEEDANCE_STATUS_PATH || '/videos/{id}').replace('{id}', encodeURIComponent(job.provider_id));
      const res = await fetch(base + path, { headers: prov });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) return reply({ state: 'processing' }); // gangguan sementara: coba lagi di polling berikutnya
      const s = String(d.status || d.data?.status || '').toLowerCase();
      const url = d.video_url || d.output?.url || d.content?.video_url || d.data?.video_url || null;
      if (['succeeded', 'success', 'completed', 'done'].includes(s)) {
        if (!url) return reply({ state: 'processing' }); // tunggu URL hasil tersedia; timeout akan mengembalikan kredit
        await patchJob(id, { status: 'done' }); return reply({ state: 'done', url });
      }
      if (['failed', 'error', 'cancelled', 'canceled'].includes(s)) { await rpc('refund_job', { p_job: id }); return reply({ state: 'failed', error: (d.error?.message || d.message || 'Pembuatan video gagal.') + ' Kredit dikembalikan.' }); }
      return reply({ state: 'processing' });
    }
    return reply({ error: 'Aksi tidak dikenal.' }, 400);
  } catch { return reply({ error: 'Terjadi gangguan di server.' }, 502); }
};
