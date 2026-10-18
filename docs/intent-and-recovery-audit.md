# Audit Intent dan Pemulihan Tindakan

## Pembedaan pesan

Bot mengklasifikasikan pesan sebelum memberikan tool kepada model:

- Perintah eksplisit seperti `Buka Chrome`, `Tolong klik tombol Simpan`, atau `Periksa RAM komputer` dapat menjalankan tindakan.
- Pertanyaan seperti `Apakah kamu bisa buka Chrome?`, `Bisa gerakkan cursor?`, atau `Bagaimana cara membuka VS Code?` dijawab tanpa tool dan tanpa mengubah komputer.
- Pesan percakapan biasa dijawab sebagai percakapan.

Pertanyaan yang membutuhkan kondisi komputer akan meminta owner memberikan perintah eksplisit sebelum pemeriksaan dilakukan.

## Pemulihan kegagalan

Jika suatu tool gagal, agent:

1. Menyimpan jenis kegagalan dan hasil aktual.
2. Mengirim pembaruan kegagalan ke WhatsApp.
3. Meminta model memilih tool, input, atau pendekatan berbeda.
4. Menghindari pengulangan tindakan identik yang sudah gagal.
5. Mengirim pembaruan untuk langkah yang berhasil.
6. Melanjutkan sampai tujuan selesai, dibatalkan owner, membutuhkan informasi owner, atau pendekatan relevan telah habis.

Pesan progres menggunakan tahap unik sehingga kegagalan dan keberhasilan dari langkah berbeda tetap terlihat selama tugas berjalan.
