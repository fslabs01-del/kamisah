# Kamisah React — Fase 1

Prototipe terpisah untuk menguji **arsitektur state dasar** dan **Beranda Proyek** sebelum komponen Canvas dibuat. Paket ini tidak menggantikan ZIP Kamisah yang saat ini terhubung ke Netlify.

## Isi
- React + Vite
- Tailwind CSS
- Zustand dengan persist ke localStorage
- Beranda proyek vertikal
- Buat proyek, buka proyek, ganti nama, hapus proyek
- Model state untuk prompt, aset terlampir, antrean Generate, dan riwayat Generate

## Jalankan lokal
Perlu Node.js versi modern dan koneksi internet untuk memasang dependency.

```bash
npm install
npm run dev
```

Untuk memeriksa build:

```bash
npm run build
```

## Penting
- Proyek ini adalah prototipe UI/state, belum terhubung ke Supabase, API Veo, atau backend antrean sebenarnya.
- `generationQueue` adalah model data frontend. Jangan menganggap tugas benar-benar dirender sebelum backend ditambahkan pada fase berikutnya.
- Data contoh memakai gambar Unsplash eksternal; ganti dengan aset Kamisah yang sebenarnya saat integrasi.
- Jangan deploy paket ini di atas situs produksi. Integrasikan dan uji dulu dengan proyek yang sudah ada.
