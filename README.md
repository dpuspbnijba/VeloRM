# Business Banking v2 — Frontend (GitHub Pages)

Frontend statis aplikasi **Business Banking — Portfolio & RM Monitoring**. Backend-nya adalah REST API Google Apps Script (`Kode.gs`), **tidak** disimpan di repository ini.

## Isi folder (folder inilah yang di-`git init`)

| Berkas | Fungsi |
|---|---|
| `index.html` | Aplikasi (SPA) |
| `verifikasi.html` | Halaman publik verifikasi QR surat |
| `css/app.css` | Tampilan |
| `js/config.js` | **Satu-satunya yang Anda ubah**: `GAS_URL` = URL `/exec` Apps Script |
| `js/app.js`, `js/verifikasi.js` | Logika |
| `manifest.json`, `sw.js`, ikon | Pemasangan di HP (PWA) |

## Ubah konfigurasi

```js
window.APP_CONFIG = {
  GAS_URL: 'https://script.google.com/macros/s/ID_DEPLOYMENT_ANDA/exec'
};
```

URL `/exec` bukan rahasia. Token WhatsApp, kunci sesi, kunci MFA, dan Client ID Google hanya ada di Script Properties Apps Script.

## Perbarui situs

```bash
git add .
git commit -m "Perbarui aplikasi"
git push
```

Panduan lengkap: `PANDUAN-INSTALASI.md`.
