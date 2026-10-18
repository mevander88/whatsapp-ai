# Audit Kontrol Mouse dan Keyboard

## Temuan

Kontrol desktop sebelumnya hanya menyediakan klik pada koordinat, pengetikan teks, dan pintasan keyboard dasar. Agent belum mempunyai tool khusus untuk membaca atau memindahkan posisi kursor, drag, scroll horizontal dan vertikal, serta pintasan tombol Windows. Akibatnya model cenderung memakai klik berulang atau PowerShell umum untuk interaksi yang seharusnya dilakukan melalui tool desktop.

Agent juga dapat memakai hasil inspeksi lama setelah layar berubah. Koordinat dari OCR menjadi tidak sesuai setelah klik, drag, scroll, atau pengetikan mengubah tampilan.

## Perbaikan

Tool godmode sekarang mencakup:

- membaca posisi kursor;
- memindahkan kursor tanpa klik;
- klik kiri, kanan, dan ganda;
- drag kiri atau kanan antar koordinat;
- scroll vertikal dan horizontal;
- mengetik teks tanpa batas jumlah karakter buatan agent;
- pintasan Ctrl, Alt, dan Shift;
- pintasan Windows seperti Win+R dan Win+D;
- fokus jendela dan inspeksi desktop.

Tidak ada batas jumlah tindakan per pesan. Agent tetap menghentikan pengulangan identik yang tidak menghasilkan kemajuan.

## Alur Interaksi

1. Fokuskan aplikasi yang dituju.
2. Inspeksi desktop untuk mendapatkan keadaan dan koordinat terbaru.
3. Jalankan input mouse atau keyboard.
4. Anggap hasil inspeksi lama tidak berlaku setelah tampilan berubah.
5. Inspeksi kembali sebelum menyatakan langkah berhasil atau memilih koordinat berikutnya.

Tool input memakai sesi desktop Windows tempat bot berjalan. Koordinat mendukung desktop virtual dan nilai negatif untuk monitor yang berada di kiri atau atas monitor utama.

## Batas Teknis Sistem

Windows tetap dapat menolak input pada layar terkunci, secure desktop, prompt UAC, aplikasi dengan hak lebih tinggi, atau sesi pengguna lain. Kondisi tersebut harus dilaporkan berdasarkan hasil aktual dan tidak dianggap sebagai keberhasilan.
