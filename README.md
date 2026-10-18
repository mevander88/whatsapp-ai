# WhatsApp AI Bot

> **Status: Beta (`v1.0.0-beta.1`)**
>
> Rilis ini ditujukan untuk pengujian dan evaluasi. API internal, konfigurasi, dan perilaku otomasi masih dapat berubah sebelum rilis stabil.

Bot WhatsApp berbasis Node.js yang menghubungkan pesan pribadi ke model AI melalui API OpenAI-compatible. Aplikasi menyimpan riwayat dan status pekerjaan di PostgreSQL, mempertahankan sesi WhatsApp melalui Baileys, serta menyediakan otomasi komputer untuk pemilik yang terdaftar.

> Proyek ini memakai koneksi WhatsApp Web tidak resmi melalui `@itsukichan/baileys`. Perubahan protokol WhatsApp dapat memengaruhi koneksi dan proses login.

## Fitur utama

- Membalas teks dan membaca gambar dari chat pribadi.
- Menyimpan riwayat, status pengiriman, audit tindakan, dan checkpoint tugas di PostgreSQL.
- Mempertahankan sesi WhatsApp agar QR tidak perlu dipindai pada setiap startup.
- Mendukung teks, media, tombol, daftar, dan polling.
- Menjalankan tugas bertahap dengan progres, verifikasi, retry alternatif, dan pembatalan realtime.
- Membedakan pertanyaan dari perintah sebelum memberikan akses tool.
- Menyusun inventaris kemampuan aktual pada setiap pesan.
- Mengontrol aplikasi, mouse, keyboard, layar, kamera, file, PowerShell, dan browser pada Windows.
- Membaca screenshot dengan OCR cepat atau analisis visual detail.
- Mengambil source web, mengirim gambar, mengisi formulir, dan memakai server MCP.

## Cara kerja singkat

Setelah terhubung, bot menerima pesan WhatsApp, memahami permintaan melalui model AI, lalu memberikan jawaban atau menjalankan tindakan yang tersedia. Riwayat percakapan dan status tugas disimpan agar pekerjaan dapat dilanjutkan dan dipantau dengan lebih konsisten.

## Persyaratan

### Wajib

- Node.js 20 atau lebih baru.
- PostgreSQL.
- Akun WhatsApp yang dapat menautkan perangkat.
- Secret key dan base URL penyedia API OpenAI-compatible.

### Fitur Windows

- Sesi desktop Windows aktif untuk kontrol aplikasi, mouse, keyboard, dan screenshot.
- FFmpeg di `PATH` untuk kamera.
- Microsoft Edge atau Google Chrome untuk otomasi browser.

Fitur chat dan AI tetap dapat berjalan tanpa fitur desktop Windows.

## Instalasi

### 1. Pasang dependency

```bash
npm install
```

### 2. Buat database

```powershell
createdb -U postgres whatsapp_ai
```

Aplikasi membuat tabel dan indeks secara otomatis. Nama database harus sama dengan nilai pada `DATABASE_URL`.

### 3. Siapkan `.env`

```powershell
Copy-Item .env.example .env
```

Konfigurasi minimum:

```dotenv
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/whatsapp_ai
OWNER_NUMBERS=6281234567890
```

Gunakan nomor WhatsApp dengan kode negara tanpa tanda `+`. Pisahkan beberapa nomor dengan koma.

### 4. Siapkan kredensial AI

Buat `apikey.txt` di root proyek. Baris pertama berisi secret key. Isi berikutnya harus mencantumkan frasa `base URL` dan endpoint HTTPS OpenAI-compatible.

```text
sk-SECRET_KEY_ANDA

OpenAI-compatible base URL: https://provider.example/v1
```

`apikey.txt` dan `.env` diabaikan oleh Git. Jangan commit kedua file tersebut. Gunakan `AI_KEY_FILE` bila kredensial berada di lokasi lain.

### 5. Jalankan aplikasi

```bash
npm start
```

Pada login pertama, pindai QR terminal melalui **WhatsApp → Perangkat tertaut → Tautkan perangkat**. Tunggu log `WhatsApp terhubung` sebelum mengirim pesan.

Folder `auth_info_baileys` menyimpan sesi login. Simpan pada volume persisten dan perlakukan isinya sebagai kredensial.

## Konfigurasi

Seluruh variabel tersedia pada [.env.example](./.env.example).

### AI dan database

| Variabel | Default | Keterangan |
| --- | --- | --- |
| `DATABASE_URL` | wajib | Connection string PostgreSQL. |
| `AI_KEY_FILE` | `./apikey.txt` | File secret key dan base URL. |
| `AI_MODEL` | `deepseek-v4.1-flash` | ID model pada penyedia API. |
| `SYSTEM_PROMPT` | prompt bawaan | Instruksi dasar percakapan. |
| `AI_TIMEOUT_MS` | `30000` | Timeout AI dalam milidetik. |
| `HISTORY_LIMIT` | `10` | Jumlah riwayat yang dikirim ke model. |

### WhatsApp

| Variabel | Default | Keterangan |
| --- | --- | --- |
| `SESSION_PATH` | `./auth_info_baileys` | Folder sesi Baileys. |
| `LOG_LEVEL` | `info` | Level log. Gunakan `debug` untuk diagnosis. |
| `WHATSAPP_CONNECT_TIMEOUT_MS` | `30000` | Timeout pembukaan koneksi. |
| `WHATSAPP_MAX_RECONNECT_ATTEMPTS` | `5` | Maksimum reconnect otomatis. |
| `WHATSAPP_WEB_VERSION` | kosong | Override `2,3000,revision`; sebaiknya kosong. |

### Akses komputer

| Variabel | Default | Keterangan |
| --- | --- | --- |
| `OWNER_NUMBERS` | kosong | Nomor yang boleh memakai kemampuan komputer. |
| `AGENT_ALLOWED_PATHS` | `./agent-workspace` | Root file dalam mode biasa. |
| `AGENT_ALLOWED_APPS` | kosong | Aplikasi yang diizinkan dalam mode biasa. |
| `AGENT_ALLOWED_CMD_COMMANDS` | daftar diagnostik | Perintah CMD yang dapat diajukan. Isi `none` untuk menonaktifkan. |
| `AGENT_APPROVAL_TTL_MINUTES` | `10` | Masa berlaku approval. |
| `AGENT_GODMODE_TTL_MINUTES` | `30` | Masa aktif godmode. |
| `AGENT_MAX_FILE_BYTES` | `32768` | Batas file teks. |
| `AGENT_MAX_MEDIA_BYTES` | `10485760` | Batas media. |

### Kamera, OCR, browser, dan MCP

| Variabel | Default | Keterangan |
| --- | --- | --- |
| `CAMERA_DEVICE_NAME` | perangkat pertama | Nama kamera DirectShow. |
| `CAMERA_FFMPEG_PATH` | `ffmpeg` | Executable FFmpeg. |
| `OCR_LANGUAGES` | `eng,ind` | Bahasa Tesseract.js. |
| `BROWSER_CHANNEL` | `msedge` | `msedge` atau `chrome`. |
| `BROWSER_HEADLESS` | `false` | Jalankan browser tanpa jendela. |
| `BROWSER_USER_DATA_DIR` | `./agent-workspace/browser-profile` | Profil browser persisten bot. |
| `MCP_SERVERS_JSON` | kosong | Daftar server MCP dalam JSON satu baris. |

Contoh MCP:

```dotenv
MCP_SERVERS_JSON=[{"name":"internal","url":"https://example.com/mcp","headers":{"Authorization":"Bearer token"}}]
```

Hanya endpoint HTTPS atau HTTP localhost yang diterima.

## Mode akses

### Pengguna biasa

Pengguna selain owner hanya mendapat jawaban umum. Tool komputer tidak diberikan kepada model.

### Owner dengan approval

Di luar godmode, tindakan komputer dibatasi konfigurasi dan memerlukan approval melalui tombol **Setujui/Tolak** atau balasan:

```text
SETUJUI <kode>
TOLAK <kode>
```

File sensitif seperti `.env`, `apikey.txt`, sesi WhatsApp, private key, `.git`, dan `node_modules` diblokir oleh path policy.

### Godmode

Aktifkan dari chat pribadi owner:

```text
/godmode
```

Godmode menjalankan tindakan tanpa approval tambahan dengan hak akses akun Windows bot. Kemampuannya mencakup PowerShell, aplikasi, file, browser, kamera, screenshot, mouse, keyboard, OCR, dan server MCP yang dikonfigurasi.

| Perintah | Fungsi |
| --- | --- |
| `/godmode` | Mengaktifkan godmode. |
| `/godmode status` | Menampilkan sisa waktu. |
| `/godmode off` | Mematikan godmode. |
| `/exec <PowerShell>` | Menjalankan PowerShell langsung. |
| `/cancel`, `/batal` | Membatalkan tugas aktif. |

Godmode hanya berlaku pada chat tempat mode diaktifkan dan tidak disimpan setelah restart.

## Perilaku agent

### Intent dan kemampuan

Pesan diklasifikasikan sebelum tool diberikan:

- `Apakah kamu bisa membuka Chrome?` dijawab tanpa tindakan.
- `Buka Chrome` diproses sebagai perintah.

Setiap giliran menerima inventaris kemampuan aktual dan tool yang boleh dipanggil. Model tidak boleh menolak kemampuan yang tersedia atau mengaku dapat memakai tool yang tidak terpasang.

### Tugas bertahap

Dalam godmode, agent:

1. Menentukan hasil akhir.
2. Memilih tool relevan.
3. Menyimpan hasil, kegagalan, artefak, dan bukti.
4. Mencoba pendekatan berbeda setelah kegagalan.
5. Menghindari tindakan identik tanpa kemajuan.
6. Mengirim progres terbatas dan hasil akhir.

Checkpoint disimpan di PostgreSQL. Pesan `lanjutkan` dapat memakai task aktif terakhir. Progres sukses dibatasi agar chat tidak penuh; kegagalan tetap dilaporkan langsung.

### Desktop dan OCR

`inspect_desktop` memakai OCR cepat untuk teks dan koordinat. Analisis visual detail digunakan untuk ikon atau elemen nonteks. Koordinat eksplisit menggunakan jalur cepat tanpa screenshot:

```text
gerakkan cursor ke 500,300
klik di 500,300
klik kanan di 500,300
klik dua kali di 500,300
```

Layar terkunci, Secure Desktop UAC, dan aplikasi dengan integrity level lebih tinggi dapat menolak input otomatis.

### Browser

Browser memakai satu profil persisten dan mempertahankan halaman aktif. Agent dapat mencari web, membaca DOM, mengelola tab, mengisi field, memilih dropdown, mengatur checkbox, mengunggah file, dan submit formulir. Form hanya dikirim ketika tujuan owner memerlukannya.

Source HTML, JSON, atau teks dapat diambil tanpa cookie browser. Konten eksternal diperlakukan sebagai data, bukan instruksi.

### Pesan dan media

- Hanya chat pribadi berbentuk teks atau gambar yang diproses.
- Grup, status, media lain, dan pesan bot sendiri diabaikan.
- Gambar mentah tidak disimpan pada riwayat PostgreSQL.
- ID pesan unik mencegah balasan ganda.
- Balasan yang sudah disiapkan tetap tersimpan bila pengiriman gagal.

## Data dan keamanan

| Lokasi | Isi | Perlakuan |
| --- | --- | --- |
| `.env` | Konfigurasi dan header MCP | Jangan commit. |
| `apikey.txt` | Secret key AI | Jangan commit. |
| `auth_info_baileys/` | Sesi WhatsApp | Jangan commit atau bagikan. |
| `agent-workspace/browser-profile/` | Cookie dan sesi browser | Simpan secara privat. |
| PostgreSQL | Pesan, reply, audit, dan checkpoint | Atur backup dan retensi. |

Log menyaring field sensitif dan memakai `messageTag` untuk menghubungkan tahap pemrosesan tanpa menampilkan nomor atau isi pesan.

## Pengembangan

```bash
npm test
npm run check
npm run eval:agent
```

Pengujian berada pada folder `test/`. Perubahan pada alur pesan, intent, tool, atau task state sebaiknya menyertakan pengujian perilaku yang relevan.

## Troubleshooting

### Database tidak ditemukan

Buat database yang sama dengan nama pada `DATABASE_URL`, kemudian jalankan ulang bot.

### QR tidak muncul

1. Periksa akses jaringan ke WhatsApp Web.
2. Pastikan dependency sesuai `package-lock.json`.
3. Pastikan folder sesi tidak berisi sesi aktif lain.
4. Untuk login ulang sambil menyimpan cadangan:

   ```powershell
   Rename-Item auth_info_baileys auth_info_baileys-backup
   npm start
   ```

Status 515 setelah pairing adalah permintaan restart socket dan ditangani otomatis. Init queries tambahan dinonaktifkan karena tidak digunakan dan dapat menghasilkan timeout 408 nonfatal.

### Terhubung tetapi tidak membalas

Cari urutan log dengan `messageTag` yang sama:

```text
Pesan pribadi diterima
Membaca riwayat percakapan
Memproses pesan dengan agent
Agent selesai memproses pesan
Balasan tersimpan untuk dikirim
Balasan diserahkan ke WhatsApp
```

Gunakan `LOG_LEVEL=debug` bila event tidak mencapai tahap pertama. `reason: from_me` berarti event berasal dari pesan bot dan sengaja diabaikan.

### API AI gagal

- `401`: periksa secret key pada baris pertama `apikey.txt`.
- `403`: periksa akses akun dan model pada penyedia.
- Timeout: periksa jaringan, `AI_TIMEOUT_MS`, dan kesehatan penyedia.
- Model tidak ditemukan: cocokkan `AI_MODEL` dengan endpoint `/models`.

Restart aplikasi setelah mengubah key, base URL, atau model.

### OCR pertama lambat

Tesseract.js menyiapkan worker dan cache bahasa pada pemakaian awal. Bot melakukan warmup setelah startup. Cache disimpan di `agent-workspace/.ocr-cache`.

## Dokumentasi lanjutan

| Dokumen | Topik |
| --- | --- |
| [DOCS.md](./DOCS.md) | Referensi Baileys dalam repository. |
| [Agent audit](./docs/agent-audit.md) | Routing, task state, dan evaluasi. |
| [Capability awareness](./docs/capability-awareness.md) | Inventaris kemampuan. |
| [Intent and recovery](./docs/intent-and-recovery-audit.md) | Klasifikasi dan retry. |
| [Desktop input](./docs/desktop-input-audit.md) | Mouse, keyboard, dan verifikasi. |
| [Desktop response time](./docs/desktop-response-time-audit.md) | Jalur cepat desktop. |
| [OCR performance](./docs/ocr-performance.md) | OCR cepat dan analisis detail. |
| [Browser control](./docs/browser-control-audit.md) | Browser dan formulir. |
| [Image delivery](./docs/image-delivery-audit.md) | Pencarian dan pengiriman gambar. |
| [Repeated response](./docs/repeated-response-audit.md) | Deduplikasi dan progres. |
| [Baileys init queries](./docs/baileys-init-query-audit.md) | Timeout sinkronisasi awal. |
| [Conversation style](./docs/conversation-style.md) | Gaya komunikasi. |

## Lisensi

Proyek menggunakan lisensi ISC sebagaimana tercantum pada `package.json`.
