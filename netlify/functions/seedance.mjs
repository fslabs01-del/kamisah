// KreatorHub — generate video: verifikasi login -> potong kredit di server -> panggil penyedia -> refund bila gagal.
// Loopling adapter: credentials and provider endpoint are read from Netlify environment variables.
// Loopling endpoints: POST /video/generations, GET /video/generations/{id}.
const H = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' };
const reply = (d, s = 200) => new Response(JSON.stringify(d), { status: s, headers: H });

// Harga kredit internal Kamisah (sementara); sinkronkan dengan MODELS di video-generator.html.
const PRICE = {
  'omni-flash': { minSec: 3, maxSec: 10, perSec: { '360p': 50, '720p': 50, '1080p': 50, '4k': 50 } },
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
  if ((!key || !base) && !process.env.GEMINI_API_KEY) return reply({ error: 'Backend belum dikonfigurasi.' }, 503);
  if (!SU || !SK) return reply({ error: 'Backend Supabase belum dikonfigurasi.' }, 503);

  const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  if (!token) return reply({ error: 'Silakan masuk dulu.' }, 401);
  const ur = await sb('/auth/v1/user', { headers: { authorization: 'Bearer ' + token } });
  const uid = ur.ok ? (await ur.json()).id : null;
  if (!uid) return reply({ error: 'Sesi tidak valid. Masuk ulang.' }, 401);

  let b; try { b = await req.json(); } catch { return reply({ error: 'Data permintaan tidak valid.' }, 400); }
  const prov = { authorization: `Bearer ${key}`, 'content-type': 'application/json' };
  const geminiKey = process.env.GEMINI_API_KEY;

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

  // Video reference upload: small user uploads only; generated videos can be referenced by their existing HTTPS URL.
  if (b.action === 'upload_reference_video') {
    const dataUrl = String(b.data_url || '');
    const match = dataUrl.match(/^data:video\/(mp4|webm|quicktime);base64,([A-Za-z0-9+/=]+)$/);
    if (!match) return reply({ error: 'Format video referensi harus MP4, WebM, atau MOV.' }, 400);
    const mime = match[1] === 'quicktime' ? 'video/quicktime' : `video/${match[1]}`;
    const ext = match[1] === 'quicktime' ? 'mov' : match[1];
    const bytes = Buffer.from(match[2], 'base64');
    if (!bytes.length || bytes.length > 3 * 1024 * 1024) return reply({ error: 'Video referensi unggahan maksimal 3 MB. Untuk video lebih besar, gunakan hasil video yang sudah tersimpan online.' }, 413);
    const objectPath = `${uid}/${crypto.randomUUID()}.${ext}`;
    const upload = await fetch(`${SU}/storage/v1/object/video-references/${objectPath}`, {
      method: 'POST',
      headers: { apikey: SK, authorization: `Bearer ${SK}`, 'content-type': mime, 'x-upsert': 'false' },
      body: bytes
    });
    if (!upload.ok) {
      const detail = await upload.text().catch(() => '');
      return reply({ error: `Gagal mengunggah video referensi ke Supabase Storage. ${detail.slice(0,180)}` }, 502);
    }
    return reply({ url: `${SU}/storage/v1/object/public/video-references/${objectPath}` });
  }

  try {
    if (b.action === 'create') {
      const requestedModel = String(b.model || ''), unit = PRICE[requestedModel];
      const model = requestedModel;
      const prompt = String(b.prompt || '').trim().slice(0, 4000), ratio = String(b.ratio || '16:9');
      const duration = Number(b.duration);
      if (!unit) return reply({ error: 'Model belum tersedia di integrasi video.' }, 400);
      if (model === 'omni-flash' && !geminiKey) return reply({ error: 'Omni memerlukan GEMINI_API_KEY di Netlify.' }, 503);
      if (model !== 'omni-flash' && (!key || !base)) return reply({ error: 'Seedance memerlukan SEEDANCE_API_KEY dan SEEDANCE_API_BASE di Netlify.' }, 503);
      if (!prompt) return reply({ error: 'Prompt wajib diisi.' }, 400);
      if (!RATIOS.has(ratio)) return reply({ error: 'Rasio tidak didukung.' }, 400);
      if (!Number.isInteger(duration) || duration < unit.minSec || duration > unit.maxSec) return reply({ error: `Durasi ${unit.minSec}–${unit.maxSec} detik untuk ${model}.` }, 400);
      const resolutionOptions = model === 'omni-flash' ? ['360p','720p','1080p','4k'] : model === 'seedance-2.0-fast' ? ['480p', '720p'] : ['480p', '720p', '1080p'];
      const resolution = resolutionOptions.includes(b.resolution) ? b.resolution : '720p';
      if (ratio === '9:16' && model === 'seedance-2.5' && resolution === '1080p') return reply({ error: 'Seedance 2.5 membatasi rasio 9:16 hingga 720p.' }, 400);
      const validUrls = (value, max, label) => {
        if (value == null) return [];
        const arr = Array.isArray(value) ? value : [value];
        if (arr.length > max || arr.some(x => typeof x !== 'string' || x.length > 2048 || !/^https:\/\/[^\s]+$/i.test(x))) throw new Error(`${label}: gunakan maksimal ${max} URL HTTPS publik.`);
        return arr;
      };
      let imageUrls, videoUrls, audioUrls;
      try { imageUrls = validUrls(b.reference_image_urls, requestedModel === 'seedance-2.5' ? 30 : 9, 'Referensi gambar'); videoUrls = validUrls(b.reference_video_urls, requestedModel === 'seedance-2.5' ? 10 : 3, 'Referensi video'); audioUrls = validUrls(b.reference_audio_urls, requestedModel === 'seedance-2.5' ? 10 : 3, 'Referensi audio'); }
      catch (e) { return reply({ error: e.message }, 400); }
      if (model === 'omni-flash' && (videoUrls.length || audioUrls.length)) return reply({ error: 'Omni saat ini menerima teks dan referensi gambar; gunakan Seedance untuk referensi video/audio.' }, 400);
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
        let res, d;
        if (model === 'omni-flash') {
          if (imageUrls.length > 3) throw new Error('Omni maksimal 3 gambar referensi.');
          const input = [];
          for (const url of imageUrls) {
            const ir = await fetch(url);
            if (!ir.ok) throw new Error('Gagal membaca gambar referensi Omni.');
            const ct = (ir.headers.get('content-type') || 'image/jpeg').split(';')[0];
            if (!['image/jpeg','image/png','image/webp'].includes(ct)) throw new Error('Format referensi Omni harus JPEG, PNG, atau WebP.');
            const bytes = Buffer.from(await ir.arrayBuffer());
            if (bytes.length > 8 * 1024 * 1024) throw new Error('Gambar referensi Omni maksimal 8 MB.');
            input.push({ type: 'image', data: bytes.toString('base64'), mime_type: ct });
          }
          input.push({ type: 'text', text: `${prompt}
Generate a ${duration}-second video. Use aspect ratio ${ratio}.` });
          res = await fetch('https://generativelanguage.googleapis.com/v1beta/interactions?key=' + encodeURIComponent(geminiKey), {
            method: 'POST', headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ model: 'gemini-omni-1.1-flash', input, background: true, response_format: { type: 'video', aspect_ratio: ratio, resolution } })
          });
          d = await res.json().catch(() => ({}));
        } else {
          res = await fetch(base.replace(/\/$/, '') + '/video/generations', {
            method: 'POST', headers: { ...prov, 'Idempotency-Key': `kamisah-${crypto.randomUUID()}` },
            body: JSON.stringify({ model, prompt, aspect_ratio: ratio, duration, resolution, generate_audio: b.generate_audio !== false, ...(firstFrameUrl ? { first_frame_url: firstFrameUrl } : {}), ...(lastFrameUrl ? { last_frame_url: lastFrameUrl } : {}), ...(imageUrls.length ? { reference_image_urls: imageUrls } : {}), ...(videoUrls.length ? { reference_video_urls: videoUrls } : {}), ...(audioUrls.length ? { reference_audio_urls: audioUrls } : {}) })
          });
          d = await res.json().catch(() => ({}));
        }
        if (!res.ok) throw new Error(d?.error?.message || d?.message || `Penyedia merespons HTTP ${res.status}.`);
        const pid = d.id || d.data?.id;
        if (!pid) throw new Error('Penyedia tidak mengembalikan ID tugas.');
        await patchJob(jobId, { provider_id: (model === 'omni-flash' ? 'omni:' : 'loopling:') + String(pid) });
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
      // Polling provider: Gemini Omni atau Loopling Seedance.
      const isOmni = String(job.provider_id || '').startsWith('omni:');
      const providerId = String(job.provider_id || '').replace(/^(omni:|loopling:)/, '');
      const res = isOmni
        ? await fetch('https://generativelanguage.googleapis.com/v1beta/interactions/' + encodeURIComponent(providerId) + '?key=' + encodeURIComponent(geminiKey || ''), { headers: { 'Api-Revision': '2026-05-20' } })
        : await fetch(base.replace(/\/$/, '') + `/video/generations/${encodeURIComponent(providerId)}`, { headers: prov });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) return reply({ state: 'processing' });
      const s = String(d.status || '').toLowerCase();
      let url = d.video?.url || null;
      if (isOmni && s === 'completed') {
        const findVideo = (o) => { if (!o || typeof o !== 'object') return null; if (typeof o.data === 'string' && (o.mime_type || o.mimeType || '').toLowerCase().startsWith('video/')) return { data:o.data, mime:o.mime_type || o.mimeType }; for (const v of Object.values(o)) { const got = findVideo(v); if (got) return got; } return null; };
        const video = findVideo(d);
        if (video) {
          const bytes = Buffer.from(video.data, 'base64');
          if (bytes.length > 100 * 1024 * 1024) { await rpc('refund_job', { p_job:id }); return reply({ state:'failed', error:'Hasil Omni terlalu besar untuk disimpan. Kredit dikembalikan.' }); }
          const objectPath = `${uid}/${crypto.randomUUID()}.mp4`;
          const up = await fetch(`${SU}/storage/v1/object/video-references/${objectPath}`, { method:'POST', headers:{ apikey:SK, authorization:'Bearer '+SK, 'content-type':'video/mp4', 'x-upsert':'false' }, body:bytes });
          if (up.ok) url = `${SU}/storage/v1/object/public/video-references/${objectPath}`;
        }
      }
      if ((s === 'succeeded' || (isOmni && s === 'completed')) && url) {
        await patchJob(id, { status: 'done' }); return reply({ state: 'done', url });
      }
      if (s === 'failed' || s === 'cancelled' || s === 'incomplete') { await rpc('refund_job', { p_job: id }); return reply({ state: 'failed', error: (d.error?.message || d.message || 'Pembuatan video gagal.') + ' Kredit dikembalikan.' }); }
      return reply({ state: 'processing' });
    }
    return reply({ error: 'Aksi tidak dikenal.' }, 400);
  } catch { return reply({ error: 'Terjadi gangguan di server.' }, 502); }
};
