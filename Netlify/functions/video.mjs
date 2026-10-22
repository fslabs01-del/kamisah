import { guard } from './lib/guard.mjs';
const API = 'https://generativelanguage.googleapis.com';
const JSON_HEADERS = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' };
const MAX_BYTES = 2 * 1024 * 1024 * 1024;
const CHUNK_MAX = 2 * 1024 * 1024;
const ALLOWED_MIME = new Set(['video/mp4', 'video/webm', 'video/quicktime']);
const reply = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: JSON_HEADERS });

export default async (request) => {
  if (request.method !== 'POST') return reply({ error: 'Gunakan metode POST.' }, 405);
  const key = process.env.GEMINI_API_KEY;
  if (!key) return reply({ error: 'Backend belum dikonfigurasi: Layanan AI belum dikonfigurasi oleh admin.' }, 503);
  let body;
  try { body = await request.json(); } catch { return reply({ error: 'JSON permintaan tidak valid.' }, 400); }
  const action = String(body.action || '');
  const LIM = { 'create-session': [10, 3600], analyze: [10, 3600], 'analyze-segment': [20, 3600], synthesize: [10, 3600], 'upload-chunk': [3000, 3600], verify: [300, 3600], delete: [30, 3600] }[action];
  if (LIM) { const g = await guard(request, 'video-' + action, LIM[0], LIM[1]); if (g instanceof Response) return g; }

  try {
    if (action === 'create-session') {
      const size = Number(body.size);
      const mimeType = String(body.mimeType || '');
      const displayName = String(body.displayName || 'video-upload').replace(/[^\w. -]/g, '_').slice(0, 80);
      if (!Number.isSafeInteger(size) || size < 1 || size > MAX_BYTES) return reply({ error: 'Ukuran video harus maksimal 2 GiB.' }, 400);
      if (!ALLOWED_MIME.has(mimeType)) return reply({ error: 'Format video harus MP4, WebM, atau MOV.' }, 400);
      const start = await fetch(`${API}/upload/v1beta/files?uploadType=resumable`, {
        method: 'POST',
        headers: {
          'x-goog-api-key': key,
          'x-goog-upload-protocol': 'resumable',
          'x-goog-upload-command': 'start',
          'x-goog-upload-header-content-length': String(size),
          'x-goog-upload-header-content-type': mimeType,
          'content-type': 'application/json'
        },
        body: JSON.stringify({ file: { display_name: displayName } })
      });
      if (!start.ok) return reply({ error: `Google gagal memulai upload (HTTP ${start.status}).` }, 502);
      const sessionUrl = start.headers.get('x-goog-upload-url');
      if (!sessionUrl || !isGoogleUploadUrl(sessionUrl)) return reply({ error: 'Google tidak memberikan URL upload yang valid.' }, 502);
      return reply({ sessionUrl, chunkSize: CHUNK_MAX, maxBytes: MAX_BYTES, expiresNote: 'Sesi upload sementara; selesaikan upload tanpa menutup halaman.' });
    }

    if (action === 'upload-chunk') {
      const sessionUrl = String(body.sessionUrl || '');
      const offset = Number(body.offset);
      const encoded = String(body.chunkBase64 || '');
      if (!isGoogleUploadUrl(sessionUrl)) return reply({ error: 'Sesi upload tidak valid.' }, 400);
      if (!Number.isSafeInteger(offset) || offset < 0) return reply({ error: 'Offset upload tidak valid.' }, 400);
      if (!encoded || encoded.length > Math.ceil(CHUNK_MAX * 4 / 3) + 16) return reply({ error: 'Potongan video terlalu besar.' }, 413);
      const binary = atob(encoded);
      if (binary.length < 1 || binary.length > CHUNK_MAX) return reply({ error: 'Ukuran potongan harus maksimal 2 MiB.' }, 413);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      const isFinal = body.isFinal === true;
      const upstream = await fetch(sessionUrl, {
        method: 'POST',
        headers: {
          'content-length': String(bytes.byteLength),
          'x-goog-upload-offset': String(offset),
          'x-goog-upload-command': isFinal ? 'upload, finalize' : 'upload'
        },
        body: bytes
      });
      const responseText = await upstream.text();
      if (!upstream.ok) return reply({ error: `Upload Google gagal (HTTP ${upstream.status}).` }, 502);
      let file = null;
      try { file = responseText ? JSON.parse(responseText) : null; } catch {}
      return reply({ ok: true, receivedBytes: bytes.byteLength, isFinal, fileName: file?.file?.name || file?.name || null, file });
    }

    if (action === 'verify') {
      const fileName = String(body.fileName || '');
      if (!/^files\/[A-Za-z0-9_-]+$/.test(fileName)) return reply({ error: 'Nama file Google tidak valid.' }, 400);
      const response = await fetch(`${API}/v1beta/${fileName}`, { headers: { 'x-goog-api-key': key } });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) return reply({ error: `Pemeriksaan file gagal (HTTP ${response.status}).` }, 502);
      return reply({ name: data.name, state: data.state, uri: data.uri, mimeType: data.mimeType, sizeBytes: Number(data.sizeBytes || 0) });
    }

    if (action === 'analyze-segment') {
      const fileName = String(body.fileName || '');
      const mode = String(body.mode || 'recap').slice(0, 40);
      const extra = String(body.extra || '').trim().slice(0, 1500);
      const startSeconds = Number(body.startSeconds);
      const endSeconds = Number(body.endSeconds);
      if (!/^files\/[A-Za-z0-9_-]+$/.test(fileName)) return reply({ error: 'Nama file Google tidak valid.' }, 400);
      if (!Number.isFinite(startSeconds) || !Number.isFinite(endSeconds) || startSeconds < 0 || endSeconds <= startSeconds || endSeconds - startSeconds > 600) return reply({ error: 'Segmen harus berdurasi maksimal 10 menit.' }, 400);
      const fileResponse = await fetch(`${API}/v1beta/${fileName}`, { headers: { 'x-goog-api-key': key } });
      const file = await fileResponse.json().catch(() => ({}));
      if (!fileResponse.ok || file.state !== 'ACTIVE' || !file.uri || !ALLOWED_MIME.has(file.mimeType)) return reply({ error: 'Video belum siap dianalisis.' }, 409);
      const model = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
      const startLabel = formatTime(startSeconds), endLabel = formatTime(endSeconds);
      const prompt = `Analisis HANYA segmen video dari ${startLabel} sampai ${endLabel} dari sebuah film yang lebih panjang. Mode: ${mode}. Bahasa Indonesia. ${extra ? `Catatan: ${extra}` : ''}\nJangan mengklaim tahu seluruh film dari segmen ini. Buat catatan terstruktur yang berguna untuk menyusun alur cerita utuh: kejadian penting sesuai urutan, tokoh yang terlihat/terdengar dan tindakan mereka, hubungan tokoh yang bisa dipastikan, perubahan konflik, petunjuk/twist, lokasi/keadaan jika penting, dan hal yang belum jelas. Sertakan penanda waktu perkiraan jika bisa. Jangan menyalin dialog panjang atau mengarang kejadian di luar segmen. Maksimal 1200 kata.`;
      const response = await fetch(`${API}/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
        method: 'POST', headers: { 'content-type': 'application/json', 'x-goog-api-key': key },
        body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: prompt }, { file_data: { mime_type: file.mimeType, file_uri: file.uri }, videoMetadata: { startOffset: `${startSeconds}s`, endOffset: `${endSeconds}s` } }] }], generationConfig: { temperature: 0.2, maxOutputTokens: 2200 } })
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) return reply({ error: result?.error?.message || `Analisis segmen gagal (HTTP ${response.status}).` }, response.status === 429 ? 429 : 502);
      const text = (result?.candidates?.[0]?.content?.parts || []).map(p => p.text || '').join('\n').trim();
      if (!text) return reply({ error: `AI tidak mengembalikan catatan untuk segmen ${startLabel}–${endLabel}.` }, 502);
      return reply({ text, model, startSeconds, endSeconds });
    }

    if (action === 'synthesize') {
      const summaries = Array.isArray(body.summaries) ? body.summaries : [];
      const mode = String(body.mode || 'recap').slice(0, 40);
      const extra = String(body.extra || '').trim().slice(0, 2000);
      if (summaries.length < 1 || summaries.length > 12 || summaries.some(x => typeof x !== 'string' || x.length > 10000)) return reply({ error: 'Catatan segmen tidak valid.' }, 400);
      const model = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
      const prompt = `Gabungkan catatan berurutan dari segmen-segmen film menjadi analisis alur cerita film secara menyeluruh. Mode: ${mode}. Bahasa Indonesia alami. ${extra ? `Catatan pengguna: ${extra}` : ''}\n\nCatatan berikut berasal dari segmen waktu yang berurutan. Sebagian informasi mungkin berulang atau tidak lengkap. Jangan mengarang fakta yang tidak didukung catatan; tandai ketidakpastian dan perbedaan yang tidak bisa dipastikan.\n\n${summaries.map((x,i)=>`=== SEGMEN ${i+1} ===\n${x}`).join('\n\n')}\n\nHasilkan: (1) sinopsis keseluruhan; (2) tokoh dan hubungan; (3) kronologi dari awal sampai akhir; (4) perkembangan konflik, titik balik, twist, klimaks dan penyelesaian; (5) naskah recap naratif orisinal dengan urutan cerita; (6) estimasi durasi VO; (7) keterbatasan/hal yang belum jelas. Jangan menyalin dialog panjang. Nyatakan bahwa analisis dirakit dari segmen video dan jangan menyebut cakupan penuh jika catatan segmen tidak mendukungnya.`;
      const response = await fetch(`${API}/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
        method: 'POST', headers: { 'content-type': 'application/json', 'x-goog-api-key': key },
        body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: prompt }] }], generationConfig: { temperature: 0.3, maxOutputTokens: 8000 } })
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) return reply({ error: result?.error?.message || `Penggabungan cerita gagal (HTTP ${response.status}).` }, response.status === 429 ? 429 : 502);
      const text = (result?.candidates?.[0]?.content?.parts || []).map(p => p.text || '').join('\n').trim();
      if (!text) return reply({ error: 'AI tidak mengembalikan hasil akhir.' }, 502);
      return reply({ text, model, segments: summaries.length, note: 'Hasil dirangkai dari analisis segmen; tetap perlu verifikasi kualitas dengan film nyata.' });
    }

    if (action === 'analyze') {
      const fileName = String(body.fileName || '');
      const mode = String(body.mode || 'recap').slice(0, 40);
      const extra = String(body.extra || '').trim().slice(0, 3000);
      if (!/^files\/[A-Za-z0-9_-]+$/.test(fileName)) return reply({ error: 'Nama file Google tidak valid.' }, 400);
      const fileResponse = await fetch(`${API}/v1beta/${fileName}`, { headers: { 'x-goog-api-key': key } });
      const file = await fileResponse.json().catch(() => ({}));
      if (!fileResponse.ok || file.state !== 'ACTIVE' || !file.uri || !ALLOWED_MIME.has(file.mimeType)) return reply({ error: 'Video belum siap dianalisis. Tunggu sebentar lalu coba lagi.' }, 409);
      if (Number(file.sizeBytes || 0) > MAX_BYTES) return reply({ error: 'Ukuran video melebihi 2 GiB.' }, 413);
      const model = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
      const prompt = `Analisis video yang dilampirkan sebagai SATU FILM UTUH, bukan hanya sampel adegan atau gerakan kamera. Bahasa keluaran: Indonesia alami. Mode: ${mode}. ${extra ? `Catatan pengguna: ${extra}` : ''}\n\nPrioritaskan alur cerita, bukan angle/lensa kamera. Susun hasil: (1) sinopsis keseluruhan; (2) daftar tokoh dan hubungan; (3) kronologi cerita dari awal, perkembangan konflik, titik balik/twist, klimaks sampai akhir; (4) pembagian babak atau rentang waktu cerita jika dapat dipastikan; (5) recap naratif berurutan dengan VO siap dibacakan; (6) estimasi durasi VO; (7) hal yang tidak jelas/terlewat. Jangan mengarang kejadian yang tidak dapat dipastikan. Jika durasi panjang membuat sebagian isi tidak dapat dianalisis, nyatakan batasnya dengan jelas dan jangan berpura-pura sudah mencakup seluruh film. Untuk film berhak cipta, gunakan kata-kata sendiri dan jangan menyalin dialog panjang.`;
      const response = await fetch(`${API}/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-goog-api-key': key },
        body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: prompt }, { file_data: { mime_type: file.mimeType, file_uri: file.uri } }] }], generationConfig: { temperature: 0.4, maxOutputTokens: 8000 } })
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) return reply({ error: result?.error?.message || `Analisis Layanan AI gagal (HTTP ${response.status}).` }, response.status === 429 ? 429 : 502);
      const text = (result?.candidates?.[0]?.content?.parts || []).map(p => p.text || '').join('\n').trim();
      if (!text) return reply({ error: 'Layanan AI tidak mengembalikan hasil analisis.' }, 502);
      return reply({ text, model, fileName, note: 'Analisis berhasil. Penghapusan file dilakukan melalui aksi delete; hasil ini bukan jaminan penghapusan dari semua log/retensi pihak ketiga.' });
    }

    if (action === 'delete') {
      const fileName = String(body.fileName || '');
      if (!/^files\/[A-Za-z0-9_-]+$/.test(fileName)) return reply({ error: 'Nama file Google tidak valid.' }, 400);
      const response = await fetch(`${API}/v1beta/${fileName}`, { method: 'DELETE', headers: { 'x-goog-api-key': key } });
      if (response.ok || response.status === 404) return reply({ ok: true, deletionRequestAccepted: true });
      return reply({ error: `Penghapusan file gagal (HTTP ${response.status}).` }, 502);
    }
    return reply({ error: 'Aksi tidak dikenal.' }, 400);
  } catch {
    return reply({ error: 'Terjadi gangguan koneksi saat memproses video. Coba lagi.' }, 502);
  }
};

function isGoogleUploadUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && url.hostname === 'generativelanguage.googleapis.com' && url.pathname.startsWith('/upload/');
  } catch { return false; }
}

function formatTime(seconds) { const n=Math.max(0,Math.floor(seconds)); const h=Math.floor(n/3600), m=Math.floor((n%3600)/60), sec=n%60; return h ? `${h}:${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}` : `${m}:${String(sec).padStart(2,'0')}`; }
