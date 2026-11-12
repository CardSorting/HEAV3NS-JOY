<!-- [LAYER: UI] -->
# HEAV3NS-JOY: Kerangka Kedaulatan Arsitektur dan Pengendalian Entropi Struktural

[English](../../README.md) · [Bahasa Lain](README.md) · [Panduan Memulai](../GETTING_STARTED.md) · [Protokol Agen](../../AGENTS.md)

> *“Jangan membangun tempat lain untuk menjalankan agen. Bangunlah sesuatu yang dapat dipelajari agen, dibawa pergi, dan direproduksi secara mandiri di mana saja.”*

**Dalam satu kalimat:** HEAV3NS-JOY menjaga basis kode Anda (baik buatan manusia maupun agen AI) tetap jujur secara arsitektural menggunakan konvensi minimal dan pemeriksa tanpa ketergantungan eksternal.

---

## Gagasan Utama dalam 60 Detik

| Dimensi | Penjelasan |
| :--- | :--- |
| **Apa ini** | Konvensi plus alat audit tanpa dependensi. Setiap berkas mendeklarasikan satu dari lima zona kanonikal (`DOMAIN`, `CORE`, `INFRASTRUCTURE`, `PLUMBING`, `UI`) pada baris tajuk pertama. |
| **Mengapa** | Arsitektur terkikis secara perlahan, dan agen AI mempercepat erosi tersebut. Membuat struktur dapat diverifikasi oleh mesin menghentikan pembusukan pada saat commit. |
| **Bagaimana** | Tempatkan setiap berkas di folder zonanya, lakukan impor hanya pada arah yang diizinkan, dan jalankan `node bin/joy-check.mjs .`. Kode keluar `0` menandakan integritas penuh. |
| **Biaya** | **Nol dependensi eksternal**, tanpa akun, tanpa jaringan internet, bawaan hanya-baca. |

### Analogi Restoran

Bayangkan basis kode sebagai restoran:
- **Dapur (`DOMAIN`)**: Meracik resep murni dan aturan bisnis; dilarang keras menelepon pemasok di tengah memasak.
- **Pengatur Pesanan (`CORE`)**: Mengoordinasikan alur pesanan dan use case.
- **Pemasok (`INFRASTRUCTURE`)**: Adaptor sistem berkas, HTTP, dan basis data.
- **Ruang Makan (`UI`)**: Melayani pelanggan dan merender tampilan; tidak pernah masuk ke gudang bahan mentah.
- **Saluran Pipa (`PLUMBING`)**: Utilitas murni tanpa status dan sepenuhnya terisolasi.

---

## Lima Zona Kanonikal

| Zona | Direktori | Tanggung Jawab | Aturan Mutlak |
| :--- | :--- | :--- | :--- |
| `DOMAIN` | `src/domain/` | Aturan bisnis, entitas, kontrak `I*` | **0% entropi I/O**; dilarang mengimpor infrastruktur atau UI |
| `CORE` | `src/core/` | Orkestrasi use-case, mesin status | Dilarang mengimpor UI; menghubungkan infra hanya lewat antarmuka |
| `INFRASTRUCTURE` | `src/infrastructure/` | Adaptor fs, HTTP, basis data | Dilarang mengimpor UI; mengimplementasikan kontrak Domain |
| `PLUMBING` | `src/plumbing/` | Kriptografi, utilitas tanpa status | Lapisan daun; dilarang mengimpor zona lain mana pun |
| `UI` | `src/ui/` | Presenter CLI, rute HTTP, tampilan | Dilarang mengimpor infrastruktur secara langsung |

---

## Memulai Cepat (2 Menit)

Tidak perlu `npm install` (hanya perlu Node.js 18+ dan git):

```bash
git clone https://github.com/CardSorting/HEAV3NS-JOY.git
cd HEAV3NS-JOY

# 1. Jalankan pengujian (196 pengujian berhasil)
npm test

# 2. Audit kedaulatan arsitektur
npm run joy-check

# 3. Siapkan agen AI (Claude, Cursor, Antigravity, dll.)
npx heav3ns-joy init
```

Pelajari lebih lanjut di [Portal Dokumentasi](../README.md) dan [Model Kanonikal](../../spec/00-CANONICAL-MODEL.md).

