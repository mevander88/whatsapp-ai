# Audit Timeout Init Queries Baileys

## Gejala

Baileys terkadang menulis `unexpected error in 'init queries'` dengan status 408 sekitar satu menit setelah WhatsApp terhubung.

## Penyebab

Setelah koneksi dibuka, Baileys menjalankan tiga kueri tambahan secara bersamaan: properti server, daftar blokir, dan pengaturan privasi. Salah satu kueri dapat melewati batas waktu bawaan walaupun socket utama masih terhubung dan tetap dapat menerima pesan.

## Keputusan

Bot menonaktifkan `fireInitQueries` karena data tambahan tersebut tidak digunakan dalam alur menerima pesan, memanggil agent, atau mengirim balasan. Ini mencegah timeout sinkronisasi tambahan tanpa mematikan penyimpanan sesi, event pesan, dan mekanisme koneksi ulang.

Sebagai pertahanan tambahan, timeout init queries dari library diklasifikasikan sebagai peringatan nonfatal. Error Baileys lain tetap dicatat sebagai error.

## Perilaku koneksi

- `connection: open` menandakan bot siap menerima pesan.
- `connection: close` tetap memicu pemeriksaan alasan putus dan koneksi ulang bertahap.
- Logout tetap menghapus sesi lama dan meminta login baru.
- Status 405 tetap tidak dicoba ulang otomatis karena biasanya memerlukan perbaikan versi atau jaringan.

## Verifikasi operasional

Setelah menjalankan `npm start`, pastikan log memuat `WhatsApp terhubung`. Kirim pesan baru dan pastikan muncul `Event pesan WhatsApp diterima`, dilanjutkan tahap pemrosesan dan pengiriman balasan.
