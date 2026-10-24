// Kamisah — generate video: verifikasi login -> potong kredit di server -> panggil penyedia -> refund bila gagal.
// Loopling adapter: credentials and provider endpoint are read from Netlify environment variables.
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


// Periksa tautan video dari penyedia: redirect, status, Content-Type, dukungan Range, dan tanda tangan file (MP4/WebM).
// Hanya membaca ~4 KB pertama; hasilnya dikirim ke frontend sebagai `diag` agar penyebab gagal-putar bisa dilihat, bukan ditebak.
async function probeVideo(raw) {
  const diag = { checked: true };
  let u;
  try { u = new URL(raw); } catch { return { ...diag, ok: false, reason: 'URL hasil tidak valid.' }; }
  if (u.protocol === 'http:') { u.protocol = 'https:'; diag.upgradedToHttps = true; }
  if (u.protocol !== 'https:') return { ...diag, ok: false, reason: 'URL hasil bukan HTTPS.' };
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 8000);
  try {
    const r = await fetch(u.href, { headers: { range: 'bytes=0-4095' }, redirect: 'follow', signal: ctl.signal });
    diag.status = r.status;
    diag.finalHost = (() => { try { return new URL(r.url).host; } catch { return null; } })();
    diag.redirected = !!r.redirected;
    diag.contentType = r.headers.get('content-type');
    diag.acceptRanges = r.headers.get('accept-ranges');
    diag.rangeSupported = r.status === 206;
    const cr = r.headers.get('content-range'), cl = r.headers.get('content-length');
    diag.totalBytes = cr && /\/(\d+)$/.test(cr) ? Number(cr.match(/\/(\d+)$/)[1]) : (r.status === 200 && cl ? Number(cl) : null);
    diag.ok = r.status === 200 || r.status === 206;
    // Baca paling banyak 4 KB lalu hentikan (server yang mengabaikan Range tidak membuat kita mengunduh seluruh file).
    const reader = r.body?.getReader();
    const head = new Uint8Array(4096); let n = 0;
    if (reader) {
      while (n < head.length) { const { done, value } = await reader.read(); if (done) break; const take = Math.min(value.length, head.length - n); head.set(value.subarray(0, take), n); n += take; }
      try { await reader.cancel(); } catch {}
    }
    const b = head.subarray(0, n);
    const ascii = (a, z) => String.fromCharCode(...b.subarray(a, z));
    diag.mp4 = n >= 12 && ascii(4, 8) === 'ftyp';
    if (diag.mp4) diag.brand = ascii(8, 12);
    diag.webm = n >= 4 && b[0] === 0x1a && b[1] === 0x45 && b[2] === 0xdf && b[3] === 0xa3;
    diag.looksLikeVideo = diag.mp4 || diag.webm;
    if (diag.ok && !diag.looksLikeVideo) diag.reason = 'Isi file bukan MP4/WebM (mungkin halaman error atau format lain).';
    if (!diag.ok) diag.reason = `Penyedia membalas HTTP ${r.status} untuk tautan video.`;
  } catch (e) {
    diag.ok = false; diag.reason = e.name === 'AbortError' ? 'Tautan video tidak merespons dalam 8 detik.' : 'Server tidak dapat menjangkau tautan video.';
  } finally { clearTimeout(timer); }
  return diag;
}

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

      // Kunci idempotensi dibuat di klien dan dipakai ulang pada setiap percobaan ulang permintaan yang sama.
      const idemKey = String(b.idempotency_key || '');
      if (!UUID.test(idemKey)) return reply({ error: 'idempotency_key (UUID) wajib dikirim. Muat ulang halaman lalu coba lagi.' }, 400);

      const cost = Math.ceil(unit.perSec[resolution] * duration);
      const cr = await rpc('charge_credits', { p_user: uid, p_cost: cost, p_model: model, p_key: idemKey });
      if (!cr.ok) { const t = await cr.text(); if (/PHONE_REQUIRED/.test(t)) return reply({ error: 'Verifikasi nomor HP dulu untuk generate.' }, 403); const low = /INSUFFICIENT/.test(t); return reply({ error: low ? 'Saldo kredit tidak cukup.' : 'Gagal memotong kredit.' }, low ? 402 : 500); }
      const row = (await cr.json().catch(() => null)) || {};
      const chargeRow = Array.isArray(row) ? row[0] : row;
      const jobId = chargeRow?.job_id, replayed = chargeRow?.replayed === true;
      if (!jobId) return reply({ error: 'Gagal memotong kredit.' }, 500);

      if (replayed) {
        // Permintaan yang sama dikirim ulang: JANGAN memotong lagi. Lanjutkan hanya bila job belum sampai ke penyedia.
        const jr = await sb(`/rest/v1/jobs?id=eq.${jobId}&user_id=eq.${uid}&select=provider_id,status,refunded,created_at`);
        const j0 = jr.ok ? (await jr.json())[0] : null;
        if (!j0) return reply({ error: 'Job tidak ditemukan.' }, 404);
        if (j0.refunded || j0.status === 'failed') return reply({ error: 'Permintaan sebelumnya gagal dan kredit sudah dikembalikan. Generate ulang untuk mencoba lagi.' }, 409);
        if (j0.provider_id || j0.status === 'done') return reply({ id: jobId, replayed: true });
        // Belum ada provider_id: permintaan pertama mungkin masih berjalan. Tunggu 45 detik sebelum mengirim ulang ke penyedia.
        if (Date.now() - Date.parse(j0.created_at) < 45000) return reply({ id: jobId, replayed: true });
      }

      try {
        // Kirim permintaan ke endpoint resmi Loopling.
        const res = await fetch(base.replace(/\/$/, '') + '/video/generations', {
          method: 'POST', headers: { ...prov, 'Idempotency-Key': `kamisah-${jobId}` },
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
        await patchJob(id, { status: 'done' });
        const safeUrl = String(url).replace(/^http:\/\//i, 'https://');
        return reply({ state: 'done', url: safeUrl, diag: await probeVideo(safeUrl) });
      }
      if (s === 'failed') { await rpc('refund_job', { p_job: id }); return reply({ state: 'failed', error: (d.error?.message || d.message || 'Pembuatan video gagal.') + ' Kredit dikembalikan.' }); }
      return reply({ state: 'processing' });
    }
    return reply({ error: 'Aksi tidak dikenal.' }, 400);
  } catch { return reply({ error: 'Terjadi gangguan di server.' }, 502); }
};
