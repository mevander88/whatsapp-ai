# WhatsApp AI Bot

Bot WhatsApp sederhana yang membalas chat pribadi menggunakan model DeepSeek melalui API HowToFix. Riwayat percakapan disimpan di PostgreSQL dan sesi login WhatsApp disimpan secara lokal agar QR tidak perlu dipindai ulang setiap kali proses dimulai.

Koneksi WhatsApp menggunakan `@itsukichan/baileys`.

## Persyaratan

- Node.js 20 atau lebih baru
- PostgreSQL yang dapat diakses oleh aplikasi
- Token API HowToFix
- Akun WhatsApp untuk dihubungkan
- FFmpeg yang tersedia di `PATH` untuk fitur foto kamera di Windows

## Menjalankan bot

1. Install dependency:

   ```bash
   npm install
   ```

2. Salin `.env.example` menjadi `.env`, lalu isi `HF_TOKEN` dan `DATABASE_URL`. Konfigurasi lama dengan `DEEPSEEK_API_KEY` tetap diterima.

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

- `HF_TOKEN`: token API HowToFix. `DEEPSEEK_API_KEY` juga diterima untuk konfigurasi lama; jika keduanya ada, `HF_TOKEN` dipakai.
- `DATABASE_URL`: connection string PostgreSQL.

Konfigurasi opsional tersedia di `.env.example`, termasuk URL API, model DeepSeek, system prompt, jumlah riwayat, timeout, lokasi sesi, dan level log.

- `WHATSAPP_CONNECT_TIMEOUT_MS`: batas waktu satu percobaan koneksi WhatsApp.
- `WHATSAPP_MAX_RECONNECT_ATTEMPTS`: jumlah maksimum percobaan koneksi ulang sebelum pengguna perlu memeriksa masalah dan menjalankan ulang bot.
- `WHATSAPP_WEB_VERSION`: override sementara dalam format `2,3000,revision`. Biarkan kosong agar bot mengambil versi langsung dari WhatsApp Web.

URL API bawaan adalah `https://api.howtofix.id/v1/chat/completions`. Model bawaan adalah **DeepSeek-V4.1-Flash** dengan ID `deepseek-v4.1-flash` sesuai daftar `https://api.howtofix.id/v1/models`. Isi `DEEPSEEK_API_URL` dan `DEEPSEEK_MODEL` di `.env` bila penyedia API memberikan nilai yang berbeda.

## AI Agent dan akses komputer

Isi `OWNER_NUMBERS` dengan nomor WhatsApp pemilik. Hanya nomor tersebut yang dapat melihat dan menjalankan tool komputer. Nomor lain tetap dapat memakai bot untuk pertanyaan umum.

`AGENT_ALLOWED_PATHS` menentukan folder yang boleh dibaca atau ditulis agent. Nilai bawaan adalah `./agent-workspace`; buat folder tersebut sebelum meminta agent menampilkan atau membaca isinya. `AGENT_ALLOWED_APPS` menentukan aplikasi yang boleh dibuka. Semua akses komputer tetap memerlukan persetujuan pemilik melalui tombol WhatsApp atau balasan `SETUJUI <kode>` di chat yang sama. Bot tidak meminta persetujuan tindakan melalui popup di komputer.

Agent dapat menjalankan perintah CMD diagnostik `ver`, `whoami`, `hostname`, `ipconfig`, `tasklist`, dan `systeminfo` di Windows setelah persetujuan pemilik. Perintah yang tersedia dapat dibatasi lewat `AGENT_ALLOWED_CMD_COMMANDS` di `.env`; isi `none` untuk menonaktifkannya. Perintah bebas dan argumen tambahan tidak diterima. Hasil perintah yang disetujui dapat dikirim ke AI untuk dirangkum.

Pemilik juga dapat meminta satu foto kamera dengan pesan seperti `Jepret kamera dan kirim fotonya`. Bot meminta persetujuan, memakai kamera video pertama yang dideteksi FFmpeg, lalu mengirim foto langsung ke chat pemilik. Jika ingin memilih kamera tertentu, isi `CAMERA_DEVICE_NAME` di `.env` sesuai nama perangkat dari `ffmpeg -list_devices true -f dshow -i dummy`. File foto sementara dihapus setelah pengiriman berhasil.

Kemampuan komputer lainnya:

- melihat informasi sistem dasar;
- menampilkan folder dan membaca file teks berukuran terbatas;
- menulis file teks dalam folder yang diizinkan;
- membuka aplikasi dari daftar izin;
- mengirim file lokal yang diizinkan sebagai gambar, video, audio, atau dokumen.

Contoh: kirim `Jalankan systeminfo di CMD dan cek RAM komputer saya`, lalu setujui perintah yang ditampilkan bot. Untuk informasi RAM saja, bot juga dapat memakai tool informasi sistem tanpa CMD.

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

## Jika bot terhubung tetapi tidak membalas

1. Tunggu log `WhatsApp terhubung`, lalu kirim pesan teks `Halo` dari akun WhatsApp lain ke nomor bot. Pesan grup, status, dan pesan dari akun bot sendiri tidak diproses.
2. Cari log `Event pesan WhatsApp diterima`, `Pesan pribadi diterima`, `Memproses pesan dengan agent`, `Balasan tersimpan untuk dikirim`, dan `Balasan diserahkan ke WhatsApp`. Semua tahap pemrosesan memakai `messageTag` yang sama tanpa menampilkan isi pesan atau nomor pengirim.
3. Jika tidak ada `Event pesan WhatsApp diterima` sesudah pesan baru dikirim, berarti Baileys belum menerbitkan event untuk bot; periksa apakah ada `Notifikasi tertunda WhatsApp selesai diterima`, koneksi, dan perangkat tertaut. Jika event ada tetapi tidak ada `Pesan pribadi diterima`, set `LOG_LEVEL=debug` di `.env` dan ulangi pesan baru. Alasan pengabaian seperti `old_append`, `from_me`, dan `unsupported_content` akan terlihat.
4. Jika muncul `Token AI ditolak (401)`, pastikan token HowToFix dan URL API di `.env` benar, lalu jalankan ulang bot. Jika muncul status 400, cek ID model dan akses model pada penyedia API. Bot tetap mencoba mengirim pemberitahuan gangguan kepada pengirim.
5. Jika tahap pengiriman gagal, balasan yang sudah disiapkan disimpan dan dicoba lagi dengan ID WhatsApp yang sama. Gangguan koneksi yang masih berlangsung dapat menunda pengiriman sampai bot terhubung kembali.

Jika log menunjukkan `stubReason: message_absent`, WhatsApp hanya mengirim placeholder `unavailable` tanpa teks pesan. Baileys meminta kirim ulang dari perangkat utama. Bila teks tetap tidak datang setelah 25 detik, bot meminta pengirim mengirim ulang. Periksa apakah perangkat utama terhubung dan apakah pesan yang sama terbaca di WhatsApp Web resmi; bot tidak dapat menjawab isi pesan yang belum dikirim WhatsApp.

Status 515 sesaat setelah pairing pertama adalah permintaan restart socket dari WhatsApp. Timeout 408 pada *init queries* Baileys terjadi setelah koneksi terbuka dan tidak otomatis berarti alur pesan gagal. Jika sesudahnya tidak ada `Event pesan WhatsApp diterima` saat pesan baru dikirim, koneksi mungkin terlihat aktif tetapi tidak menerima event; kumpulkan log itu sebelum mengubah sesi login.

## Perilaku versi awal

- Hanya chat pribadi berbentuk teks yang diproses.
- Pesan grup, status, media, dan pesan dari akun bot sendiri diabaikan.
- ID pesan disimpan secara unik sehingga event yang diterima ulang tidak menghasilkan balasan ganda.
- Gangguan pada DeepSeek atau database ditangani per pesan dan tidak menghentikan bot.

## Pemeriksaan

```bash
npm test
npm run check
```
