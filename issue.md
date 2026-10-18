# Audit Kecerdasan dan Keandalan AI Agent untuk Tugas Kompleks

## Latar Belakang

AI Agent masih sering terlihat hanya bereaksi terhadap satu langkah, memilih tool yang kurang tepat, berhenti sebelum tujuan pengguna benar-benar selesai, atau menyatakan berhasil tanpa bukti hasil akhir. Penambahan tool saja belum membuat agent mampu memahami tujuan, menyusun langkah, menilai hasil, dan memperbaiki pendekatannya ketika terjadi kegagalan.

Audit ini harus menilai sistem agent secara menyeluruh. Fokus audit bukan sekadar mengubah system prompt, tetapi memastikan alur perencanaan, pemilihan tool, penyimpanan konteks, verifikasi hasil, pemulihan kesalahan, dan komunikasi progres bekerja sebagai satu kesatuan.

## Tujuan

Membuat AI Agent yang mampu:

- Memahami hasil akhir yang diminta pengguna, bukan hanya kata kunci pada pesan terakhir.
- Menyusun dan menjalankan beberapa langkah sampai tujuan selesai.
- Memilih tool yang sesuai berdasarkan kebutuhan tugas.
- Membaca hasil tool dan menggunakannya untuk menentukan langkah berikutnya.
- Memeriksa hasil nyata sebelum menyatakan tugas selesai.
- Mengubah rencana ketika tool gagal atau hasilnya tidak sesuai.
- Mempertahankan konteks tugas selama percakapan dan setelah gangguan sementara.
- Memberikan kabar progres yang jelas tanpa memenuhi chat dengan pesan berulang.

## Permasalahan yang Perlu Diaudit

### 1. Pemahaman Tujuan

Periksa apakah agent dapat membedakan antara permintaan, batasan, hasil akhir, dan informasi pendukung. Agent harus tetap mengingat tujuan utama walaupun tugas membutuhkan banyak tool atau beberapa kali percakapan.

### 2. Perencanaan Tugas

Periksa apakah agent membuat rencana kerja internal yang berisi tujuan, langkah aktif, langkah yang sudah selesai, hasil yang harus dihasilkan, dan hambatan yang ditemukan. Rencana harus dapat berubah mengikuti hasil aktual dari setiap tool.

### 3. Pemilihan Tool

Periksa apakah terlalu banyak tool diberikan kepada model dalam satu waktu sehingga membingungkan model. Pertimbangkan pemilihan kelompok tool secara dinamis berdasarkan maksud pengguna, seperti web, file, aplikasi, terminal, kamera, dan WhatsApp.

Agent tidak boleh membuat perintah palsu, memilih tool berdasarkan tebakan, atau mengaku memakai kemampuan yang sebenarnya tidak tersedia.

### 4. Pemahaman Hasil Tool

Periksa bentuk keluaran setiap tool. Hasil tool perlu dinormalisasi agar informasi penting mudah dipahami model, termasuk status, data utama, bukti keberhasilan, pesan kesalahan, dan saran tindakan berikutnya.

Hindari hasil yang terlalu panjang, terpotong pada bagian penting, atau berisi data teknis yang tidak membantu keputusan agent.

### 5. Verifikasi Hasil Akhir

Keberhasilan menjalankan tool belum tentu berarti permintaan pengguna selesai. Tambahkan pemeriksaan hasil sesuai jenis tugas, misalnya:

- Gambar dinyatakan terkirim hanya setelah file valid dan pesan media berhasil diserahkan ke WhatsApp.
- File dinyatakan dibuat setelah keberadaannya diperiksa dan isinya sesuai.
- Perintah dinyatakan berhasil berdasarkan exit code dan keluaran yang relevan.
- Aplikasi dinyatakan terbuka setelah proses atau jendelanya terdeteksi.
- Jawaban hasil pencarian harus sesuai dengan sumber yang benar-benar dibaca.

Agent tidak boleh memberikan laporan selesai ketika hasil belum diverifikasi.

### 6. Penanganan Kegagalan

Kelompokkan kegagalan seperti timeout, input tool tidak valid, akses ditolak, sumber tidak tersedia, hasil kosong, atau koneksi terputus. Agent harus mencoba pendekatan alternatif yang masuk akal dan tidak mengulangi tindakan gagal yang sama tanpa perubahan.

Jika tugas tidak dapat dilanjutkan, agent harus menjelaskan hambatan yang nyata dan informasi yang diperlukan dari pengguna.

### 7. Penggunaan Konteks

Audit cara riwayat percakapan dan status tugas disimpan. Agent harus dapat memahami rujukan seperti "gambar tadi", "lanjutkan", atau "kirim yang kedua" berdasarkan hasil sebelumnya.

Status tugas penting perlu bertahan ketika koneksi WhatsApp atau proses agent dimulai ulang, tanpa mengulangi tindakan yang sudah menghasilkan efek nyata.

### 8. Pertanyaan Klarifikasi

Agent hanya meminta klarifikasi ketika informasi penting benar-benar tidak tersedia. Untuk detail kecil, agent dapat memilih nilai standar yang aman dan menjelaskan pilihannya. Pertanyaan klarifikasi harus menyebutkan informasi yang dibutuhkan dan dampaknya terhadap tugas.

### 9. Laporan Progres

Pesan progres harus berasal dari status tugas yang sebenarnya, misalnya sedang mencari sumber, mengunduh gambar, memeriksa file, menjalankan perintah, atau mencoba kembali setelah kegagalan.

Terapkan pembatasan dan penggabungan pesan agar progres tidak berulang. Pesan terakhir harus menjelaskan hasil, bukti yang relevan, atau hambatan yang masih tersisa.

### 10. Konsistensi Model AI

Audit kemampuan model yang digunakan dalam menghasilkan pemanggilan tool terstruktur, mengikuti skema, dan melanjutkan tugas setelah menerima hasil tool. Tangani keluaran model yang tidak valid dengan perbaikan format atau percobaan ulang yang terbatas.

Konfigurasi model dan penyedia API harus tetap dapat diubah tanpa mengubah logika utama agent.

### 11. Keamanan dan Batas Akses

Pertahankan pemeriksaan identitas owner dan aturan mode akses yang sudah ada. Isi halaman web, gambar, dokumen, dan keluaran tool harus dianggap sebagai data, bukan instruksi baru yang dapat mengambil alih agent.

Log tidak boleh menampilkan token, kredensial, isi sesi WhatsApp, atau data pribadi yang tidak diperlukan.

## Rancangan Alur yang Diharapkan

1. Terima pesan dan konteks percakapan.
2. Tentukan tujuan, hasil akhir, batasan, dan informasi yang masih kurang.
3. Pilih kelompok tool yang relevan.
4. Susun langkah kerja singkat.
5. Jalankan satu langkah dan baca hasil aktualnya.
6. Perbarui status tugas dan tentukan langkah berikutnya.
7. Jika gagal, ubah pendekatan berdasarkan jenis kegagalan.
8. Verifikasi bahwa hasil akhir benar-benar tersedia.
9. Kirim hasil melalui format WhatsApp yang sesuai.
10. Simpan ringkasan hasil agar dapat digunakan pada pesan berikutnya.

Detail penalaran internal model tidak perlu dikirim kepada pengguna. Pengguna cukup menerima progres tindakan dan hasil yang dapat diperiksa.

## Skenario Audit Wajib

Gunakan skenario nyata berikut untuk menemukan kegagalan dan mengukur perbaikan:

1. **Pencarian dan pengiriman gambar**  
   "Carikan gambar kucing oranye yang jelas lalu kirim ke sini."  
   Agent harus mencari, memilih hasil yang relevan, mengunduh, memvalidasi, dan mengirimnya sebagai media.

2. **Riset beberapa sumber**  
   "Cari tiga pilihan laptop sesuai kebutuhan saya, bandingkan, lalu rekomendasikan satu."  
   Agent harus membaca sumber aktual, membandingkan informasi, dan menjelaskan dasar rekomendasi.

3. **Tugas file dan terminal**  
   "Buat file program sederhana, jalankan, lalu kirim hasilnya."  
   Agent harus membuat file, menjalankannya, memeriksa keluaran, dan melaporkan lokasi serta hasil.

4. **Diagnosis proyek**  
   "Cari penyebab npm start gagal dan perbaiki sampai dapat dijalankan."  
   Agent harus membaca error, memeriksa proyek, melakukan perbaikan yang sesuai, dan menjalankan pemeriksaan akhir.

5. **Konteks percakapan**  
   Setelah beberapa hasil ditemukan, pengguna mengatakan "kirim yang kedua". Agent harus memilih hasil kedua dari konteks yang benar.

6. **Permintaan ambigu**  
   "Kirim gambarnya." Agent harus menggunakan konteks sebelumnya atau meminta satu klarifikasi yang tepat jika konteks tidak cukup.

7. **Tool gagal**  
   Simulasikan timeout, hasil kosong, URL rusak, dan format keluaran tidak valid. Agent harus mencoba alternatif tanpa masuk ke pengulangan tanpa akhir.

8. **Gangguan proses**  
   Putuskan koneksi atau mulai ulang proses di tengah tugas. Agent harus melanjutkan dengan aman dan tidak mengirim hasil ganda.

## Evaluasi dan Pengujian

Buat kumpulan evaluasi yang dapat dijalankan ulang dengan masukan, hasil yang diharapkan, tool yang diizinkan, dan bukti keberhasilan. Sertakan kasus berhasil, gagal, ambigu, dan beberapa langkah.

Nilai setidaknya aspek berikut:

- Ketepatan memahami tujuan.
- Ketepatan memilih tool.
- Kemampuan menyelesaikan seluruh langkah.
- Kemampuan memulihkan kegagalan.
- Ketepatan verifikasi hasil.
- Konsistensi menggunakan konteks.
- Kejujuran laporan akhir.
- Jumlah tindakan yang tidak diperlukan.

Gunakan hasil evaluasi sebelum dan setelah perbaikan agar peningkatan dapat dibuktikan. Tambahkan pengujian otomatis untuk alur keputusan dan pengujian manual melalui WhatsApp untuk hasil nyata.

## Kriteria Penerimaan

- Agent menyimpan tujuan, rencana, status langkah, hasil tool, dan bukti penyelesaian selama tugas berjalan.
- Agent dapat menyelesaikan skenario beberapa langkah tanpa instruksi tambahan untuk setiap langkah normal.
- Agent memakai hasil tool untuk menentukan tindakan berikutnya dan tidak mengarang hasil.
- Agent tidak menyatakan selesai sebelum hasil akhir diverifikasi.
- Agent dapat mengganti pendekatan setelah tool gagal dan menghentikan pengulangan kesalahan yang sama.
- Agent memahami rujukan terhadap hasil sebelumnya dalam percakapan.
- Agent tidak mengulang tindakan yang memiliki efek nyata setelah reconnect atau restart.
- Pesan progres sesuai tindakan aktual, tidak berulang, dan tidak membocorkan penalaran internal.
- Balasan akhir menyebutkan hasil yang diperoleh dan bukti yang dapat diperiksa, atau hambatan yang benar-benar terjadi.
- Seluruh skenario audit wajib memiliki hasil pengujian yang tercatat.
- Dokumentasi menjelaskan cara menambah tool, menambah skenario evaluasi, dan membaca hasil audit.
- Seluruh pemeriksaan proyek dan pengujian yang relevan berhasil dijalankan.

## Hasil yang Harus Diserahkan

- Laporan audit berisi pola kegagalan, penyebab utama, dan prioritas perbaikan.
- Perbaikan arsitektur agent berdasarkan temuan audit.
- Kumpulan skenario evaluasi yang dapat dijalankan ulang.
- Perbandingan hasil sebelum dan setelah perbaikan.
- Dokumentasi singkat untuk pengembang berikutnya.

## Catatan Implementasi

Gunakan struktur yang sederhana dan mudah dirawat oleh Junior Programmer. Pisahkan tanggung jawab perencanaan, eksekusi tool, verifikasi, penyimpanan status, dan pengiriman progres. Hindari menjadikan satu prompt yang semakin panjang sebagai satu-satunya solusi untuk meningkatkan kemampuan agent.
