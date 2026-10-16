# WhatsApp AI Bot

Bot WhatsApp sederhana yang membalas chat pribadi menggunakan API DeepSeek. Riwayat percakapan disimpan di PostgreSQL dan sesi login WhatsApp disimpan secara lokal agar QR tidak perlu dipindai ulang setiap kali proses dimulai.

## Persyaratan

- Node.js 20 atau lebih baru
- PostgreSQL yang dapat diakses oleh aplikasi
- API key DeepSeek
- Akun WhatsApp untuk dihubungkan

## Menjalankan bot

1. Install dependency:

   ```bash
   npm install
   ```

2. Salin `.env.example` menjadi `.env`, lalu isi `DEEPSEEK_API_KEY` dan `DATABASE_URL`.

3. Pastikan database pada `DATABASE_URL` sudah dibuat. Tabel yang diperlukan akan dibuat otomatis.

4. Jalankan bot:

   ```bash
   npm start
   ```

5. Pada login pertama, pindai QR yang muncul di terminal melalui menu **Perangkat tertaut** di WhatsApp.

Saat startup, bot mengambil `client_revision` terbaru langsung dari WhatsApp Web, kemudian memakai sumber Baileys sebagai fallback. Terminal akan menampilkan pesan `QR login WhatsApp siap` sebelum QR dapat dipindai dan `WhatsApp terhubung` setelah login berhasil.

Folder `auth_info_baileys` menyimpan sesi login. Pertahankan folder ini di server atau volume persisten dan jangan membagikannya. Bot akan mencoba terhubung kembali saat koneksi sementara terputus. Jika perangkat ditautkan keluar dari WhatsApp, sesi lama dihapus dan QR baru akan muncul.

## Konfigurasi

Konfigurasi wajib:

- `DEEPSEEK_API_KEY`: token API DeepSeek.
- `DATABASE_URL`: connection string PostgreSQL.

Konfigurasi opsional tersedia di `.env.example`, termasuk model DeepSeek, system prompt, jumlah riwayat, timeout, lokasi sesi, dan level log.

- `WHATSAPP_CONNECT_TIMEOUT_MS`: batas waktu satu percobaan koneksi WhatsApp.
- `WHATSAPP_MAX_RECONNECT_ATTEMPTS`: jumlah maksimum percobaan koneksi ulang sebelum pengguna perlu memeriksa masalah dan menjalankan ulang bot.
- `WHATSAPP_WEB_VERSION`: override sementara dalam format `2,3000,revision`. Biarkan kosong agar bot mengambil versi langsung dari WhatsApp Web.

Model bawaan adalah **DeepSeek-V4.1-Flash**. ID model yang dikirim ke API adalah `deepseek-flash`, sesuai [dokumentasi resmi DeepSeek](https://api-docs.deepseek.com/news/news260910/).

## AI Agent dan akses komputer

Isi `OWNER_NUMBERS` dengan nomor WhatsApp pemilik. Hanya nomor tersebut yang dapat melihat dan menjalankan tool komputer. Nomor lain tetap dapat memakai bot untuk pertanyaan umum.

`AGENT_ALLOWED_PATHS` menentukan folder yang boleh dibaca atau ditulis agent. Nilai bawaan adalah `./agent-workspace`; buat folder tersebut sebelum meminta agent menampilkan atau membaca isinya. `AGENT_ALLOWED_APPS` menentukan aplikasi yang boleh dibuka. Semua akses komputer tetap memerlukan persetujuan pemilik melalui tombol WhatsApp atau balasan `SETUJUI <kode>`.

Agent tidak menerima terminal umum. Kemampuannya dibatasi pada:

- melihat informasi sistem dasar;
- menampilkan folder dan membaca file teks berukuran terbatas;
- menulis file teks dalam folder yang diizinkan;
- membuka aplikasi dari daftar izin;
- mengirim file lokal yang diizinkan sebagai gambar, video, audio, atau dokumen.

File rahasia seperti `.env`, kredensial sesi WhatsApp, private key, `.git`, dan isi `node_modules` selalu diblokir. Hasil baca yang disetujui dapat dikirim ke DeepSeek untuk dirangkum.

Bot juga dapat memilih balasan berbentuk tombol, daftar, dan polling. Jika format interaktif gagal dikirim, bot memakai fallback teks.

## Jika QR tidak muncul

1. Pastikan terminal menampilkan sumber `whatsapp-web` saat memilih versi protokol. Jika gagal, periksa akses ke `web.whatsapp.com` dan jalankan `npm install` untuk memastikan dependency memakai rilis terbaru.
2. Untuk status 405, pastikan versi Baileys dan protokol sudah terbaru serta jaringan mengizinkan akses ke WhatsApp Web.
3. Untuk timeout atau status 500, periksa koneksi internet, proxy, firewall, dan waktu sistem Windows.
4. Jika log menyatakan sesi tidak valid, hentikan bot dan simpan sesi lama sebagai cadangan sebelum login ulang:

   ```powershell
   Rename-Item auth_info_baileys auth_info_baileys-backup
   npm start
   ```

Bot membatasi percobaan koneksi ulang agar terminal tidak terus mengulang kegagalan yang sama. Setelah masalah diperbaiki, jalankan kembali `npm start`.

## Perilaku versi awal

- Hanya chat pribadi berbentuk teks yang diproses.
- Pesan grup, status, media, dan pesan dari akun bot sendiri diabaikan.
- ID pesan disimpan secara unik sehingga event yang diterima ulang tidak menghasilkan balasan ganda.
- Gangguan pada DeepSeek atau database ditangani per pesan dan tidak menghentikan bot.

## Catatan dependency

`npm audit` saat ini melaporkan kerentanan pada dependency transitif `@itsukichan/baileys`. Sebagian belum memiliki perbaikan upstream. Pantau pembaruan paket tersebut dan lakukan upgrade ketika versi perbaikannya tersedia.

## Pemeriksaan

```bash
npm test
npm run check
```
