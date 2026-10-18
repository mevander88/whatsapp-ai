# Audit Pengiriman Gambar

## Temuan

Pengiriman gambar sebelumnya bergantung pada model untuk selalu melakukan urutan `web_image_search` lalu `web_download_image`. Ketika model berhenti setelah pencarian, memberikan tautan, atau kehilangan konteks kandidat pada pesan berikutnya, agent tidak menghasilkan media yang dapat dikirim oleh Baileys.

Kandidat pencarian hanya tersedia dalam percakapan tool saat itu. Checkpoint tugas hanya menyimpan nama tool dan ringkasan pendek, sehingga pilihan seperti "kirim yang kedua" tidak mempunyai daftar URL terstruktur yang dapat dipakai kembali.

Jalur Baileys sudah dapat mengirim respons bertipe `image`, menyimpan respons sebelum pengiriman, mencoba ulang ketika jaringan gagal, dan baru membersihkan file sementara setelah pesan berhasil dicatat. Ketidakkonsistenan utama terjadi sebelum tahap tersebut, yaitu saat agent belum menghasilkan respons media.

## Perbaikan

- Hasil `web_image_search` disimpan sebagai artefak kandidat gambar pada status tugas.
- Status yang diberikan kepada model memuat judul, nomor kandidat, URL gambar, dan halaman sumber.
- Permintaan belum dianggap selesai selama bukti `media_ready` belum tersedia.
- Model mendapat instruksi koreksi khusus media jika berhenti pada teks atau tautan.
- Jika model tetap tidak memanggil tool pengunduhan, agent memilih kandidat dari artefak secara deterministik dan menjalankan `web_download_image`.
- Frasa seperti "yang kedua", "ketiga", atau nomor kandidat menentukan gambar yang dipilih.
- Kandidat berikutnya dipakai ketika pengunduhan kandidat sebelumnya gagal.
- File tetap divalidasi sebagai JPEG, PNG, GIF, atau WebP sebelum diserahkan ke Baileys.

## Hasil yang Diharapkan

Permintaan mengirim gambar harus menghasilkan respons WhatsApp bertipe media. Tautan, penjelasan, dan hasil pencarian belum dianggap sebagai penyelesaian. Jika seluruh kandidat gagal diunduh, agent melaporkan kegagalan nyata setelah mencoba kandidat yang tersedia.

Pengujian otomatis mencakup model yang menolak memakai tool setelah pencarian serta pemilihan gambar kedua. Pengujian integrasi manual tetap diperlukan untuk memeriksa akses Bing, URL sumber eksternal, jaringan WhatsApp, dan tampilan media pada perangkat penerima.
