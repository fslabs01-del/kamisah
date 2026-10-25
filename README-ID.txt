KAMISAH — PAKET SUMBER UNTUK UPLOAD KE GITHUB / NETLIFY

STRUKTUR
- index.html, config.js, netlify.toml, dan folder netlify/ ada langsung di root.
- Folder pribadi `pw` tidak disertakan.
- File backup lama tidak disertakan agar tidak terpublikasi.
- Meta verifikasi Google Search Console dipertahankan.

SEBELUM UPLOAD
1. Ekstrak ZIP; upload ISI folder ke repo GitHub, bukan ZIP-nya.
2. Gunakan branch yang terhubung ke situs Netlify sekarang. Jangan hapus repo/situs lama.
3. Build command kosong; publish directory `.`; functions directory `netlify/functions`.
4. Deploy preview dan uji halaman sebelum mempromosikan ke production.

KONFIGURASI SUPABASE FRONTEND
- `config.js` pada paket ini sudah diisi dengan Project URL dan Publishable key yang diberikan pemilik.
- `SUPABASE_URL` dan `SUPABASE_PUBLISHABLE_KEY` dipakai oleh frontend; Netlify Environment Variables tidak otomatis mengisi `config.js` statis.
- Jangan pernah menaruh `sb_secret_...`, service role key, password database, atau API secret di file frontend/GitHub/chat.

ENVIRONMENT VARIABLES NETLIFY (BACKEND)
- SUPABASE_URL
- SUPABASE_SERVICE_ROLE_KEY (backend saja; Netlify environment variables, jangan di GitHub)
- GEMINI_API_KEY (jika memilih layanan Google untuk teks/analisis/suara)
- GEMINI_MODEL, GEMINI_CHAT_MODEL, GEMINI_TTS_MODEL (opsional)
- SEEDANCE_API_BASE, SEEDANCE_API_KEY, SEEDANCE_CREATE_PATH, SEEDANCE_STATUS_PATH, VIDEO_GEN_ENABLED (video provider; belum aktif sampai diuji)
- PAY_API_BASE, PAY_API_KEY, PAY_CREATE_PATH, PAY_WEBHOOK_SECRET, PAYMENTS_ENABLED (gateway pembayaran; belum aktif sampai provider dipilih dan webhook diverifikasi)

PENTING — SKEMA DATABASE
Backend di paket ini memakai tabel/fungsi `wallets`, `ledger`, `jobs`, `topups`, serta RPC yang dibuat oleh SQL bertahap di folder `supabase/`. Tabel `profiles` dan `credit_transactions` yang dibuat terpisah di SQL Editor bukan pengganti tabel-tabel tersebut. Jangan menganggap saldo/kredit sudah berfungsi hanya karena tabel profil sudah ada.

Project Supabase ini sudah memiliki tabel `profiles` dan `credit_transactions` serta trigger profil otomatis dari langkah sebelumnya. Backend Kamisah juga membutuhkan `wallets`, `ledger`, `jobs`, `topups`, `settings`, `usage_limits`, `chat_charges`, dan tabel pendukung. SQL `supabase/KAMISAH-SETUP-ALL.sql` menggabungkan skema backend secara berurutan dan menggunakan CREATE IF NOT EXISTS untuk tabel utama. Sebelum menjalankan, pastikan project Supabase yang dipilih benar dan buat backup. Jalankan file gabungan tersebut SEKALI di SQL Editor; jika muncul error, berhenti dan periksa pesan error sebelum mengulang. File `schema.sql` sampai `schema-4.sql` disimpan sebagai referensi bertahap, jangan jalankan lagi setelah file gabungan sukses. Setelah migrasi, uji signup, login, dompet, RPC kredit, refund, top-up, dan RLS dengan akun uji.

STATUS YANG BENAR
- ZIP berhasil diekstrak dan struktur root diperiksa.
- Sintaks backend `.mjs` lolos `node --check`.
- Folder `pw` tidak disertakan.
- Ini paket sumber yang disiapkan untuk upload ke branch/preview, BUKAN klaim siap produksi.
- Belum dilakukan pengujian end-to-end browser, Supabase nyata, API provider, pembayaran, atau generator audio/video.
- Studio Musik saat ini menyiapkan prompt; belum menghasilkan audio tanpa provider/API yang sesuai.

DOMAIN
Domain kamisah.com belum didaftarkan/disambungkan melalui paket ini. Pertahankan domain Netlify sampai domain baru terdaftar dan DNS/HTTPS diverifikasi.


PEMERIKSAAN SEBELUM UPLOAD (2026-10-21)
- 9 file backend `.mjs` lolos `node --check`.
- Tidak ditemukan pola service-role/secret key tertanam dalam kode paket.
- Top-up frontend/backend diselaraskan ke minimum Rp10.000 agar tidak bentrok dengan constraint database aman.
- Tetap belum diuji end-to-end di browser atau terhadap layanan Supabase/AI/payment gateway sungguhan.
- Jangan jalankan SQL gabungan lama jika migrasi aman sudah dijalankan; jangan upload folder berbeda ke repo yang salah. Pastikan repo yang terhubung ke Netlify memang untuk aplikasi Kamisah, karena paket ini mengganti file root seperti `index.html`.


FITUR TAMBAHAN — AI FILM ANALYZER
- Halaman baru: /ai-film-analyzer atau /ai-film-analyzer.html.
- Auto Cut menggunakan FFmpeg WebAssembly dari CDN di browser. Pertama kali perlu internet untuk memuat engine; file besar bisa menghabiskan RAM/performa HP.
- Analisis Gemini dan suara AI menggunakan Netlify Functions `film-analyze.mjs` dan `film-voice.mjs`.
- Tambahkan `GEMINI_API_KEY` pada Netlify Environment Variables. Opsional: `GEMINI_MODEL` (default gemini-2.5-flash), `GEMINI_TTS_MODEL` (default gemini-2.5-flash-preview-tts).
- Batas analisis halaman saat ini 18 MB karena unggahan melewati Netlify Function; film panjang memerlukan alur unggah langsung ke penyimpanan cloud dan pemrosesan bertahap. Jangan menganggap unggahan film panjang sudah didukung.
- Suara AI saat ini satu permintaan; naskah lebih dari 28.000 karakter perlu dukungan pemecahan dan penggabungan audio bertahap.
- Editor manual timeline lengkap belum tersedia; tombol memberi status jujur dan hasil Auto Cut bisa diunduh untuk diedit di editor lain.
