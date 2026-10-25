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


## Perbaikan debugging
- Navigasi beranda dan Studio tetap memakai `activeProjectId`: tombol kembali membawa pengguna ke daftar proyek.
- Ikon notifikasi dan profil tetap terlihat di header Studio; bagian profil masih berupa placeholder.
- Referensi terpilih sekarang ditampilkan di kanvas.
- Thumbnail gambar unggahan disimpan sebagai data URL agar tetap muncul setelah halaman dimuat ulang. Video memakai URL sementara agar tidak memenuhi localStorage.
- Generate masih antrean demo dan belum terhubung ke API video.

## Studio Film Panjang (rancangan UI)
- Halaman baru: `film-studio.html` (dapat dibuka pada `/film-studio.html`).
- Memuat 11 tampilan berdasarkan gambar acuan: Beranda & Proyek, Input Cerita, Hasil Pengembangan, Pusat Kontinuitas, Pemeriksaan Proyek, Pengaturan Kredit, Detail Adegan & Shot, Detail Shot, Produksi per Shot, Timeline Editor, dan Hasil Akhir & Ekspor.
- Tombol navigasi antarhalaman dan beberapa kontrol pratinjau berjalan pada frontend.
- PENTING: produksi video, pemeriksaan AI, pencatatan kredit server, penyuntingan timeline sebenarnya, dan ekspor belum tersambung ke backend/API. UI menampilkan pemberitahuan pada tindakan yang memerlukan layanan tersebut.
- Halaman lama di `index.html` dan Studio Canvas tetap dipertahankan. Beranda lama memiliki tombol **Studio Film** untuk membuka halaman baru.
