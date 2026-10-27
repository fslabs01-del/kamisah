# Kamisah AI — paket Node.js untuk ArenHost

## Status paket
Paket ini mengemas website Kamisah yang diberikan dan adaptor Express untuk mempertahankan URL `/.netlify/functions/<nama>` pada hosting Node.js. Pemeriksaan sintaks server dan modul fungsi dapat dijalankan dengan `npm run check`. Paket ini belum dinyatakan lulus uji produksi: akses akun, skema/RPC Supabase, upload video berukuran besar, API Seedance, dan gateway pembayaran harus diuji di hosting dengan kredensial milik pemilik.

## Persyaratan
- Node.js 20 atau lebih baru
- npm
- Hosting mengizinkan aplikasi Node.js persisten dan menyediakan `PORT`

## Instalasi
1. Ekstrak ZIP ke direktori aplikasi di hosting.
2. Pilih Node.js 20+.
3. Jalankan `npm install`.
4. Masukkan variabel dari `.env.example` ke panel Environment Variables. Jangan mengunggah `.env` ke GitHub.
5. Set perintah start ke `npm start`.
6. Buka `/health`; respons yang diharapkan adalah JSON dengan `ok: true`.
7. Uji halaman dan setiap endpoint satu per satu sebelum mengaktifkan transaksi atau menerima pengguna berbayar.

## Variabel lingkungan
- `SUPABASE_URL`: URL proyek Supabase yang digunakan frontend.
- `SUPABASE_SERVICE_ROLE_KEY`: rahasia server saja.
- `GEMINI_API_KEY`: kunci Gemini server-side.
- `SEEDANCE_API_BASE` dan `SEEDANCE_API_KEY`: isi setelah memastikan dokumentasi endpoint penyedia yang dibeli.
- `PAYMENTS_ENABLED=false`: jangan aktifkan sampai gateway dan validasi webhook diverifikasi.

## Catatan penting
- Adapter meneruskan URL lama `/.netlify/functions/*` ke handler terkait.
- `film-analyze` memakai format event Netlify lama dan perlu diuji dengan upload sungguhan. Batas upload Express saat ini 25 MB.
- `topup` dan `pay-webhook` tidak boleh dianggap siap produksi tanpa memastikan API gateway, tanda tangan webhook, serta RPC Supabase `confirm_topup` sesuai.
- Pastikan migrasi SQL dan kebijakan/RPC Supabase yang dibutuhkan sudah benar-benar diterapkan.
- `config.js` adalah konfigurasi frontend: hanya boleh berisi URL Supabase dan publishable/anon key. Jangan pernah memasukkan service-role key atau secret API di sana.
- Beberapa file backend `.mjs` dan file konfigurasi internal diblokir dari akses statis oleh server.
- Sebelum mengganti domain, perbarui URL redirect/login, domain Supabase Auth, callback pembayaran, dan CORS bila diperlukan.
