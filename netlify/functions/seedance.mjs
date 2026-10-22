// KreatorHub — generate video: verifikasi login -> potong kredit di server -> panggil penyedia -> refund bila gagal.
// Loopling adapter: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SEEDANCE_API_KEY, SEEDANCE_API_BASE=https://loopling.ai/v1, VIDEO_GEN_ENABLED=true
// Loopling endpoints: POST /video/generations, GET /video/generations/{id}.
const H = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' };
const reply = (d, s = 200) => new Response(JSON.stringify(d), { status: s, headers: H });

// Harga kredit internal Kamisah (sementara); sinkronkan dengan MODELS di video-generator.html.
const PRICE = {
  'seedance-2.0-fast': { minSec: 4, maxSec: 15, perSec: { '480p': 13, '720p': 26 } },
  'seedance-2.0': { minSec: 4, maxSec: 15, perSec: { '480p': 16, '720p': 32, '1080p': 80 } },
  'seedance-2.5': { minSec: 4, maxSec: 30, perSec: { '480p': 24, '720p': 49, '1080p': 120 } }
};
const RATIOS = new Set(['21:9', '16:9', '4:3', '1:1', '3:4', '9:16', 'adaptive']);
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

  // Unggah referensi gambar ke bucket publik Supabase agar Loopling dapat mengambil URL HTTPS.
  if (b.action === 'upload_reference') {
    const dataUrl = String(b.data_url || '');
    const match = dataUrl.match(/^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/=]+)$/);
    if (!match) return reply({ error: 'Format gambar harus JPEG, PNG, atau WebP.' }, 400);
    const ext = match[1] === 'jpeg' ? 'jpg' : match[1];
    const bytes = Buffer.from(match[2], 'base64');
    if (!bytes.length || bytes.length > 5 * 1024 * 1024) return reply({ error: 'Gambar terlalu besar (maksimal 5 MB setelah kompresi).' }, 413);
    const objectPath = `${uid}/${crypto.randomUUID()}.${ext}`;
    const upload = await fetch(`${SU}/storage/v1/object/video-references/${objectPath}`, {
      method: 'POST',
      headers: { apikey: SK, authorization: `Bearer ${SK}`, 'content-type': `image/${match[1]}`, 'x-upsert': 'false' },
      body: bytes
    });
    if (!upload.ok) {
      const detail = await upload.text().catch(() => '');
      return reply({ error: `Gagal mengunggah gambar referensi ke Supabase Storage. ${detail.slice(0,180)}` }, 502);
    }
    return reply({ url: `${SU}/storage/v1/object/public/video-references/${objectPath}` });
  }

  try {
    if (b.action === 'create') {
      const requestedModel = String(b.model || ''), unit = PRICE[requestedModel];
      // Model ID Loopling harus persis seperti ID resmi. Omni bukan model video Loopling.
      const model = requestedModel;
      const prompt = String(b.prompt || '').trim().slice(0, 4000), ratio = String(b.ratio || '16:9');
      const duration = Number(b.duration);
      if (!unit) return reply({ error: requestedModel === 'omni-flash' ? 'Omni tidak tersedia melalui endpoint video Loopling ini.' : 'Model belum tersedia di integrasi Loopling.' }, 400);
      if (!prompt) return reply({ error: 'Prompt wajib diisi.' }, 400);
      if (!RATIOS.has(ratio)) return reply({ error: 'Rasio tidak didukung.' }, 400);
      if (!Number.isInteger(duration) || duration < unit.minSec || duration > unit.maxSec) return reply({ error: `Durasi ${unit.minSec}–${unit.maxSec} detik untuk ${model}.` }, 400);
      const resolutionOptions = model === 'seedance-2.0-fast' ? ['480p', '720p'] : ['480p', '720p', '1080p'];
      const resolution = resolutionOptions.includes(b.resolution) ? b.resolution : '720p';
      if (ratio === '9:16' && model === 'seedance-2.5' && resolution === '1080p') return reply({ error: 'Seedance 2.5 membatasi rasio 9:16 hingga 720p.' }, 400);
      const validUrls = (value, max, label) => {
        if (value == null) return [];
        const arr = Array.isArray(value) ? value : [value];
        if (arr.length > max || arr.some(x => typeof x !== 'string' || x.length > 2048 || !/^https:\/\/[^\s]+$/i.test(x))) throw new Error(`${label}: gunakan maksimal ${max} URL HTTPS publik.`);
        return arr;
      };
      let imageUrls, videoUrls, audioUrls;
      try { imageUrls = validUrls(b.reference_image_urls, requestedModel === 'seedance-2.5' ? 30 : 9, 'Referensi gambar'); videoUrls = validUrls(b.reference_video_urls, 3, 'Referensi video'); audioUrls = validUrls(b.reference_audio_urls, 3, 'Referensi audio'); }
      catch (e) { return reply({ error: e.message }, 400); }
      const firstFrameUrl = b.first_frame_url ? String(b.first_frame_url) : null;
      const lastFrameUrl = b.last_frame_url ? String(b.last_frame_url) : null;
      if (firstFrameUrl && !/^https:\/\/[^\s]+$/i.test(firstFrameUrl)) return reply({ error: 'first_frame_url harus berupa URL HTTPS publik.' }, 400);
      if (lastFrameUrl && (!firstFrameUrl || !/^https:\/\/[^\s]+$/i.test(lastFrameUrl))) return reply({ error: 'last_frame_url memerlukan first_frame_url dan URL HTTPS publik.' }, 400);
      if ((firstFrameUrl || lastFrameUrl) && (imageUrls.length || videoUrls.length || audioUrls.length)) return reply({ error: 'Pilih first/last frame atau referensi, jangan digabung.' }, 400);
      if (audioUrls.length && !imageUrls.length && !videoUrls.length) return reply({ error: 'Referensi audio perlu disertai referensi gambar atau video untuk Seedance 2.0 Fast.' }, 400);

      const cost = Math.ceil(unit.perSec[resolution] * duration);
      const cr = await rpc('charge_credits', { p_user: uid, p_cost: cost, p_model: model });
      if (!cr.ok) { const t = await cr.text(); if (/PHONE_REQUIRED/.test(t)) return reply({ error: 'Verifikasi nomor HP dulu untuk generate.' }, 403); const low = /INSUFFICIENT/.test(t); return reply({ error: low ? 'Saldo kredit tidak cukup.' : 'Gagal memotong kredit.' }, low ? 402 : 500); }
      const jobId = await cr.json();

      try {
        // Kirim permintaan ke endpoint resmi Loopling.
        const res = await fetch(base.replace(/\/$/, '') + '/video/generations', {
          method: 'POST', headers: { ...prov, 'Idempotency-Key': `kamisah-${crypto.randomUUID()}` },
          body: JSON.stringify({ model, prompt, aspect_ratio: ratio, duration, resolution, generate_audio: b.generate_audio !== false, ...(firstFrameUrl ? { first_frame_url: firstFrameUrl } : {}), ...(lastFrameUrl ? { last_frame_url: lastFrameUrl } : {}), ...(imageUrls.length ? { reference_image_urls: imageUrls } : {}), ...(videoUrls.length ? { reference_video_urls: videoUrls } : {}), ...(audioUrls.length ? { reference_audio_urls: audioUrls } : {}) })
        });
        const d = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(d?.error?.message || d?.message || `Penyedia merespons HTTP ${res.status}.`);
        const pid = d.id || d.data?.id;
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
      // Poll status dan URL video dari Loopling.
      const path = `/video/generations/${encodeURIComponent(job.provider_id)}`;
      const res = await fetch(base.replace(/\/$/, '') + path, { headers: prov });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) return reply({ state: 'processing' }); // gangguan sementara: coba lagi di polling berikutnya
      const s = String(d.status || '').toLowerCase();
      const url = d.video?.url || null;
      if (s === 'succeeded') {
        if (!url) return reply({ state: 'processing' }); // tunggu URL hasil tersedia; timeout akan mengembalikan kredit
        await patchJob(id, { status: 'done' }); return reply({ state: 'done', url });
      }
      if (s === 'failed') { await rpc('refund_job', { p_job: id }); return reply({ state: 'failed', error: (d.error?.message || d.message || 'Pembuatan video gagal.') + ' Kredit dikembalikan.' }); }
      return reply({ state: 'processing' });
    }
    return reply({ error: 'Aksi tidak dikenal.' }, 400);
  } catch { return reply({ error: 'Terjadi gangguan di server.' }, 502); }
};
