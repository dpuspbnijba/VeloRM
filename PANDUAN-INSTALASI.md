# Panduan Instalasi & Migrasi — Business Banking v2 (REST API + GitHub Pages)

Versi 2.0.0 memindahkan Business Banking ke arsitektur **gas-pro-api**: Google Apps Script menjadi **REST API JSON murni**, dan seluruh tampilan menjadi **situs statis di GitHub Pages** (bisa dipasang di HP sebagai aplikasi). Fitur dan isi database sama dengan v1; data v1 dipindahkan lewat menu **Impor Data → Migrasi dari aplikasi v1**.

> **Cara tercepat:** buka halaman **Panduan Pasang Business Banking v2** (artifact) yang menyertai paket ini. Tombol *Salin nama / Salin isi* untuk setiap berkas backend, perintah Git, dan alamat penting terisi otomatis di sana.

---

## 1. Apa yang berubah dari v1

| | v1 | v2 |
|---|---|---|
| Backend | `Kode.gs` + 3 berkas HTML (HtmlService) | **`Kode.gs` + `appsscript.json` saja** — `doGet`/`doPost` selalu membalas JSON |
| Tampilan | Dari Apps Script (`google.script.run`) **dan** PWA | **Hanya** situs statis GitHub Pages (`fetch` text/plain) |
| Login langkah 1 | Akun aktif di peramban (`Session.getActiveUser`) atau Google Identity | **Google Identity Services** (ID token diverifikasi server) |
| Login langkah 2 | Microsoft Authenticator (TOTP) | Sama |
| Verifikasi QR surat | Halaman HTML di `/exec?verifikasi=` | **`verifikasi.html`** di GitHub Pages → REST GET |
| Database | `DB Business Banking` | **`DB Business Banking v2`** (spreadsheet & folder baru; v1 tidak disentuh) |
| Performa | Cache berversi | + rute **batch**, deduplikasi permintaan, kunci tulis singkat, *lease* antrean WA, tulis blok kontigu, hangatkan cache |

Struktur sheet **tidak berubah** (17 sheet yang sama + `AppConfig` catatan baca-saja), sehingga migrasi cukup menyalin baris.

## 2. Isi paket

| Berkas | Untuk apa | Cara memakai |
|---|---|---|
| `Kode.gs` | Seluruh backend REST (±3.300 baris) | Tempel ke proyek Apps Script **baru** |
| `appsscript.json` | Manifes: zona Asia/Jakarta, Drive API v3, setelan web app | Ganti isi manifes |
| `business-banking-v2-frontend.zip` | Frontend GitHub Pages — **isi ZIP = isi repository** | Ekstrak → `git init` di folder hasil ekstrak |
| `business-banking-v2-source.zip` | Kode sumber modular, `build.py`, pengujian | Untuk pengembangan lanjutan |
| `PANDUAN-INSTALASI.md` | Dokumen ini | — |

Isi `business-banking-v2-frontend.zip` (langsung di akar, tanpa folder pembungkus):

```
index.html          ← aplikasi
verifikasi.html     ← halaman publik verifikasi QR surat
css/app.css
js/config.js        ← SATU-SATUNYA yang Anda ubah (GAS_URL)
js/app.js
js/verifikasi.js
manifest.json  sw.js  404.html  .nojekyll  README.md  PANDUAN-INSTALASI.md
icon-192.png  icon-512.png  icon-maskable-512.png  apple-touch-icon.png  favicon-32.png
```

## 3. Prasyarat

* **Akun Google yang sama dengan pemilik v1.** Ini wajib agar spreadsheet v1 bisa dibaca dan semua berkas Drive lama (dokumen nasabah, PDF/DOCX surat, template) tetap terbuka — yang dipindah hanya ID-nya, bukan berkasnya.
* Akun GitHub, Git di komputer, Microsoft Authenticator di HP setiap pengguna, akun Fonnte (untuk WA).

---

## 4. Tahap A — Backend (proyek Apps Script BARU)

1. <https://script.google.com/home/projects/create> → beri nama **Business Banking v2 Backend**.
2. ⚙ **Setelan proyek** → centang **Tampilkan file manifes "appsscript.json" di editor**.
3. Tempel `appsscript.json` (ganti seluruh isi) dan `Kode.gs` (ganti isi `Kode.gs`/`Code.gs` bawaan). **Ctrl+S**. Tidak ada berkas HTML di v2.
4. **(Hanya bila memigrasi dari v1, opsional tetapi disarankan)** agar pengguna **tidak perlu mendaftar ulang Microsoft Authenticator**: buka proyek v1 → ⚙ Setelan proyek → Properti skrip → salin nilai `MFA_ENC_KEY`. Di proyek v2 → Properti skrip → **Tambahkan properti** `MFA_ENC_KEY` dengan nilai itu. Lakukan **sebelum** langkah 6 (setup tidak pernah menimpa kunci yang sudah ada). Jangan menyalin `SESSION_SECRET` — biarkan v2 membuat sendiri.
5. Properti skrip → tambah `GOOGLE_CLIENT_ID` (lihat Tahap C; Client ID v1 boleh dipakai ulang).
6. Pilih fungsi **`setupAppEnvironment`** → ▷ **Jalankan** → izinkan akses. Log menulis `✅ SETUP SELESAI`. Yang dibuat (idempoten):
   * Folder **Business Banking v2** (+ `Dokumen_Nasabah`, `Surat_Terbit`, `Template`, `Impor_Arsip`, `Backup_Harian`) dan spreadsheet **DB Business Banking v2** — nama sengaja berbeda dari v1 agar setup tidak pernah membuka database lama.
   * 17 sheet + `AppConfig` (catatan ID baca-saja, tanpa rahasia), pengaturan bawaan, `SESSION_SECRET` (dan `MFA_ENC_KEY` bila belum ada) di Script Properties, data contoh untuk mencoba.
   * Pemicu: `jalankanHarian` (±08.00 WIB), `prosesAntreanWA` (tiap menit), `hangatkanCache` (tiap 10 menit).
7. **Deploy → Deployment baru → Aplikasi web**: *Jalankan sebagai* **Saya**, *Yang memiliki akses* **Siapa saja** → **Deploy** → salin URL `/exec`.
8. Uji: buka `URL/exec?ping` → harus tampil JSON yang diawali `{"success":true`.

> "Siapa saja" aman: semua data hanya keluar setelah token sesi HMAC + MFA + cek peran di server. GET hanya melayani `ping`, `auth.config`, dan `surat.verifikasi` (publik, data disamarkan).

## 5. Tahap B — Frontend di GitHub Pages

1. Ekstrak `business-banking-v2-frontend.zip`. Folder hasil ekstrak **`business-banking-v2-frontend`** adalah folder yang di-`git init` — jangan masuk lebih dalam atau naik satu tingkat.
2. Buka PowerShell di folder itu (Explorer → ketik `powershell` di address bar → Enter), lalu `dir`. **Baris yang harus terlihat:** `index.html`, `verifikasi.html`, folder `css` dan `js`. Bila yang terlihat justru satu folder lain, Anda di tingkat yang salah.
3. Buka `js\config.js` dengan Notepad, ganti URL contoh dengan URL `/exec` dari Tahap A, simpan:
   ```js
   window.APP_CONFIG = {
     GAS_URL: 'https://script.google.com/macros/s/ID_DEPLOYMENT_ANDA/exec'
   };
   ```
4. Sekali seumur komputer: `git config --global user.name "Nama Anda"` dan `git config --global user.email "email@github"`.
5. Buat repository **Public** baru di <https://github.com/new> bernama `business-banking-v2`, **tanpa** README/.gitignore/license.
6. Jalankan satu per satu:
   ```bash
   git init
   git add .
   git commit -m "Business Banking v2"
   git branch -M main
   git remote add origin https://github.com/USERNAME/business-banking-v2.git
   git push -u origin main
   ```
   Saat diminta *Password*, tempel **Personal Access Token** (github.com/settings/tokens → classic → centang `repo`). Layar tidak menampilkan apa pun saat token ditempel — itu normal.
7. Repository → **Settings → Pages** → *Deploy from a branch*, **main** / **(root)** → Save, centang **Enforce HTTPS**. Setelah 1–2 menit situs aktif di `https://USERNAME.github.io/business-banking-v2/`.
8. Pembaruan berikutnya: `git add .` → `git commit -m "…"` → `git push`. Bila tampilan belum berubah: **Ctrl+Shift+R**.

## 6. Tahap C — Login Google (OAuth Client ID)

* **Sudah punya Client ID dari v1:** pakai ulang. Origin GitHub Pages sama (`https://USERNAME.github.io`) untuk semua repository, jadi tidak ada yang perlu diubah di Google Cloud.
* **Belum punya:** <https://console.cloud.google.com> → proyek baru → **Google Auth Platform → Branding** (isi nama & email, Audience **External**, **Publish app**) → **Clients → Create client → Web application** → **Authorized JavaScript origins** = `https://USERNAME.github.io` (tanpa nama repo, tanpa garis miring akhir).
* Simpan di Script Properties v2 sebagai `GOOGLE_CLIENT_ID` (Tahap A langkah 5). Client ID bukan rahasia; frontend mengambilnya lewat `auth.config`.

## 7. Tahap D — Masuk pertama & pengaturan

1. Buka situs GitHub Pages → **Masuk dengan Google** (akun pemilik) → pindai QR dengan Microsoft Authenticator → 6 digit → **simpan 8 kode cadangan**.
2. **Pengaturan → Instalasi HP → Alamat aplikasi**: isi *Alamat aplikasi (GitHub Pages)*. QR verifikasi di setiap surat baru otomatis mengarah ke `…/verifikasi.html?kode=…`.
3. **Pengaturan → WhatsApp**: tempel token Fonnte → **Simpan token** (tersimpan di Script Properties, tampil tersamar). Token v1 tidak ikut pindah karena Script Properties milik masing-masing proyek.

## 8. Tahap E — Migrasi data dari v1

Menu **Impor Data → tab "Migrasi dari aplikasi v1"** (khusus Admin).

1. Tempel URL atau ID spreadsheet **DB Business Banking** (v1). Spreadsheet v1 **hanya dibaca** — tidak ada satu sel pun yang diubah.
2. Opsi (bawaan sudah aman):
   * ☑ Lewati data contoh v1 (`@contoh.co.id`) beserta data terkaitnya
   * ☑ Hapus data contoh bawaan v2 lebih dulu
   * ☑ Matikan pengingat otomatis & WA v2 sampai cutover — mencegah pengingat/pesan terkirim dua kali (oleh v1 dan v2)
   * ☑ Arsipkan salinan utuh DB v1 ke `Impor_Arsip` (sekali) — termasuk `Log_Audit` v1 dengan rantai hash aslinya
   * ☐ Timpa data v2 yang sudah ada (abaikan aturan "data yang lebih baru menang")
3. **Pindai (dry-run)** → tabel *Data | Di v1 | Ditambah | Diperbarui | Dilewati | Catatan* + daftar hal yang perlu diketahui. Belum ada yang ditulis.
4. **Jalankan migrasi** → konfirmasi. Berjalan **per sheet** (master dulu: pengaturan → pengguna → template → portofolio → target → penomoran → riwayat …), sehingga aman dari batas 6 menit Apps Script dan dapat dilihat progresnya.

**Aturan yang dipakai** (aman dijalankan berulang kali):

| Data | Kunci | Aturan |
|---|---|---|
| Pengaturan | `kunci` | Disalin hanya bila nilai v2 masih bawaan; `PWA_URL`/`URL_VERIFIKASI`/`APP_URL_INTERNAL` tidak disalin |
| Pengguna, Portofolio, Target | email / id_fasilitas / email+periode+jenis | Baru → ditambah; sudah ada → diperbarui **hanya bila `tgl_update` v1 lebih baru** (perubahan di v2 tidak tertimpa) |
| Penomoran surat | kode + tahun | `urut` = nilai **terbesar** v1/v2 → nomor surat tidak pernah ganda |
| Riwayat surat, dokumen, CRM | id | Ditambah; status dokumen yang dihapus di v1 ikut diperbarui. Surat v1 tetap bisa diverifikasi di v2 |
| Blast & pesan WA | id | Status/penghitung disegarkan dari v1. **Pesan berstatus *Antri* di v1 tidak dipindah** (agar tidak terkirim dua kali) |
| Log pengingat | id_log (+ fasilitas & jatuh tempo) | Pengingat yang sama tidak pernah tercatat ganda |
| Snapshot harian | tanggal + cabang + RM | Ditambah, lalu diurutkan menurut tanggal |
| Microsoft Authenticator | email | Dipindah **hanya bila `MFA_ENC_KEY` sama** (Tahap A langkah 4). Bila beda, pengguna mendaftar ulang saat masuk |
| Log audit | — | Tidak digabung (rantai hash v2 baru); salinan utuh v1 diarsipkan |

Nomor rekening dan nomor WA tetap berawalan `0`; baris ganda di sumber dilewati dan dilaporkan.

## 9. Cutover (hari perpindahan)

1. Uji v2 dengan 1 akun RM dan 1 akun Pimpinan (data, dokumen lama, cetak surat).
2. Tunggu antrean WA v1 habis (menu Pesan WA v1 tidak menampilkan *Antri*).
3. **Jalankan migrasi sekali lagi (delta sync)** — hanya perubahan sejak migrasi pertama yang ditulis.
4. Di proyek **v1**: Apps Script → ⏰ **Pemicu** → hapus `jalankanHarian` dan `prosesAntreanWA` (agar v1 berhenti mengirim). Deployment v1 **jangan diarsipkan** bila surat lama perlu tetap bisa dipindai (QR surat v1 mengarah ke `/exec?verifikasi=` milik v1).
5. Di **v2**: menu **Pengingat** → nyalakan saklar **Pengingat aktif** → Simpan; lalu **Pengaturan → WhatsApp → Saklar utama WhatsApp** → *Pengiriman aktif* → Simpan.
6. Pindahkan pengguna ke alamat baru — pilih salah satu:
   * **Alamat tetap (disarankan bila v1 sudah dipasang di HP):** dari folder `business-banking-v2-frontend`, push ke repository lama:
     `git remote set-url origin https://github.com/USERNAME/business-banking.git` lalu `git push -u origin main --force`. Aplikasi yang sudah terpasang di HP ikut berganti ke v2. (`--force` menimpa isi repo lama dengan v2.)
   * **Alamat baru:** umumkan `https://USERNAME.github.io/business-banking-v2/` (bisa lewat WA Blast dari v2) dan minta pengguna memasang ulang di HP.
7. Setiap pengguna masuk ulang (sesi v1 tidak ikut pindah).

## 10. Script Properties v2

| Kunci | Diisi oleh | Keterangan |
|---|---|---|
| `SPREADSHEET_ID`, `FOLDER_ROOT`, `FOLDER_DOKUMEN`, `FOLDER_SURAT`, `FOLDER_TEMPLATE`, `FOLDER_IMPOR`, `FOLDER_BACKUP` | setup | Dicerminkan ke sheet `AppConfig` sebagai catatan baca-saja |
| `SESSION_SECRET` | otomatis | Kunci HMAC sesi. Rotasi = semua keluar |
| `MFA_ENC_KEY` | otomatis / disalin dari v1 | **Jangan diubah setelah dipakai** — pendaftaran Authenticator menjadi tidak terbaca |
| `GOOGLE_CLIENT_ID` | pemilik (Properti skrip) atau Admin (Pengaturan → Keamanan) | Publik secara desain |
| `FONNTE_TOKEN` | Admin (Pengaturan → WhatsApp) | Tidak pernah dikirim ke peramban, log, atau audit |
| `AUDIT_HASH`, `VER_*`, `REV_*`, `ANTRIAN_*`, `WA_*`, `MIGRASI_*` | aplikasi | State operasional — jangan diubah manual |

## 11. Performa (gas-scale-turbo) — yang dioptimalkan & hasil uji

| Pola | Dampak terukur |
|---|---|
| Navigasi menu sepenuhnya di klien | 4 perpindahan menu: **0 eksekusi Apps Script**, 70–130 ms |
| Rute `batch` + batcher otomatis di frontend | Membuka Pesan WA: **1 eksekusi** (sebelumnya 2) |
| Deduplikasi permintaan baca yang identik + *epoch* tulis | Klik ganda / render ulang tidak memicu panggilan kembar; hasil baca lama tidak dipakai setelah ada penulisan |
| Antrean WA memakai *lease* cache, kunci hanya saat menulis hasil | Panggilan Fonnte di dalam kunci: **0**; simpan data pengguna lain tidak ikut antre selama blast |
| Cetak surat, unggah dokumen, validasi nomor: Docs/Drive/UrlFetch di luar kunci | Kunci hanya untuk memesan nomor & menulis 1 baris log |
| Tulis blok kontigu | 20 baris tersebar: **500 sel dalam 2 blok** (sebelumnya 1.250 sel = seluruh sheet) |
| Email admin dikirim setelah kunci dilepas | Pengingat terjadwal tidak menunggu MailApp |
| Hangatkan cache (pemicu 10 menit) + cache berversi ber-chunk | Pengguna pertama setelah jeda tidak menunggu pembacaan Sheets |
| Polling adaptif | Berhenti saat tab tersembunyi; 60 dtk saat aktif → 3 mnt saat diam (Pesan WA 15 → 45 dtk) |
| Telemetri | Setiap respons membawa `ms` (waktu server) & `v` (versi); terlihat di tooltip status sinkron dan Pengaturan → Instalasi HP |

Angka di atas dari server uji lokal (RTT disimulasikan 120 ms). Di Apps Script sungguhan satu panggilan biasanya 0,5–2 detik, sehingga penghematan eksekusi terasa lebih besar; perpindahan menu tetap instan karena tidak memanggil server.

## 12. Memperbarui aplikasi

* **Backend:** tempel `Kode.gs` baru → **Deploy → Kelola deployment → ✎ → Versi: Versi baru → Deploy**. URL `/exec` tetap sama (jangan membuat deployment baru, karena URL di `js/config.js` akan berbeda).
* **Frontend:** ganti berkas di folder repo (pertahankan `js/config.js` Anda) → `git add . && git commit -m "…" && git push`.
* **Dari kode sumber:** ubah `src/`, jalankan `python3 build.py` (tidak menimpa `dist/frontend/js/config.js` yang sudah ada), uji `TZ=Asia/Jakarta node test/uji-backend.js` dan `node test/uji-migrasi.js`.

## 13. Fungsi darurat (editor Apps Script v2)

| Fungsi | Kapan |
|---|---|
| `resetMfaPemilik` | Pemilik kehilangan HP & kode cadangan dan tidak ada Admin lain |
| `rotasiKunciSesi` | Curiga token bocor — semua pengguna keluar |
| `hapusDataContoh` | Instalasi baru tanpa v1: bersihkan data contoh sebelum go-live |
| `ujiPengingatSekarang` | Uji pengingat jatuh tempo saat itu juga |
| `hangatkanCache` | Bangun ulang cache secara manual |
| `setupAppEnvironment` | Memperbaiki struktur/pemicu tanpa menimpa data & rahasia |

## 14. Daftar periksa keamanan

- [ ] `js/config.js` hanya berisi URL `/exec`; repository tidak memuat `.gs` maupun token.
- [ ] `GOOGLE_CLIENT_ID`, `FONNTE_TOKEN`, `MFA_ENC_KEY` hanya ada di Script Properties (tidak di Sheets, chat, atau commit).
- [ ] Editor proyek Apps Script v1 & v2 hanya orang tepercaya (editor dapat melihat Script Properties).
- [ ] Spreadsheet & folder Drive v2 tidak dibagikan ke pengguna aplikasi.
- [ ] Minimal 2 Admin aktif, masing-masing menyimpan kode cadangan MFA.
- [ ] Pemicu v1 sudah dihapus setelah cutover (tidak ada pengingat ganda).
- [ ] **Pengaturan → Log Audit → Verifikasi rantai** menunjukkan rantai utuh.

## 15. Batasan

* Fonnte adalah gateway WhatsApp tidak resmi; untuk volume besar rencanakan WhatsApp Business Platform resmi.
* Kuota Apps Script (akun biasa / Workspace): waktu pemicu 90 menit / 6 jam per hari, URL Fetch 20.000 / 100.000, email 100 / 1.500 per hari, 6 menit per eksekusi. Pemicu per menit yang antreannya kosong & hangatkan cache yang *cache hit* hanya berjalan sesaat.
* Pemicu harian berjalan dalam jendela ±08.00–09.00 WIB.
* Sesi login v1 tidak ikut pindah; pendaftaran Authenticator ikut hanya bila `MFA_ENC_KEY` disalin.
* Pustaka Excel/PDF/QR dimuat dari CDN saat pertama dipakai (butuh internet).
* Panel *cashflow* referensi desain tetap diganti **Tren Baki Debet** (PRD tidak memuat data arus kas).

## 16. Hasil pengujian paket ini

* **Backend REST (103/103 lulus):** login hanya ID token (aud salah/kedaluwarsa/palsu ditolak), MFA & kunci 15 menit, RBAC server-side, batch (aksi tulis ditolak, peran tetap dicek), `doGet` selalu JSON, pengingat H-3 bulan, antrean & blast WA, impor dry-run, surat ber-QR, *lease* antrean, 0 UrlFetch di dalam kunci, tulis blok kontigu, `AppConfig` tanpa rahasia.
* **Migrasi v1 → v2 (32/32 lulus)** dengan `Kode.gs` v1 asli di Drive bersama: dry-run tidak menulis, 48 data contoh v1 dilewati, angka 0 tetap, pesan *Antri* tidak dipindah, nomor surat melanjutkan (≥ 41), surat v1 terverifikasi di v2, Authenticator lama berfungsi tanpa daftar ulang, jalankan ulang = 0 baris baru, delta menangkap perubahan v1 tanpa menimpa perubahan v2 yang lebih baru, seluruh sheet v1 identik sebelum & sesudah.
* **E2E Chrome (desktop & HP):** login Google + MFA, semua menu, verifikasi publik, migrasi lewat UI, 0 galat aplikasi, 0 px geser horizontal di HP, RM tidak bisa membuka menu Admin.
