/* Verifikasi publik QR surat — memanggil GET /exec?action=surat.verifikasi&kode=… (tanpa login, tanpa token). */
(function () {
  const CFG = window.APP_CONFIG || {};
  const $ = (s) => document.querySelector(s);
  const esc = (s) => String(s === null || s === undefined ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const bersih = (k) => String(k || '').toUpperCase().replace(/[^A-Z0-9]/g, '');

  function tampil(html) { $('#hasil').innerHTML = html; }

  async function periksa(kode) {
    kode = bersih(kode);
    if (kode.length !== 20) { tampil('<div class="st bad"><span class="dot"></span>Kode harus 20 karakter huruf/angka.</div>'); return; }
    if (!CFG.GAS_URL || /GANTI|XXXX/.test(CFG.GAS_URL)) { tampil('<div class="st bad"><span class="dot"></span>Halaman belum dikonfigurasi (GAS_URL di js/config.js).</div>'); return; }
    tampil('<div class="spin" role="status" aria-label="Memeriksa"></div>');
    try {
      const r = await fetch(CFG.GAS_URL + '?action=surat.verifikasi&kode=' + encodeURIComponent(kode), { redirect: 'follow' }).then((x) => x.json());
      if (!r.success) { tampil(`<div class="st bad"><span class="dot"></span>${esc(r.message || 'Dokumen tidak terdaftar.')}</div>`); return; }
      const d = r.data, baris = [['Nomor', d.nomor], ['Perihal', d.perihal], ['Tanggal terbit', d.tanggal], ['Status', d.status],
        ['Nasabah', d.nasabah], ['Cabang', d.cabang], ['Sidik PDF (SHA-256)', d.sidik + '…'], ['Penerbit', d.penerbit]];
      const sah = String(d.status).toUpperCase() === 'TERBIT';
      tampil(`<div class="st ${sah ? 'ok' : 'bad'}"><span class="dot"></span>${sah ? 'Dokumen terdaftar dan sah' : 'Dokumen terdaftar, status: ' + esc(d.status)}</div>
        <table>${baris.map((b) => `<tr><th scope="row">${esc(b[0])}</th><td>${esc(b[1])}</td></tr>`).join('')}</table>`);
    } catch (e) {
      tampil('<div class="st bad"><span class="dot"></span>Gagal menghubungi server. Periksa koneksi internet lalu coba lagi.</div>');
    }
  }

  const q = new URLSearchParams(location.search), awal = q.get('kode') || q.get('verifikasi') || '';
  $('#kode').value = bersih(awal);
  $('#f').addEventListener('submit', (e) => { e.preventDefault(); periksa($('#kode').value); });
  if (awal) periksa(awal);
})();
