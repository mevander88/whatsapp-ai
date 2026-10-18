# WhatsApp AI Bot

Bot WhatsApp sederhana yang membalas chat pribadi menggunakan model AI melalui API OpenAI-compatible Rindri. Riwayat percakapan disimpan di PostgreSQL dan sesi login WhatsApp disimpan secara lokal agar QR tidak perlu dipindai ulang setiap kali proses dimulai.

Koneksi WhatsApp menggunakan `@itsukichan/baileys`.

## Persyaratan

- Node.js 20 atau lebih baru
- PostgreSQL yang dapat diakses oleh aplikasi
- Secret key API dan base URL dalam `apikey.txt`
- Akun WhatsApp untuk dihubungkan
- FFmpeg yang tersedia di `PATH` untuk fitur foto kamera di Windows

## Menjalankan bot

1. Install dependency:

   ```bash
   npm install
   ```

2. Salin `.env.example` menjadi `.env`, lalu isi `DATABASE_URL`. Pastikan `apikey.txt` tersedia di folder proyek.

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

- `DATABASE_URL` di `.env`: connection string PostgreSQL.
- `apikey.txt` di folder proyek: baris pertama berisi secret key. Baris petunjuk pemakaian harus memuat `base URL https://api.rindri.com/v1`.

Contoh format `apikey.txt` dengan nilai pengganti, tanpa key asli:

```text
sk-ISI_SECRET_KEY_ANDA

Endpoint: https://api.rindri.com/
Cara pakai: OpenAI-compatible: base URL https://api.rindri.com/v1 + header Authorization: Bearer <Secret Key>.
```

Bot membaca secret key dan base URL dari file tersebut saat mulai, lalu memakai paket `openai` untuk Chat Completions. Secret key dikirim dalam header `Authorization: Bearer`, sesuai petunjuk di `apikey.txt`. File ini diabaikan oleh Git; jangan unggah atau bagikan isinya. Nilai lama `HF_TOKEN`, `DEEPSEEK_API_KEY`, `AI_BASE_URL`, `AI_API_URL`, dan `DEEPSEEK_API_URL` di `.env` tidak dipakai lagi. Jika file berada di lokasi lain, isi `AI_KEY_FILE` dengan path-nya.

Jika log menampilkan `401`, periksa secret key di baris pertama `apikey.txt`. Untuk `403`, periksa izin akun dan akses model pada penyedia API. Daftar model tersedia melalui `GET https://api.rindri.com/v1/models` dengan header Authorization yang sama. Setelah mengubah key, URL, atau model, hentikan proses bot yang lama dan jalankan lagi dengan `npm start`.

Konfigurasi opsional tersedia di `.env.example`, termasuk model AI, system prompt, jumlah riwayat, timeout, lokasi sesi, dan level log. Gunakan `AI_MODEL` untuk memilih ID model; nama lama `DEEPSEEK_MODEL` masih diterima.

- `WHATSAPP_CONNECT_TIMEOUT_MS`: batas waktu satu percobaan koneksi WhatsApp.
- `WHATSAPP_MAX_RECONNECT_ATTEMPTS`: jumlah maksimum percobaan koneksi ulang sebelum pengguna perlu memeriksa masalah dan menjalankan ulang bot.
- `WHATSAPP_WEB_VERSION`: override sementara dalam format `2,3000,revision`. Biarkan kosong agar bot mengambil versi langsung dari WhatsApp Web.

Model bawaan adalah **DeepSeek V4.1 Flash** dengan ID `deepseek-v4.1-flash`. ID ini tersedia pada daftar model Rindri saat konfigurasi diuji. Isi `AI_MODEL` di `.env` bila ingin memakai model lain yang tersedia untuk key tersebut.

## AI Agent dan akses komputer

Isi `OWNER_NUMBERS` dengan nomor WhatsApp pemilik. Hanya nomor tersebut yang dapat melihat dan menjalankan tool komputer. Nomor lain tetap dapat memakai bot untuk pertanyaan umum.

`AGENT_ALLOWED_PATHS` menentukan folder yang boleh dibaca atau ditulis agent dalam mode biasa. Nilai bawaan adalah `./agent-workspace`; buat folder tersebut sebelum meminta agent menampilkan atau membaca isinya. `AGENT_ALLOWED_APPS` menentukan aplikasi yang boleh dibuka. Dalam mode biasa, akses komputer memerlukan persetujuan pemilik melalui tombol WhatsApp atau balasan `SETUJUI <kode>` di chat yang sama. Bot tidak meminta persetujuan tindakan melalui popup di komputer.

Agent dapat menjalankan perintah CMD diagnostik `ver`, `whoami`, `hostname`, `ipconfig`, `tasklist`, dan `systeminfo` di Windows setelah persetujuan pemilik. Perintah yang tersedia dapat dibatasi lewat `AGENT_ALLOWED_CMD_COMMANDS` di `.env`; isi `none` untuk menonaktifkannya. Perintah bebas dan argumen tambahan tidak diterima. Hasil perintah yang disetujui dapat dikirim ke AI untuk dirangkum.

Pemilik juga dapat meminta satu foto kamera dengan pesan seperti `Jepret kamera dan kirim fotonya`. Bot meminta persetujuan, memakai kamera video pertama yang dideteksi FFmpeg, lalu mengirim foto langsung ke chat pemilik. Jika ingin memilih kamera tertentu, isi `CAMERA_DEVICE_NAME` di `.env` sesuai nama perangkat dari `ffmpeg -list_devices true -f dshow -i dummy`. File foto sementara dihapus setelah pengiriman berhasil.

Kemampuan komputer lainnya:

- melihat informasi sistem dasar;
- menampilkan folder dan membaca file teks berukuran terbatas;
- menulis file teks dalam folder yang diizinkan;
- membuka aplikasi dari daftar izin;
- mengirim file lokal yang diizinkan sebagai gambar, video, audio, atau dokumen.

Contoh: kirim `Jalankan systeminfo di CMD dan cek RAM komputer saya`, lalu setujui perintah yang ditampilkan bot. Untuk informasi RAM saja, bot juga dapat memakai tool informasi sistem tanpa CMD.

Dalam mode biasa, file rahasia seperti `.env`, `apikey.txt`, kredensial sesi WhatsApp, private key, `.git`, dan isi `node_modules` diblokir. Hasil baca yang disetujui dapat dikirim ke model AI untuk dirangkum.

### Godmode untuk pemilik

Kirim `/godmode` dari chat pribadi nomor yang tercantum di `OWNER_NUMBERS` untuk mengaktifkan akses penuh selama 30 menit (atau nilai `AGENT_GODMODE_TTL_MINUTES`). Selama aktif, pemilik dapat meminta tindakan komputer dengan bahasa biasa, misalnya `Buka Chrome`, `Tutup Notepad`, `Lihat aplikasi yang berjalan`, atau `Kirim tangkapan layar komputer`. Agent dapat membuka aplikasi di luar `AGENT_ALLOWED_APPS`, menutup aplikasi, memilih jendela, membaca dan memindahkan kursor, mengklik, drag, scroll, mengetik teks, serta menekan pintasan keyboard termasuk tombol Windows. Tangkapan layar dikirim ke chat pemilik dan file sementaranya dibersihkan setelah terkirim. Untuk file, folder, pengaturan sistem, atau tindakan lain, agent dapat memakai PowerShell tanpa daftar izin; `AGENT_ALLOWED_PATHS` tidak membatasi perintah tersebut. Tindakan berjalan tanpa persetujuan tambahan dengan hak akses akun Windows yang menjalankan bot. Gunakan `/exec <perintah PowerShell>` jika ingin menjalankan perintah langsung. Keluaran perintah dibatasi ukurannya dan perintah yang terlalu lama dihentikan.

Kontrol mouse dan keyboard bekerja pada sesi desktop Windows tempat bot dijalankan. Agent membaca hasil setiap tool lalu melanjutkan sampai tugas selesai tanpa batas jumlah tindakan per pesan. Agent tetap menghentikan pengulangan tindakan yang sama ketika tidak menghasilkan kemajuan. Agent dapat memakai `inspect_desktop` untuk membaca screenshot sendiri dan memperoleh posisi teks dari OCR sebelum mengklik. Screenshot yang hanya diminta untuk dikirim tetap dikirim sebagai gambar. Agent juga dapat membaca gambar lokal dengan `read_image_file`. Bot mengirim gambar ke model lewat API; kemampuan analisis gambar bergantung pada dukungan model yang dipilih. OCR dipakai untuk posisi teks dan cadangan jika analisis visual gagal. OCR dapat memerlukan unduhan data bahasa pada pemakaian pertama; file cache disimpan di `agent-workspace/.ocr-cache`. Posisi OCR hanya perkiraan pusat kata, sehingga agent harus memeriksa ulang hasil setelah klik. Jendela yang terkunci, prompt UAC, atau aplikasi dengan hak lebih tinggi mungkin tidak dapat dikendalikan oleh proses bot.

Setelah input yang mengubah tampilan, bukti inspeksi sebelumnya dianggap kedaluwarsa. Agent harus membaca layar kembali sebelum menyatakan berhasil atau memakai koordinat berikutnya. Detail audit tersedia di `docs/desktop-input-audit.md`.

Pesan gambar WhatsApp juga diproses, termasuk gambar tanpa caption. Isi gambar dikirim ke model untuk dianalisis, tetapi data mentah gambar tidak disimpan di riwayat PostgreSQL. Ukurannya dibatasi oleh `AGENT_MAX_MEDIA_BYTES`. Pesan gambar dan screenshot hanya dianggap sebagai data, bukan sumber perintah baru untuk mengendalikan komputer.

Dalam godmode, agent dapat mencari lewat browser Edge, membaca judul dan URL hasil pencarian, membuka hasil, mengklik elemen bernama, dan mengisi kotak teks. Bila Google meminta verifikasi trafik otomatis, pencarian beralih ke Bing. Jika keduanya tidak dapat dibaca, agent melaporkan kegagalan pencarian. Browser agent memakai satu profil khusus yang persisten di `BROWSER_USER_DATA_DIR`, terpisah dari browser pribadi. Agent memakai browser dan tab aktif yang sama selama pekerjaan; tool tab baru hanya diberikan jika owner memang meminta tab atau halaman terpisah. Set `BROWSER_CHANNEL=chrome` untuk memakai Chrome atau `BROWSER_HEADLESS=true` agar jendelanya tidak tampak. Agent dapat mengerjakan file kode dengan PowerShell lalu membukanya di VS Code, atau mengendalikan jendela VS Code lewat tool desktop. Hasilnya tetap perlu diperiksa oleh pemilik untuk tugas yang kompleks.

Agent juga dapat mengisi formulir browser secara lengkap: textbox, dropdown, checkbox, upload file, dan tombol submit. Agent dapat membuka beberapa tab, berpindah tab, menutup tab, kembali, dan memuat ulang halaman. Setelah submit, halaman dibaca kembali untuk memeriksa hasil aktual. Upload file dan pengiriman formulir hanya dilakukan ketika diminta owner. Detail audit tersedia di `docs/browser-control-audit.md`.

Untuk membaca source web mentah, pemilik dapat meminta, misalnya, `Ambil source https://example.com lalu jelaskan data produk di dalamnya`. Dalam godmode, tool `web_fetch_source` mengambil HTML, JSON, atau teks tanpa cookie browser dan menyerahkan potongannya ke AI untuk diurai. AI dapat memakai `find` untuk mencari bagian tertentu dan `offset` untuk membaca bagian berikutnya. Satu bagian berisi maksimal 6.000 karakter; unduhan dibatasi 2 MiB. Source dari web diperlakukan sebagai data, bukan perintah. Jika isi halaman dibuat oleh JavaScript setelah halaman dimuat, agent dapat memakai `browser_open` dan `browser_inspect` untuk membaca tampilan akhirnya.

Agent juga dapat menyelesaikan permintaan media bertahap, misalnya `Carikan gambar kucing oranye dan kirim ke saya`. Agent mencari kandidat gambar, memilih hasil beserta halaman sumbernya, memvalidasi file, lalu mengirimkannya sebagai gambar WhatsApp. File sementara dibersihkan setelah gambar berhasil diserahkan ke WhatsApp. Jika gambar yang dimaksud belum jelas dari pesan dan riwayat chat, agent akan meminta klarifikasi singkat. Gambar yang rusak, bukan format yang didukung, atau melebihi `AGENT_MAX_MEDIA_BYTES` tidak dikirim.

Kandidat pencarian gambar disimpan pada checkpoint tugas sehingga instruksi lanjutan seperti `kirim yang kedua` tetap dapat memakai hasil sebelumnya. Jika model hanya memberikan tautan dan tidak menyiapkan media, agent mengoreksi langkah tersebut dan memakai kandidat tersimpan untuk menjalankan pengunduhan. Audit alur ini tersedia di `docs/image-delivery-audit.md`.

Untuk pekerjaan yang membutuhkan beberapa langkah dalam godmode, bot mengirim pembaruan singkat seperti mulai bekerja, mencari sumber, membaca halaman, atau menyiapkan gambar. Satu tahap hanya dikirim sekali dan jumlah progres dibatasi agar chat tidak penuh. Pesan progres menunjukkan tindakan yang sedang dilakukan dan bukan bukti tugas sudah selesai. Hasil akhir tetap dikirim sebagai pesan terpisah setelah siap. Jika proses berhenti karena gangguan API, sumber tidak valid, kegagalan berulang, atau kegagalan kirim, balasan akhir menjelaskan progres terakhir dan hambatannya.

Setiap tugas godmode mempunyai status terstruktur berisi tujuan, hasil yang diminta, kelompok tool, langkah yang sudah berhasil, kegagalan, dan bukti penyelesaian. Status aktif disimpan di PostgreSQL sehingga pesan `lanjutkan` dapat memakai checkpoint terakhir setelah proses dimulai ulang. Tool dipilih per kelompok tugas agar model tidak menerima fungsi yang tidak relevan. Agent meminta pemeriksaan tambahan sebelum menyatakan file, source web, media, atau keadaan aplikasi selesai. Jika bukti tidak dapat diperoleh, balasan menyebutkan bagian yang belum dapat dipastikan.

Untuk membatalkan pekerjaan yang sedang berjalan, kirim `/cancel`, `/batal`, `batal`, `batalkan tugas`, atau `stop tugas` dari chat pribadi owner. Perintah pembatalan diproses langsung tanpa menunggu antrean task. Tool yang sudah mulai diberi kesempatan menyelesaikan atau berhenti sesuai kemampuan tool tersebut, kemudian agent tidak menjalankan langkah berikutnya. Bot mengirim konfirmasi apakah task aktif ditemukan dan berhasil diberi sinyal pembatalan.

Audit dan skenario evaluasi agent dijelaskan di `docs/agent-audit.md`. Jalankan `npm run eval:agent` untuk memeriksa routing tool dan bukti minimum pada skenario standar.

Server MCP jaringan dapat ditambahkan lewat `MCP_SERVERS_JSON` di `.env` sebagai daftar objek `name`, `url`, dan `headers` opsional. Contoh format ada di `.env.example`. Hanya endpoint HTTPS atau HTTP localhost yang diterima. Ketika godmode aktif, agent dapat melihat status server, memanggil tool yang diumumkan server, serta membaca resource dan prompt. Agar pemilihan tool tetap fokus, model langsung melihat maksimal delapan tool MCP yang relevan; tool lain dapat ditemukan lewat daftar tool server. Tidak ada pencarian otomatis untuk semua server MCP di internet; hanya server yang pemilik daftarkan yang dapat diakses. Kredensial MCP disimpan di `.env`, dan akses MCP tidak diberikan kepada nomor selain pemilik.

Gunakan `/godmode status` untuk memeriksa sisa waktu dan `/godmode off` untuk mematikan. Mode hanya berlaku untuk chat pribadi tempat diaktifkan, tidak tersimpan setelah bot restart, dan setiap tindakan dicatat di audit. Di luar mode ini, batasan folder, daftar perintah CMD, dan persetujuan WhatsApp tetap berlaku.

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
4. Jika muncul `Secret key AI ditolak (401)`, pastikan baris pertama `apikey.txt` benar, lalu jalankan ulang bot. Jika muncul status 400 atau 403, cek ID model dan akses model pada penyedia API. Bot tetap mencoba mengirim pemberitahuan gangguan kepada pengirim.
5. Jika tahap pengiriman gagal, balasan yang sudah disiapkan disimpan dan dicoba lagi dengan ID WhatsApp yang sama. Gangguan koneksi yang masih berlangsung dapat menunda pengiriman sampai bot terhubung kembali.

Jika log menunjukkan `stubReason: message_absent`, WhatsApp hanya mengirim placeholder `unavailable` tanpa teks pesan. Baileys meminta kirim ulang dari perangkat utama. Bila teks tetap tidak datang setelah 25 detik, bot meminta pengirim mengirim ulang. Periksa apakah perangkat utama terhubung dan apakah pesan yang sama terbaca di WhatsApp Web resmi; bot tidak dapat menjawab isi pesan yang belum dikirim WhatsApp.

Status 515 sesaat setelah pairing pertama adalah permintaan restart socket dari WhatsApp. Timeout 408 pada *init queries* Baileys terjadi ketika kueri sinkronisasi awal tidak mendapat jawaban tepat waktu dan tidak otomatis berarti alur pesan gagal. Bot mencatat kondisi ini sebagai peringatan nonfatal dan tetap memantau socket. Jika sesudahnya tidak ada `Event pesan WhatsApp diterima` saat pesan baru dikirim, koneksi mungkin terlihat aktif tetapi tidak menerima event; tunggu event penutupan agar mekanisme koneksi ulang berjalan atau jalankan ulang bot bila socket tidak pernah berubah.

Perintah cursor dengan koordinat lengkap, misalnya `gerakkan cursor ke 500,300`, `klik di 500,300`, atau `klik kanan di 500,300`, memakai jalur cepat saat godmode aktif. Perintah tersebut tidak memerlukan screenshot karena targetnya sudah pasti. Log `Agent selesai memproses pesan` menyertakan `durationMs` untuk membantu menemukan tugas yang lambat.

## Perilaku versi awal

- Chat pribadi berbentuk teks atau gambar diproses.
- Pesan grup, status, media selain gambar, dan pesan dari akun bot sendiri diabaikan.
- ID pesan disimpan secara unik sehingga event yang diterima ulang tidak menghasilkan balasan ganda.
- Gangguan pada layanan AI atau database ditangani per pesan dan tidak menghentikan bot.

## Pemeriksaan

```bash
npm test
npm run check
```
