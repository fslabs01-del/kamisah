# Kamisah React — Tahap 1–3

Prototipe React/Vite mobile-first untuk beranda proyek dan Studio Canvas.

## Fitur Tahap 3
- Kanvas proyek responsif dan area media.
- Upload beberapa gambar/video lokal sebagai referensi.
- Sheet Referensi dengan pencarian, galeri demo, pilihan multi-select, dan hapus referensi.
- Prompt video, pilihan model, rasio, resolusi, durasi 1–30 detik, dan jumlah output.
- Antrean pekerjaan demo tersimpan melalui Zustand persist/localStorage.
- Tampilan status antrean berubah berkala; ini hanya simulasi UI.

## Penting
Generate **belum terhubung ke API video/backend**. Job tidak menghasilkan video sungguhan; antrean dan status hanya demonstrasi frontend. URL gambar demo memerlukan koneksi internet.

## Deploy Netlify
Build command: `npm run build`
Publish directory: `dist`

Jangan meletakkan secret API di frontend atau file yang dipublikasikan. Hubungkan API melalui backend/function server setelah siap.

## Jalankan lokal
`npm install`
`npm run dev`
