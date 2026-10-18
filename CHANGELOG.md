# Changelog

Semua perubahan penting pada proyek ini dicatat dalam dokumen ini. Format versi mengikuti [Semantic Versioning](https://semver.org/).

## [1.0.0-beta.1] - 2026-10-18

Rilis beta pertama untuk pengujian alur WhatsApp AI dan otomasi komputer.

### Ditambahkan

- Integrasi WhatsApp melalui `@itsukichan/baileys` dengan sesi persisten dan reconnect bertahap.
- Chat Completions melalui SDK OpenAI dan endpoint OpenAI-compatible.
- Penyimpanan riwayat, status pengiriman, audit tindakan, approval, dan checkpoint task di PostgreSQL.
- Mode approval owner dan godmode berbatas waktu.
- Kontrol aplikasi, PowerShell, file, mouse, keyboard, screenshot, kamera, dan browser pada Windows.
- OCR cepat, analisis gambar, pencarian dan pengiriman media, pengambilan source web, serta integrasi MCP.
- Agent bertahap dengan klasifikasi intent, inventaris kemampuan, bukti penyelesaian, retry alternatif, progres, dan pembatalan realtime.
- Respons WhatsApp berupa teks, media, tombol, daftar, dan polling.
- Dokumentasi teknis, audit fitur, evaluasi agent, dan rangkaian pengujian otomatis.

### Diperbaiki

- Penanganan restart socket setelah pairing dan timeout init queries Baileys.
- Deduplikasi pesan masuk dan retry balasan yang sudah dipersiapkan.
- Pembedaan pertanyaan dan perintah agar pertanyaan tidak memicu tindakan komputer.
- Pembatasan pembaruan progres agar tugas panjang tidak membanjiri chat.
- Jalur cepat untuk koordinat cursor dan OCR desktop.

### Catatan beta

- Koneksi WhatsApp memakai library tidak resmi dan dapat terpengaruh perubahan protokol WhatsApp Web.
- Otomasi desktop membutuhkan sesi Windows aktif dan tidak dapat melewati Secure Desktop UAC.
- Kemampuan visual bergantung pada model AI dan kualitas OCR.
- Godmode menjalankan tindakan dengan hak akses akun Windows bot; gunakan hanya pada lingkungan yang dikendalikan owner.
