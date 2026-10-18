# Audit AI Agent

## Ringkasan temuan

Audit issue #10 menemukan empat penyebab utama agent terlihat kurang mampu menyelesaikan tugas:

1. Status tujuan dan hasil tool hanya berada di dalam percakapan model. Tidak ada catatan tugas terstruktur yang dapat dipakai kembali setelah proses terputus.
2. Hampir seluruh tool godmode diberikan pada setiap permintaan. Model kecil harus memilih dari terlalu banyak fungsi yang tidak relevan.
3. Respons tool dianggap berhasil berdasarkan bentuk respons, sementara kebutuhan hasil akhir belum diperiksa.
4. Model dapat memberikan jawaban akhir meskipun bukti yang diperlukan, seperti media, source web, file, atau keadaan aplikasi, belum tersedia.

## Perbaikan

- `src/task-state.js` menentukan tujuan, jenis hasil, kelompok tool, bukti wajib, langkah selesai, dan kegagalan.
- Definisi tool dipilih berdasarkan tugas. Tool web, file, desktop, kamera, sistem, dan MCP tidak selalu diberikan bersamaan.
- Hasil tool dinormalisasi menjadi status, ringkasan, jenis kegagalan, dan bukti.
- Kegagalan identik dihentikan setelah dua percobaan. Model diminta memilih pendekatan lain atau melaporkan hambatan.
- Jawaban akhir melewati gerbang verifikasi. Agent meminta langkah pemeriksaan tambahan ketika bukti hasil akhir belum lengkap.
- Checkpoint tugas disimpan di tabel `agent_tasks`. Pesan lanjutan dapat memakai tugas aktif terakhir tanpa mengulang efek yang sudah tercatat.
- Owner dapat membatalkan task aktif secara realtime dari WhatsApp. Sinyal pembatalan diperiksa di antara setiap langkah tanpa menunggu antrean percakapan selesai.
- Progres tetap berasal dari tool yang benar-benar akan dijalankan dan diduplikasi per tahap oleh alur WhatsApp.

## Menjalankan evaluasi

Jalankan pemeriksaan otomatis:

```bash
npm test
npm run check
npm run eval:agent
```

Skenario berada di `evals/agent-scenarios.json`. Setiap skenario memiliki masukan, kelompok tool, bukti wajib, dan hasil manual yang harus diperiksa melalui WhatsApp.

Untuk menambah skenario, tambahkan objek baru dengan format yang sama. Untuk menambah tool, masukkan tool ke kelompok yang sesuai dalam `TOOL_GROUPS` pada `src/task-state.js`, lalu tambahkan aturan bukti jika tool tersebut menghasilkan artefak atau memeriksa keadaan.

## Cara membaca hasil

`npm run eval:agent` memeriksa routing dan bukti minimum secara deterministik. `npm test` memeriksa loop tool, pencegahan pengulangan, verifikasi, dan alur WhatsApp. Pengujian manual tetap diperlukan untuk membuktikan integrasi dengan model, desktop Windows, situs eksternal, dan pengiriman media WhatsApp.

Agent harus melaporkan hambatan jika pengujian manual tidak menghasilkan bukti yang diwajibkan. Jawaban seperti "sudah selesai" tanpa bukti tersebut dianggap gagal.

## Batasan audit

- Checkpoint mencegah hilangnya konteks, tetapi tugas tidak dijalankan otomatis saat bot baru dimulai. Pemilik mengirim `lanjutkan` untuk meneruskan tugas aktif.
- Keberhasilan pengiriman media terakhir tetap ditentukan oleh mekanisme retry pesan WhatsApp yang sudah ada.
- Kualitas pemilihan sumber dan isi jawaban masih bergantung pada model. Evaluasi deterministik memastikan model menerima tool dan syarat verifikasi yang tepat.
- Aplikasi yang tidak menyediakan proses atau tampilan yang dapat diperiksa akan dilaporkan belum terverifikasi.
