# Audit Error Task Kosong dan Pesan Progres Berulang

## Error `taskContext(null)`

Pesan berbentuk pertanyaan tidak membuat task eksekusi. Jalur fallback lama masih dapat mencoba memilih tindakan komputer dan memanggil `taskContext` dengan nilai kosong. Hal ini menghasilkan `Cannot read properties of null (reading 'id')`.

Perbaikannya:

- Retry tindakan hanya berjalan untuk pesan yang sudah diklasifikasikan sebagai perintah.
- Tool call komputer yang tidak semestinya dikembalikan model untuk sebuah pertanyaan diabaikan.
- Tool format WhatsApp seperti tombol tetap dapat digunakan untuk menjawab pertanyaan.
- `taskContext` menyediakan struktur kosong yang valid sebagai pertahanan terakhir.

## Pesan progres berulang

Setiap langkah berhasil sebelumnya menghasilkan pesan WhatsApp baru. Tugas panjang dapat mengirim belasan pesan dan setiap pesan keluar menghasilkan event `append` dari akun bot sendiri.

Perbaikannya:

- Pembaruan sukses dibatasi paling sering sekali setiap 15 detik.
- Pembaruan biasa dibatasi agar tidak membanjiri chat.
- Kegagalan tetap langsung diberitahukan.
- Balasan hasil akhir tetap selalu dikirim.

Log `reason: from_me` menunjukkan event pesan yang dikirim bot sendiri berhasil dikenali dan diabaikan. Event tersebut bukan pemrosesan ulang dan tidak menjalankan agent kembali.
