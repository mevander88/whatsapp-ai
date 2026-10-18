# Kesadaran Kemampuan Bot

Sebelum menjawab, model menerima inventaris kemampuan yang dibuat dari tool yang benar-benar tersedia pada proses bot.

Inventaris membedakan:

- Kemampuan yang dikenal dalam mode aktif.
- Tool yang boleh dipanggil pada pesan saat ini.
- Mode persetujuan dan godmode.
- Pertanyaan kemampuan dan perintah eksekusi.

Aturannya:

1. Cocokkan permintaan dengan inventaris sebelum menjawab.
2. Jangan menolak kemampuan yang tercantum.
3. Jangan mengaku berhasil tanpa hasil eksekusi aktual.
4. Pertanyaan kemampuan membaca inventaris tanpa menjalankan tindakan.
5. Setelah sebuah cara gagal, periksa kemampuan lain yang relevan sebelum menyerah.
6. Nama tool hanya untuk konteks internal dan tidak ditampilkan dalam jawaban pengguna.

Inventaris dibuat ulang pada setiap giliran. Dengan begitu, jawaban mengikuti mode serta integrasi yang sedang tersedia dan tidak hanya bergantung pada ingatan model.
