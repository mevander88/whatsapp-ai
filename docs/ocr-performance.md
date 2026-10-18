# Performa Pembacaan Layar dan OCR

## Jalur cepat

`inspect_desktop` menggunakan mode `fast` secara default. Mode ini:

- Mengambil screenshot satu kali.
- Menjalankan OCR lokal tanpa menunggu analisis vision dari API.
- Mengembalikan teks dan koordinat yang dapat dipakai untuk klik.
- Cocok untuk tombol, menu, formulir, judul jendela, dan antarmuka berbasis teks.

Mesin OCR mulai dipersiapkan di latar belakang setelah bot aktif. Cache bahasa tetap disimpan agar penggunaan berikutnya lebih cepat.

## Mode detail

Mode `detailed` digunakan bila target berupa ikon, gambar, atau tata letak yang tidak dapat dikenali lewat teks. Analisis vision dan OCR dijalankan bersamaan agar durasinya mengikuti proses yang paling lambat, bukan jumlah waktu keduanya.

Contoh keputusan:

- Tombol bertuliskan `Simpan`: gunakan mode cepat.
- Ikon tanpa label atau isi gambar: gunakan mode detail.
- Koordinat sudah diberikan owner: langsung lakukan tindakan tanpa screenshot.
