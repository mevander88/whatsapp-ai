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

Folder `auth_info_baileys` menyimpan sesi login. Pertahankan folder ini di server atau volume persisten dan jangan membagikannya. Bot akan mencoba terhubung kembali saat koneksi sementara terputus. Jika perangkat ditautkan keluar dari WhatsApp, sesi lama dihapus dan QR baru akan muncul.

## Konfigurasi

Konfigurasi wajib:

- `DEEPSEEK_API_KEY`: token API DeepSeek.
- `DATABASE_URL`: connection string PostgreSQL.

Konfigurasi opsional tersedia di `.env.example`, termasuk model DeepSeek, system prompt, jumlah riwayat, timeout, lokasi sesi, dan level log.

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
