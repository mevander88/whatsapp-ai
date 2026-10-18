# Audit Kontrol Browser

## Temuan

Tool browser sebelumnya dapat membuka halaman, membaca isi, mengklik elemen, mengisi textbox, dan menekan tombol keyboard. Cakupan tersebut belum cukup untuk formulir modern karena tidak ada operasi khusus untuk dropdown, checkbox, input file, submit, navigasi riwayat, dan pengelolaan tab.

Agent juga dapat menganggap klik tombol sebagai keberhasilan tanpa membaca keadaan halaman setelah submit. Hal ini membuat hasil formulir tidak dapat dibedakan antara berhasil, validasi gagal, atau tetap berada pada halaman yang sama.

## Perbaikan

Kemampuan berikut ditambahkan:

- memilih opsi dropdown;
- mencentang dan menghapus centang checkbox;
- memilih file lokal pada input upload;
- submit formulir melalui tombol bernama atau satu tombol submit yang unik;
- kembali dan memuat ulang halaman;
- membuka, melihat, memilih, dan menutup tab;
- membaca ulang halaman setelah submit dan navigasi.

Browser sekarang memakai satu profil khusus pada `BROWSER_USER_DATA_DIR`. Konteks, cookie, penyimpanan situs, dan tab aktif dipakai kembali selama proses berjalan dan dapat bertahan setelah restart. Agent tidak membuka browser atau konteks baru untuk setiap tool. Tool membuat dan berpindah tab disembunyikan dari model kecuali permintaan owner secara jelas menyebut tab atau halaman terpisah.

Input ditargetkan berdasarkan role serta nama aksesibel yang terlihat dari `browser_inspect`. Elemen yang tidak ditemukan atau tidak unik ditolak agar agent memeriksa halaman kembali. Upload memeriksa bahwa path adalah file dan ukurannya berada dalam batas media.

Isi field, teks yang diketik, isi file, dan perintah terminal tidak disimpan mentah pada checkpoint tugas. Nilai tersebut diganti sidik hash untuk mencegah data formulir muncul dalam status tugas atau log.

## Alur yang Diharapkan

1. Buka dan inspeksi halaman.
2. Isi setiap field menggunakan tool sesuai jenis kontrol.
3. Pilih file hanya jika owner memang meminta upload file tersebut.
4. Submit formulir.
5. Baca halaman hasil dan periksa pesan sukses atau validasi gagal.
6. Perbaiki field yang salah atau laporkan hasil aktual.

Instruksi dari isi halaman tetap dianggap data. Agent tidak boleh mengirim form, mengunggah file, atau membuka data lokal hanya karena halaman meminta tindakan tersebut; tindakan harus berasal dari permintaan owner.

## Batasan

- CAPTCHA, passkey, prompt browser, dan autentikasi perangkat dapat memerlukan tindakan manual.
- Browser agent menggunakan konteks terpisah sehingga sesi login browser pribadi tidak otomatis tersedia.
- Kontrol yang tidak memiliki nama aksesibel mungkin memerlukan inspeksi atau interaksi desktop.
- Submit tidak menjamin layanan eksternal menerima data; agent menilai hasil dari halaman yang tampil setelah tindakan.
