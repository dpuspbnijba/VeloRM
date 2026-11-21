/* =========================================================================
   Business Banking — JavaScript (SPA)
   Frontend statis (GitHub Pages) → REST API Apps Script lewat fetch() text/plain (gas-pro-api).
   Prinsip instant UX: navigasi show/hide 0 ms, data dimuat sekali lalu
   difilter lokal, optimistic UI + sinkron latar belakang, cache sesi.
   ========================================================================= */
'use strict';
const MODE = 'pwa'; // v2: selalu frontend terpisah (gas-pro-api)
const CFG = window.APP_CONFIG || {};
const S = {
  token: '', me: null, set: {}, ver: {}, porto: [], pIdx: {}, users: [], uIdx: {}, cabang: [], target: [], snap: {}, tplWA: [], tplSurat: [], ringkas: {},
  route: 'dashboard', hist: [], cab: '*', dirty: {}, cache: {}, detailId: null, waktuServer: '', sinkronTerakhir: 0, pending: 0, aktifTerakhir: Date.now()
};
const R = {}; // renderer per halaman

// ── Utilitas DOM & format ──
const $ = (s, r) => (r || document).querySelector(s);
const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
const esc = (s) => String(s === null || s === undefined ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const ic = (n, c) => `<span class="ms${c ? ' ' + c : ''}" aria-hidden="true">${n}</span>`;
const NF = new Intl.NumberFormat('id-ID');
const n0 = (x) => NF.format(Math.round(Number(x) || 0));
const rp = (x) => (Number(x) < 0 ? '-Rp ' : 'Rp ') + NF.format(Math.abs(Math.round(Number(x) || 0)));
function rpS(x) {
  const v = Math.abs(Number(x) || 0), s = Number(x) < 0 ? '-' : '';
  const f = (n, d) => n.toLocaleString('id-ID', { minimumFractionDigits: 0, maximumFractionDigits: d });
  if (v >= 1e12) return s + 'Rp ' + f(v / 1e12, 2) + ' T';
  if (v >= 1e9) return s + 'Rp ' + f(v / 1e9, v >= 1e11 ? 0 : 1) + ' M';
  if (v >= 1e6) return s + 'Rp ' + f(v / 1e6, 0) + ' Jt';
  return s + 'Rp ' + NF.format(Math.round(v));
}
const pct = (x, d) => (Number(x) || 0).toLocaleString('id-ID', { minimumFractionDigits: d === undefined ? 1 : d, maximumFractionDigits: d === undefined ? 1 : d }) + '%';
const BLN = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
const BLN_P = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
function parseT(s) { if (!s) return null; const m = String(s).match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?/); return m ? new Date(+m[1], +m[2] - 1, +m[3], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0)) : null; }
function tgl(s) { const d = s instanceof Date ? s : parseT(s); return d ? String(d.getDate()).padStart(2, '0') + ' ' + BLN[d.getMonth()] + ' ' + d.getFullYear() : '—'; }
function tglJam(s) { const d = parseT(s); return d ? tgl(d) + ', ' + String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0') : '—'; }
function jam(s) { const d = parseT(s); return d ? String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0') : ''; }
function hariIni() { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), d.getDate()); }
function iso(d) { return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
function selisihHari(s) { const d = parseT(s); return d ? Math.round((new Date(d.getFullYear(), d.getMonth(), d.getDate()) - hariIni()) / 864e5) : null; }
function tambahBulan(d, n) { const y = d.getFullYear(), m = d.getMonth() + n, akhir = new Date(y, m + 1, 0).getDate(); return new Date(y, m, Math.min(d.getDate(), akhir)); }
function relatif(s) {
  const d = parseT(s); if (!d) return '';
  const h = Math.round((hariIni() - new Date(d.getFullYear(), d.getMonth(), d.getDate())) / 864e5);
  if (h === 0) return jam(s); if (h === 1) return 'Kemarin';
  return String(d.getDate()).padStart(2, '0') + ' ' + BLN[d.getMonth()];
}
const ini = (n) => String(n || '?').replace(/^(PT|CV|H\.|Hj\.|Koperasi|Bpk\.|Ibu)\s+/i, '').split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase() || '?';
const deb = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
const uniq = (a) => Array.from(new Set(a));
const sum = (a, f) => a.reduce((s, x) => s + (f ? f(x) : x), 0);
const maskHp = (s) => { s = String(s || ''); return /\*/.test(s) || s.length < 8 ? s : s.slice(0, 4) + '-****-' + s.slice(-4); };
const peran = () => (S.me ? S.me.peran : '');
const isAdm = () => peran() === 'Admin';
const isPim = () => peran() === 'Pimpinan';
const bolehWA = () => isAdm() || isPim();

// ── Penyimpanan aman ──
const store = (jenis) => ({
  get(k, d) { try { const v = window[jenis].getItem('bb_' + k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { window[jenis].setItem('bb_' + k, JSON.stringify(v)); } catch (e) { /* kuota penuh / diblokir */ } },
  del(k) { try { window[jenis].removeItem('bb_' + k); } catch (e) { } }
});
const LS = store('localStorage'), SS = store('sessionStorage');

// ── Jembatan API REST (fetch → /exec) ──
function setSync(st, teks) {
  const el = $('#sync'); if (!el) return;
  el.className = 'sync' + (st ? ' ' + st : '');
  el.querySelector('span').textContent = teks || (st === 'busy' ? 'Menyinkron…' : st === 'off' ? 'Offline' : 'Tersinkron');
}
/*
 * api(action, data) → Promise<respons>. Optimasi scale-turbo:
 *  1) deduplikasi: panggilan BACA identik yang sedang berjalan menumpang promise yang sama;
 *  2) epoch tulis: setiap aksi tulis menaikkan epoch sehingga hasil baca lama tidak dipakai ulang;
 *  3) batcher: aksi baca dalam tick yang sama digabung menjadi 1 POST {action:'batch'} (1 RTT, 1 eksekusi GAS).
 */
const API = { inflight: {}, epoch: 0, antre: [], jadwal: 0, rtt: [], terakhir: null };
const BACA_BATCH = new Set(['data.sinkron', 'nasabah.detail', 'dok.daftar', 'surat.skema', 'surat.riwayat', 'wa.log', 'wa.status', 'wa.blastHitung',
  'pengingat.log', 'pengguna.daftar', 'tplsurat.daftar', 'rahasia.status', 'audit.daftar']);
function kirimRest(body) {
  if (!CFG.GAS_URL || /GANTI|XXXX/.test(CFG.GAS_URL)) return Promise.reject(Object.assign(new Error('Konfigurasi aplikasi belum lengkap: isi GAS_URL di js/config.js.'), { code: 'CONFIG' }));
  const t0 = performance.now();
  // WAJIB text/plain — application/json memicu preflight CORS yang ditolak Apps Script
  return fetch(CFG.GAS_URL, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(body), redirect: 'follow' })
    .then((r) => r.json())
    .then((j) => { catatRtt(body.action, performance.now() - t0, j && j.ms); return j; })
    .catch((e) => { if (e.code === 'CONFIG') throw e; setSync('off'); throw new Error(navigator.onLine === false ? 'Tidak ada koneksi internet.' : 'Gagal menghubungi server.'); });
}
function catatRtt(aksi, rtt, server) {
  API.terakhir = { aksi, rtt: Math.round(rtt), server: server || 0 };
  API.rtt.push(API.terakhir); if (API.rtt.length > 40) API.rtt.shift();
  const el = $('#sync'); if (el) el.title = `Terakhir: ${aksi} · ${API.terakhir.rtt} ms (server ${API.terakhir.server} ms)`;
}
function olahRespons(r) {
  if (!r) throw new Error('Respons kosong dari server.');
  if (r.code === 'AUTH') { sesiHabis(r.message); throw Object.assign(new Error(r.message), { code: 'AUTH' }); }
  if (!r.success) throw Object.assign(new Error(r.message || 'Permintaan gagal.'), { code: r.code, data: r.data });
  return r;
}
function api(action, data, opsi) {
  opsi = opsi || {};
  const baca = BACA_BATCH.has(action) || action === 'auth.config';
  if (!baca) API.epoch++;
  const kunci = baca ? API.epoch + '|' + action + '|' + JSON.stringify(data || {}) : '';
  if (kunci && API.inflight[kunci]) return API.inflight[kunci];
  S.pending++; setSync('busy');
  const selesai = () => { S.pending = Math.max(0, S.pending - 1); if (!S.pending) setSync(navigator.onLine === false ? 'off' : ''); };
  const p = new Promise((res, rej) => {
    if (BACA_BATCH.has(action) && S.token && !opsi.sendiri) {
      API.antre.push({ action, data: data || {}, res, rej });
      if (!API.jadwal) API.jadwal = setTimeout(kurasAntre, 0);
    } else {
      kirimRest({ action, data: data || {}, token: S.token }).then(olahRespons).then(res, rej);
    }
  });
  p.then(selesai, selesai);
  if (kunci) { API.inflight[kunci] = p; const hapus = () => { delete API.inflight[kunci]; }; p.then(hapus, hapus); }
  return p;
}
function kurasAntre() {
  API.jadwal = 0;
  const q = API.antre.splice(0, API.antre.length);
  if (!q.length) return;
  if (q.length === 1) { kirimRest({ action: q[0].action, data: q[0].data, token: S.token }).then(olahRespons).then(q[0].res, q[0].rej); return; }
  kirimRest({ action: 'batch', data: { calls: q.map((x) => ({ action: x.action, data: x.data })) }, token: S.token })
    .then((r) => {
      if (!r || !r.success) { const e = (() => { try { olahRespons(r); } catch (err) { return err; } return new Error('Batch gagal.'); })(); q.forEach((x) => x.rej(e)); return; }
      q.forEach((x, i) => { try { x.res(olahRespons(r.data[i])); } catch (e) { x.rej(e); } });
    })
    .catch((e) => q.forEach((x) => x.rej(e)));
}
const SCRIPT_MUAT = {};
function muatScript(src) {
  if (!SCRIPT_MUAT[src]) SCRIPT_MUAT[src] = new Promise((res, rej) => { const s = document.createElement('script'); s.src = src; s.async = true; s.onload = res; s.onerror = () => { delete SCRIPT_MUAT[src]; rej(new Error('Gagal memuat pustaka ' + src.split('/').pop())); }; document.head.appendChild(s); });
  return SCRIPT_MUAT[src];
}
const LIB = {
  xlsx: 'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js',
  jspdf: 'https://cdn.jsdelivr.net/npm/jspdf@2.5.2/dist/jspdf.umd.min.js',
  autotable: 'https://cdn.jsdelivr.net/npm/jspdf-autotable@3.8.4/dist/jspdf.plugin.autotable.min.js',
  qr: 'https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/qrcode.min.js',
  gis: 'https://accounts.google.com/gsi/client'
};

// ── Toast ──
function toast(judul, pesan, jenis, opsi) {
  opsi = opsi || {};
  const ikon = { ok: 'check_circle', bad: 'error', warn: 'warning', info: 'info' }[jenis || 'info'] || 'info';
  const el = document.createElement('div');
  el.className = 'toast ' + (jenis || 'info');
  el.setAttribute('role', jenis === 'bad' ? 'alert' : 'status');
  el.innerHTML = `${ic(ikon, 'fill')}<div class="sp"><b>${esc(judul)}</b>${pesan ? `<div class="muted fs13">${esc(pesan)}</div>` : ''}${opsi.aksi ? `<div class="act"><button class="btn btn-sm btn-p" type="button">${esc(opsi.aksi)}</button></div>` : ''}</div><button class="x" aria-label="Tutup">${ic('close', 's18')}</button>`;
  const tutup = () => { el.style.opacity = '0'; setTimeout(() => el.remove(), 160); };
  el.querySelector('.x').onclick = tutup;
  if (opsi.aksi) el.querySelector('.act button').onclick = () => { tutup(); opsi.onAksi && opsi.onAksi(); };
  $('#toasts').appendChild(el);
  setTimeout(tutup, opsi.lama || (jenis === 'bad' ? 7000 : 4200));
  return { tutup };
}
const gagalToast = (e) => { if (e && e.code !== 'AUTH') toast('Gagal', e.message || String(e), 'bad'); };

// ── Modal ──
const MODALS = [];
function modal(o) {
  const wrap = document.createElement('div');
  wrap.className = 'mdl-wrap';
  wrap.innerHTML = `<div class="mdl ${o.lebar || ''}" role="dialog" aria-modal="true" aria-labelledby="mdl-t-${MODALS.length}">
    <div class="mdl-h">${o.ikon ? `<div class="well">${ic(o.ikon)}</div>` : ''}<div class="sp"><h3 id="mdl-t-${MODALS.length}">${esc(o.judul || '')}</h3>${o.sub ? `<p>${esc(o.sub)}</p>` : ''}</div>
    <button class="btn-ic sm" data-x aria-label="Tutup">${ic('close')}</button></div>
    <div class="mdl-b">${o.isi || ''}</div>${o.kaki === false ? '' : `<div class="mdl-f">${o.kaki || ''}</div>`}</div>`;
  const m = { el: wrap, tutup() { if (!wrap.isConnected) return; wrap.remove(); MODALS.splice(MODALS.indexOf(m), 1); o.onTutup && o.onTutup(); if (m.fokusAwal && m.fokusAwal.focus) m.fokusAwal.focus(); } };
  m.fokusAwal = document.activeElement;
  wrap.addEventListener('mousedown', (e) => { if (e.target === wrap && !o.kunci) m.tutup(); });
  wrap.querySelector('[data-x]').onclick = () => m.tutup();
  $('#layer').appendChild(wrap);
  MODALS.push(m);
  o.onBuka && o.onBuka(wrap, m);
  setTimeout(() => { const f = wrap.querySelector('[autofocus],input:not([type=hidden]):not([readonly]),select,textarea,button.btn-p'); f && f.focus(); }, 30);
  return m;
}
function konfirmasi(o) {
  return new Promise((res) => {
    let hasil = false;
    const m = modal({
      judul: o.judul, sub: o.sub, ikon: o.ikon || (o.bahaya ? 'warning' : 'help'), lebar: 'sm',
      isi: `<div class="fs13" style="line-height:1.6">${o.pesan || ''}</div>`,
      kaki: `<button class="btn btn-g" data-no>Batal</button><button class="btn ${o.bahaya ? 'btn-d' : 'btn-p'}" data-ok>${esc(o.ok || 'Ya, lanjutkan')}</button>`,
      onTutup: () => res(hasil)
    });
    m.el.querySelector('[data-no]').onclick = () => m.tutup();
    m.el.querySelector('[data-ok]').onclick = () => { hasil = true; m.tutup(); };
  });
}
function tombolMuat(btn, aktif, teks) {
  if (!btn) return;
  if (aktif) { btn.dataset.html = btn.innerHTML; btn.classList.add('load'); btn.innerHTML = `<span class="spin"></span>${esc(teks || 'Memproses…')}`; }
  else { btn.classList.remove('load'); if (btn.dataset.html) btn.innerHTML = btn.dataset.html; }
}

// ── Formulir dinamis ──
function fieldHtml(f, v) {
  const id = 'f_' + f.k, req = f.wajib ? ' required' : '', val = v === undefined || v === null ? (f.def !== undefined ? f.def : '') : v;
  const lbl = `<label for="${id}">${esc(f.l)}${f.wajib ? ' <span class="req">*</span>' : ''}</label>`;
  let inp;
  if (f.t === 'select') inp = `<select id="${id}" name="${f.k}" class="sel"${req}>${(f.opsi || []).map((o) => { const ov = typeof o === 'object' ? o.v : o, ol = typeof o === 'object' ? o.l : o; return `<option value="${esc(ov)}"${String(ov) === String(val) ? ' selected' : ''}>${esc(ol)}</option>`; }).join('')}</select>`;
  else if (f.t === 'textarea') inp = `<textarea id="${id}" name="${f.k}" class="txa" rows="${f.rows || 4}"${req} placeholder="${esc(f.ph || '')}">${esc(val)}</textarea>`;
  else if (f.t === 'switch') inp = `<label class="sw"><input type="checkbox" id="${id}" name="${f.k}"${val === true || /^(ya|true|1)$/i.test(String(val)) ? ' checked' : ''}><span class="tr"></span><span class="fs13">${esc(f.teks || 'Aktif')}</span></label>`;
  else if (f.t === 'uang') inp = `<input id="${id}" name="${f.k}" class="inp num" inputmode="numeric" data-uang value="${val === '' ? '' : esc(n0(val))}"${req} placeholder="${esc(f.ph || '0')}">`;
  else inp = `<input id="${id}" name="${f.k}" class="inp${f.t === 'number' ? ' num' : ''}" type="${f.t || 'text'}" value="${esc(val)}"${req}${f.ro ? ' readonly' : ''}${f.pola ? ` pattern="${esc(f.pola)}"` : ''}${f.step ? ` step="${f.step}"` : ''} placeholder="${esc(f.ph || '')}" autocomplete="${f.ac || 'off'}">`;
  return `<div class="fld${f.full ? ' full' : ''}" data-fld="${f.k}">${f.t === 'switch' ? `<span class="lbl">${esc(f.l)}</span>` : lbl}${inp}${f.help ? `<span class="help">${esc(f.help)}</span>` : ''}<span class="err" hidden></span></div>`;
}
function pasangUang(root) {
  $$('[data-uang]', root).forEach((el) => el.addEventListener('input', () => {
    const angka = el.value.replace(/[^\d]/g, ''); const pos = el.value.length - el.selectionStart;
    el.value = angka ? NF.format(Number(angka)) : ''; const p = Math.max(0, el.value.length - pos); el.setSelectionRange(p, p);
  }));
}
function bacaForm(root, fields) {
  const v = {}; let ok = true;
  fields.forEach((f) => {
    const el = root.querySelector('[name="' + f.k + '"]'); if (!el) return;
    const wrap = el.closest('.fld'), err = wrap.querySelector('.err');
    let x = f.t === 'switch' ? (el.checked ? 'Ya' : 'Tidak') : f.t === 'uang' ? el.value.replace(/[^\d]/g, '') : el.value.trim();
    let pesan = '';
    if (f.wajib && x === '') pesan = f.l + ' wajib diisi.';
    else if (x && f.t === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(x)) pesan = 'Format email tidak valid.';
    else if (x && f.validasi) pesan = f.validasi(x) || '';
    if (pesan) { ok = false; err.textContent = pesan; err.hidden = false; el.classList.add('bad'); } else { err.hidden = true; el.classList.remove('bad'); }
    v[f.k] = x;
  });
  if (!ok) { const b = root.querySelector('.bad'); b && b.focus(); }
  return ok ? v : null;
}
function formModal(o) {
  const m = modal({
    judul: o.judul, sub: o.sub, ikon: o.ikon, lebar: o.lebar || 'lg',
    isi: `<form novalidate class="form-g" id="fm">${o.atas || ''}${o.fields.map((f) => fieldHtml(f, (o.nilai || {})[f.k])).join('')}${o.bawah || ''}</form>`,
    kaki: `<button class="btn btn-g" type="button" data-batal>Batal</button><button class="btn btn-p" type="submit" form="fm" data-simpan>${ic('save', 's18')}${esc(o.tombol || 'Simpan')}</button>`
  });
  const fm = m.el.querySelector('#fm');
  pasangUang(fm);
  m.el.querySelector('[data-batal]').onclick = () => m.tutup();
  fm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const v = bacaForm(fm, o.fields); if (!v) return;
    const btn = m.el.querySelector('[data-simpan]');
    tombolMuat(btn, true, 'Menyimpan…');
    try { const r = await o.simpan(v, m); if (r !== false) m.tutup(); } catch (err) { gagalToast(err); } finally { tombolMuat(btn, false); }
  });
  o.onBuka && o.onBuka(m.el, m);
  return m;
}

// ── Popover ──
let POP = null;
function popover(anchor, html, lebar) {
  tutupPop();
  const el = document.createElement('div');
  el.className = 'pop'; el.innerHTML = html;
  if (lebar) el.style.minWidth = lebar + 'px';
  document.body.appendChild(el);
  const r = anchor.getBoundingClientRect(), w = el.offsetWidth;
  el.style.top = (r.bottom + 8) + 'px';
  el.style.left = Math.max(8, Math.min(window.innerWidth - w - 8, r.right - w)) + 'px';
  POP = el;
  setTimeout(() => document.addEventListener('mousedown', luarPop), 0);
  return el;
}
function luarPop(e) { if (POP && !POP.contains(e.target)) tutupPop(); }
function tutupPop() { if (POP) { POP.remove(); POP = null; } document.removeEventListener('mousedown', luarPop); }

// ── Tooltip global (data-tip) ──
(function () {
  const tip = () => $('#tip');
  document.addEventListener('mouseover', (e) => { const t = e.target.closest && e.target.closest('[data-tip]'); if (!t) return; tip().textContent = t.getAttribute('data-tip'); tip().classList.add('on'); });
  document.addEventListener('mousemove', (e) => { const el = tip(); if (!el || !el.classList.contains('on')) return; const w = el.offsetWidth, h = el.offsetHeight; el.style.left = Math.min(window.innerWidth - w - 8, e.clientX + 14) + 'px'; el.style.top = Math.max(8, e.clientY - h - 12) + 'px'; });
  document.addEventListener('mouseout', (e) => { const t = e.target.closest && e.target.closest('[data-tip]'); if (t && !t.contains(e.relatedTarget)) tip().classList.remove('on'); });
})();

// ── Unduh berkas ──
function unduhBlob(blob, nama) {
  const url = URL.createObjectURL(blob), a = document.createElement('a');
  a.href = url; a.download = nama; a.rel = 'noopener'; document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 4000);
}
function b64Blob(b64, mime) { const bin = atob(b64), u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return new Blob([u], { type: mime || 'application/octet-stream' }); }
function bacaBerkas(file) { return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(',')[1] || ''); r.onerror = () => rej(new Error('Berkas tidak bisa dibaca.')); r.readAsDataURL(file); }); }
function salin(teks, label) {
  const ok = () => toast('Disalin', label || teks, 'ok', { lama: 2000 });
  if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(teks).then(ok, () => salinLama(teks) && ok());
  else if (salinLama(teks)) ok();
}
function salinLama(t) { const a = document.createElement('textarea'); a.value = t; a.style.position = 'fixed'; a.style.opacity = '0'; document.body.appendChild(a); a.select(); let r = false; try { r = document.execCommand('copy'); } catch (e) { } a.remove(); return r; }

// ── Ekspor Excel / CSV / PDF (pustaka dimuat saat dibutuhkan) ──
function baris2D(kolom, rows) { return rows.map((r) => kolom.map((k) => { const v = typeof k.v === 'function' ? k.v(r) : r[k.k]; return v === undefined || v === null ? '' : v; })); }
async function eksporExcel(nama, kolom, rows, sheet) {
  await muatScript(LIB.xlsx);
  const ws = XLSX.utils.aoa_to_sheet([kolom.map((k) => k.l)].concat(baris2D(kolom, rows)));
  ws['!cols'] = kolom.map((k) => ({ wch: k.w || 16 }));
  const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, (sheet || 'Data').slice(0, 30));
  XLSX.writeFile(wb, nama + '.xlsx');
  catatEkspor(nama, rows.length + ' baris Excel');
}
function eksporCsv(nama, kolom, rows) {
  const q = (v) => { const s = String(v === null || v === undefined ? '' : v); return /[",;\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
  const csv = '﻿' + [kolom.map((k) => q(k.l)).join(',')].concat(baris2D(kolom, rows).map((r) => r.map(q).join(','))).join('\r\n');
  unduhBlob(new Blob([csv], { type: 'text/csv;charset=utf-8' }), nama + '.csv');
  catatEkspor(nama, rows.length + ' baris CSV');
}
async function eksporPdf(judul, kolom, rows, opsi) {
  opsi = opsi || {};
  await muatScript(LIB.jspdf); await muatScript(LIB.autotable);
  const doc = new window.jspdf.jsPDF({ orientation: kolom.length > 6 ? 'landscape' : 'portrait', unit: 'pt', format: 'a4' });
  doc.setFontSize(14); doc.text(judul, 40, 40);
  doc.setFontSize(9); doc.setTextColor(110);
  doc.text((S.set.NAMA_BANK || '') + ' • Dicetak ' + tglJam(iso(new Date()) + ' ' + new Date().toTimeString().slice(0, 5)) + ' oleh ' + (S.me ? S.me.nama : '') + (opsi.sub ? ' • ' + opsi.sub : ''), 40, 56);
  doc.autoTable({ startY: 70, head: [kolom.map((k) => k.l)], body: baris2D(kolom, rows).map((r) => r.map((v, i) => kolom[i].pdf ? kolom[i].pdf(v) : (typeof v === 'number' ? NF.format(v) : v))),
    styles: { fontSize: 7.5, cellPadding: 4 }, headStyles: { fillColor: [124, 58, 237], textColor: 255 }, alternateRowStyles: { fillColor: [246, 243, 255] },
    columnStyles: Object.fromEntries(kolom.map((k, i) => [i, { halign: k.kanan ? 'right' : 'left' }])), margin: { left: 40, right: 40 } });
  doc.save(judul.replace(/[\\/:*?"<>|]/g, '-') + '.pdf');
  catatEkspor(judul, rows.length + ' baris PDF');
}
function catatEkspor(objek, ket) { api('ekspor.catat', { objek, ket }).catch(() => { }); }
// ── Data: ingest, turunan, lingkup cabang ──
const STATUS = {
  lancar: { l: 'Lancar', c: 'ok' }, lunas: { l: 'Lunas', c: 'ok' }, jt: { l: 'Jatuh Tempo Dekat', c: 'info' },
  dpk: { l: 'Dalam Perhatian', c: 'warn' }, macet: { l: 'Macet', c: 'bad' }, hb: { l: 'Hapus Buku', c: 'mut' }
};
const KOL_L = ['', 'Lancar', 'Dalam Perhatian Khusus', 'Kurang Lancar', 'Diragukan', 'Macet'];
const KOL_C = ['mut', 'ok', 'warn', 'bad', 'bad', 'bad'];
const JENDELA_JT = 90;
function statusKey(r) {
  if (r.status_kredit === 'Lunas') return 'lunas';
  if (r.status_kredit === 'Hapus Buku') return 'hb';
  if (r.kolektibilitas >= 3) return 'macet';
  if (r.kolektibilitas === 2) return 'dpk';
  if (r._h !== null && r._h >= 0 && r._h <= JENDELA_JT) return 'jt';
  return 'lancar';
}
function labelStatus(r) { const k = r._st; return k === 'macet' ? (KOL_L[r.kolektibilitas] || 'Macet') : STATUS[k].l; }
function badgeStatus(r) { const s = STATUS[r._st]; return `<span class="bdg ${s.c}"><i></i>${esc(labelStatus(r))}</span>`; }
function badgeKol(k) { return `<span class="kol" style="--c:var(--${KOL_C[k] || 'mut'})" data-tip="Kol ${k} — ${esc(KOL_L[k] || '')}">${k || '–'}</span>`; }
const aktif = (r) => r.status_kredit !== 'Lunas' && r.status_kredit !== 'Hapus Buku';
function turunan(o) {
  o.kolektibilitas = Number(o.kolektibilitas) || 0;
  ['plafon', 'baki_debet', 'saldo_efektif', 'saldo_blokir', 'nilai_agunan', 'dpd'].forEach((k) => { o[k] = Number(o[k]) || 0; });
  o._h = selisihHari(o.tgl_jatuh_tempo);
  o._st = statusKey(o);
  o._q = (o.nama_nasabah + ' ' + o.no_rekening + ' ' + o.npwp + ' ' + o.sektor + ' ' + o.jenis_fasilitas).toLowerCase();
  return o;
}
const namaRm = (e) => (S.uIdx[e] ? S.uIdx[e].nama : (e || '—'));
const namaCab = (k) => { const c = S.cabang.find((x) => x.kode === k); return c ? c.nama : k; };

S.raw = { d: {} };
const simpanCacheSesi = deb(() => { if (S.me) SS.set('boot', { me: S.me, raw: S.raw, ver: S.ver }); }, 800);
function terapkanData(p, dariCache) {
  const d = p.d || {};
  Object.keys(d).forEach((k) => { S.raw.d[k] = d[k]; });
  if (p.cabang) S.raw.cabang = p.cabang;
  if (p.ringkas) S.raw.ringkas = p.ringkas;
  if (d.Master_RM_Cabang) { S.users = d.Master_RM_Cabang; S.uIdx = {}; S.users.forEach((u) => { S.uIdx[u.email] = u; }); }
  if (d.Portofolio_Kredit) {
    const { c, r } = d.Portofolio_Kredit;
    S.porto = r.map((row) => { const o = {}; c.forEach((k, i) => { o[k] = row[i]; }); return turunan(o); });
    S.pIdx = {}; S.porto.forEach((x) => { S.pIdx[x.id_fasilitas] = x; });
  }
  if (d.Target_RM) S.target = d.Target_RM;
  if (d.Template_WA) S.tplWA = d.Template_WA;
  if (d.Template_Surat) S.tplSurat = d.Template_Surat;
  if (d.Pengaturan) S.set = d.Pengaturan;
  if (d.Snapshot_Harian) S.snap = d.Snapshot_Harian;
  if (p.cabang) S.cabang = p.cabang;
  if (p.ringkas) S.ringkas = p.ringkas;
  if (p.ver) S.ver = Object.assign({}, S.ver, p.ver);
  if (p.waktu) S.waktuServer = p.waktu;
  if (Object.keys(d).length) { Object.keys(R).forEach((k) => { S.dirty[k] = true; }); if (!dariCache) simpanCacheSesi(); }
  return Object.keys(d).length;
}
/** Portofolio dalam lingkup filter cabang global (server sudah membatasi per peran). */
const P = () => (S.cab === '*' ? S.porto : S.porto.filter((r) => r.kode_cabang === S.cab));
const usersLingkup = () => S.users.filter((u) => S.cab === '*' || u.kode_cabang === S.cab);
const rmLingkup = () => usersLingkup().filter((u) => u.peran === 'RM' || S.porto.some((r) => r.email_rm === u.email));

// ── Achievement ──
const jenisTarget = () => uniq(S.target.map((t) => t.jenis_target)).sort((a, b) => String(S.set.JENIS_TARGET || '').indexOf(a) - String(S.set.JENIS_TARGET || '').indexOf(b));
const daftarPeriode = () => uniq(S.target.map((t) => t.periode)).sort();
function periodeKini() { const now = iso(new Date()).slice(0, 7), ps = daftarPeriode(); const lalu = ps.filter((p) => p <= now); return lalu[lalu.length - 1] || ps[ps.length - 1] || now; }
function labelPeriode(p) { const [y, m] = String(p).split('-'); return (BLN_P[+m - 1] || '') + ' ' + y; }
function achRm(periode, jenis) {
  const emails = uniq(S.target.filter((t) => t.periode === periode).map((t) => t.email_rm)).filter((e) => S.cab === '*' || (S.uIdx[e] && S.uIdx[e].kode_cabang === S.cab));
  return emails.map((e) => {
    const rows = S.target.filter((t) => t.email_rm === e && t.periode === periode && (!jenis || t.jenis_target === jenis));
    const per = {};
    rows.forEach((t) => { per[t.jenis_target] = { t: t.target, r: t.realisasi, a: t.target ? t.realisasi / t.target * 100 : 0, id: t.id_target }; });
    const vals = Object.values(per);
    const avg = vals.length ? sum(vals, (x) => x.a) / vals.length : 0;
    const u = S.uIdx[e] || {};
    return { email: e, nama: u.nama || e, cabang: u.kode_cabang || '', nama_cabang: u.nama_cabang || '', per, avg, t: sum(vals, (x) => x.t), r: sum(vals, (x) => x.r) };
  }).filter((x) => Object.keys(x.per).length).sort((a, b) => b.avg - a.avg);
}

// ── Snapshot (tren baki) ──
function seriSnap() {
  const peta = {};
  Object.keys(S.snap || {}).forEach((k) => {
    if (S.cab !== '*' && k !== 'SAYA' && k !== S.cab) return;
    S.snap[k].forEach((r) => { const a = peta[r[0]] = peta[r[0]] || [r[0], 0, 0, 0, 0, 0, 0]; for (let i = 1; i < 7; i++) a[i] += Number(r[i]) || 0; });
  });
  return Object.keys(peta).sort().map((k) => peta[k]);
}

// ── Grafik SVG ringan (tanpa pustaka) ──
function gid() { return 'g' + Math.random().toString(36).slice(2, 9); }
function donut(v, o) {
  o = Object.assign({ s: 84, w: 9, c: 'var(--accent)', track: 'var(--elev)' }, o || {});
  const r = (o.s - o.w) / 2, C = 2 * Math.PI * r, val = Math.max(0, Math.min(100, Number(v) || 0)), len = val / 100 * C, id = gid(), h = o.s / 2;
  const grad = o.grad ? `<defs><linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1">${o.grad.map((c, i) => `<stop offset="${i / (o.grad.length - 1) * 100}%" style="stop-color:${c}"/>`).join('')}</linearGradient></defs>` : '';
  return `<div class="donut-wrap" style="width:${o.s}px;height:${o.s}px;--fs:${o.fs || Math.round(o.s / 4.3)}px">
    <svg width="${o.s}" height="${o.s}" viewBox="0 0 ${o.s} ${o.s}" role="img" aria-label="${esc(o.aria || pct(val))}">${grad}
    <circle cx="${h}" cy="${h}" r="${r}" fill="none" style="stroke:${o.track}" stroke-width="${o.w}"/>
    <circle class="donut-arc" cx="${h}" cy="${h}" r="${r}" fill="none" style="stroke:${o.grad ? 'url(#' + id + ')' : o.c}" stroke-width="${o.w}" stroke-linecap="round" stroke-dasharray="${len.toFixed(2)} ${C.toFixed(2)}" transform="rotate(-90 ${h} ${h})"/></svg>
    <div class="ctr"><b>${o.label !== undefined ? o.label : pct(val, 0)}</b>${o.sub ? `<small style="color:${o.subC || 'var(--tx2)'}">${esc(o.sub)}</small>` : ''}</div></div>`;
}
function skalaNice(maks) {
  if (maks <= 0) return { maks: 1, step: 0.25 };
  const p = Math.pow(10, Math.floor(Math.log10(maks))), n = maks / p;
  const kandidat = [1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10].find((x) => x >= n) * p;
  return { maks: kandidat, step: kandidat / 4 };
}
function lebarEl(el, def) { return Math.max(260, Math.floor((el && el.clientWidth) || def || 600)); }
/** Grafik batang berkelompok. series: [{n, c, v:[..]}] */
function grafikBatang(el, cats, series, o) {
  o = Object.assign({ h: 220, fmt: (x) => n0(x), fmtSumbu: null }, o || {});
  const W = lebarEl(el), H = o.h, pl = 52, pb = 26, pt = 10, iw = W - pl - 8, ih = H - pb - pt;
  const maks = Math.max(1, ...series.flatMap((s) => s.v.map((x) => Number(x) || 0)));
  const sk = skalaNice(maks), gw = iw / Math.max(1, cats.length), bw = Math.max(6, Math.min(22, gw * 0.7 / series.length - 3));
  const fs = o.fmtSumbu || o.fmt;
  let g = '';
  for (let i = 0; i <= 4; i++) { const y = pt + ih - (i * sk.step / sk.maks) * ih; g += `<line class="gl" x1="${pl}" x2="${W - 8}" y1="${y}" y2="${y}"/><text x="${pl - 8}" y="${y + 4}" text-anchor="end">${esc(fs(i * sk.step))}</text>`; }
  cats.forEach((c, i) => {
    const gx = pl + i * gw, total = series.length * (bw + 4) - 4, x0 = gx + (gw - total) / 2;
    series.forEach((s, j) => {
      const v = Number(s.v[i]) || 0, bh = Math.max(v > 0 ? 2 : 0, v / sk.maks * ih), x = x0 + j * (bw + 4), y = pt + ih - bh, r = Math.min(5, bw / 2, bh);
      g += `<path d="M${x},${y + bh}V${y + r}Q${x},${y} ${x + r},${y}H${x + bw - r}Q${x + bw},${y} ${x + bw},${y + r}V${y + bh}Z" style="fill:${s.c}"/>`;
    });
    const tipTeks = c + '\n' + series.map((s) => s.n + ': ' + o.fmt(s.v[i])).join('\n');
    g += `<rect x="${gx}" y="${pt}" width="${gw}" height="${ih}" fill="transparent" data-tip="${esc(tipTeks)}"/>`;
    g += `<text x="${gx + gw / 2}" y="${H - 6}" text-anchor="middle" style="${i === cats.length - 1 ? 'fill:var(--tx);font-weight:700' : ''}">${esc(c)}</text>`;
  });
  el.innerHTML = `<div class="chart"><svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(o.aria || 'Grafik batang')}">${g}</svg></div>`;
}
/** Grafik area halus dengan crosshair interaktif. pts: [{l, v, tip}] */
function grafikArea(el, pts, o) {
  o = Object.assign({ h: 210, c: '#8B5CF6', fmt: (x) => rpS(x), label: 6 }, o || {});
  if (!pts.length) { el.innerHTML = `<div class="empty">${ic('show_chart')}<b>Belum ada data tren</b><span class="fs12">Data snapshot harian terisi otomatis setiap pukul 08.00 WIB.</span></div>`; return; }
  const W = lebarEl(el), H = o.h, pl = 8, pr = 8, pt = 16, pb = 26, iw = W - pl - pr, ih = H - pt - pb;
  const vs = pts.map((p) => Number(p.v) || 0), mn = Math.min(...vs), mx = Math.max(...vs), rentang = (mx - mn) || mx || 1;
  const lo = Math.max(0, mn - rentang * 0.25), hi = mx + rentang * 0.12;
  const X = (i) => pl + (pts.length === 1 ? iw / 2 : i / (pts.length - 1) * iw), Y = (v) => pt + ih - (v - lo) / (hi - lo) * ih;
  let d = `M${X(0)},${Y(vs[0])}`;
  for (let i = 0; i < vs.length - 1; i++) {
    const x0 = X(i - 1 < 0 ? 0 : i - 1), y0 = Y(vs[Math.max(0, i - 1)]), x1 = X(i), y1 = Y(vs[i]), x2 = X(i + 1), y2 = Y(vs[i + 1]), x3 = X(Math.min(vs.length - 1, i + 2)), y3 = Y(vs[Math.min(vs.length - 1, i + 2)]);
    d += `C${x1 + (x2 - x0) / 6},${y1 + (y2 - y0) / 6} ${x2 - (x3 - x1) / 6},${y2 - (y3 - y1) / 6} ${x2},${y2}`;
  }
  const id = gid(), fid = gid();
  let lab = '';
  const langkah = Math.max(1, Math.ceil(pts.length / o.label));
  pts.forEach((p, i) => { if (i % langkah === 0 || i === pts.length - 1) lab += `<text x="${Math.min(W - 24, Math.max(18, X(i)))}" y="${H - 6}" text-anchor="middle">${esc(p.l)}</text>`; });
  let grid = '';
  for (let i = 1; i <= 3; i++) { const y = pt + ih * i / 4; grid += `<line class="gl" x1="${pl}" x2="${W - pr}" y1="${y}" y2="${y}"/>`; }
  el.innerHTML = `<div class="chart"><svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(o.aria || 'Grafik tren')}">
    <defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" style="stop-color:${o.c};stop-opacity:.5"/><stop offset="65%" style="stop-color:${o.c};stop-opacity:.12"/><stop offset="100%" style="stop-color:${o.c};stop-opacity:0"/></linearGradient>
    <filter id="${fid}" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="3" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>
    ${grid}<path d="${d}L${X(vs.length - 1)},${pt + ih}L${X(0)},${pt + ih}Z" fill="url(#${id})"/>
    <path d="${d}" fill="none" style="stroke:${o.c}" stroke-width="2.6" filter="url(#${fid})"/>
    <line data-x1 x1="0" x2="0" y1="${pt}" y2="${pt + ih}" style="stroke:${o.c};opacity:0" stroke-dasharray="4 4"/>
    <circle data-dot r="5" cx="${X(vs.length - 1)}" cy="${Y(vs[vs.length - 1])}" style="fill:#D0BCFF;stroke:var(--canvas)" stroke-width="2.5"/>
    ${lab}<rect data-hit x="${pl}" y="${pt}" width="${iw}" height="${ih}" fill="transparent"/></svg></div>`;
  const svg = el.querySelector('svg'), dot = svg.querySelector('[data-dot]'), ln = svg.querySelector('[data-x1]'), tip = $('#tip');
  const gerak = (cx) => {
    const r = svg.getBoundingClientRect(), x = (cx - r.left) * (W / r.width);
    const i = Math.max(0, Math.min(pts.length - 1, Math.round((x - pl) / (iw || 1) * (pts.length - 1))));
    dot.setAttribute('cx', X(i)); dot.setAttribute('cy', Y(vs[i])); ln.setAttribute('x1', X(i)); ln.setAttribute('x2', X(i)); ln.style.opacity = .6;
    tip.textContent = pts[i].tip || (pts[i].l + ': ' + o.fmt(vs[i])); tip.classList.add('on');
    const bx = r.left + X(i) * (r.width / W), by = r.top + Y(vs[i]) * (r.height / H);
    tip.style.left = Math.min(window.innerWidth - tip.offsetWidth - 8, Math.max(8, bx - tip.offsetWidth / 2)) + 'px'; tip.style.top = Math.max(8, by - tip.offsetHeight - 14) + 'px';
  };
  const hit = svg.querySelector('[data-hit]');
  hit.addEventListener('mousemove', (e) => gerak(e.clientX));
  hit.addEventListener('touchmove', (e) => { gerak(e.touches[0].clientX); }, { passive: true });
  hit.addEventListener('mouseleave', () => { tip.classList.remove('on'); ln.style.opacity = 0; });
}
/** Daftar batang horizontal (HTML). items: [{l, v, sub, c, nilai}] */
function hbar(items, o) {
  o = o || {};
  const mx = Math.max(1, ...items.map((x) => Number(x.v) || 0));
  if (!items.length) return `<div class="empty">${ic('bar_chart')}<b>Tidak ada data</b></div>`;
  return `<div class="hb">${items.map((x) => `<div class="hb-r"><div class="top"><span title="${esc(x.l)}">${esc(x.l)}</span><b class="num" style="color:${x.c || 'var(--tx)'}">${esc(x.nilai !== undefined ? x.nilai : n0(x.v))}</b></div>
    <div class="bar thin"><i style="width:${Math.max(1.5, (Number(x.v) || 0) / (o.maks || mx) * 100)}%;--c:${x.c || 'linear-gradient(90deg,var(--accent),var(--pink))'}"></i></div>${x.sub ? `<div class="fs12 dim mt4">${esc(x.sub)}</div>` : ''}</div>`).join('')}</div>`;
}
/** Batang bertumpuk 100% per baris. rows: [{l, parts:[{v,c,n}]}] */
function stack100(rows) {
  return `<div class="hb">${rows.map((r) => { const t = sum(r.parts, (p) => p.v) || 1; return `<div class="hb-r"><div class="top"><span>${esc(r.l)}</span><span class="dim fs12">${esc(r.ket || '')}</span></div>
    <div class="bar" style="display:flex;height:12px">${r.parts.map((p) => `<i style="width:${p.v / t * 100}%;--c:${p.c};border-radius:0" data-tip="${esc(p.n + ': ' + pct(p.v / t * 100) + (p.ket ? ' • ' + p.ket : ''))}"></i>`).join('')}</div></div>`; }).join('')}</div>`;
}
function sparkBar(vals, c) {
  const mx = Math.max(1, ...vals);
  return `<span style="display:inline-flex;align-items:flex-end;gap:2px;height:22px">${vals.map((v) => `<i style="display:block;width:5px;border-radius:2px;height:${Math.max(2, v / mx * 22)}px;background:${c || 'var(--accent)'};opacity:${0.45 + 0.55 * v / mx}"></i>`).join('')}</span>`;
}
const kosong = (ikon, judul, sub, aksi) => `<div class="empty">${ic(ikon)}<b>${esc(judul)}</b>${sub ? `<span class="fs12">${esc(sub)}</span>` : ''}${aksi || ''}</div>`;
const skel = (n) => Array.from({ length: n || 4 }, () => '<div class="sk l"></div>').join('');
// ── Autentikasi dua langkah (akun Google + Microsoft Authenticator TOTP) ──
const AUTH = { pre: '', email: '', nama: '', timer: null };
function langkahAuth(teks, persen, warna) {
  $('#auth-steps').innerHTML = `<div class="row"><span class="row g4" style="color:var(--tx)"><span style="width:8px;height:8px;border-radius:50%;background:var(--${warna || 'info'});display:inline-block"></span>${esc(teks)}</span><b class="acc fs12">${persen}%</b></div>
    <div class="bar thin"><i style="width:${persen}%;--c:linear-gradient(90deg,var(--accent-btn),var(--accent-tx))"></i></div>`;
}
function tampilAuth(html) { clearInterval(AUTH.timer); $('#auth-body').innerHTML = html; }
function bukaAuth() {
  $('#splash').hidden = true; $('#app').hidden = true; $('#auth').hidden = false;
  if (S.set.NAMA_APLIKASI) $('#auth-appname').textContent = S.set.NAMA_APLIKASI;
  mulaiLangkah1();
}
function kotakGalat(judul, pesan, ekstra) {
  return `<div class="note bad mb16">${ic('error')}<div><b>${esc(judul)}</b><div class="mt4">${esc(pesan)}</div></div></div>${ekstra || ''}
    <button class="btn btn-g" style="width:100%" data-auth="ulang">${ic('refresh', 's18')}Coba lagi</button>`;
}
async function mulaiLangkah1() {
  langkahAuth('Langkah 1 dari 2: Akun Google', 50, 'warn');
  tampilAuth(`<div class="box"><div class="ic">${ic('corporate_fare')}</div><div><h2>Masuk dengan akun Google</h2><p>Gunakan email kantor yang terdaftar sebagai Admin, Pimpinan, atau RM.</p></div></div>
    <div class="gbtn-host" id="gbtn"><div class="spin"></div></div><p class="center fs12 dim mt12">Akun Google hanya dipakai untuk identitas — kata sandi tidak pernah dikirim ke aplikasi.</p>`);
  try {
    const cfg = await api('auth.config', {});
    if (cfg.data.namaAplikasi) $('#auth-appname').textContent = cfg.data.namaAplikasi;
    if (!cfg.data.googleClientId) { tampilAuth(kotakGalat('Login Google belum dikonfigurasi', 'Pemilik aplikasi perlu mengisi GOOGLE_CLIENT_ID di Apps Script → Setelan proyek → Properti skrip (panduan tahap C).')); return; }
    await muatScript(LIB.gis);
    google.accounts.id.initialize({ client_id: cfg.data.googleClientId, callback: async (resp) => {
      tampilAuth(`<div class="center"><div class="spin" style="margin:16px auto"></div><p class="muted">Memverifikasi akun Google…</p></div>`);
      try { const r = await api('auth.mulai', { idToken: resp.credential }); hasilLangkah1(r.data, false); } catch (e) { galatLangkah1(e); }
    }, auto_select: false, cancel_on_tap_outside: true, ux_mode: 'popup' });
    const host = $('#gbtn'); host.innerHTML = '';
    google.accounts.id.renderButton(host, { theme: 'filled_black', size: 'large', shape: 'pill', text: 'signin_with', locale: 'id', width: Math.min(340, host.clientWidth || 320) });
  } catch (e) { galatLangkah1(e); }
}
function galatLangkah1(e) {
  const pwa = S.set.PWA_URL || '';
  const judul = e.code === 'NO_EMAIL' ? 'Akun Google tidak terbaca' : e.code === 'NOT_REGISTERED' ? 'Akun tidak terdaftar' : 'Tidak dapat memulai login';
  tampilAuth(kotakGalat(judul, e.message, e.code === 'NO_EMAIL' && pwa ? `<a class="btn btn-p mb12" style="width:100%" href="${esc(pwa)}" target="_blank" rel="noopener">${ic('install_mobile', 's18')}Buka aplikasi HP</a>` : ''));
}
function hasilLangkah1(d, perluKonfirmasi) {
  Object.assign(AUTH, { pre: d.pre, email: d.email, nama: d.nama });
  if (d.terkunciSampai) { tampilKunci(d.terkunciSampai); return; }
  const lanjut = () => (d.perluDaftar ? mulaiDaftar() : tampilOtp());
  if (!perluKonfirmasi) return lanjut();
  tampilAuth(`<div class="box"><div class="ic">${ic('verified_user', 'fill')}</div><div><h2>Akun Google terverifikasi</h2><p>Halo, <b style="color:var(--tx)">${esc(d.nama)}</b> (${esc(d.peran)}).</p></div></div>
    <div class="fld mb16"><label for="em-ro">Email terdaftar</label><input id="em-ro" class="inp" readonly value="${esc(d.email)}"></div>
    <button class="btn btn-p" style="width:100%;height:48px" data-auth="lanjut">${ic('arrow_forward', 's18')}Lanjutkan ke verifikasi MFA</button>`);
  $('[data-auth="lanjut"]').onclick = lanjut;
}
function tampilKunci(sampai) {
  langkahAuth('Akun terkunci sementara', 100, 'bad');
  tampilAuth(`<div class="note bad mb16">${ic('lock_clock')}<div><b>Terlalu banyak percobaan salah</b><div class="mt4">Akun dikunci hingga <b id="kunci-j">${new Date(sampai).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}</b>. Sisa <b id="kunci-s"></b>.</div></div></div><button class="btn btn-g" style="width:100%" data-auth="ulang">${ic('refresh', 's18')}Muat ulang</button>`);
  const t = () => { const s = Math.max(0, Math.ceil((sampai - Date.now()) / 1000)); const el = $('#kunci-s'); if (el) el.textContent = Math.floor(s / 60) + ' menit ' + (s % 60) + ' detik'; if (!s) mulaiLangkah1(); };
  t(); AUTH.timer = setInterval(t, 1000);
}
function htmlOtp(id) {
  return `<div class="otp" id="${id}" role="group" aria-label="Kode 6 digit">${Array.from({ length: 6 }, (_, i) => `<input inputmode="numeric" maxlength="1" autocomplete="${i === 0 ? 'one-time-code' : 'off'}" aria-label="Digit ${i + 1}">`).join('')}</div>`;
}
function pasangOtp(id, kirim) {
  const box = $('#' + id), ins = $$('input', box);
  const nilai = () => ins.map((x) => x.value).join('');
  const cek = () => { if (/^\d{6}$/.test(nilai())) kirim(nilai()); };
  ins.forEach((el, i) => {
    el.addEventListener('input', () => { el.value = el.value.replace(/\D/g, '').slice(-1); if (el.value && i < 5) ins[i + 1].focus(); box.classList.remove('salah'); cek(); });
    el.addEventListener('keydown', (e) => { if (e.key === 'Backspace' && !el.value && i > 0) { ins[i - 1].focus(); ins[i - 1].value = ''; } if (e.key === 'ArrowLeft' && i > 0) ins[i - 1].focus(); if (e.key === 'ArrowRight' && i < 5) ins[i + 1].focus(); });
    el.addEventListener('paste', (e) => { const t = (e.clipboardData || window.clipboardData).getData('text').replace(/\D/g, '').slice(0, 6); if (!t) return; e.preventDefault(); t.split('').forEach((c, k) => { if (ins[k]) ins[k].value = c; }); ins[Math.min(5, t.length)].focus(); cek(); });
    el.addEventListener('focus', () => el.select());
  });
  setTimeout(() => ins[0].focus(), 50);
  return { nilai, reset: () => { ins.forEach((x) => { x.value = ''; }); box.classList.add('salah'); ins[0].focus(); } };
}
function timerTotp() {
  const C = 56.5;
  const t = () => { const s = 30 - (Math.floor(Date.now() / 1000) % 30), el = $('#t-dtk'), c = $('#t-ring'); if (el) el.textContent = s + ' detik'; if (c) c.style.strokeDashoffset = C * (1 - s / 30); };
  t(); AUTH.timer = setInterval(t, 1000);
  return `<div class="center"><span class="timer"><svg width="16" height="16" viewBox="0 0 24 24" style="transform:rotate(-90deg)"><circle cx="12" cy="12" r="9" fill="none" stroke-width="2" style="stroke:var(--elev2)"/><circle id="t-ring" cx="12" cy="12" r="9" fill="none" stroke-width="2.5" stroke-linecap="round" stroke-dasharray="56.5" style="stroke:var(--warn)"/></svg>Kode berganti dalam <b class="num" id="t-dtk" style="color:var(--tx)">30 detik</b></span></div>`;
}
function tampilOtp() {
  langkahAuth('Langkah 2 dari 2: Verifikasi Dua Langkah (MFA)', 100, 'info');
  tampilAuth(`<div class="box"><div class="ic">${ic('security', 'fill')}</div><div><h2 class="row">Verifikasi Kode <span class="bdg acc lc">Microsoft Authenticator</span></h2>
    <p>Buka aplikasi <b style="color:var(--tx)">Microsoft Authenticator</b> di ponsel, lalu masukkan 6 digit kode untuk:</p><span class="pill-tag mt8" style="height:26px;font-size:12.5px">${ic('mail', 's16')}&nbsp;${esc(AUTH.email)}</span></div></div>
    ${htmlOtp('otp1')}<div id="tmr"></div>
    <button class="btn btn-p mt16" style="width:100%;height:48px" data-auth="verif">${ic('lock_open', 's18')}Verifikasi &amp; Masuk</button>
    <div class="row mt12" style="justify-content:space-between"><button class="lnk" data-auth="cadangan">${ic('key', 's16')} Gunakan kode cadangan</button><button class="lnk" style="color:var(--tx2)" data-auth="ulang">Ganti akun</button></div>`);
  $('#tmr').outerHTML = timerTotp();
  const btn = $('[data-auth="verif"]');
  const kirim = async (kode) => {
    if (btn.classList.contains('load')) return;
    tombolMuat(btn, true, 'Memverifikasi…');
    try { const r = await api('auth.verifikasi', { pre: AUTH.pre, otp: kode }); masukAplikasi(r.data.token, r.data.boot); }
    catch (e) { tombolMuat(btn, false); if (e.code === 'LOCKED') return tampilKunci(Date.now() + 15 * 60e3); toast('Verifikasi gagal', e.message, 'bad'); otp.reset(); }
  };
  const otp = pasangOtp('otp1', kirim);
  btn.onclick = () => { const v = otp.nilai(); if (/^\d{6}$/.test(v)) kirim(v); else toast('Kode belum lengkap', 'Masukkan 6 digit kode dari Authenticator.', 'warn'); };
  $('[data-auth="cadangan"]').onclick = tampilCadangan;
}
function tampilCadangan() {
  tampilAuth(`<div class="box"><div class="ic">${ic('key')}</div><div><h2>Kode cadangan</h2><p>Masukkan salah satu dari 8 kode cadangan yang Anda simpan saat pendaftaran. Setiap kode hanya berlaku sekali.</p></div></div>
    <div class="fld"><label for="kc">Kode cadangan</label><input id="kc" class="inp mono" placeholder="XXXX-XXXX" maxlength="9" autocomplete="off" style="font-size:18px;letter-spacing:.12em;text-align:center;height:52px"></div>
    <button class="btn btn-p mt16" style="width:100%;height:48px" data-auth="kirim-kc">${ic('lock_open', 's18')}Masuk dengan kode cadangan</button>
    <button class="lnk mt12" data-auth="kembali">${ic('arrow_back', 's16')} Kembali ke kode Authenticator</button>`);
  const inp = $('#kc'), btn = $('[data-auth="kirim-kc"]');
  inp.addEventListener('input', () => { const v = inp.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8); inp.value = v.length > 4 ? v.slice(0, 4) + '-' + v.slice(4) : v; });
  const kirim = async () => {
    if (inp.value.replace(/-/g, '').length !== 8) return toast('Kode tidak lengkap', 'Kode cadangan terdiri dari 8 karakter.', 'warn');
    tombolMuat(btn, true, 'Memverifikasi…');
    try { const r = await api('auth.verifikasi', { pre: AUTH.pre, otpCadangan: inp.value }); toast('Kode cadangan dipakai', 'Segera buat kode cadangan baru dari menu akun.', 'warn'); masukAplikasi(r.data.token, r.data.boot); }
    catch (e) { tombolMuat(btn, false); if (e.code === 'LOCKED') return tampilKunci(Date.now() + 15 * 60e3); toast('Gagal', e.message, 'bad'); inp.select(); }
  };
  btn.onclick = kirim; inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') kirim(); });
  $('[data-auth="kembali"]').onclick = tampilOtp;
  inp.focus();
}
async function mulaiDaftar() {
  langkahAuth('Aktivasi baru: Pendaftaran Authenticator', 75, 'acc');
  tampilAuth(`<div class="center"><div class="spin" style="margin:16px auto"></div><p class="muted">Menyiapkan kunci rahasia…</p></div>`);
  let d;
  try { d = (await api('auth.daftarMulai', { pre: AUTH.pre })).data; } catch (e) { return galatLangkah1(e); }
  tampilAuth(`<div class="box"><div class="ic">${ic('qr_code_scanner')}</div><div><h2>Daftarkan perangkat (sekali saja)</h2>
    <p>1. Buka <b style="color:var(--tx)">Microsoft Authenticator</b> → <b style="color:var(--tx)">+</b> → <i>Akun lainnya (Google, Facebook, dll.)</i><br>2. Pindai kode QR di bawah, lalu masukkan 6 digit kode yang muncul.</p></div></div>
    <div class="qr" id="qr" aria-label="Kode QR pendaftaran"><div class="spin"></div></div>
    <div class="inner center mb16"><div class="fs11 muted b" style="letter-spacing:.06em;text-transform:uppercase">Tidak bisa memindai? Masukkan kunci manual</div><div class="secret mt4">${esc(d.secret)}</div>
    <button class="lnk mt4" data-auth="salin-kunci">${ic('content_copy', 's16')} Salin kunci</button></div>
    <label class="lbl">Kode 6 digit dari Authenticator</label>${htmlOtp('otp2')}
    <button class="btn btn-p" style="width:100%;height:48px" data-auth="daftar">${ic('done_all', 's18')}Aktifkan &amp; Masuk</button>`);
  $('[data-auth="salin-kunci"]').onclick = () => salin(d.secret.replace(/\s/g, ''), 'Kunci rahasia disalin');
  // Pustaka QR dimuat asinkron: layar bisa sudah berganti (pengguna mengetik kode manual) saat pustaka tiba → selalu cek #qr masih ada
  muatScript(LIB.qr).then(() => { const el = $('#qr'); if (!el) return; const q = qrcode(0, 'M'); q.addData(d.uri); q.make(); el.innerHTML = q.createSvgTag({ cellSize: 4, margin: 0, scalable: true }); })
    .catch(() => { const el = $('#qr'); if (el) el.innerHTML = '<span class="fs12" style="color:#333;padding:8px;text-align:center">QR tidak dapat dimuat. Gunakan kunci manual di bawah.</span>'; });
  const btn = $('[data-auth="daftar"]');
  const kirim = async (kode) => {
    if (btn.classList.contains('load')) return;
    tombolMuat(btn, true, 'Mengaktifkan…');
    try { const r = await api('auth.daftarSelesai', { pre: AUTH.pre, otp: kode }); tampilKodeCadangan(r.data.cadangan, () => masukAplikasi(r.data.token, r.data.boot)); }
    catch (e) { tombolMuat(btn, false); if (e.code === 'LOCKED') return tampilKunci(Date.now() + 15 * 60e3); toast('Kode salah', e.message, 'bad'); otp.reset(); }
  };
  const otp = pasangOtp('otp2', kirim);
  btn.onclick = () => { const v = otp.nilai(); if (/^\d{6}$/.test(v)) kirim(v); else toast('Kode belum lengkap', 'Masukkan 6 digit kode.', 'warn'); };
}
function htmlKodeCadangan(kode) {
  return `<div class="note warn mb16">${ic('warning')}<div><b>Simpan 8 kode cadangan ini sekarang</b><div class="mt4">Kode hanya ditampilkan sekali. Gunakan bila ponsel hilang. Setiap kode berlaku satu kali.</div></div></div>
    <div class="codes">${kode.map((k) => `<span>${esc(k)}</span>`).join('')}</div>
    <div class="row mt12"><button class="btn btn-g btn-sm" data-kc="salin">${ic('content_copy')}Salin</button><button class="btn btn-g btn-sm" data-kc="unduh">${ic('download')}Unduh .txt</button></div>`;
}
function pasangKodeCadangan(root, kode) {
  const teks = 'Kode cadangan ' + (S.set.NAMA_APLIKASI || 'Business Banking') + ' — ' + (AUTH.email || (S.me && S.me.email) || '') + '\nDibuat: ' + new Date().toLocaleString('id-ID') + '\n\n' + kode.join('\n') + '\n\nSetiap kode hanya berlaku sekali. Simpan di tempat aman.';
  root.querySelector('[data-kc="salin"]').onclick = () => salin(teks, '8 kode cadangan disalin');
  root.querySelector('[data-kc="unduh"]').onclick = () => unduhBlob(new Blob([teks], { type: 'text/plain' }), 'kode-cadangan-business-banking.txt');
}
function tampilKodeCadangan(kode, lanjut) {
  langkahAuth('MFA aktif — simpan kode cadangan', 100, 'ok');
  tampilAuth(`${htmlKodeCadangan(kode)}<label class="chk mt16"><input type="checkbox" id="kc-ok"> Saya sudah menyimpan kode cadangan di tempat aman</label>
    <button class="btn btn-p mt16" style="width:100%;height:48px" data-auth="masuk" disabled>${ic('dashboard', 's18')}Masuk ke Dashboard</button>`);
  pasangKodeCadangan($('#auth-body'), kode);
  const b = $('[data-auth="masuk"]');
  $('#kc-ok').onchange = (e) => { b.disabled = !e.target.checked; };
  b.onclick = lanjut;
}
document.addEventListener('click', (e) => { const t = e.target.closest('[data-auth="ulang"]'); if (t) { AUTH.pre = ''; mulaiLangkah1(); } });
// ── Kerangka aplikasi: menu, router SPA, sesi, sinkron latar, idle, tema, PWA ──
const MENU = [
  { sek: 'Utama' },
  { id: 'dashboard', l: 'Dashboard', i: 'dashboard' },
  { id: 'analisis', l: 'Analisis', i: 'monitoring' },
  { sek: 'Portofolio' },
  { id: 'nasabah', l: 'Nasabah', i: 'group' },
  { id: 'achievement', l: 'Achievement RM', i: 'military_tech' },
  { id: 'dokumen', l: 'Dokumen', i: 'folder_open' },
  { id: 'surat', l: 'Surat', i: 'mail' },
  { sek: 'Komunikasi' },
  { id: 'wa', l: 'Pesan WA', i: 'chat', peran: ['Admin', 'Pimpinan'] },
  { id: 'pengingat', l: 'Pengingat', i: 'notifications_active' },
  { sek: 'Administrasi', peran: ['Admin'] },
  { id: 'impor', l: 'Impor Data', i: 'upload_file', peran: ['Admin'], tag: 'Admin' },
  { id: 'pengaturan', l: 'Pengaturan', i: 'settings', peran: ['Admin'] }
];
const JUDUL = { dashboard: 'Portfolio & Monitoring', analisis: 'Analisis Portofolio', nasabah: 'Daftar Nasabah', detail: 'Detail Nasabah', achievement: 'Achievement RM',
  dokumen: 'Arsip Dokumen', surat: 'Cetak Surat', wa: 'Pesan WA', pengingat: 'Pengingat Jatuh Tempo', impor: 'Impor & Sinkronisasi', pengaturan: 'Pengaturan' };
const bolehMenu = (m) => !m.peran || m.peran.includes(peran());

function renderMenu() {
  $('#nav').innerHTML = MENU.filter(bolehMenu).map((m) => m.sek ? `<div class="nav-sec">${esc(m.sek)}</div>`
    : `<button class="nav-item" type="button" data-go="${m.id}" title="${esc(m.l)}">${ic(m.i)}<span>${esc(m.l)}</span>${m.tag ? `<span class="tag">${m.tag}</span>` : ''}${m.id === 'pengingat' ? '<span class="cnt" id="cnt-png" hidden></span>' : ''}</button>`).join('');
}
function go(route, params, opsi) {
  opsi = opsi || {};
  if (!R[route]) route = 'dashboard';
  const m = MENU.find((x) => x.id === route);
  if (m && !bolehMenu(m)) { toast('Akses ditolak', 'Menu ini tidak tersedia untuk peran ' + peran() + '.', 'warn'); route = 'dashboard'; }
  if (S.route !== route && !opsi.noHist) S.hist.push({ r: S.route, p: S.params });
  const ganti = S.route !== route || JSON.stringify(params || {}) !== JSON.stringify(S.params || {});
  S.route = route; S.params = params || {};
  $$('.view').forEach((v) => v.classList.toggle('on', v.id === 'v-' + route));
  $$('#nav .nav-item').forEach((n) => n.classList.toggle('on', n.dataset.go === (route === 'detail' ? 'nasabah' : route)));
  $('#tb-title').textContent = JUDUL[route] || '';
  document.title = (JUDUL[route] || '') + ' — ' + (S.set.NAMA_APLIKASI || 'Business Banking');
  tutupSb(); tutupPop();
  if (route !== 'wa') { const qb = $('#qbox'); if (qb) qb.remove(); }
  render(route, ganti || opsi.paksa);
  if (ganti) window.scrollTo(0, 0);
  if (route !== 'detail') LS.set('route', route);
  if (MODE === 'pwa' && !opsi.dariPop) { try { history.pushState({ route, params }, '', '#/' + route + (route === 'detail' && params && params.id ? '/' + params.id : '')); } catch (e) { } }
}
function render(route, paksa) {
  const el = $('#v-' + route);
  if (!el || !R[route] || !S.me) return; // belum masuk (mis. resize/DevTools di layar login) → jangan render halaman data
  if (paksa || S.dirty[route] || !el.dataset.siap) {
    try { R[route](el, S.params || {}); } catch (e) { console.error(e); el.innerHTML = kosong('error', 'Gagal menampilkan halaman', e.message); }
    el.dataset.siap = '1'; S.dirty[route] = false;
  }
}
function kembali() { const h = S.hist.pop(); if (h) go(h.r, h.p, { noHist: true }); else go('dashboard', {}, { noHist: true }); }
window.addEventListener('popstate', (e) => { if (MODE === 'pwa' && S.me && e.state && e.state.route) go(e.state.route, e.state.params, { noHist: true, dariPop: true }); });

function bukaSb() { $('#sb').classList.add('open'); $('#scrim').classList.add('on'); }
function tutupSb() { $('#sb').classList.remove('open'); $('#scrim').classList.remove('on'); }
function aturTema(t) { document.documentElement.setAttribute('data-theme', t); LS.set('tema', t); const i = $('#ic-tema'); if (i) i.textContent = t === 'light' ? 'dark_mode' : 'light_mode'; const m = document.querySelector('meta[name=theme-color]'); if (m) m.content = t === 'light' ? '#F5F3FB' : '#1B1530'; }

function masukAplikasi(token, boot) {
  S.token = token; SS.set('tok', token);
  S.me = boot.me; S.raw = { d: {} };
  terapkanData(boot);
  tampilkanApp();
  toast('Selamat datang', S.me.nama + ' • ' + S.me.peran, 'ok', { lama: 2500 });
}
function tampilkanApp() {
  $('#splash').hidden = true; $('#auth').hidden = true; $('#app').hidden = false;
  clearInterval(AUTH.timer);
  $('#tb-nama').textContent = S.me.nama; $('#tb-peran').textContent = S.me.peran + (S.me.nama_cabang ? ' • ' + S.me.nama_cabang : '');
  $('#tb-av').textContent = ini(S.me.nama);
  $('#sb-nama').textContent = S.set.NAMA_APLIKASI || 'Business Banking';
  renderMenu();
  const cw = $('#cab-wrap'), sel = $('#cab-sel');
  if (isAdm()) {
    cw.hidden = false;
    const simpan = LS.get('cab', '*');
    S.cab = simpan === '*' || S.cabang.some((c) => c.kode === simpan) ? simpan : '*';
    sel.innerHTML = `<option value="*">Semua Cabang</option>` + S.cabang.map((c) => `<option value="${esc(c.kode)}">${esc(c.nama)}</option>`).join('');
    sel.value = S.cab; sel.disabled = false;
  } else if (isPim()) {
    cw.hidden = false; S.cab = '*';
    sel.innerHTML = `<option>${esc(S.me.nama_cabang || S.me.kode_cabang)}</option>`; sel.disabled = true;
  } else { cw.hidden = true; S.cab = '*'; }
  let awal = LS.get('route', 'dashboard');
  if (MODE === 'pwa' && location.hash.length > 2) { const p = location.hash.slice(2).split('/'); awal = p[0]; if (awal === 'detail' && p[1]) return go('detail', { id: p[1] }, { noHist: true }); }
  perbaruiNotif();
  go(awal === 'detail' ? 'nasabah' : awal, {}, { noHist: true, paksa: true });
  mulaiLatar();
}
function sesiHabis(pesan) {
  if (!S.token) return;
  S.token = ''; SS.del('tok'); SS.del('boot');
  S.me = null; S.porto = []; S.cache = {}; S.raw = { d: {} };
  $$('.view').forEach((v) => { v.innerHTML = ''; delete v.dataset.siap; });
  MODALS.slice().forEach((m) => m.tutup()); tutupPop();
  bukaAuth();
  if (pesan) toast('Sesi berakhir', pesan, 'warn', { lama: 8000 });
}
async function keluar() {
  const ok = await konfirmasi({ judul: 'Keluar dari aplikasi?', pesan: 'Sesi Anda akan diakhiri di perangkat ini.', ok: 'Keluar', ikon: 'logout' });
  if (!ok) return;
  api('auth.keluar', {}).catch(() => { });
  sesiHabis('');
  toast('Anda telah keluar', 'Data sesi dihapus dari perangkat ini.', 'ok');
}

// ── Sinkron latar (stale-while-revalidate) & batas tidak aktif ──
let LATAR = null, PERINGATAN_IDLE = null;
async function sinkron(paksa) {
  if (!S.token) return;
  const aktifBaru = Date.now() - S.aktifTerakhir < 4 * 60e3;
  if (!paksa && (document.hidden || !aktifBaru)) return; // sinkron latar TIDAK memperpanjang sesi orang yang diam
  try {
    const r = await api('data.sinkron', { ver: S.ver });
    const n = terapkanData(r.data);
    S.sinkronTerakhir = Date.now();
    perbaruiNotif();
    if (n) { render(S.route); }
  } catch (e) { /* tetap pakai data lokal */ }
}
function tandaiAktif() { S.aktifTerakhir = Date.now(); if (PERINGATAN_IDLE) { PERINGATAN_IDLE.tutup(); PERINGATAN_IDLE = null; } }
['mousemove', 'keydown', 'touchstart', 'scroll', 'click'].forEach((ev) => document.addEventListener(ev, deb(tandaiAktif, 400), { passive: true }));
function mulaiLatar() {
  clearInterval(LATAR);
  S.aktifTerakhir = Date.now();
  LATAR = setInterval(() => {
    if (!S.token) return;
    const idleMs = (Number(S.set.IDLE_MENIT) || 30) * 60e3, diam = Date.now() - S.aktifTerakhir;
    if (diam >= idleMs) return sesiHabis('Sesi berakhir karena tidak aktif lebih dari ' + (S.set.IDLE_MENIT || 30) + ' menit.');
    if (diam >= idleMs - 120e3 && !PERINGATAN_IDLE) {
      PERINGATAN_IDLE = toast('Sesi akan berakhir', 'Anda tidak aktif. Sesi berakhir dalam 2 menit.', 'warn', { lama: 115000, aksi: 'Tetap masuk', onAksi: () => { tandaiAktif(); sinkron(true); } });
    }
    // Polling adaptif (scale-turbo §4.3): berhenti saat tab tersembunyi; 60 dtk saat aktif, 3 menit saat pengguna diam
    if (document.hidden) return;
    if (Date.now() - S.sinkronTerakhir > (diam < 120e3 ? 60e3 : 180e3)) sinkron();
  }, 20000);
}
document.addEventListener('visibilitychange', () => { if (!document.hidden && S.token && Date.now() - S.sinkronTerakhir > 30e3) sinkron(); });
window.addEventListener('online', () => { setSync(''); sinkron(true); });
window.addEventListener('offline', () => setSync('off'));
window.addEventListener('resize', deb(() => { if (['dashboard', 'analisis', 'achievement'].includes(S.route)) render(S.route, true); }, 250));

// ── Notifikasi & menu akun ──
function daftarNotif() {
  const a = P().filter(aktif), out = [];
  const jt30 = a.filter((r) => r._h !== null && r._h >= 0 && r._h <= 30).length, jt90 = a.filter((r) => r._h !== null && r._h >= 0 && r._h <= 90).length;
  const kol2 = a.filter((r) => r.kolektibilitas === 2).length, npl = a.filter((r) => r.kolektibilitas >= 3).length, rg = S.ringkas || {};
  if (rg.pengingatGagal) out.push({ i: 'notification_important', c: 'bad', t: rg.pengingatGagal + ' pengingat gagal dikirim', s: 'Periksa nomor WA RM lalu kirim ulang', go: 'pengingat', p: { st: 'Gagal' }, pen: 1 });
  if (rg.waGagal && bolehWA()) out.push({ i: 'sms_failed', c: 'bad', t: rg.waGagal + ' pesan WA gagal', s: 'Buka Pesan WA untuk mencoba ulang', go: 'wa', p: { tab: 'gagal' }, pen: 1 });
  if (jt30) out.push({ i: 'event_busy', c: 'warn', t: jt30 + ' fasilitas jatuh tempo ≤ 30 hari', s: 'Prioritaskan tindak lanjut perpanjangan', go: 'nasabah', p: { jt: '30' }, pen: 1 });
  if (jt90) out.push({ i: 'event_repeat', c: 'info', t: jt90 + ' fasilitas jatuh tempo ≤ 3 bulan', s: 'Lihat jadwal pengingat', go: 'pengingat', p: {} });
  if (npl) out.push({ i: 'gpp_maybe', c: 'bad', t: npl + ' kredit bermasalah (Kol 3–5)', s: 'Lihat daftar debitur NPL', go: 'nasabah', p: { kol: '35' } });
  if (kol2) out.push({ i: 'report', c: 'warn', t: kol2 + ' debitur Dalam Perhatian Khusus', s: 'Kolektibilitas 2 perlu pembinaan', go: 'nasabah', p: { kol: '2' } });
  if (rg.waAntri && bolehWA()) out.push({ i: 'hourglass_top', c: 'info', t: rg.waAntri + ' pesan WA dalam antrean', s: rg.waStatus || 'Diproses otomatis setiap menit', go: 'wa', p: {} });
  return out;
}
function perbaruiNotif() {
  const n = daftarNotif().filter((x) => x.pen).length, el = $('#notif-cnt');
  if (el) { el.hidden = !n; el.textContent = n > 9 ? '9+' : n; }
  const c = $('#cnt-png'), g = (S.ringkas || {}).pengingatGagal;
  if (c) { c.hidden = !g; c.textContent = g; }
}
function bukaNotif(btn) {
  const it = daftarNotif();
  const pop = popover(btn, `<div class="pop-h">Notifikasi</div>${it.length ? it.map((x, i) => `<button class="pop-i" data-n="${i}"><span class="well ${x.c}" style="width:34px;height:34px">${ic(x.i, 's18')}</span><span><b>${esc(x.t)}</b><small>${esc(x.s)}</small></span></button>`).join('') : kosong('notifications_off', 'Tidak ada notifikasi', 'Semua aman untuk saat ini.')}`, 330);
  $$('[data-n]', pop).forEach((b) => { b.onclick = () => { const x = it[+b.dataset.n]; tutupPop(); Object.assign(S, { prefill: x.p }); go(x.go, x.p); }; });
}
function bukaAkun(btn) {
  const pop = popover(btn, `<div style="padding:10px 10px 6px" class="row g12"><span class="av lg acc">${esc(ini(S.me.nama))}</span><div class="trunc"><b>${esc(S.me.nama)}</b><div class="fs12 muted trunc">${esc(S.me.email)}</div><span class="bdg acc mt4">${esc(S.me.peran)}</span></div></div><hr>
    <button class="pop-i" data-a="pasang">${ic('install_mobile')}<span><b>Pasang aplikasi di HP</b><small>PWA — bisa dibuka dari layar utama</small></span></button>
    <button class="pop-i" data-a="cadangan">${ic('key')}<span><b>Buat kode cadangan baru</b><small>Kode lama otomatis tidak berlaku</small></span></button>
    <button class="pop-i" data-a="tema">${ic('contrast')}<span><b>Ganti tema</b><small>Gelap / terang</small></span></button><hr>
    <button class="pop-i" data-a="keluar" style="color:var(--bad)">${ic('logout')}<span><b>Keluar</b></span></button>`, 300);
  pop.querySelector('[data-a="pasang"]').onclick = () => { tutupPop(); bukaPasang(); };
  pop.querySelector('[data-a="cadangan"]').onclick = () => { tutupPop(); cadanganBaru(); };
  pop.querySelector('[data-a="tema"]').onclick = () => { tutupPop(); aturTema(document.documentElement.getAttribute('data-theme') === 'light' ? 'dark' : 'light'); render(S.route, true); };
  pop.querySelector('[data-a="keluar"]').onclick = () => { tutupPop(); keluar(); };
}
function cadanganBaru() {
  const m = modal({ judul: 'Buat kode cadangan baru', sub: 'Konfirmasi dengan kode Authenticator saat ini', ikon: 'key', lebar: 'sm',
    isi: `<p class="fs13 muted" style="margin-top:0">8 kode baru akan diterbitkan dan semua kode lama tidak berlaku.</p>${htmlOtp('otp3')}<div id="hasil-kc"></div>`, kaki: false });
  const otp = pasangOtp('otp3', async (kode) => {
    try { const r = await api('auth.cadanganBaru', { otp: kode }); $('#otp3').remove(); $('#hasil-kc').innerHTML = htmlKodeCadangan(r.data.cadangan); pasangKodeCadangan(m.el, r.data.cadangan); toast('Kode cadangan baru dibuat', '', 'ok'); }
    catch (e) { gagalToast(e); otp.reset(); }
  });
}
let PROMPT_PASANG = null;
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault(); PROMPT_PASANG = e;
  if (MODE === 'pwa' && !LS.get('install_tutup') && !$('.install-banner')) {
    const b = document.createElement('div'); b.className = 'install-banner';
    b.innerHTML = `${ic('install_mobile', 'acc')}<span>Pasang Business Banking di layar utama?</span><button class="btn btn-p btn-sm">Pasang</button><button class="btn-ic sm" aria-label="Tutup">${ic('close', 's18')}</button>`;
    b.querySelector('.btn-p').onclick = async () => { b.remove(); PROMPT_PASANG.prompt(); await PROMPT_PASANG.userChoice; PROMPT_PASANG = null; };
    b.querySelector('.btn-ic').onclick = () => { b.remove(); LS.set('install_tutup', 1); };
    document.body.appendChild(b);
  }
});
function bukaPasang() {
  const url = S.set.PWA_URL || (MODE === 'pwa' ? location.href.split('#')[0] : '');
  const m = modal({ judul: 'Pasang aplikasi di HP', sub: 'Progressive Web App — tampil layar penuh seperti aplikasi asli', ikon: 'install_mobile', lebar: 'lg',
    isi: url ? `<div class="g g2" style="align-items:start"><div class="center"><div class="qr" id="qr-pwa"><div class="spin"></div></div><div class="fs12 muted">Pindai dengan kamera HP</div>
      <div class="inner mt12 mono" style="word-break:break-all">${esc(url)}</div><button class="btn btn-g btn-sm mt8" data-salin>${ic('content_copy')}Salin tautan</button></div>
      <div><div class="note mb12">${ic('android')}<div><b>Android (Chrome)</b><div class="mt4">Buka tautan → menu <b>⋮</b> → <b>Instal aplikasi</b> / <b>Tambahkan ke layar utama</b>.</div></div></div>
      <div class="note mb12">${ic('phone_iphone')}<div><b>iPhone (Safari)</b><div class="mt4">Buka tautan → tombol <b>Bagikan</b> → <b>Tambahkan ke Layar Utama</b>.</div></div></div>
      <div class="note ok">${ic('verified_user')}<div><b>Keamanan tetap sama</b><div class="mt4">Login tetap wajib akun Google + kode Microsoft Authenticator. Data tidak disimpan permanen di HP.</div></div></div>
      ${PROMPT_PASANG ? `<button class="btn btn-p mt16" style="width:100%" data-pasang>${ic('download')}Pasang sekarang</button>` : ''}</div></div>`
      : kosong('link_off', 'Alamat aplikasi HP belum diatur', isAdm() ? 'Isi "Alamat aplikasi HP (GitHub Pages)" di Pengaturan → Umum.' : 'Hubungi Admin untuk alamat aplikasi HP.'),
    kaki: `<button class="btn btn-g" data-x2>Tutup</button>` });
  m.el.querySelector('[data-x2]').onclick = () => m.tutup();
  if (!url) return;
  m.el.querySelector('[data-salin]').onclick = () => salin(url, 'Tautan aplikasi HP disalin');
  const p = m.el.querySelector('[data-pasang]'); if (p) p.onclick = async () => { PROMPT_PASANG.prompt(); await PROMPT_PASANG.userChoice; PROMPT_PASANG = null; m.tutup(); };
  muatScript(LIB.qr).then(() => { const el = $('#qr-pwa'); if (!el) return; const q = qrcode(0, 'M'); q.addData(url); q.make(); el.innerHTML = q.createSvgTag({ cellSize: 4, margin: 0, scalable: true }); }).catch(() => { const el = $('#qr-pwa'); if (el) el.innerHTML = '<span class="fs12" style="color:#333">QR gagal dimuat</span>'; });
}

// ── Delegasi klik global ──
document.addEventListener('click', (e) => {
  const g = e.target.closest('[data-go]');
  if (g && !g.closest('.mdl-wrap')) { e.preventDefault(); let p = {}; try { p = g.dataset.p ? JSON.parse(g.dataset.p) : {}; } catch (x) { } go(g.dataset.go, p); return; }
  const a = e.target.closest('[data-act]');
  if (!a) return;
  const act = a.dataset.act;
  if (act === 'menu') { if (window.innerWidth < 1024) ($('#sb').classList.contains('open') ? tutupSb() : bukaSb()); else { document.body.classList.toggle('mini'); LS.set('mini', document.body.classList.contains('mini')); setTimeout(() => render(S.route, true), 240); } }
  else if (act === 'tutup-sb') tutupSb();
  else if (act === 'keluar') keluar();
  else if (act === 'tema') { aturTema(document.documentElement.getAttribute('data-theme') === 'light' ? 'dark' : 'light'); render(S.route, true); }
  else if (act === 'notif') bukaNotif(a);
  else if (act === 'akun') bukaAkun(a);
  else if (act === 'kembali') kembali();
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') { if (POP) return tutupPop(); if (MODALS.length) return MODALS[MODALS.length - 1].tutup(); tutupSb(); }
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k' && S.me) { e.preventDefault(); if (S.route !== 'nasabah') go('nasabah'); setTimeout(() => { const s = $('#q-nasabah'); s && s.focus(); }, 30); }
});
$('#cab-sel').addEventListener('change', (e) => { S.cab = e.target.value; LS.set('cab', S.cab); Object.keys(R).forEach((k) => { S.dirty[k] = true; }); perbaruiNotif(); render(S.route, true); });

// ── Mulai ──
function tungguIkon() {
  // Sembunyikan teks ligatur ikon sampai font Material Symbols benar-benar siap (hindari kedipan "dashboard", "group"…)
  const h = document.documentElement;
  if (!document.fonts || !document.fonts.load) { h.classList.add('ms-ok'); return; }
  let n = 0;
  const cek = () => document.fonts.load('20px "Material Symbols Outlined"', 'home').then((f) => {
    if (f && f.length) h.classList.add('ms-ok'); else if (++n < 20) setTimeout(cek, 500);
  }).catch(() => { if (++n < 20) setTimeout(cek, 500); });
  cek();
}
function mulai() {
  tungguIkon();
  aturTema(LS.get('tema', 'dark'));
  if (LS.get('mini') && window.innerWidth >= 1024) document.body.classList.add('mini');
  if (MODE === 'pwa' && 'serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(() => { });
  const tok = SS.get('tok'), c = SS.get('boot');
  if (tok && c && c.me && c.raw) {
    S.token = tok; S.me = c.me;
    terapkanData({ d: c.raw.d || {}, cabang: c.raw.cabang, ringkas: c.raw.ringkas }, true);
    S.ver = c.ver || {};
    tampilkanApp();
    sinkron(true);
  } else if (tok) {
    S.token = tok;
    api('data.boot', {}).then((r) => { S.me = r.data.me; terapkanData(r.data); tampilkanApp(); }).catch(() => { if (S.token) { S.token = ''; SS.del('tok'); } bukaAuth(); });
  } else bukaAuth();
}
// ── Dashboard ──
S.dash = LS.get('dash', { kolPer: 0, barJenis: '', barN: 6, tren: 30 });
function kpiCard(o) {
  return `<div class="card kpi hov"${o.go ? ` data-go="${o.go}" data-p='${esc(JSON.stringify(o.p || {}))}' role="button" tabindex="0"` : ''}>
    <div class="kpi-top"><span class="kpi-l">${esc(o.l)}</span><span class="well ${o.w || ''}">${ic(o.i)}</span></div>
    <div><div class="kpi-v">${o.v}</div><div class="kpi-d ${o.dc || 'muted'}">${o.di ? ic(o.di) : ''}<span>${o.d || ''}</span></div></div></div>`;
}
function kolSnapshot(hariLalu) {
  if (!hariLalu) { const a = P().filter(aktif), t = sum(a, (r) => r.baki_debet) || 1; return { t, k1: sum(a.filter((r) => r.kolektibilitas <= 1), (r) => r.baki_debet), k2: sum(a.filter((r) => r.kolektibilitas === 2), (r) => r.baki_debet), k35: sum(a.filter((r) => r.kolektibilitas >= 3), (r) => r.baki_debet), n35: a.filter((r) => r.kolektibilitas >= 3).length, n2: a.filter((r) => r.kolektibilitas === 2).length }; }
  const s = seriSnap(), target = iso(new Date(Date.now() - hariLalu * 864e5)), row = s.filter((x) => x[0] <= target).pop();
  if (!row) return null;
  return { t: row[1] || 1, k1: row[2], k2: row[3], k35: row[4] };
}
R.dashboard = function (el) {
  const a = P().filter(aktif), totBaki = sum(a, (r) => r.baki_debet), seri = seriSnap();
  const nasabah = uniq(a.map((r) => r.nama_nasabah.toLowerCase())).length;
  const baru30 = a.filter((r) => r.tgl_update && selisihHari(r.tgl_akad) !== null && selisihHari(r.tgl_akad) >= -30).length;
  const jt = a.filter((r) => r._h !== null && r._h >= 0 && r._h <= 90), jt30 = jt.filter((r) => r._h <= 30).length;
  const k = kolSnapshot(0), npl = totBaki ? k.k35 / totBaki * 100 : 0, batasNpl = Number(S.set.BATAS_NPL) || 2.5;
  const lalu = seri.filter((x) => x[0] <= iso(new Date(Date.now() - 30 * 864e5))).pop(), dBaki = lalu && lalu[1] ? (totBaki - lalu[1]) / lalu[1] * 100 : null;
  const per = periodeKini(), ach = achRm(per), rata = ach.length ? sum(ach, (x) => x.avg) / ach.length : 0, bench = Number(S.set.BENCHMARK_ACHIEVEMENT) || 90;
  const kp = S.dash.kolPer ? kolSnapshot(S.dash.kolPer) : k;
  const jenis = jenisTarget(), jSel = S.dash.barJenis && jenis.includes(S.dash.barJenis) ? S.dash.barJenis : jenis[0] || '';
  const perJenis = jenis.map((j) => { const r = S.target.filter((t) => t.periode === per && t.jenis_target === j && ach.some((x) => x.email === t.email_rm)); const tt = sum(r, (x) => x.target); return { j, a: tt ? sum(r, (x) => x.realisasi) / tt * 100 : 0, sisa: Math.max(0, tt - sum(r, (x) => x.realisasi)) }; });
  const warnaJ = ['var(--accent)', 'var(--pink)', 'var(--blue)', 'var(--ok)', 'var(--warn)'];
  const totalTargetJ = perJenis.length ? sum(perJenis, (x) => x.a) / perJenis.length : 0;
  const sapa = (() => { const h = new Date().getHours(); return h < 11 ? 'Selamat pagi' : h < 15 ? 'Selamat siang' : h < 18 ? 'Selamat sore' : 'Selamat malam'; })();
  const ringkasKol2 = a.filter((r) => r.kolektibilitas === 2);
  el.innerHTML = `
  <div class="ph"><div><div class="row wrap"><h2>${sapa}, ${esc(S.me.nama.split(' ')[0])}</h2><span class="bdg ok lc"><i></i>Sistem online</span></div>
    <p>Monitoring portofolio kredit dan pencapaian target Relationship Manager${S.cab !== '*' ? ' — ' + esc(namaCab(S.cab)) : isPim() ? ' — ' + esc(S.me.nama_cabang) : isAdm() ? ' — semua cabang' : ''}.</p></div>
    <div class="tools"><span class="chip">${ic('calendar_month', 's18 acc')}Periode ${esc(labelPeriode(per))}</span><button class="btn btn-p" id="dl-ring">${ic('download', 's18')}Unduh Ringkasan</button></div></div>
  <div class="g g5">
    ${kpiCard({ l: 'Total Nasabah', i: 'groups', v: n0(nasabah), d: a.length + ' fasilitas aktif' + (baru30 ? ' • +' + baru30 + ' akad 30 hari' : ''), di: 'trending_up', dc: 'ok', go: 'nasabah', p: { st: 'Aktif' } })}
    ${kpiCard({ l: 'Total Baki Debet', i: 'account_balance_wallet', v: rpS(totBaki), d: dBaki === null ? 'Plafon ' + rpS(sum(a, (r) => r.plafon)) : (dBaki >= 0 ? '+' : '') + pct(dBaki) + ' vs 30 hari lalu', di: dBaki === null ? '' : dBaki >= 0 ? 'arrow_upward' : 'arrow_downward', dc: dBaki === null ? 'muted' : dBaki >= 0 ? 'ok' : 'bad' })}
    ${kpiCard({ l: 'Jatuh Tempo ≤ 3 Bulan', i: 'event_repeat', w: 'info', v: n0(jt.length) + '<small>fasilitas</small>', d: jt30 ? jt30 + ' fasilitas ≤ 30 hari — segera tindak lanjut' : 'Perlu tindak lanjut RM', di: 'priority_high', dc: 'info', go: 'nasabah', p: { jt: '90' } })}
    ${kpiCard({ l: 'Rata-rata Achievement', i: 'military_tech', w: rata >= bench ? 'ok' : 'warn', v: pct(rata), d: (rata >= bench ? 'Melampaui' : 'Di bawah') + ' benchmark ' + pct(bench, 0), di: rata >= bench ? 'check_circle' : 'error', dc: rata >= bench ? 'ok' : 'warn', go: 'achievement' })}
    ${kpiCard({ l: 'Kredit Bermasalah (Kol 3–5)', i: 'gpp_maybe', w: 'bad', v: pct(npl, 2), d: k.n35 + ' debitur • batas maksimum ' + pct(batasNpl, 2), di: npl > batasNpl ? 'warning' : 'verified_user', dc: npl > batasNpl ? 'bad' : 'ok', go: 'nasabah', p: { kol: '35' } })}
  </div>
  <div class="g g12 sec">
    <div class="card c4"><div class="card-h"><div><h3 class="card-t">Ringkasan Kolektibilitas</h3><p class="card-s">Komposisi baki debet Kol 1 – Kol 5</p></div>
      <select class="sel sm" style="width:auto" id="kol-per" aria-label="Periode kolektibilitas"><option value="0">Saat ini</option><option value="30">30 hari lalu</option><option value="90">90 hari lalu</option></select></div>
      ${kp ? `<div class="kol3" style="padding:6px 0 4px">
        <div class="center">${donut(kp.k1 / kp.t * 100, { c: 'var(--ok)', s: 84 })}<div class="b ok mt8">Lancar</div><div class="fs12 muted">Kol 1</div></div>
        <div class="center">${donut(kp.k2 / kp.t * 100, { c: 'var(--warn)', s: 84 })}<div class="b warn mt8">Perhatian</div><div class="fs12 muted">Kol 2 (DPK)</div></div>
        <div class="center">${donut(kp.k35 / kp.t * 100, { c: 'var(--bad)', s: 84 })}<div class="b bad mt8">Bermasalah</div><div class="fs12 muted">Kol 3–5 (NPL)</div></div></div>`
        : kosong('history', 'Belum ada snapshot periode itu')}
      <div class="inner soft row mt16 fs13"><span class="muted">Debitur Kol 2 &amp; Kol 3–5</span><span class="sp"></span><b>${n0(k.n2 + k.n35)} fasilitas</b></div></div>
    <div class="card c4"><div class="card-h"><div><h3 class="card-t">Pencapaian Target</h3><p class="card-s">Realisasi agregat ${esc(labelPeriode(per))}</p></div><button class="lnk" data-go="achievement">Detail</button></div>
      ${perJenis.length ? `<div class="row g16" style="justify-content:center;flex-wrap:wrap">${donut(totalTargetJ, { s: 132, w: 13, grad: ['#8B5CF6', '#EC4899', '#60A5FA'], sub: totalTargetJ >= bench ? 'Sangat Baik' : totalTargetJ >= 75 ? 'Cukup' : 'Perlu Dorongan', subC: totalTargetJ >= bench ? 'var(--ok)' : 'var(--warn)', fs: 28 })}
        <div class="col" style="gap:12px;flex:1;min-width:160px">${perJenis.map((x, i) => `<div><div class="row fs12 mb8" style="margin-bottom:4px"><span class="row g4 muted"><i style="width:8px;height:8px;border-radius:50%;background:${warnaJ[i % 5]};display:inline-block"></i>${esc(x.j)}</span><span class="sp"></span><b class="num">${pct(x.a, 0)}</b></div><div class="bar thin"><i style="width:${Math.min(100, x.a)}%;--c:${warnaJ[i % 5]}"></i></div></div>`).join('')}</div></div>
        <div class="row fs12 mt16"><span class="muted">Target tersisa (${esc(perJenis[0].j)})</span><span class="sp"></span><b class="acc">${rpS(perJenis[0].sisa)}</b></div>` : kosong('flag', 'Belum ada target', isAdm() ? 'Tambahkan target RM di Achievement RM.' : '')}</div>
    <div class="card c4"><div class="card-h"><div><h3 class="card-t">RM Terbaik</h3><p class="card-s">Peringkat achievement bulanan</p></div><button class="lnk" data-go="achievement">Lihat semua</button></div>
      ${ach.length ? `<div class="lb">${ach.slice(0, 4).map((x, i) => `<div class="lb-r"><span class="rk"><span class="av lg ${i === 0 ? 'acc' : ''}">${esc(ini(x.nama))}</span><em class="${i === 0 ? 'gold' : ''}">${i + 1}</em></span>
        <div class="sp trunc"><b class="trunc" style="display:block">${esc(x.nama)}</b><span class="fs12 muted">${esc(namaCab(x.cabang))} • ${rpS(x.r)}</span></div>
        <span class="bdg ${x.avg >= 100 ? 'ok' : x.avg >= bench ? 'acc' : 'warn'} lc num">${pct(x.avg, 0)}</span></div>`).join('')}</div>` : kosong('emoji_events', 'Belum ada data achievement')}</div>
  </div>
  <div class="g g12 sec">
    <div class="card c6"><div class="card-h wrap"><div><h3 class="card-t">Target vs Realisasi</h3><p class="card-s">${esc(jSel)} per bulan (agregat lingkup)</p></div>
      <div class="row wrap"><div class="legend"><span><i style="--c:var(--accent)"></i>Target</span><span><i style="--c:var(--pink)"></i>Realisasi</span></div>
      <select class="sel sm" style="width:auto" id="bar-j" aria-label="Jenis target">${jenis.map((j) => `<option${j === jSel ? ' selected' : ''}>${esc(j)}</option>`).join('')}</select>
      <select class="sel sm" style="width:auto" id="bar-n" aria-label="Rentang bulan"><option value="6"${S.dash.barN === 6 ? ' selected' : ''}>6 bulan</option><option value="12"${S.dash.barN === 12 ? ' selected' : ''}>12 bulan</option></select></div></div>
      <div id="ch-bar"></div></div>
    <div class="card c6"><div class="card-h wrap"><div><h3 class="card-t">Tren Baki Debet</h3><p class="card-s" id="tren-s">Pertumbuhan outstanding</p></div>
      <div class="seg" role="tablist">${[[30, '30 Hari'], [182, '6 Bulan'], [365, '1 Tahun']].map(([v, l]) => `<button data-tren="${v}" class="${S.dash.tren === v ? 'on' : ''}" role="tab" aria-selected="${S.dash.tren === v}">${l}</button>`).join('')}</div></div>
      <div id="ch-area"></div></div>
  </div>
  ${ringkasKol2.length || jt30 ? `<div class="alert sec"><div class="ic">${ic('notification_important')}</div><div class="sp" style="min-width:220px">
    <b class="fs16">${ringkasKol2.length ? ringkasKol2.length + ' fasilitas memerlukan review kolektibilitas' : jt30 + ' fasilitas jatuh tempo dalam 30 hari'}</b>
    <div class="fs13 muted mt4">${ringkasKol2.length ? 'Debitur Kol 2 perlu pembinaan dan verifikasi data jaminan.' : 'Pastikan RM sudah memproses perpanjangan atau pelunasan.'}</div></div>
    <div class="row wrap"><button class="btn btn-g" data-go="nasabah" data-p='${ringkasKol2.length ? '{"kol":"2"}' : '{"jt":"30"}'}'>${ringkasKol2.length ? 'Buka Data Kol 2' : 'Lihat Fasilitas'}</button><button class="btn btn-p" data-go="pengingat">${ic('notifications_active', 's18')}Pengingat RM</button></div></div>` : ''}`;

  // Grafik batang target vs realisasi
  const pers = daftarPeriode().filter((p) => p <= per).slice(-S.dash.barN);
  const lingk = (t) => S.cab === '*' || (S.uIdx[t.email_rm] && S.uIdx[t.email_rm].kode_cabang === S.cab);
  const tv = pers.map((p) => sum(S.target.filter((t) => t.periode === p && t.jenis_target === jSel && lingk(t)), (t) => t.target));
  const rv = pers.map((p) => sum(S.target.filter((t) => t.periode === p && t.jenis_target === jSel && lingk(t)), (t) => t.realisasi));
  if (pers.length) grafikBatang($('#ch-bar'), pers.map((p) => BLN[+p.slice(5) - 1]), [{ n: 'Target', c: 'var(--accent)', v: tv }, { n: 'Realisasi', c: 'var(--pink)', v: rv }], { fmt: rpS, fmtSumbu: (x) => rpS(x).replace('Rp ', ''), aria: 'Target vs realisasi ' + jSel });
  else $('#ch-bar').innerHTML = kosong('bar_chart', 'Belum ada data target');
  // Grafik area tren baki
  const batas = iso(new Date(Date.now() - S.dash.tren * 864e5));
  let s = seri.filter((x) => x[0] >= batas);
  if (S.dash.tren > 60) { const lompat = S.dash.tren > 200 ? 7 : 3; s = s.filter((x, i) => i % lompat === 0 || i === s.length - 1); }
  const pts = s.map((x) => ({ l: S.dash.tren > 200 ? BLN[+x[0].slice(5, 7) - 1] + ' ' + x[0].slice(2, 4) : x[0].slice(8) + ' ' + BLN[+x[0].slice(5, 7) - 1], v: x[1], tip: tgl(x[0]) + '\nBaki debet: ' + rpS(x[1]) + '\nNPL: ' + pct(x[1] ? x[4] / x[1] * 100 : 0, 2) }));
  if (pts.length) pts.push({ l: 'Kini', v: totBaki, tip: 'Saat ini\nBaki debet: ' + rpS(totBaki) });
  grafikArea($('#ch-area'), pts, { aria: 'Tren baki debet' });
  const d0 = pts.length ? pts[0].v : 0;
  $('#tren-s').textContent = pts.length > 1 ? 'Perubahan ' + (totBaki >= d0 ? '+' : '') + pct(d0 ? (totBaki - d0) / d0 * 100 : 0) + ' dalam periode' : 'Pertumbuhan outstanding';

  const simpan = () => { LS.set('dash', S.dash); render('dashboard', true); };
  $('#kol-per').value = String(S.dash.kolPer);
  $('#kol-per').onchange = (e) => { S.dash.kolPer = +e.target.value; simpan(); };
  $('#bar-j').onchange = (e) => { S.dash.barJenis = e.target.value; simpan(); };
  $('#bar-n').onchange = (e) => { S.dash.barN = +e.target.value; simpan(); };
  $$('[data-tren]', el).forEach((b) => { b.onclick = () => { S.dash.tren = +b.dataset.tren; simpan(); }; });
  $('#dl-ring').onclick = () => eksporPdf('Ringkasan Portofolio ' + labelPeriode(per), [{ l: 'Indikator', k: 'a' }, { l: 'Nilai', k: 'b', kanan: true }], [
    { a: 'Total nasabah', b: n0(nasabah) }, { a: 'Fasilitas aktif', b: n0(a.length) }, { a: 'Total plafon', b: rp(sum(a, (r) => r.plafon)) }, { a: 'Total baki debet', b: rp(totBaki) },
    { a: 'Jatuh tempo ≤ 3 bulan', b: n0(jt.length) + ' fasilitas' }, { a: 'Rata-rata achievement RM', b: pct(rata) }, { a: 'Kolektibilitas 1 (Lancar)', b: pct(k.k1 / k.t * 100) },
    { a: 'Kolektibilitas 2 (DPK)', b: pct(k.k2 / k.t * 100) }, { a: 'Rasio NPL (Kol 3–5)', b: pct(npl, 2) }
  ].concat(ach.slice(0, 10).map((x, i) => ({ a: 'RM #' + (i + 1) + ' ' + x.nama, b: pct(x.avg) }))), { sub: S.cab === '*' ? 'Semua cabang dalam wewenang' : namaCab(S.cab) }).catch(gagalToast);
};

// ── Analisis ──
R.analisis = function (el) {
  const a = P().filter(aktif), tot = sum(a, (r) => r.baki_debet) || 1;
  const now = hariIni(), bulan = Array.from({ length: 12 }, (_, i) => tambahBulan(new Date(now.getFullYear(), now.getMonth(), 1), i));
  const jtBulan = bulan.map((b) => { const k = iso(b).slice(0, 7), r = a.filter((x) => String(x.tgl_jatuh_tempo).slice(0, 7) === k); return { l: BLN[b.getMonth()] + ' ' + String(b.getFullYear()).slice(2), n: r.length, v: sum(r, (x) => x.baki_debet) }; });
  const cabs = uniq(a.map((r) => r.kode_cabang)).sort();
  const top = a.slice().sort((x, y) => y.baki_debet - x.baki_debet).slice(0, 10);
  const sek = {}; a.forEach((r) => { const s = r.sektor || 'Lainnya'; sek[s] = (sek[s] || 0) + r.baki_debet; });
  const jen = {}; a.forEach((r) => { const s = r.jenis_fasilitas || 'Lainnya'; jen[s] = (jen[s] || 0) + r.baki_debet; });
  const rms = uniq(a.map((r) => r.email_rm)).map((e) => { const r = a.filter((x) => x.email_rm === e), p = sum(r, (x) => x.plafon); return { e, n: r.length, b: sum(r, (x) => x.baki_debet), u: p ? sum(r, (x) => x.baki_debet) / p * 100 : 0 }; }).sort((x, y) => y.b - x.b);
  const seri = seriSnap(), bulanan = {}; seri.forEach((x) => { bulanan[x[0].slice(0, 7)] = x; });
  const nplSeri = Object.keys(bulanan).sort().slice(-12).map((k) => { const x = bulanan[k]; return { l: BLN[+k.slice(5) - 1], v: x[1] ? x[4] / x[1] * 100 : 0, tip: labelPeriode(k) + '\nRasio NPL: ' + pct(x[1] ? x[4] / x[1] * 100 : 0, 2) }; });
  const konsentrasi10 = sum(top, (r) => r.baki_debet) / tot * 100;
  const ltv = a.filter((r) => r.nilai_agunan > 0), cover = sum(ltv, (r) => r.nilai_agunan) / (sum(ltv, (r) => r.baki_debet) || 1) * 100;
  el.innerHTML = `<div class="ph"><div><h2>Analisis Portofolio</h2><p>Profil jatuh tempo, konsentrasi debitur, komposisi kolektibilitas, dan kinerja per RM — dihitung langsung dari data lingkup Anda.</p></div>
    <div class="tools"><button class="btn btn-g" id="an-xls">${ic('table_view', 's18 ok')}Unduh Excel</button></div></div>
  <div class="g g4">
    ${kpiCard({ l: 'Konsentrasi 10 debitur terbesar', i: 'pie_chart', w: konsentrasi10 > 50 ? 'warn' : '', v: pct(konsentrasi10), d: 'dari total baki debet', dc: 'muted' })}
    ${kpiCard({ l: 'Rata-rata utilisasi plafon', i: 'speed', v: pct(sum(a, (r) => r.baki_debet) / (sum(a, (r) => r.plafon) || 1) * 100), d: 'baki debet / plafon', dc: 'muted' })}
    ${kpiCard({ l: 'Cakupan agunan', i: 'shield', w: cover >= 100 ? 'ok' : 'warn', v: pct(cover, 0), d: 'nilai agunan / baki debet', dc: cover >= 100 ? 'ok' : 'warn' })}
    ${kpiCard({ l: 'Jatuh tempo 12 bulan', i: 'event', w: 'info', v: n0(sum(jtBulan, (x) => x.n)) + '<small>fasilitas</small>', d: rpS(sum(jtBulan, (x) => x.v)) + ' baki debet', dc: 'info' })}
  </div>
  <div class="g g12 sec">
    <div class="card c7"><div class="card-h"><div><h3 class="card-t">Profil Jatuh Tempo 12 Bulan</h3><p class="card-s">Baki debet yang jatuh tempo per bulan</p></div><div class="legend"><span><i style="--c:var(--blue)"></i>Baki debet</span></div></div><div id="an-jt"></div></div>
    <div class="card c5"><div class="card-h"><div><h3 class="card-t">Tren Rasio NPL</h3><p class="card-s">Kol 3–5 terhadap baki debet (bulanan)</p></div><span class="bdg ${(nplSeri.length ? nplSeri[nplSeri.length - 1].v : 0) > (Number(S.set.BATAS_NPL) || 2.5) ? 'bad' : 'ok'} lc">Batas ${pct(Number(S.set.BATAS_NPL) || 2.5, 1)}</span></div><div id="an-npl"></div></div>
  </div>
  <div class="g g12 sec">
    <div class="card c6"><div class="card-h"><div><h3 class="card-t">Komposisi Kolektibilitas per Cabang</h3><p class="card-s">Proporsi baki debet Kol 1 / Kol 2 / Kol 3–5</p></div>
      <div class="legend"><span><i style="--c:var(--ok)"></i>Kol 1</span><span><i style="--c:var(--warn)"></i>Kol 2</span><span><i style="--c:var(--bad)"></i>Kol 3–5</span></div></div>
      ${stack100(cabs.map((c) => { const r = a.filter((x) => x.kode_cabang === c); return { l: namaCab(c), ket: rpS(sum(r, (x) => x.baki_debet)), parts: [
        { n: 'Kol 1', c: 'var(--ok)', v: sum(r.filter((x) => x.kolektibilitas <= 1), (x) => x.baki_debet) },
        { n: 'Kol 2', c: 'var(--warn)', v: sum(r.filter((x) => x.kolektibilitas === 2), (x) => x.baki_debet) },
        { n: 'Kol 3–5', c: 'var(--bad)', v: sum(r.filter((x) => x.kolektibilitas >= 3), (x) => x.baki_debet) }] }; }))}</div>
    <div class="card c6"><div class="card-h"><div><h3 class="card-t">10 Debitur Terbesar</h3><p class="card-s">Konsentrasi risiko berdasarkan baki debet</p></div></div>
      ${hbar(top.map((r) => ({ l: r.nama_nasabah, v: r.baki_debet, nilai: rpS(r.baki_debet) + ' • ' + pct(r.baki_debet / tot * 100), c: r.kolektibilitas >= 3 ? 'var(--bad)' : r.kolektibilitas === 2 ? 'var(--warn)' : undefined })))}</div>
  </div>
  <div class="g g12 sec">
    <div class="card c4"><div class="card-h"><div><h3 class="card-t">Sebaran Sektor</h3><p class="card-s">Baki debet per sektor usaha</p></div></div>
      ${hbar(Object.keys(sek).sort((x, y) => sek[y] - sek[x]).slice(0, 8).map((k) => ({ l: k, v: sek[k], nilai: pct(sek[k] / tot * 100) })))}</div>
    <div class="card c4"><div class="card-h"><div><h3 class="card-t">Jenis Fasilitas</h3><p class="card-s">Baki debet per produk kredit</p></div></div>
      ${hbar(Object.keys(jen).sort((x, y) => jen[y] - jen[x]).slice(0, 8).map((k) => ({ l: k, v: jen[k], nilai: rpS(jen[k]), c: 'var(--blue)' })))}</div>
    <div class="card c4"><div class="card-h"><div><h3 class="card-t">Portofolio per RM</h3><p class="card-s">Baki debet & utilisasi plafon</p></div></div>
      ${hbar(rms.slice(0, 8).map((x) => ({ l: namaRm(x.e), v: x.b, nilai: rpS(x.b), sub: x.n + ' fasilitas • utilisasi ' + pct(x.u, 0), c: 'var(--pink)' })))}</div>
  </div>`;
  grafikBatang($('#an-jt'), jtBulan.map((x) => x.l), [{ n: 'Baki debet', c: 'var(--blue)', v: jtBulan.map((x) => x.v) }], { fmt: rpS, fmtSumbu: (x) => rpS(x).replace('Rp ', ''), h: 230 });
  grafikArea($('#an-npl'), nplSeri, { c: '#F87171', fmt: (x) => pct(x, 2), h: 230 });
  $('#an-xls').onclick = () => eksporExcel('Analisis Portofolio', [{ l: 'Bulan', k: 'l' }, { l: 'Jumlah Fasilitas JT', k: 'n' }, { l: 'Baki Debet JT', k: 'v', w: 20 }], jtBulan, 'Profil Jatuh Tempo').catch(gagalToast);
};
// ── Daftar Nasabah ──
S.f = Object.assign({ q: '', rm: '', kol: '', st: '', jt: '', sort: 'baki_debet', dir: -1, page: 1, size: 10 }, LS.get('fnas', {}));
const KOLOM_NAS = [
  { k: 'no_rekening', l: 'No. Rekening' }, { k: 'nama_nasabah', l: 'Nasabah' }, { k: 'email_rm', l: 'RM Pengelola' },
  { k: 'plafon', l: 'Plafon', r: 1 }, { k: 'baki_debet', l: 'Baki Debet', r: 1 }, { k: 'saldo_efektif', l: 'Saldo Efektif', r: 1 },
  { k: 'tgl_jatuh_tempo', l: 'Jatuh Tempo' }, { k: 'kolektibilitas', l: 'Kol', c: 1 }, { k: '_st', l: 'Status', c: 1 }
];
function filterNasabah() {
  const f = S.f, q = f.q.toLowerCase().trim();
  let r = P().filter((x) => {
    if (q && x._q.indexOf(q) < 0) return false;
    if (f.rm && x.email_rm !== f.rm) return false;
    if (f.kol === '35' ? x.kolektibilitas < 3 : f.kol && String(x.kolektibilitas) !== f.kol) return false;
    if (f.st && x.status_kredit !== f.st) return false;
    if (f.jt) { if (f.jt === 'lewat') { if (!(x._h !== null && x._h < 0 && aktif(x))) return false; } else if (!(x._h !== null && x._h >= 0 && x._h <= +f.jt && aktif(x))) return false; }
    return true;
  });
  const k = f.sort, d = f.dir;
  r.sort((a, b) => { let x = a[k], y = b[k]; if (k === 'email_rm') { x = namaRm(x); y = namaRm(y); } if (x === y) return 0; if (x === '' || x === null) return 1; if (y === '' || y === null) return -1; return (x > y ? 1 : -1) * d; });
  return r;
}
function jtSel(r) {
  if (!r.tgl_jatuh_tempo) return '—';
  const h = r._h; let sub = '';
  if (!aktif(r)) sub = `<span class="sub">${esc(r.status_kredit)}</span>`;
  else if (r.dpd > 0) sub = `<span class="sub ${r.kolektibilitas >= 3 ? 'bad' : 'warn'} b">DPD ${n0(r.dpd)} hari</span>`;
  else if (h !== null && h < 0) sub = `<span class="sub bad b">Lewat ${-h} hari</span>`;
  else if (h !== null && h <= JENDELA_JT) sub = `<span class="sub info b">${h} hari lagi</span>`;
  else if (r.tgl_akad) { const bln = Math.round((parseT(r.tgl_jatuh_tempo) - parseT(r.tgl_akad)) / (30.44 * 864e5)); sub = `<span class="sub">Tenor ${bln} bln</span>`; }
  return `<span class="${h !== null && h >= 0 && h <= JENDELA_JT && aktif(r) ? 'info b' : ''}">${tgl(r.tgl_jatuh_tempo)}</span>${sub}`;
}
function warnaMono(r) { return r._st === 'macet' ? 'var(--bad)' : r._st === 'dpk' ? 'var(--warn)' : r._st === 'jt' ? 'var(--info)' : 'var(--accent-tx)'; }
R.nasabah = function (el, p) {
  if (p && Object.keys(p).length) { S.f = Object.assign({ q: '', rm: '', kol: '', st: '', jt: '', sort: S.f.sort, dir: S.f.dir, page: 1, size: S.f.size }, p); S.params = {}; }
  const semua = P(), ak = semua.filter(aktif);
  const rms = uniq(semua.map((r) => r.email_rm)).sort((a, b) => namaRm(a).localeCompare(namaRm(b)));
  el.innerHTML = `<div class="ph"><div><div class="row wrap"><h2>Daftar Nasabah Kredit</h2><span class="bdg acc lc">${n0(ak.length)} fasilitas aktif</span></div>
    <p>Pantau fasilitas kredit, status jatuh tempo, kolektibilitas, dan RM pengelola. Klik baris untuk membuka detail.</p></div>
    <div class="tools">
      <button class="chip" data-qf='{"kol":"1"}'><i style="--c:var(--ok)"></i>Kol 1 <b>${n0(ak.filter((r) => r.kolektibilitas === 1).length)}</b></button>
      <button class="chip" data-qf='{"kol":"2"}'><i style="--c:var(--warn)"></i>Kol 2 <b>${n0(ak.filter((r) => r.kolektibilitas === 2).length)}</b></button>
      <button class="chip" data-qf='{"kol":"35"}'><i style="--c:var(--bad)"></i>NPL <b class="bad">${n0(ak.filter((r) => r.kolektibilitas >= 3).length)}</b></button>
      <button class="chip" data-qf='{"jt":"90"}'><i style="--c:var(--info)"></i>≤ 90 hari <b class="info">${n0(ak.filter((r) => r._h !== null && r._h >= 0 && r._h <= 90).length)}</b></button></div></div>
  <div class="card pad16">
    <div class="row wrap g12"><label class="search"><span class="ms">search</span><span class="sr">Cari</span><input id="q-nasabah" class="inp" placeholder="Cari nama debitur, no. rekening, NPWP, sektor…" value="${esc(S.f.q)}" autocomplete="off"></label>
      <button class="btn btn-g" id="nx-xls">${ic('table_view', 's18 ok')}Unduh Excel</button><button class="btn btn-g" id="nx-csv">${ic('csv', 's18 info')}CSV</button><button class="btn btn-g" id="nx-pdf">${ic('picture_as_pdf', 's18 pink')}Unduh PDF</button>
      ${isAdm() ? `<button class="btn btn-p" id="nx-add">${ic('add_circle', 's18')}Tambah Fasilitas</button>` : ''}</div>
    <div class="filters mt12" style="padding-top:12px;border-top:1px solid var(--line2)">
      <span class="fs11 b muted row g4" style="letter-spacing:.06em">${ic('filter_list', 's16')}FILTER</span>
      ${rms.length > 1 ? `<label class="fsel${S.f.rm ? ' on' : ''}"><span>RM:</span><select data-f="rm"><option value="">Semua RM</option>${rms.map((e) => `<option value="${esc(e)}"${S.f.rm === e ? ' selected' : ''}>${esc(namaRm(e))}</option>`).join('')}</select></label>` : ''}
      <label class="fsel${S.f.kol ? ' on' : ''}"><span>Kolektibilitas:</span><select data-f="kol"><option value="">Semua Kol</option>${[1, 2, 3, 4, 5].map((k) => `<option value="${k}"${S.f.kol === String(k) ? ' selected' : ''}>Kol ${k} — ${KOL_L[k]}</option>`).join('')}<option value="35"${S.f.kol === '35' ? ' selected' : ''}>Kol 3–5 (NPL)</option></select></label>
      <label class="fsel${S.f.st ? ' on' : ''}"><span>Status:</span><select data-f="st"><option value="">Semua</option>${['Aktif', 'Restrukturisasi', 'Lunas', 'Hapus Buku'].map((s) => `<option${S.f.st === s ? ' selected' : ''}>${s}</option>`).join('')}</select></label>
      <label class="fsel${S.f.jt ? ' on' : ''}"><span>Jatuh tempo:</span><select data-f="jt"><option value="">Semua</option><option value="30"${S.f.jt === '30' ? ' selected' : ''}>≤ 30 hari</option><option value="90"${S.f.jt === '90' ? ' selected' : ''}>≤ 3 bulan</option><option value="180"${S.f.jt === '180' ? ' selected' : ''}>≤ 6 bulan</option><option value="lewat"${S.f.jt === 'lewat' ? ' selected' : ''}>Lewat jatuh tempo</option></select></label>
      <span class="sp"></span><button class="lnk" id="nx-reset" style="color:var(--tx2)">${ic('restart_alt', 's16')} Reset filter</button></div>
  </div>
  <div class="card p0 sec" style="overflow:hidden"><div class="tbl-wrap resp"><table class="tbl tbl-resp" id="tb-nas"></table></div><div class="pager" id="pg-nas"></div></div>`;
  const tabel = () => {
    const rows = filterNasabah(), f = S.f, hal = Math.max(1, Math.ceil(rows.length / f.size));
    f.page = Math.min(f.page, hal);
    const isi = rows.slice((f.page - 1) * f.size, f.page * f.size);
    LS.set('fnas', { sort: f.sort, dir: f.dir, size: f.size });
    $('#tb-nas').innerHTML = `<thead><tr>${KOLOM_NAS.map((c) => `<th class="sortable${c.r ? ' right' : c.c ? ' center' : ''}" data-sort="${c.k}" scope="col" aria-sort="${f.sort === c.k ? (f.dir > 0 ? 'ascending' : 'descending') : 'none'}">${c.l}${f.sort === c.k ? ic(f.dir > 0 ? 'arrow_upward' : 'arrow_downward') : ''}</th>`).join('')}<th class="center" scope="col">Aksi</th></tr></thead>
      <tbody>${isi.length ? isi.map((r) => `<tr class="klik ${r._st === 'macet' ? 't-bad' : r._st === 'dpk' ? 't-warn' : r._st === 'jt' ? 't-info' : ''}" data-id="${esc(r.id_fasilitas)}" tabindex="0">
        <td class="mono nowrap first" data-l="No. Rekening" style="color:${r._st === 'macet' ? 'var(--bad)' : 'var(--tx2)'}"><span class="row g4">${esc(r.no_rekening)}<button class="cp" data-cp="${esc(r.no_rekening)}" aria-label="Salin nomor rekening">${ic('content_copy', 's16')}</button></span></td>
        <td data-l="Nasabah" class="no-l"><div class="row g12" style="min-width:220px"><span class="mono-av" style="--c:${warnaMono(r)}">${esc(ini(r.nama_nasabah))}</span><div class="trunc" style="text-align:left"><b class="trunc" style="display:block">${esc(r.nama_nasabah)}</b><span class="fs11 dim trunc" style="display:block;margin-top:2px">${esc([r.sektor, r.jenis_fasilitas].filter(Boolean).join(' • '))}</span></div></div></td>
        <td data-l="RM"><span class="row"><span class="av">${esc(ini(namaRm(r.email_rm)))}</span><span class="trunc">${esc(namaRm(r.email_rm))}</span></span></td>
        <td class="right num b" data-l="Plafon">${rp(r.plafon)}</td>
        <td class="right num ${r.kolektibilitas >= 3 ? 'bad b' : ''}" data-l="Baki Debet">${rp(r.baki_debet)}</td>
        <td class="right num ${r.saldo_efektif > 0 ? 'ok' : 'dim'}" data-l="Saldo Efektif">${rp(r.saldo_efektif)}</td>
        <td data-l="Jatuh Tempo" class="nowrap">${jtSel(r)}</td>
        <td class="center" data-l="Kol">${badgeKol(r.kolektibilitas)}</td>
        <td class="center" data-l="Status">${badgeStatus(r)}</td>
        <td class="center" data-l="Aksi"><span class="acts"><button class="btn-ic sm" data-aksi="detail" aria-label="Detail" data-tip="Detail debitur">${ic('visibility', 's18')}</button>
          <button class="btn-ic sm" data-aksi="surat" aria-label="Cetak surat" data-tip="Cetak surat">${ic('description', 's18')}</button>
          ${bolehWA() ? `<button class="btn-ic sm" data-aksi="wa" aria-label="Kirim WhatsApp" data-tip="${r.wa_consent === 'Ya' ? 'Kirim WhatsApp' : 'Nasabah belum memberi persetujuan WA'}" style="${r.wa_consent === 'Ya' ? '' : 'opacity:.4'}">${ic('chat', 's18')}</button>` : ''}</span></td></tr>`).join('')
      : `<tr><td colspan="10" class="no-l">${kosong('search_off', 'Tidak ada nasabah yang cocok', 'Ubah kata kunci atau reset filter.')}</td></tr>`}</tbody>`;
    const nomor = [];
    for (let i = 1; i <= hal; i++) if (i === 1 || i === hal || Math.abs(i - f.page) <= 1) nomor.push(i); else if (nomor[nomor.length - 1] !== '…') nomor.push('…');
    $('#pg-nas').innerHTML = `<div class="row wrap fs13 muted">Menampilkan <b style="color:var(--tx)">${rows.length ? (f.page - 1) * f.size + 1 : 0}–${Math.min(rows.length, f.page * f.size)}</b> dari <b style="color:var(--tx)">${n0(rows.length)}</b> fasilitas
      <span class="tb-sep"></span>Baris <select class="sel sm" id="pg-size" style="width:auto">${[10, 25, 50, 100].map((s) => `<option${s === f.size ? ' selected' : ''}>${s}</option>`).join('')}</select>
      <span class="tb-sep"></span>Baki debet <b class="num" style="color:var(--tx)">${rpS(sum(rows, (r) => r.baki_debet))}</b></div>
      <div class="pg"><button data-pg="${f.page - 1}" ${f.page <= 1 ? 'disabled' : ''} aria-label="Sebelumnya">${ic('chevron_left', 's18')}</button>${nomor.map((n) => n === '…' ? '<span class="muted">…</span>' : `<button data-pg="${n}" class="${n === f.page ? 'on' : ''}">${n}</button>`).join('')}<button data-pg="${f.page + 1}" ${f.page >= hal ? 'disabled' : ''} aria-label="Berikutnya">${ic('chevron_right', 's18')}</button></div>`;
  };
  tabel();
  const q = $('#q-nasabah');
  q.addEventListener('input', deb(() => { S.f.q = q.value; S.f.page = 1; tabel(); }, 120));
  $$('[data-f]', el).forEach((s) => s.onchange = () => { S.f[s.dataset.f] = s.value; S.f.page = 1; s.closest('.fsel').classList.toggle('on', !!s.value); tabel(); });
  $$('[data-qf]', el).forEach((b) => b.onclick = () => { S.f = Object.assign({}, S.f, { rm: '', kol: '', st: '', jt: '', page: 1 }, JSON.parse(b.dataset.qf)); render('nasabah', true); });
  $('#nx-reset').onclick = () => { S.f = Object.assign(S.f, { q: '', rm: '', kol: '', st: '', jt: '', page: 1 }); render('nasabah', true); };
  el.onclick = (e) => {
    const s = e.target.closest('[data-sort]'); if (s) { S.f.dir = S.f.sort === s.dataset.sort ? -S.f.dir : (s.dataset.sort === 'nama_nasabah' || s.dataset.sort === 'email_rm' ? 1 : -1); S.f.sort = s.dataset.sort; tabel(); return; }
    const pg = e.target.closest('[data-pg]'); if (pg && !pg.disabled) { S.f.page = +pg.dataset.pg; tabel(); $('#tb-nas').scrollIntoView({ block: 'nearest' }); return; }
    const cp = e.target.closest('[data-cp]'); if (cp) { e.stopPropagation(); salin(cp.dataset.cp, 'No. rekening ' + cp.dataset.cp); return; }
    const tr = e.target.closest('tr[data-id]'); if (!tr) return;
    const ak = e.target.closest('[data-aksi]'), id = tr.dataset.id;
    if (!ak || ak.dataset.aksi === 'detail') return go('detail', { id });
    if (ak.dataset.aksi === 'surat') return go('surat', { id });
    if (ak.dataset.aksi === 'wa') return kirimWaCepat(S.pIdx[id]);
  };
  el.onkeydown = (e) => { const tr = e.target.closest('tr[data-id]'); if (tr && e.key === 'Enter') go('detail', { id: tr.dataset.id }); };
  el.onchange = (e) => { if (e.target.id === 'pg-size') { S.f.size = +e.target.value; S.f.page = 1; tabel(); } };
  const kolomEkspor = [{ l: 'No. Rekening', k: 'no_rekening' }, { l: 'Nama Nasabah', k: 'nama_nasabah', w: 30 }, { l: 'RM', v: (r) => namaRm(r.email_rm), w: 20 }, { l: 'Cabang', k: 'kode_cabang' },
    { l: 'Jenis Fasilitas', k: 'jenis_fasilitas', w: 20 }, { l: 'Plafon', k: 'plafon', kanan: true }, { l: 'Baki Debet', k: 'baki_debet', kanan: true }, { l: 'Saldo Efektif', k: 'saldo_efektif', kanan: true },
    { l: 'Jatuh Tempo', k: 'tgl_jatuh_tempo' }, { l: 'Kol', k: 'kolektibilitas' }, { l: 'Status', v: (r) => labelStatus(r) }];
  $('#nx-xls').onclick = () => eksporExcel('Daftar Nasabah ' + iso(new Date()), kolomEkspor, filterNasabah(), 'Nasabah').catch(gagalToast);
  $('#nx-csv').onclick = () => eksporCsv('Daftar Nasabah ' + iso(new Date()), kolomEkspor, filterNasabah());
  $('#nx-pdf').onclick = () => eksporPdf('Daftar Nasabah Kredit', kolomEkspor.filter((k) => k.l !== 'Saldo Efektif'), filterNasabah(), { sub: filterNasabah().length + ' fasilitas (hasil filter)' }).catch(gagalToast);
  if (isAdm()) $('#nx-add').onclick = () => formFasilitas(null);
};

// ── Formulir fasilitas (Admin) ──
function formFasilitas(r) {
  const rmOpsi = S.users.filter((u) => u.status_aktif).map((u) => ({ v: u.email, l: u.nama + ' (' + u.peran + ' • ' + u.kode_cabang + ')' }));
  const cabOpsi = S.cabang.map((c) => ({ v: c.kode, l: c.nama + ' (' + c.kode + ')' }));
  const fields = [
    { k: 'nama_nasabah', l: 'Nama perusahaan / debitur', wajib: true, full: true, ph: 'Contoh: PT Prima Agro Sentosa' },
    { k: 'no_rekening', l: 'No. rekening pinjaman', wajib: true, ph: '00XX-XXXX-XX' }, { k: 'npwp', l: 'NPWP', ph: '01.234.567.8-901.000' },
    { k: 'jenis_fasilitas', l: 'Jenis fasilitas', ph: 'KMK / KI / KUR …' }, { k: 'sektor', l: 'Sektor usaha' },
    { k: 'email_rm', l: 'RM pengelola', t: 'select', wajib: true, opsi: rmOpsi }, { k: 'kode_cabang', l: 'Cabang', t: 'select', wajib: true, opsi: cabOpsi },
    { k: 'plafon', l: 'Plafon (Rp)', t: 'uang', wajib: true }, { k: 'baki_debet', l: 'Baki debet (Rp)', t: 'uang', wajib: true },
    { k: 'saldo_efektif', l: 'Saldo efektif (Rp)', t: 'uang' }, { k: 'saldo_blokir', l: 'Saldo blokir (Rp)', t: 'uang' },
    { k: 'tgl_akad', l: 'Tanggal akad', t: 'date' }, { k: 'tgl_jatuh_tempo', l: 'Tanggal jatuh tempo', t: 'date', wajib: true },
    { k: 'kolektibilitas', l: 'Kolektibilitas', t: 'select', wajib: true, opsi: [1, 2, 3, 4, 5].map((k) => ({ v: k, l: 'Kol ' + k + ' — ' + KOL_L[k] })) },
    { k: 'status_kredit', l: 'Status kredit', t: 'select', wajib: true, opsi: ['Aktif', 'Restrukturisasi', 'Lunas', 'Hapus Buku'] },
    { k: 'suku_bunga', l: 'Suku bunga (% p.a.)', t: 'number', step: '0.01' }, { k: 'dpd', l: 'DPD (hari tunggakan)', t: 'number' },
    { k: 'nilai_agunan', l: 'Nilai agunan (Rp)', t: 'uang' },
    { k: 'no_wa_nasabah', l: 'No. WA nasabah', t: 'tel', ph: '08xxxxxxxxxx', help: r ? 'Kosongkan bila tidak diubah (nomor lama disamarkan).' : 'Format 08… atau 62…', validasi: (v) => (/^(\+?62|0)8\d{7,12}$/.test(v.replace(/[\s-]/g, '')) ? '' : 'Nomor WA tidak valid.') },
    { k: 'wa_consent', l: 'Persetujuan menerima WA', t: 'switch', teks: 'Nasabah setuju (wa_consent)' }, { k: 'pengingat_aktif', l: 'Pengingat jatuh tempo', t: 'switch', teks: 'Aktif (H-3 bulan ke RM)', def: 'Ya' },
    { k: 'catatan', l: 'Catatan', t: 'textarea', full: true, rows: 3 }
  ];
  const nilai = r ? Object.assign({}, r, { no_wa_nasabah: '' }) : { kode_cabang: S.cab !== '*' ? S.cab : (S.cabang[0] || {}).kode, status_kredit: 'Aktif', kolektibilitas: 1, pengingat_aktif: 'Ya' };
  formModal({ judul: r ? 'Ubah Data Fasilitas' : 'Registrasi Fasilitas Debitur', sub: 'Data tersimpan ke Portofolio_Kredit dan tercatat di log audit', ikon: 'post_add', fields, nilai, lebar: 'xl',
    simpan: async (v) => {
      if (r && !v.no_wa_nasabah) delete v.no_wa_nasabah;
      if (!r && !v.no_wa_nasabah) delete v.no_wa_nasabah;
      if (r) v.id_fasilitas = r.id_fasilitas;
      const res = await api('nasabah.simpan', v);
      toast('Tersimpan', res.message, 'ok');
      await sinkron(true);
      if (S.route === 'detail') render('detail', true);
    } });
}

// ── Detail nasabah ──
async function muatDetail(id, paksa) {
  const c = S.cache['det_' + id];
  if (c && !paksa && Date.now() - c.t < 60e3) return c.d;
  const r = await api('nasabah.detail', { id });
  S.cache['det_' + id] = { t: Date.now(), d: r.data };
  return r.data;
}
R.detail = function (el, p) {
  const r = S.pIdx[p.id];
  if (!r) { el.innerHTML = `<div class="crumb"><button data-go="nasabah">${ic('group', 's18')}Nasabah</button></div>` + kosong('person_off', 'Data nasabah tidak ditemukan', 'Mungkin di luar wewenang Anda atau sudah dihapus.'); return; }
  S.detailId = r.id_fasilitas;
  const util = r.plafon ? r.baki_debet / r.plafon * 100 : 0, cover = r.baki_debet ? r.nilai_agunan / r.baki_debet * 100 : 0;
  const jadwal = r.tgl_jatuh_tempo ? tambahBulan(parseT(r.tgl_jatuh_tempo), -(Number(S.set.PENGINGAT_BULAN) || 3)) : null;
  const rm = S.uIdx[r.email_rm] || {};
  el.innerHTML = `<div class="row wrap" style="justify-content:space-between;margin-bottom:14px">
    <div class="crumb" style="margin:0"><button data-act="kembali">${ic('arrow_back', 's18')}Kembali</button><span class="dim">/</span><button data-go="nasabah">Nasabah</button>${ic('chevron_right', 's16 dim')}<b style="color:var(--tx)">${esc(r.nama_nasabah)}</b><span class="pill-tag">${esc(r.id_fasilitas)}</span></div>
    <div class="row wrap">${badgeStatus(r)}${r.tgl_jatuh_tempo ? `<span class="bdg info lc">${ic('event', 's16')}JT ${tgl(r.tgl_jatuh_tempo)}${r._h !== null && aktif(r) ? ' (H' + (r._h >= 0 ? '-' + r._h : '+' + -r._h) + ')' : ''}</span>` : ''}<span class="bdg mut lc">${ic('badge', 's16')}RM: ${esc(namaRm(r.email_rm))}</span></div></div>
  <section class="card hero"><div class="row wrap g16" style="position:relative;align-items:flex-start">
    <span class="mono-lg">${esc(ini(r.nama_nasabah))}</span>
    <div class="sp" style="min-width:240px"><div class="row wrap"><h2 style="margin:0;font-size:24px;letter-spacing:-.01em">${esc(r.nama_nasabah)}</h2>${r.jenis_fasilitas ? `<span class="bdg acc lc">${esc(r.jenis_fasilitas)}</span>` : ''}</div>
      <div class="meta"><span>${ic('credit_card')}No. Rekening: <b class="mono" style="color:var(--tx)">${esc(r.no_rekening)}</b></span>${r.npwp ? `<span>${ic('receipt_long')}NPWP: <span class="mono" style="color:var(--tx)">${esc(r.npwp)}</span></span>` : ''}${r.sektor ? `<span>${ic('domain')}${esc(r.sektor)}</span>` : ''}<span>${ic('account_balance')}${esc(namaCab(r.kode_cabang))}</span></div></div>
    <div class="row wrap"><button class="btn btn-p" data-d="surat">${ic('print', 's18')}Cetak Surat</button>
      ${bolehWA() ? `<button class="btn" data-d="wa">${ic('chat', 's18 ok')}Kirim WhatsApp</button>` : ''}
      <button class="btn btn-g" data-d="unggah">${ic('upload_file', 's18 info')}Unggah Berkas</button>
      ${isAdm() ? `<button class="btn-ic" data-d="ubah" aria-label="Ubah data" data-tip="Ubah parameter data">${ic('edit_note')}</button>` : ''}
      <button class="btn-ic" data-d="pdf" aria-label="Ekspor profil PDF" data-tip="Ekspor profil ringkas (PDF)">${ic('picture_as_pdf')}</button></div></div></section>
  <div class="g g12 sec" style="align-items:start">
    <div class="c5 col" style="gap:16px">
      <section class="card"><div class="card-h"><div class="row g12"><span class="well">${ic('account_balance_wallet', 's18')}</span><div><h3 class="card-t">Fasilitas Kredit &amp; Agunan</h3><p class="card-s">${esc(r.jenis_fasilitas || 'Fasilitas kredit')}</p></div></div><span class="bdg ${aktif(r) ? 'ok' : 'mut'} lc">${esc(r.status_kredit)}</span></div>
        <div class="inner"><div class="row fs13"><span class="muted">Utilisasi baki debet</span><span class="sp"></span><b class="fs16 num">${pct(util)}</b></div>
          <div class="bar thick mt8"><i style="width:${Math.min(100, util)}%;--c:linear-gradient(90deg,var(--accent-tx),var(--accent),var(--pink))"></i></div>
          <div class="row mt8 fs12 muted" style="justify-content:space-between"><span>Plafon<br><b class="num fs13" style="color:var(--tx)">${rp(r.plafon)}</b></span><span class="right">Baki debet<br><b class="num fs13" style="color:var(--tx)">${rp(r.baki_debet)}</b></span></div></div>
        <div class="g g2 mt12" style="gap:10px"><div class="mini"><span>Saldo efektif</span><b class="ok">${rp(r.saldo_efektif)}</b></div><div class="mini"><span>Saldo blokir (kas jaminan)</span><b class="warn">${rp(r.saldo_blokir)}</b></div>
          <div class="mini"><span>Suku bunga</span><b>${r.suku_bunga !== '' && r.suku_bunga !== undefined ? pct(r.suku_bunga, 2) + ' <span class="fs11 muted">p.a.</span>' : '—'}</b></div>
          <div class="mini"><span>Kolektibilitas / DPD</span><b class="row g4"><i style="width:8px;height:8px;border-radius:50%;background:var(--${KOL_C[r.kolektibilitas]})"></i>Kol ${r.kolektibilitas} <span class="fs11 muted">(${n0(r.dpd)} hari)</span></b></div></div>
        <div class="kv mt12"><span class="muted row g4">${ic('calendar_today', 's16 info')}Tanggal akad</span><b class="num">${r.tgl_akad ? tgl(r.tgl_akad) : '—'}</b></div>
        <div class="kv"><span class="muted row g4">${ic('alarm', 's16 warn')}Jatuh tempo</span><span class="right"><b class="info">${tgl(r.tgl_jatuh_tempo)}</b>${r._h !== null && aktif(r) ? `<span class="sub fs11 ${r._h < 0 ? 'bad' : 'warn'} b" style="display:block">${r._h < 0 ? 'Lewat ' + -r._h + ' hari' : 'Sisa ' + r._h + ' hari'}</span>` : ''}</span></div>
        <div class="inner mt12" style="background:var(--accent-soft);border:0"><div class="row"><span class="fs11 b acc row g4" style="letter-spacing:.06em">${ic('shield', 's16')}NILAI AGUNAN</span><span class="sp"></span>${r.nilai_agunan ? `<span class="bdg ${cover >= 100 ? 'ok' : 'warn'} lc">Cakupan ${pct(cover, 0)}</span>` : ''}</div>
          <div class="fs20 bb num mt4">${r.nilai_agunan ? rp(r.nilai_agunan) : '—'}</div></div>
        ${r.catatan ? `<div class="note mt12">${ic('sticky_note_2')}<div>${esc(r.catatan)}</div></div>` : ''}</section>
      <section class="card"><div class="card-h"><div class="row g12"><span class="well ok">${ic('notifications_active', 's18')}</span><div><h3 class="card-t">Pengingat Jatuh Tempo</h3><p class="card-s">WA otomatis H-${esc(S.set.PENGINGAT_BULAN || 3)} bulan ke RM pengelola</p></div></div>
        <label class="sw" data-tip="Aktif/nonaktifkan pengingat untuk fasilitas ini"><input type="checkbox" id="sw-png" ${r.pengingat_aktif === 'Ya' ? 'checked' : ''} ${aktif(r) ? '' : 'disabled'}><span class="tr"></span></label></div>
        <div class="inner fs13" style="line-height:1.6">${ic('info', 's18 info')} Pengingat dikirim ke WA <b>${esc(namaRm(r.email_rm))}</b> (${esc(maskHp(rm.no_wa_rm) || 'nomor belum diisi')}). ${aktif(r) ? '' : '<b class="ok">Kredit sudah ' + esc(r.status_kredit) + ' — pengingat berhenti otomatis.</b>'}</div>
        <div class="kv mt12"><span class="muted row g4">${ic('schedule_send', 's16 acc')}Jadwal pengingat</span><b>${jadwal ? tgl(jadwal) : '—'}</b></div>
        <div class="kv"><span class="muted row g4">${ic('verified', 's16')}Persetujuan WA nasabah</span>${r.wa_consent === 'Ya' ? '<span class="bdg ok lc">Ya</span>' : '<span class="bdg mut lc">Tidak / opt-out</span>'}</div>
        <div id="det-png" class="mt12"></div></section>
      <section class="card"><div class="card-h"><div class="row g12"><span class="well pink">${ic('contacts', 's18')}</span><div><h3 class="card-t">Kontak Kunci (CRM)</h3><p class="card-s">PIC pengambil keputusan</p></div></div><button class="btn btn-sm btn-g" data-d="kontak">${ic('add')}Tambah</button></div><div id="det-kontak">${skel(3)}</div></section>
    </div>
    <div class="c7 col" style="gap:16px">
      <section class="card"><div class="tabs" role="tablist" id="det-tabs">${[['dok', 'folder_open', 'Dokumen'], ['surat', 'outgoing_mail', 'Riwayat Surat'], ['wa', 'chat', 'Riwayat WA'], ['crm', 'forum', 'Interaksi'], ['jadwal', 'event_note', 'Jadwal']]
        .map(([k, i, l], n) => `<button class="tab${(S.detTab || 'dok') === k ? ' on' : ''}" data-tab="${k}" role="tab">${ic(i, 's18')}${l}<span class="n" id="n-${k}">${k === 'jadwal' ? '' : '…'}</span></button>`).join('')}</div>
        <div id="det-isi">${skel(5)}</div></section>
    </div></div>`;
  $$('[data-d]', el).forEach((b) => b.onclick = () => aksiDetail(b.dataset.d, r));
  $('#sw-png').onchange = (e) => togglePengingat(r, e.target.checked, e.target);
  $$('[data-tab]', el).forEach((b) => b.onclick = () => { S.detTab = b.dataset.tab; $$('[data-tab]', el).forEach((x) => x.classList.toggle('on', x === b)); isiTabDetail(r); });
  isiTabDetail(r, true);
};
function aksiDetail(a, r) {
  if (a === 'surat') return go('surat', { id: r.id_fasilitas });
  if (a === 'wa') return kirimWaCepat(r);
  if (a === 'unggah') return modalDokumen(r.id_fasilitas);
  if (a === 'ubah') return formFasilitas(r);
  if (a === 'kontak') return formKontak(r, null);
  if (a === 'pdf') return eksporPdf('Profil Fasilitas ' + r.nama_nasabah, [{ l: 'Parameter', k: 'a' }, { l: 'Nilai', k: 'b' }], [
    ['No. rekening', r.no_rekening], ['Nama nasabah', r.nama_nasabah], ['NPWP', r.npwp], ['Jenis fasilitas', r.jenis_fasilitas], ['Sektor', r.sektor], ['RM pengelola', namaRm(r.email_rm)],
    ['Cabang', namaCab(r.kode_cabang)], ['Plafon', rp(r.plafon)], ['Baki debet', rp(r.baki_debet)], ['Saldo efektif', rp(r.saldo_efektif)], ['Saldo blokir', rp(r.saldo_blokir)],
    ['Suku bunga', r.suku_bunga !== '' ? pct(r.suku_bunga, 2) : '—'], ['Tanggal akad', tgl(r.tgl_akad)], ['Jatuh tempo', tgl(r.tgl_jatuh_tempo)], ['Kolektibilitas', 'Kol ' + r.kolektibilitas + ' — ' + KOL_L[r.kolektibilitas]],
    ['DPD', n0(r.dpd) + ' hari'], ['Status kredit', r.status_kredit], ['Nilai agunan', rp(r.nilai_agunan)], ['Persetujuan WA', r.wa_consent], ['Pengingat aktif', r.pengingat_aktif]
  ].map(([a2, b]) => ({ a: a2, b: b || '—' }))).catch(gagalToast);
}
async function togglePengingat(r, nilai, el) {
  const lama = r.pengingat_aktif;
  r.pengingat_aktif = nilai ? 'Ya' : 'Tidak'; // optimistic
  S.dirty.pengingat = true;
  try { const res = await api('nasabah.pengingat', { id: r.id_fasilitas, aktif: nilai }); toast(res.message, r.nama_nasabah, 'ok', { lama: 2200 }); S.ver.Portofolio_Kredit = 'x'; }
  catch (e) { r.pengingat_aktif = lama; if (el) el.checked = lama === 'Ya'; gagalToast(e); }
}
async function isiTabDetail(r, muatUlang) {
  const box = $('#det-isi'), kontak = $('#det-kontak');
  let d;
  try { d = await muatDetail(r.id_fasilitas, muatUlang === 'paksa'); }
  catch (e) { box.innerHTML = kosong('error', 'Gagal memuat detail', e.message); kontak.innerHTML = ''; return; }
  if (S.detailId !== r.id_fasilitas || !box.isConnected) return;
  [['dok', d.dok], ['surat', d.surat], ['wa', d.wa], ['crm', d.interaksi]].forEach(([k, a]) => { const n = $('#n-' + k); if (n) n.textContent = a.length; });
  kontak.innerHTML = d.kontak.length ? d.kontak.map((k) => `<div class="doc-i"><span class="av lg" style="background:var(--accent-soft);color:var(--accent-tx)">${esc(ini(k.nama))}</span><div class="sp trunc"><b>${esc(k.nama)}</b><div class="fs12 muted trunc">${esc(k.jabatan || '—')}${k.email ? ' • ' + esc(k.email) : ''}</div></div>
    ${k.no_wa ? `<button class="bdg ok lc" style="cursor:pointer" data-nomor="${esc(k.id_kontak)}" data-tip="Tampilkan nomor lengkap (tercatat di audit)">${ic('call', 's16')}${esc(k.no_wa)}</button>` : ''}
    <button class="btn-ic sm" data-ek="${esc(k.id_kontak)}" aria-label="Ubah kontak">${ic('edit', 's18')}</button></div>`).join('') : kosong('person_add', 'Belum ada kontak kunci', 'Catat PIC / pengambil keputusan debitur.');
  $$('[data-ek]', kontak).forEach((b) => b.onclick = () => formKontak(r, d.kontak.find((k) => k.id_kontak === b.dataset.ek)));
  $$('[data-nomor]', kontak).forEach((b) => b.onclick = async () => { try { const x = await api('nasabah.nomor', { id_kontak: b.dataset.nomor }); b.innerHTML = ic('call', 's16') + esc(x.data.nomor); b.removeAttribute('data-nomor'); } catch (e) { gagalToast(e); } });
  const pg = $('#det-png');
  if (pg) pg.innerHTML = d.pengingat.length ? `<div class="fs12 b muted mb8">Riwayat pengingat</div>` + d.pengingat.slice(0, 4).map((x) => `<div class="kv"><span class="fs12">JT ${tgl(x.tgl_jatuh_tempo)}</span><span class="bdg ${x.status === 'Terkirim' ? 'ok' : x.status === 'Gagal' ? 'bad' : x.status === 'Dibatalkan' ? 'mut' : 'info'} lc" data-tip="${esc(x.keterangan || '')}">${esc(x.status)}${x.tgl_kirim ? ' ' + tgl(x.tgl_kirim) : ''}</span></div>`).join('') : '';
  const tab = S.detTab || 'dok';
  if (tab === 'dok') box.innerHTML = `<div class="row mb12"><span class="muted fs13">${d.dok.length} berkas, tautan & video</span><span class="sp"></span><button class="btn btn-sm btn-p" id="dt-up">${ic('add')}Tambah dokumen</button></div>` + (d.dok.length ? d.dok.map(htmlDok).join('') : kosong('folder_off', 'Belum ada dokumen', 'Unggah PDF/ZIP, tambahkan tautan, atau video YouTube.'));
  else if (tab === 'surat') box.innerHTML = `<div class="row mb12"><span class="muted fs13">${d.surat.length} surat terbit</span><span class="sp"></span><button class="btn btn-sm btn-p" data-go="surat" data-p='${esc(JSON.stringify({ id: r.id_fasilitas }))}'>${ic('add_circle')}Terbitkan surat</button></div>` + (d.surat.length ? tabelSurat(d.surat, true) : kosong('mail', 'Belum ada surat', 'Surat yang dicetak akan muncul di sini.'));
  else if (tab === 'wa') box.innerHTML = d.wa.length ? `<div class="stream" style="max-height:520px;min-height:0;border-radius:12px">${d.wa.slice().reverse().map(htmlBubble).join('')}</div>` : kosong('chat', 'Belum ada riwayat WA', bolehWA() ? 'Kirim pesan dari tombol Kirim WhatsApp.' : '');
  else if (tab === 'crm') box.innerHTML = `<div class="row mb12"><span class="muted fs13">Catatan kunjungan, telepon & rapat</span><span class="sp"></span><button class="btn btn-sm btn-p" id="dt-int">${ic('add')}Catat interaksi</button></div>` +
    (d.interaksi.length ? `<div class="tl">${d.interaksi.map((x) => `<div class="tl-i" style="--c:var(--${x.kanal === 'Kunjungan' ? 'pink' : x.kanal === 'Telepon' ? 'info' : 'accent'})"><b>${esc(x.kanal)} • ${tgl(x.tanggal)}</b><div class="fs13 mt4">${esc(x.ringkasan)}</div>${x.tindak_lanjut ? `<small class="mt4">Tindak lanjut: ${esc(x.tindak_lanjut)}</small>` : ''}<small>oleh ${esc(namaRm(x.oleh))}</small></div>`).join('')}</div>` : kosong('forum', 'Belum ada interaksi tercatat'));
  else if (tab === 'jadwal') {
    const ev = [];
    if (r.tgl_akad) ev.push({ t: r.tgl_akad, l: 'Akad kredit', c: 'accent' });
    if (r.tgl_jatuh_tempo) { const j = tambahBulan(parseT(r.tgl_jatuh_tempo), -(Number(S.set.PENGINGAT_BULAN) || 3)); ev.push({ t: iso(j), l: 'Pengingat otomatis ke RM (H-' + (S.set.PENGINGAT_BULAN || 3) + ' bulan)', c: 'info' }); ev.push({ t: r.tgl_jatuh_tempo, l: 'Jatuh tempo fasilitas', c: 'warn' }); }
    d.surat.forEach((s) => ev.push({ t: String(s.waktu).slice(0, 10), l: 'Surat: ' + s.nama_surat + ' (' + s.nomor_surat + ')', c: 'pink' }));
    ev.sort((a, b) => (a.t > b.t ? 1 : -1));
    const kini = iso(new Date());
    box.innerHTML = `<div class="tl">${ev.map((e) => `<div class="tl-i" style="--c:var(--${e.c})"><b>${esc(e.l)}</b><small>${tgl(e.t)} • ${e.t < kini ? 'telah lewat' : e.t === kini ? 'hari ini' : (selisihHari(e.t) + ' hari lagi')}</small></div>`).join('')}</div>`;
  }
  const up = $('#dt-up'); if (up) up.onclick = () => modalDokumen(r.id_fasilitas);
  const it = $('#dt-int'); if (it) it.onclick = () => formInteraksi(r);
  pasangAksiDok(box, d.dok);
  pasangAksiSurat(box);
}
function formKontak(r, k) {
  formModal({ judul: k ? 'Ubah kontak' : 'Tambah kontak kunci', sub: r.nama_nasabah, ikon: 'person_add', lebar: '',
    fields: [{ k: 'nama', l: 'Nama', wajib: true, full: true }, { k: 'jabatan', l: 'Jabatan', ph: 'Direktur Utama' }, { k: 'no_wa', l: 'No. WA', t: 'tel', ph: '08…', help: k ? 'Biarkan bila tidak diubah' : '' },
      { k: 'email', l: 'Email', t: 'email', full: true }, { k: 'catatan', l: 'Catatan', t: 'textarea', full: true, rows: 2 }],
    nilai: k || {}, atas: '', bawah: k ? `<div class="full"><button type="button" class="btn btn-d btn-sm" id="hapus-k">${ic('delete')}Hapus kontak</button></div>` : '',
    onBuka: (el, m) => { const h = el.querySelector('#hapus-k'); if (h) h.onclick = async () => { if (!(await konfirmasi({ judul: 'Hapus kontak?', pesan: esc(k.nama), bahaya: true, ok: 'Hapus' }))) return; try { await api('kontak.hapus', { id_kontak: k.id_kontak }); m.tutup(); toast('Kontak dihapus', '', 'ok'); isiTabDetail(r, 'paksa'); } catch (e) { gagalToast(e); } }; },
    simpan: async (v) => { v.id_fasilitas = r.id_fasilitas; if (k) v.id_kontak = k.id_kontak; await api('kontak.simpan', v); toast('Kontak tersimpan', v.nama, 'ok'); isiTabDetail(r, 'paksa'); } });
}
function formInteraksi(r) {
  formModal({ judul: 'Catat interaksi', sub: r.nama_nasabah, ikon: 'forum', lebar: '',
    fields: [{ k: 'kanal', l: 'Kanal', t: 'select', opsi: ['Kunjungan', 'Telepon', 'Rapat', 'WhatsApp', 'Email', 'Catatan'] }, { k: 'tanggal', l: 'Tanggal', t: 'date', def: iso(new Date()) },
      { k: 'ringkasan', l: 'Ringkasan', t: 'textarea', wajib: true, full: true }, { k: 'tindak_lanjut', l: 'Tindak lanjut', full: true }],
    simpan: async (v) => { v.id_fasilitas = r.id_fasilitas; await api('interaksi.tambah', v); toast('Interaksi dicatat', '', 'ok'); S.detTab = 'crm'; isiTabDetail(r, 'paksa'); $$('[data-tab]').forEach((x) => x.classList.toggle('on', x.dataset.tab === 'crm')); } });
}
// ── Achievement RM ──
S.ach = LS.get('ach', { per: '', jenis: '' });
R.achievement = function (el) {
  const pers = daftarPeriode(), jen = jenisTarget();
  if (!pers.length) { el.innerHTML = `<div class="ph"><div><h2>Achievement RM</h2><p>Target vs realisasi per RM per periode.</p></div>${isAdm() ? `<div class="tools"><button class="btn btn-p" id="ac-kel">${ic('edit_calendar', 's18')}Kelola Target</button></div>` : ''}</div><div class="card">${kosong('flag', 'Belum ada data target', isAdm() ? 'Tambahkan lewat Kelola Target atau Impor Data.' : 'Hubungi Admin untuk pengisian target.')}</div>`; const k = $('#ac-kel'); if (k) k.onclick = () => kelolaTarget(periodeKini()); return; }
  const per = pers.includes(S.ach.per) ? S.ach.per : periodeKini(), jSel = jen.includes(S.ach.jenis) ? S.ach.jenis : '';
  const data = achRm(per, jSel), bench = Number(S.set.BENCHMARK_ACHIEVEMENT) || 90, jFokus = jSel || jen[0];
  const rata = data.length ? sum(data, (x) => x.avg) / data.length : 0, capai = data.filter((x) => x.avg >= 100).length;
  const tf = sum(data, (x) => (x.per[jFokus] || {}).t || 0), rf = sum(data, (x) => (x.per[jFokus] || {}).r || 0);
  const tren = (email) => pers.slice(-6).map((p) => { const a = achRm(p, jSel).find((x) => x.email === email); return a ? a.avg : 0; });
  el.innerHTML = `<div class="ph"><div><h2>Achievement RM</h2><p>${isPim() ? 'Peringkat dan selisih terhadap target tim cabang Anda.' : peran() === 'RM' ? 'Pencapaian target pribadi Anda per periode.' : 'Target vs realisasi seluruh RM per periode.'}</p></div>
    <div class="tools"><select class="sel" style="width:auto" id="ac-per" aria-label="Periode">${pers.slice().reverse().map((p) => `<option value="${p}"${p === per ? ' selected' : ''}>${labelPeriode(p)}</option>`).join('')}</select>
      <select class="sel" style="width:auto" id="ac-j" aria-label="Jenis target"><option value="">Semua jenis target</option>${jen.map((j) => `<option${j === jSel ? ' selected' : ''}>${esc(j)}</option>`).join('')}</select>
      <button class="btn btn-g" id="ac-xls">${ic('table_view', 's18 ok')}Excel</button>${isAdm() ? `<button class="btn btn-p" id="ac-kel">${ic('edit_calendar', 's18')}Kelola Target</button>` : ''}</div></div>
  <div class="g g4">
    ${kpiCard({ l: peran() === 'RM' ? 'Achievement saya' : 'Rata-rata achievement', i: 'military_tech', w: rata >= bench ? 'ok' : 'warn', v: pct(rata), d: 'Benchmark ' + pct(bench, 0), dc: rata >= bench ? 'ok' : 'warn', di: rata >= bench ? 'trending_up' : 'trending_down' })}
    ${kpiCard({ l: 'RM mencapai ≥ 100%', i: 'emoji_events', w: 'pink', v: capai + '<small>/ ' + data.length + ' RM</small>', d: data.length ? pct(capai / data.length * 100, 0) + ' dari tim' : '—' })}
    ${kpiCard({ l: 'Realisasi ' + jFokus, i: 'savings', w: 'info', v: rpS(rf), d: 'Target ' + rpS(tf), dc: 'info' })}
    ${kpiCard({ l: 'Selisih terhadap target', i: rf >= tf ? 'north_east' : 'south_east', w: rf >= tf ? 'ok' : 'bad', v: (rf - tf >= 0 ? '+' : '') + rpS(rf - tf), d: jFokus, dc: rf >= tf ? 'ok' : 'bad' })}
  </div>
  <div class="g g12 sec"><div class="card c4"><div class="card-h"><div><h3 class="card-t">Pencapaian Tim</h3><p class="card-s">${esc(labelPeriode(per))}</p></div></div>
      <div class="center" style="display:grid;place-items:center;padding:8px 0">${donut(rata, { s: 160, w: 14, grad: ['#8B5CF6', '#EC4899', '#60A5FA'], sub: rata >= bench ? 'Di atas benchmark' : 'Di bawah benchmark', subC: rata >= bench ? 'var(--ok)' : 'var(--warn)', fs: 30 })}</div>
      <div class="col mt12" style="gap:10px">${jen.map((j, i) => { const t = sum(data, (x) => (x.per[j] || {}).t || 0), r = sum(data, (x) => (x.per[j] || {}).r || 0), a = t ? r / t * 100 : 0; return `<div><div class="row fs12" style="margin-bottom:4px"><span class="muted">${esc(j)}</span><span class="sp"></span><b>${pct(a, 0)}</b></div><div class="bar thin"><i style="width:${Math.min(100, a)}%;--c:${['var(--accent)', 'var(--pink)', 'var(--blue)', 'var(--ok)'][i % 4]}"></i></div></div>`; }).join('')}</div></div>
    <div class="card c8"><div class="card-h wrap"><div><h3 class="card-t">${peran() === 'RM' ? 'Tren achievement saya' : 'Target vs Realisasi per RM'}</h3><p class="card-s">${peran() === 'RM' ? '6 periode terakhir (%)' : esc(jFokus) + ' • ' + esc(labelPeriode(per))}</p></div>
      ${peran() === 'RM' ? '' : '<div class="legend"><span><i style="--c:var(--accent)"></i>Target</span><span><i style="--c:var(--pink)"></i>Realisasi</span></div>'}</div><div id="ac-ch"></div></div></div>
  <div class="card p0 sec" style="overflow:hidden"><div class="card-h" style="padding:16px 20px 0"><div><h3 class="card-t">Peringkat RM</h3><p class="card-s">Diurutkan dari rata-rata achievement tertinggi</p></div></div>
    <div class="tbl-wrap resp"><table class="tbl tbl-resp"><thead><tr><th>#</th><th>RM</th>${(jSel ? [jSel] : jen).map((j) => `<th class="right">${esc(j)}</th>`).join('')}<th class="right">Rata-rata</th><th class="right">Selisih ${esc(jFokus)}</th><th>Tren 6 bln</th>${isAdm() ? '<th></th>' : ''}</tr></thead>
    <tbody>${data.map((x, i) => `<tr><td class="first b" data-l="Peringkat">${i + 1}</td><td data-l="RM"><span class="row"><span class="av ${i === 0 ? 'acc' : ''}">${esc(ini(x.nama))}</span><span><b>${esc(x.nama)}</b><span class="sub">${esc(namaCab(x.cabang))}</span></span></span></td>
      ${(jSel ? [jSel] : jen).map((j) => { const v = x.per[j]; return `<td class="right num" data-l="${esc(j)}">${v ? `<b class="${v.a >= 100 ? 'ok' : v.a >= bench ? '' : 'warn'}">${pct(v.a, 0)}</b><span class="sub">${rpS(v.r)} / ${rpS(v.t)}</span>` : '<span class="dim">—</span>'}</td>`; }).join('')}
      <td class="right" data-l="Rata-rata"><span class="bdg ${x.avg >= 100 ? 'ok' : x.avg >= bench ? 'acc' : 'warn'} lc num">${pct(x.avg)}</span></td>
      <td class="right num ${((x.per[jFokus] || {}).r || 0) - ((x.per[jFokus] || {}).t || 0) >= 0 ? 'ok' : 'bad'}" data-l="Selisih">${x.per[jFokus] ? ((x.per[jFokus].r - x.per[jFokus].t) >= 0 ? '+' : '') + rpS(x.per[jFokus].r - x.per[jFokus].t) : '—'}</td>
      <td data-l="Tren">${sparkBar(tren(x.email), x.avg >= bench ? 'var(--ok)' : 'var(--warn)')}</td>${isAdm() ? `<td><button class="btn-ic sm" data-et="${esc(x.email)}" aria-label="Ubah target">${ic('edit', 's18')}</button></td>` : ''}</tr>`).join('') || `<tr><td colspan="9" class="no-l">${kosong('person_search', 'Tidak ada RM dalam lingkup')}</td></tr>`}</tbody></table></div></div>`;
  if (peran() === 'RM') {
    const ps = pers.slice(-6);
    grafikBatang($('#ac-ch'), ps.map((p) => BLN[+p.slice(5) - 1]), [{ n: 'Achievement', c: 'var(--accent)', v: ps.map((p) => { const a = achRm(p, jSel)[0]; return a ? a.avg : 0; }) }], { fmt: (v) => pct(v, 0) });
  } else {
    const top = data.slice(0, 12);
    grafikBatang($('#ac-ch'), top.map((x) => x.nama.split(' ')[0]), [{ n: 'Target', c: 'var(--accent)', v: top.map((x) => (x.per[jFokus] || {}).t || 0) }, { n: 'Realisasi', c: 'var(--pink)', v: top.map((x) => (x.per[jFokus] || {}).r || 0) }], { fmt: rpS, fmtSumbu: (v) => rpS(v).replace('Rp ', '') });
  }
  const simpan = () => { LS.set('ach', S.ach); render('achievement', true); };
  $('#ac-per').onchange = (e) => { S.ach.per = e.target.value; simpan(); };
  $('#ac-j').onchange = (e) => { S.ach.jenis = e.target.value; simpan(); };
  $('#ac-xls').onclick = () => eksporExcel('Achievement RM ' + per, [{ l: 'Peringkat', v: (x) => data.indexOf(x) + 1 }, { l: 'RM', k: 'nama', w: 24 }, { l: 'Cabang', k: 'cabang' }]
    .concat(jen.map((j) => ({ l: j + ' (%)', v: (x) => (x.per[j] ? Math.round(x.per[j].a * 10) / 10 : '') })), [{ l: 'Rata-rata (%)', v: (x) => Math.round(x.avg * 10) / 10 }]), data, 'Achievement').catch(gagalToast);
  if (isAdm()) { $('#ac-kel').onclick = () => kelolaTarget(per); $$('[data-et]', el).forEach((b) => b.onclick = () => kelolaTarget(per, b.dataset.et)); }
};
function kelolaTarget(per, hanyaEmail) {
  const jen = (String(S.set.JENIS_TARGET || '').split(',').map((x) => x.trim()).filter(Boolean)).concat(jenisTarget()).filter((v, i, a) => a.indexOf(v) === i);
  const rms = S.users.filter((u) => u.status_aktif && (u.peran === 'RM') && (!hanyaEmail || u.email === hanyaEmail));
  const isi = (p) => `<div class="row wrap mb12"><label class="fsel"><span>Periode</span><input type="month" id="kt-per" value="${p}" style="background:transparent;border:0;color:var(--tx);height:32px"></label><span class="fs12 muted">Isi target & realisasi (Rp). Kosongkan bila tidak ada.</span></div>
    <div class="tbl-wrap" style="max-height:56vh;overflow:auto"><table class="tbl"><thead><tr><th>RM</th>${jen.map((j) => `<th>${esc(j)}<span class="sub" style="text-transform:none">target / realisasi</span></th>`).join('')}</tr></thead><tbody>
    ${rms.map((u) => `<tr><td><b>${esc(u.nama)}</b><span class="sub">${esc(u.kode_cabang)}</span></td>${jen.map((j) => { const t = S.target.find((x) => x.email_rm === u.email && x.periode === p && x.jenis_target === j) || {}; return `<td><div class="col" style="gap:4px;min-width:150px"><input class="inp sm num" data-uang data-e="${esc(u.email)}" data-j="${esc(j)}" data-k="target" value="${t.target ? n0(t.target) : ''}" placeholder="Target"><input class="inp sm num" data-uang data-e="${esc(u.email)}" data-j="${esc(j)}" data-k="realisasi" value="${t.realisasi ? n0(t.realisasi) : ''}" placeholder="Realisasi"></div></td>`; }).join('')}</tr>`).join('')}</tbody></table></div>`;
  const m = modal({ judul: 'Kelola Target RM', sub: 'Target bulanan per RM per jenis', ikon: 'edit_calendar', lebar: 'xl', isi: isi(per),
    kaki: `<button class="btn btn-g" data-x2>Batal</button><button class="btn btn-p" data-sv>${ic('save', 's18')}Simpan Target</button>` });
  const pasang = () => { pasangUang(m.el); $('#kt-per', m.el).onchange = (e) => { m.el.querySelector('.mdl-b').innerHTML = isi(e.target.value); pasang(); }; };
  pasang();
  m.el.querySelector('[data-x2]').onclick = () => m.tutup();
  m.el.querySelector('[data-sv]').onclick = async (e) => {
    const p = $('#kt-per', m.el).value, rows = {};
    $$('[data-k]', m.el).forEach((i) => { const key = i.dataset.e + '|' + i.dataset.j; const v = i.value.replace(/[^\d]/g, ''); rows[key] = rows[key] || { email_rm: i.dataset.e, periode: p, jenis_target: i.dataset.j }; rows[key][i.dataset.k] = v; });
    const kirim = Object.values(rows).filter((r) => r.target !== '');
    if (!kirim.length) return toast('Tidak ada isian', 'Isi minimal satu target.', 'warn');
    tombolMuat(e.currentTarget, true, 'Menyimpan…');
    try { const r = await api('target.simpan', { rows: kirim }); toast('Target tersimpan', r.data.ditambah + ' baru, ' + r.data.diperbarui + ' diperbarui', 'ok'); m.tutup(); S.ach.per = p; await sinkron(true); render('achievement', true); }
    catch (err) { gagalToast(err); tombolMuat(e.currentTarget, false); }
  };
}

// ── Dokumen ──
function ikonDok(d) {
  if (d.jenis === 'video') return { i: 'smart_display', c: 'var(--pink)' };
  if (d.jenis === 'tautan') return { i: 'link', c: 'var(--accent-tx)' };
  const n = String(d.nama).toLowerCase();
  if (/\.pdf$/.test(n)) return { i: 'picture_as_pdf', c: 'var(--bad)' };
  if (/\.(zip|rar)$/.test(n)) return { i: 'folder_zip', c: 'var(--warn)' };
  if (/\.(png|jpe?g|webp|gif)$/.test(n)) return { i: 'image', c: 'var(--info)' };
  if (/\.(xlsx?|csv)$/.test(n)) return { i: 'table_view', c: 'var(--ok)' };
  return { i: 'description', c: 'var(--blue)' };
}
const ukuran = (b) => (!b ? '' : b > 1048576 ? (b / 1048576).toLocaleString('id-ID', { maximumFractionDigits: 1 }) + ' MB' : Math.ceil(b / 1024) + ' KB');
function htmlDok(d, denganNasabah) {
  const k = ikonDok(d), bisaHapus = isAdm() || d.diunggah_oleh === S.me.email;
  return `<div class="doc-i"><span class="doc-ic" style="--c:${k.c}">${ic(k.i)}</span><div class="sp trunc"><b class="trunc" style="display:block">${esc(d.nama)}</b>
    <div class="fs12 muted trunc">${denganNasabah ? `<a href="javascript:void(0)" data-go="detail" data-p='${esc(JSON.stringify({ id: d.id_fasilitas }))}'>${esc(d.nama_nasabah)}</a> • ` : ''}${d.jenis === 'file' ? ukuran(d.ukuran) : d.jenis === 'video' ? 'Video YouTube' : 'Tautan'} • ${esc(namaRm(d.diunggah_oleh))} • ${tglJam(d.waktu)}</div></div>
    <button class="btn btn-sm btn-g" data-dok-buka="${esc(d.id_dokumen)}">${ic(d.jenis === 'tautan' ? 'open_in_new' : 'visibility')}${d.jenis === 'tautan' ? 'Buka' : 'Lihat'}</button>
    ${bisaHapus ? `<button class="btn-ic sm" data-dok-hapus="${esc(d.id_dokumen)}" aria-label="Hapus dokumen">${ic('delete', 's18')}</button>` : ''}</div>`;
}
function pasangAksiDok(root, list) {
  $$('[data-dok-buka]', root).forEach((b) => b.onclick = () => bukaDokumen(list.find((d) => d.id_dokumen === b.dataset.dokBuka), b));
  $$('[data-dok-hapus]', root).forEach((b) => b.onclick = async () => {
    const d = list.find((x) => x.id_dokumen === b.dataset.dokHapus);
    if (!(await konfirmasi({ judul: 'Hapus dokumen?', pesan: '<b>' + esc(d.nama) + '</b> akan dipindahkan ke sampah Drive.', bahaya: true, ok: 'Hapus' }))) return;
    const row = b.closest('.doc-i'); row.style.opacity = '.4';
    try { await api('dok.hapus', { id_dokumen: d.id_dokumen }); row.remove(); toast('Dokumen dihapus', d.nama, 'ok'); delete S.cache.dok; delete S.cache['det_' + d.id_fasilitas]; }
    catch (e) { row.style.opacity = ''; gagalToast(e); }
  });
}
async function bukaDokumen(d, btn) {
  if (d.jenis === 'video') return modal({ judul: d.nama, sub: 'Video referensi', ikon: 'smart_display', lebar: 'lg', isi: `<div class="yt"><iframe src="https://www.youtube-nocookie.com/embed/${esc(d.yt)}?rel=0" title="${esc(d.nama)}" allow="accelerometer; encrypted-media; gyroscope; picture-in-picture; fullscreen" allowfullscreen></iframe></div>`, kaki: false });
  if (d.jenis === 'tautan') { const a = document.createElement('a'); a.href = d.url; a.target = '_blank'; a.rel = 'noopener noreferrer'; document.body.appendChild(a); a.click(); a.remove(); return; }
  tombolMuat(btn, true, 'Membuka…');
  try {
    const r = await api('dok.ambil', { id_dokumen: d.id_dokumen }), blob = b64Blob(r.data.base64, r.data.mime);
    const url = URL.createObjectURL(blob), img = /^image\//.test(r.data.mime), pdf = /pdf/.test(r.data.mime);
    if (!img && !pdf) { unduhBlob(blob, r.data.nama); return; }
    const m = modal({ judul: r.data.nama, sub: ukuran(blob.size) + ' • dibuka melalui aplikasi', ikon: img ? 'image' : 'picture_as_pdf', lebar: 'xl',
      isi: img ? `<img src="${url}" alt="${esc(r.data.nama)}" style="max-width:100%;border-radius:10px;display:block;margin:auto">` : `<iframe class="prev" src="${url}" title="Pratinjau ${esc(r.data.nama)}"></iframe>`,
      kaki: `<button class="btn btn-g" data-x2>Tutup</button><button class="btn btn-p" data-dl>${ic('download', 's18')}Unduh</button>`, onTutup: () => setTimeout(() => URL.revokeObjectURL(url), 1000) });
    m.el.querySelector('[data-x2]').onclick = () => m.tutup();
    m.el.querySelector('[data-dl]').onclick = () => unduhBlob(blob, r.data.nama);
  } catch (e) { gagalToast(e); } finally { tombolMuat(btn, false); }
}
/** Pemilih nasabah (combobox ringan). */
function pilihNasabah(host, onPilih, idAwal) {
  const awal = idAwal && S.pIdx[idAwal];
  host.innerHTML = `<div style="position:relative"><label class="search" style="max-width:none"><span class="ms">person_search</span><span class="sr">Cari nasabah</span><input class="inp" placeholder="Cari nama / no. rekening…" value="${awal ? esc(awal.nama_nasabah + ' — ' + awal.no_rekening) : ''}" autocomplete="off"></label>
    <div class="pop" style="position:absolute;top:44px;left:0;right:0;max-width:none;max-height:300px;overflow:auto;display:none"></div></div>`;
  const inp = host.querySelector('input'), list = host.querySelector('.pop');
  const tampil = () => {
    const q = inp.value.toLowerCase().trim(), hasil = P().filter((r) => !q || r._q.indexOf(q) > -1 || (r.nama_nasabah + ' — ' + r.no_rekening).toLowerCase() === q).slice(0, 40);
    list.innerHTML = hasil.length ? hasil.map((r) => `<button type="button" class="pop-i" data-pid="${esc(r.id_fasilitas)}"><span class="mono-av" style="--c:${warnaMono(r)};width:30px;height:30px">${esc(ini(r.nama_nasabah))}</span><span class="trunc"><b>${esc(r.nama_nasabah)}</b><small>${esc(r.no_rekening)} • ${esc(namaRm(r.email_rm))}</small></span></button>`).join('') : '<div class="empty fs13">Tidak ditemukan</div>';
    list.style.display = 'block';
  };
  inp.addEventListener('focus', () => { inp.select(); tampil(); });
  inp.addEventListener('input', deb(tampil, 80));
  inp.addEventListener('blur', () => setTimeout(() => { list.style.display = 'none'; }, 180));
  list.addEventListener('mousedown', (e) => { const b = e.target.closest('[data-pid]'); if (!b) return; e.preventDefault(); const r = S.pIdx[b.dataset.pid]; inp.value = r.nama_nasabah + ' — ' + r.no_rekening; list.style.display = 'none'; inp.blur(); onPilih(r); });
  if (awal) onPilih(awal);
}
function modalDokumen(idAwal) {
  let pilih = idAwal ? S.pIdx[idAwal] : null, tab = 'file';
  const maks = Number(S.set.DOK_MAKS_MB) || 10, eks = String(S.set.DOK_EKSTENSI || '').split(/[,\s]+/).filter(Boolean);
  const m = modal({ judul: 'Tambah Dokumen Nasabah', sub: 'Berkas tersimpan privat di Drive — akses selalu melalui aplikasi', ikon: 'upload_file', lebar: 'lg',
    isi: `<div class="fld mb16"><label>Nasabah <span class="req">*</span></label><div id="pn-dok"></div></div>
      <div class="tabs"><button class="tab on" data-t="file">${ic('upload', 's18')}Unggah berkas</button><button class="tab" data-t="tautan">${ic('link', 's18')}Tautan</button><button class="tab" data-t="video">${ic('smart_display', 's18')}Video YouTube</button></div>
      <div data-p="file"><label class="drop" id="drop" tabindex="0">${ic('cloud_upload')}<div class="b mt8" style="color:var(--tx)">Tarik & lepas berkas di sini, atau klik untuk memilih</div><div class="fs12 mt4">${esc(eks.join(', ').toUpperCase())} • maks. ${maks} MB per berkas</div><input type="file" multiple hidden id="f-dok" accept="${eks.map((x) => '.' + x).join(',')}"></label><div id="antri-up" class="mt12"></div></div>
      <div data-p="tautan" hidden><div class="form-g">${fieldHtml({ k: 'nama_t', l: 'Nama tautan', ph: 'Contoh: Laporan keuangan audited 2025', full: true })}${fieldHtml({ k: 'url_t', l: 'URL', t: 'url', ph: 'https://…', full: true })}</div></div>
      <div data-p="video" hidden><div class="form-g">${fieldHtml({ k: 'nama_v', l: 'Judul video', ph: 'Contoh: Profil perusahaan', full: true })}${fieldHtml({ k: 'url_v', l: 'URL YouTube', t: 'url', ph: 'https://youtu.be/…', full: true })}</div><div id="yt-prev" class="mt12"></div></div>`,
    kaki: `<button class="btn btn-g" data-x2>Tutup</button><button class="btn btn-p" data-sv hidden>${ic('add_link', 's18')}Simpan</button>` });
  const el = m.el, sv = el.querySelector('[data-sv]');
  pilihNasabah(el.querySelector('#pn-dok'), (r) => { pilih = r; }, idAwal);
  el.querySelector('[data-x2]').onclick = () => m.tutup();
  $$('[data-t]', el).forEach((b) => b.onclick = () => { tab = b.dataset.t; $$('[data-t]', el).forEach((x) => x.classList.toggle('on', x === b)); $$('[data-p]', el).forEach((p) => { p.hidden = p.dataset.p !== tab; }); sv.hidden = tab === 'file'; });
  const ytId = (u) => { const x = String(u).match(/(?:youtu\.be\/|youtube(?:-nocookie)?\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/|live\/))([A-Za-z0-9_-]{11})/); return x ? x[1] : ''; };
  el.querySelector('[name=url_v]').addEventListener('input', deb((e) => { const id = ytId(e.target.value); el.querySelector('#yt-prev').innerHTML = id ? `<div class="yt"><iframe src="https://www.youtube-nocookie.com/embed/${id}" title="Pratinjau" allowfullscreen></iframe></div>` : ''; }, 300));
  const unggah = async (files) => {
    if (!pilih) return toast('Pilih nasabah dulu', 'Dokumen harus terhubung ke satu fasilitas.', 'warn');
    for (const f of Array.from(files)) {
      const ext = f.name.split('.').pop().toLowerCase(), row = document.createElement('div');
      row.className = 'doc-i'; row.innerHTML = `<span class="doc-ic">${ic('upload')}</span><div class="sp trunc"><b class="trunc" style="display:block">${esc(f.name)}</b><div class="bar thin mt4"><i style="width:15%"></i></div></div><span class="fs12 muted" data-st>Menyiapkan…</span>`;
      el.querySelector('#antri-up').prepend(row);
      const st = row.querySelector('[data-st]'), bar = row.querySelector('.bar i');
      if (!eks.includes(ext)) { st.innerHTML = `<span class="bad">Ekstensi ditolak</span>`; bar.style.width = '0'; continue; }
      if (f.size > maks * 1048576) { st.innerHTML = `<span class="bad">> ${maks} MB</span>`; bar.style.width = '0'; continue; }
      try {
        const b64 = await bacaBerkas(f); bar.style.width = '45%'; st.textContent = 'Mengunggah…';
        const r = await api('dok.unggah', { id_fasilitas: pilih.id_fasilitas, nama: f.name, mime: f.type, base64: b64 });
        bar.style.width = '100%'; st.innerHTML = `<span class="ok row g4">${ic('check_circle', 's16')}Tersimpan</span>`;
        delete S.cache.dok; delete S.cache['det_' + pilih.id_fasilitas];
        if (S.route === 'dokumen') render('dokumen', true);
        if (S.route === 'detail' && S.detailId === pilih.id_fasilitas) { S.detTab = 'dok'; render('detail', true); }
        void r;
      } catch (e) { bar.style.width = '0'; st.innerHTML = `<span class="bad" data-tip="${esc(e.message)}">Gagal</span>`; }
    }
  };
  const drop = el.querySelector('#drop'), fi = el.querySelector('#f-dok');
  fi.onchange = () => { unggah(fi.files); fi.value = ''; };
  ['dragenter', 'dragover'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add('on'); }));
  ['dragleave', 'drop'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.remove('on'); }));
  drop.addEventListener('drop', (e) => unggah(e.dataTransfer.files));
  drop.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fi.click(); } });
  sv.onclick = async () => {
    if (!pilih) return toast('Pilih nasabah dulu', '', 'warn');
    const video = tab === 'video', nama = el.querySelector(video ? '[name=nama_v]' : '[name=nama_t]').value.trim(), url = el.querySelector(video ? '[name=url_v]' : '[name=url_t]').value.trim();
    if (!/^https?:\/\//i.test(url)) return toast('URL tidak valid', 'Harus diawali http:// atau https://', 'warn');
    if (video && !ytId(url)) return toast('Bukan URL YouTube', 'Contoh: https://youtu.be/xxxxxxxxxxx', 'warn');
    tombolMuat(sv, true, 'Menyimpan…');
    try { await api('dok.tautan', { id_fasilitas: pilih.id_fasilitas, jenis: video ? 'video' : 'tautan', nama, url }); toast(video ? 'Video ditambahkan' : 'Tautan ditambahkan', nama || url, 'ok'); delete S.cache.dok; delete S.cache['det_' + pilih.id_fasilitas]; m.tutup(); if (S.route === 'dokumen') render('dokumen', true); if (S.route === 'detail') render('detail', true); }
    catch (e) { gagalToast(e); } finally { tombolMuat(sv, false); }
  };
}
S.fd = { q: '', j: '' };
R.dokumen = async function (el) {
  el.innerHTML = `<div class="ph"><div><h2>Arsip Dokumen</h2><p>Berkas pendukung (PDF, ZIP, gambar, Office), tautan, dan video YouTube per nasabah. Folder Drive privat — akses selalu lewat aplikasi.</p></div>
    <div class="tools"><button class="btn btn-p" id="dk-add">${ic('add', 's18')}Tambah Dokumen</button></div></div>
    <div class="card pad16"><div class="row wrap g12"><label class="search"><span class="ms">search</span><span class="sr">Cari dokumen</span><input class="inp" id="dk-q" placeholder="Cari nama dokumen atau nasabah…" value="${esc(S.fd.q)}"></label>
      <div class="seg" id="dk-j">${[['', 'Semua'], ['file', 'Berkas'], ['tautan', 'Tautan'], ['video', 'Video']].map(([v, l]) => `<button data-j="${v}" class="${S.fd.j === v ? 'on' : ''}">${l}</button>`).join('')}</div></div></div>
    <div class="card sec" id="dk-list">${skel(6)}</div>`;
  $('#dk-add').onclick = () => modalDokumen(null);
  let list = S.cache.dok && Date.now() - S.cache.dok.t < 120e3 ? S.cache.dok.d : null;
  if (!list) { try { list = (await api('dok.daftar', {})).data; S.cache.dok = { t: Date.now(), d: list }; } catch (e) { $('#dk-list').innerHTML = kosong('error', 'Gagal memuat dokumen', e.message); return; } }
  if (!el.isConnected || S.route !== 'dokumen') return;
  const tampil = () => {
    const q = S.fd.q.toLowerCase(), r = list.filter((d) => (S.cab === '*' || (S.pIdx[d.id_fasilitas] || {}).kode_cabang === S.cab) && (!S.fd.j || d.jenis === S.fd.j) && (!q || (d.nama + ' ' + d.nama_nasabah + ' ' + d.no_rekening).toLowerCase().includes(q)));
    $('#dk-list').innerHTML = `<div class="row mb12"><b>${n0(r.length)} dokumen</b><span class="sp"></span><span class="fs12 muted">${ukuran(sum(r, (d) => d.ukuran || 0))} total berkas</span></div>` + (r.length ? r.slice(0, 300).map((d) => htmlDok(d, true)).join('') : kosong('folder_off', 'Tidak ada dokumen', 'Gunakan tombol Tambah Dokumen.'));
    pasangAksiDok($('#dk-list'), list);
  };
  tampil();
  $('#dk-q').addEventListener('input', deb((e) => { S.fd.q = e.target.value; tampil(); }, 120));
  $$('[data-j]', el).forEach((b) => b.onclick = () => { S.fd.j = b.dataset.j; $$('[data-j]', el).forEach((x) => x.classList.toggle('on', x === b)); tampil(); });
};

// ── Surat ──
const PH_SISTEM = ['nomor', 'tanggal', 'tahun', 'bulan_romawi', 'kode_verifikasi', 'qr', 'url_verifikasi'];
const PH_DATA = ['nama_nasabah', 'no_rekening', 'plafon', 'baki_debet', 'saldo_efektif', 'saldo_blokir', 'tgl_jatuh_tempo', 'kolektibilitas', 'status_kredit', 'jenis_fasilitas',
  'sektor', 'suku_bunga', 'tgl_akad', 'nilai_agunan', 'npwp', 'dpd', 'nama_rm', 'email_rm', 'no_wa_rm', 'kode_cabang', 'nama_cabang', 'nama_pimpinan', 'nama_bank', 'alamat_bank', 'sisa_hari'];
const labelPh = (k) => k.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
function tabelSurat(list, ringkas) {
  return `<div class="tbl-wrap resp"><table class="tbl tbl-resp tbl-surat"><thead><tr><th>Surat</th>${ringkas ? '' : '<th>Nasabah</th>'}<th>Diterbitkan</th><th class="right">Unduh</th></tr></thead><tbody>
    ${list.map((s) => `<tr><td class="first" data-l="Surat"><b>${esc(s.nama_surat)}</b><span class="sub row g4 wrap"><span class="acc mono nowrap">${esc(s.nomor_surat)}</span>${s.status && s.status !== 'TERBIT' ? `<span class="bdg warn lc">${esc(s.status)}</span>` : ''}</span></td>${ringkas ? '' : `<td class="nas" data-l="Nasabah"><a href="javascript:void(0)" data-go="detail" data-p='${esc(JSON.stringify({ id: s.id_fasilitas }))}'>${esc(s.nama_nasabah)}</a><span class="sub mono">${esc(s.no_rekening)}</span></td>`}
      <td class="nowrap" data-l="Diterbitkan">${tglJam(s.waktu)}<span class="sub">${esc(namaRm(s.dibuat_oleh))}</span></td>
      <td class="right nowrap" data-l="Unduh"><span class="acts">${s.ada_pdf ? `<button class="btn btn-sm btn-d" data-us="${esc(s.id_surat)}" data-jn="pdf" aria-label="Lihat PDF ${esc(s.nomor_surat)}">${ic('picture_as_pdf')}PDF</button>` : ''}${s.ada_docx ? `<button class="btn btn-sm btn-g" data-us="${esc(s.id_surat)}" data-jn="docx" aria-label="Unduh Word ${esc(s.nomor_surat)}">${ic('description')}Word</button>` : ''}</span></td></tr>`).join('')}</tbody></table></div>`;
}
function pasangAksiSurat(root) {
  $$('[data-us]', root).forEach((b) => b.onclick = async () => {
    tombolMuat(b, true, '…');
    try {
      const r = await api('surat.unduh', { id_surat: b.dataset.us, jenis: b.dataset.jn }), blob = b64Blob(r.data.base64, r.data.mime);
      if (b.dataset.jn === 'pdf') {
        const url = URL.createObjectURL(blob);
        const m = modal({ judul: r.data.nama, sub: 'Pratinjau surat', ikon: 'picture_as_pdf', lebar: 'xl', isi: `<iframe class="prev" src="${url}" title="Pratinjau surat"></iframe>`, kaki: `<button class="btn btn-g" data-x2>Tutup</button><button class="btn btn-p" data-dl>${ic('download', 's18')}Unduh PDF</button>`, onTutup: () => setTimeout(() => URL.revokeObjectURL(url), 800) });
        m.el.querySelector('[data-x2]').onclick = () => m.tutup(); m.el.querySelector('[data-dl]').onclick = () => unduhBlob(blob, r.data.nama);
      } else unduhBlob(blob, r.data.nama);
    } catch (e) { gagalToast(e); } finally { tombolMuat(b, false); }
  });
}
R.surat = async function (el, p) {
  const tpls = S.tplSurat;
  let fas = p.id ? S.pIdx[p.id] : null, tpl = tpls[0] || null;
  el.innerHTML = `<div class="ph"><div><h2>Cetak Surat</h2><p>Surat resmi dari template Google Docs/Word: placeholder terisi otomatis, nomor surat berurutan, hasil <b>.docx</b> dan <b>PDF</b> ber-QR verifikasi.</p></div>
    ${isAdm() ? `<div class="tools"><button class="btn btn-g" data-go="pengaturan" data-p='{"tab":"tplsurat"}'>${ic('description', 's18')}Kelola Template</button></div>` : ''}</div>
  <div class="g g12" style="align-items:start"><div class="card c5"><div class="card-h"><div class="row g12"><span class="well">${ic('edit_document', 's18')}</span><div><h3 class="card-t">Buat surat baru</h3><p class="card-s">Pilih nasabah dan jenis surat</p></div></div></div>
      ${tpls.length ? `<div class="fld"><label>Nasabah <span class="req">*</span></label><div id="sr-pn"></div></div>
      <div class="fld mt12"><label for="sr-tpl">Jenis surat <span class="req">*</span></label><select class="sel" id="sr-tpl">${tpls.map((t) => `<option value="${esc(t.id_template)}">${esc(t.nama_surat)} (${esc(t.kode)})</option>`).join('')}</select></div>
      <div id="sr-isi" class="mt16"></div>
      <button class="btn btn-p mt16" style="width:100%;height:46px" id="sr-buat">${ic('print', 's18')}Buat Surat (.docx &amp; PDF)</button>
      <div id="sr-hasil" class="mt16"></div>` : kosong('description', 'Belum ada template surat aktif', isAdm() ? 'Tambahkan template di Pengaturan → Template Surat.' : 'Hubungi Admin.')}</div>
    <div class="card c7 p0" style="overflow:hidden"><div class="card-h" style="padding:20px 20px 0"><div><h3 class="card-t">Riwayat surat terbit</h3><p class="card-s">Arsip di Drive: Surat_Terbit/Tahun/Bulan</p></div>
      <label class="search" style="max-width:240px;min-width:160px"><span class="ms">search</span><input class="inp sm" id="sr-q" placeholder="Cari…" style="height:36px"></label></div><div id="sr-riw" style="padding:12px 0 0">${skel(5)}</div></div></div>`;
  if (tpls.length) {
    const isiForm = () => {
      if (!tpl) return;
      const kustom = tpl.placeholder.filter((k) => PH_SISTEM.indexOf(k) < 0 && PH_DATA.indexOf(k) < 0);
      const tipe = (k) => (/tanggal|tgl/.test(k) ? 'date' : /jumlah|nominal|nilai|biaya|harga/.test(k) ? 'uang' : /alamat|isi|catatan|keterangan|uraian|paragraf/.test(k) ? 'textarea' : 'text');
      const dataPh = tpl.placeholder.filter((k) => PH_DATA.indexOf(k) > -1).slice(0, 8);
      $('#sr-isi').innerHTML = (fas ? `<div class="inner fs13"><div class="fs11 b muted mb8" style="letter-spacing:.06em">DIISI OTOMATIS DARI DATA</div>${dataPh.map((k) => `<div class="row" style="padding:3px 0"><span class="muted">${labelPh(k)}</span><span class="sp"></span><b class="trunc" style="max-width:60%">${esc(nilaiPhKlien(k, fas))}</b></div>`).join('')}
        <div class="row" style="padding:3px 0"><span class="muted">Nomor &amp; tanggal surat</span><span class="sp"></span><span class="bdg acc lc">Otomatis oleh server</span></div></div>` : `<div class="note">${ic('info')}<div>Pilih nasabah untuk melihat isian otomatis.</div></div>`)
        + (kustom.length ? `<div class="fs11 b muted mt16 mb8" style="letter-spacing:.06em">ISIAN TAMBAHAN (DARI TEMPLATE)</div><div class="form-g one" id="sr-kus">${kustom.map((k) => fieldHtml({ k, l: labelPh(k), t: tipe(k), full: tipe(k) === 'textarea', help: 'Kosongkan untuk memakai nilai bawaan template' })).join('')}</div>` : '');
      pasangUang($('#sr-isi'));
    };
    pilihNasabah($('#sr-pn'), (r) => { fas = r; isiForm(); }, p.id);
    $('#sr-tpl').onchange = (e) => { tpl = tpls.find((t) => t.id_template === e.target.value); isiForm(); };
    isiForm();
    $('#sr-buat').onclick = async (e) => {
      if (!fas) return toast('Pilih nasabah', 'Surat harus terhubung ke satu fasilitas.', 'warn');
      const isian = {};
      $$('#sr-kus [name]').forEach((i) => { const v = i.dataset.uang !== undefined ? i.value.replace(/[^\d]/g, '') : i.value.trim(); if (v) isian[i.name] = v; });
      const btn = e.currentTarget; tombolMuat(btn, true, 'Membuat surat… (±10 detik)');
      try {
        const r = await api('surat.buat', { id_template: tpl.id_template, id_fasilitas: fas.id_fasilitas, isian });
        toast('Surat terbit', r.data.nomor_surat, 'ok');
        $('#sr-hasil').innerHTML = `<div class="note ok">${ic('task_alt')}<div class="sp"><b>${esc(r.data.nama_surat)}</b><div class="mono mt4">${esc(r.data.nomor_surat)}</div><div class="fs12 mt4">Kode verifikasi: <span class="mono">${esc(r.data.kode_verifikasi)}</span></div>
          <div class="row wrap mt12">${r.data.ada_pdf ? `<button class="btn btn-sm btn-d" data-us="${esc(r.data.id_surat)}" data-jn="pdf">${ic('picture_as_pdf')}Lihat / Unduh PDF</button>` : ''}${r.data.ada_docx ? `<button class="btn btn-sm" data-us="${esc(r.data.id_surat)}" data-jn="docx">${ic('description')}Unduh .docx</button>` : ''}</div></div></div>`;
        pasangAksiSurat($('#sr-hasil'));
        delete S.cache.surat; delete S.cache['det_' + fas.id_fasilitas]; muatRiwayat(true);
      } catch (err) { gagalToast(err); } finally { tombolMuat(btn, false); }
    };
  }
  const muatRiwayat = async (paksa) => {
    let list = !paksa && S.cache.surat && Date.now() - S.cache.surat.t < 120e3 ? S.cache.surat.d : null;
    if (!list) { try { list = (await api('surat.riwayat', {})).data; S.cache.surat = { t: Date.now(), d: list }; } catch (e) { $('#sr-riw').innerHTML = kosong('error', 'Gagal memuat riwayat', e.message); return; } }
    const box = $('#sr-riw'); if (!box) return;
    const tampil = () => { const q = ($('#sr-q').value || '').toLowerCase(); const r = list.filter((s) => (S.cab === '*' || s.kode_cabang === S.cab) && (!q || (s.nomor_surat + ' ' + s.nama_surat + ' ' + s.nama_nasabah).toLowerCase().includes(q))); box.innerHTML = r.length ? tabelSurat(r.slice(0, 200), false) : kosong('mail', 'Belum ada surat', 'Surat yang dibuat akan tampil di sini.'); pasangAksiSurat(box); };
    tampil(); $('#sr-q').oninput = deb(tampil, 120);
  };
  muatRiwayat(false);
};
function nilaiPhKlien(k, r) {
  const rm = S.uIdx[r.email_rm] || {};
  const v = { nama_rm: rm.nama || r.email_rm, no_wa_rm: maskHp(rm.no_wa_rm), nama_cabang: namaCab(r.kode_cabang), nama_bank: S.set.NAMA_BANK, alamat_bank: S.set.ALAMAT_BANK, sisa_hari: r._h }[k];
  if (v !== undefined) return v === null ? '—' : v;
  if (['plafon', 'baki_debet', 'saldo_efektif', 'saldo_blokir', 'nilai_agunan'].includes(k)) return rp(r[k]);
  if (/^tgl_/.test(k)) return tgl(r[k]);
  if (k === 'kolektibilitas') return 'Kol ' + r[k] + ' (' + KOL_L[r[k]] + ')';
  return r[k] === undefined || r[k] === '' ? '—' : r[k];
}
// ── WhatsApp: utilitas bersama ──
const VAR_WA = ['nama_nasabah', 'no_rekening', 'plafon', 'baki_debet', 'tgl_jatuh_tempo', 'sisa_hari', 'nama_rm', 'nama_cabang', 'nama_bank'];
function varWaKlien(r) {
  const rm = S.uIdx[r.email_rm] || {};
  return { nama_nasabah: r.nama_nasabah, no_rekening: r.no_rekening, plafon: rp(r.plafon), baki_debet: rp(r.baki_debet), saldo_efektif: rp(r.saldo_efektif), tgl_jatuh_tempo: tgl(r.tgl_jatuh_tempo),
    kolektibilitas: 'Kol ' + r.kolektibilitas, jenis_fasilitas: r.jenis_fasilitas, nama_rm: rm.nama || r.email_rm, no_wa_rm: rm.no_wa_rm || '', nama_cabang: rm.nama_cabang || r.kode_cabang,
    sisa_hari: r._h === null ? '' : r._h, nama_bank: S.set.NAMA_BANK || '', nama_aplikasi: S.set.NAMA_APLIKASI || '' };
}
const isiTpl = (t, v) => String(t || '').replace(/\{\{\s*([A-Za-z0-9_]+)\s*\}\}/g, (_, k) => (v[k.toLowerCase()] === undefined ? '' : String(v[k.toLowerCase()])));
const STATUS_WA = { Antri: ['schedule', 'Antri', 'info'], Terkirim: ['done_all', 'Terkirim', 'ok'], Gagal: ['error', 'Gagal', 'bad'], Dibatalkan: ['block', 'Dibatalkan', 'mut'], Dilewati: ['block', 'Dilewati', 'mut'] };
function waktuBub(t) { const h = String(t || '').slice(0, 10); return h === iso(new Date()) ? jam(t) : tgl(h).replace(/ \d{4}$/, '') + ', ' + jam(t); }
function htmlBubble(w) {
  const st = STATUS_WA[w.status] || ['schedule', w.status, 'mut'], cls = w.status === 'Gagal' ? 'gagal' : (w.status === 'Dibatalkan' || w.status === 'Dilewati') ? 'sys' : '';
  const label = w.jenis === 'Pengingat' ? `${ic('notifications_active', 's16')} Pengingat ke RM ${esc(w.nama_penerima)}` : w.jenis === 'Blast' ? `${ic('campaign', 's16')} Blast` : '';
  return `<div class="bub ${cls}">${label ? `<div class="fs11 b row g4" style="opacity:.85;margin-bottom:4px">${label}</div>` : ''}${esc(w.isi || w.respon || '')}
    <div class="ft"><span>${esc(waktuBub(w.waktu))}</span>${ic(st[0])}<span>${st[1]}</span></div>${(w.status === 'Gagal' || w.status === 'Dibatalkan') && w.respon ? `<div class="fs11 mt4" style="opacity:.85">${esc(w.respon)}</div>` : ''}</div>`;
}
function kirimWaCepat(r) {
  if (!r) return;
  if (!bolehWA()) return toast('Akses ditolak', 'Pengiriman WA hanya untuk Admin/Pimpinan.', 'warn');
  const tpls = S.tplWA.filter((t) => t.status_aktif && t.jenis !== 'Pengingat'), v = varWaKlien(r);
  const m = modal({ judul: 'Kirim WhatsApp', sub: r.nama_nasabah + ' • ' + (r.no_wa_nasabah || 'nomor kosong'), ikon: 'chat', lebar: 'lg',
    isi: `${r.wa_consent !== 'Ya' ? `<div class="note warn mb12">${ic('gpp_maybe')}<div><b>Nasabah belum memberi persetujuan menerima WA</b><div class="mt4">Sesuai UU PDP, pesan tidak dapat dikirim sebelum persetujuan terdokumentasi.</div>${isAdm() || isPim() ? '<button class="btn btn-sm btn-g mt8" data-consent>' + ic('verified') + 'Catat persetujuan nasabah</button>' : ''}</div></div>` : ''}
      ${!r.wa_valid ? `<div class="note bad mb12">${ic('phone_disabled')}<div>Nomor WA nasabah tidak valid. Perbarui data fasilitas terlebih dahulu.</div></div>` : ''}
      <div class="fld"><label for="wq-t">Template</label><select class="sel" id="wq-t"><option value="">— Tulis manual —</option>${tpls.map((t) => `<option value="${esc(t.id_template)}">${esc(t.nama)}</option>`).join('')}</select></div>
      <div class="row wrap mt12">${VAR_WA.map((k) => `<button type="button" class="vchip" data-var="${k}">{{${k}}}</button>`).join('')}</div>
      <div class="fld mt12"><label for="wq-i">Isi pesan</label><textarea class="txa" id="wq-i" rows="6" placeholder="Ketik pesan… gunakan {{variabel}} untuk personalisasi"></textarea></div>
      <div class="fs12 b muted mt12 mb8">PRATINJAU</div><div class="stream" style="min-height:0;padding:14px;border-radius:12px"><div class="bub" id="wq-p">…</div></div>`,
    kaki: `<button class="btn btn-g" data-x2>Batal</button><button class="btn btn-p" data-kirim ${r.wa_consent !== 'Ya' || !r.wa_valid ? 'disabled' : ''}>${ic('send', 's18')}Masukkan ke antrean</button>` });
  const el = m.el, ta = $('#wq-i', el), pv = () => { $('#wq-p', el).textContent = isiTpl(ta.value, v) || '…'; };
  $('#wq-t', el).onchange = (e) => { const t = tpls.find((x) => x.id_template === e.target.value); if (t) ta.value = t.isi_pesan; pv(); };
  ta.oninput = pv;
  $$('[data-var]', el).forEach((b) => b.onclick = () => { const s = ta.selectionStart || ta.value.length; ta.value = ta.value.slice(0, s) + '{{' + b.dataset.var + '}}' + ta.value.slice(s); ta.focus(); pv(); });
  el.querySelector('[data-x2]').onclick = () => m.tutup();
  const c = el.querySelector('[data-consent]');
  if (c) c.onclick = async () => { if (!(await konfirmasi({ judul: 'Catat persetujuan WA?', pesan: 'Pastikan persetujuan tertulis/elektronik dari <b>' + esc(r.nama_nasabah) + '</b> sudah terdokumentasi (UU No. 27/2022). Tindakan ini tercatat di log audit.', ok: 'Ya, catat' }))) return; try { await api('nasabah.consent', { id: r.id_fasilitas, consent: 'Ya' }); r.wa_consent = 'Ya'; toast('Persetujuan dicatat', r.nama_nasabah, 'ok'); m.tutup(); kirimWaCepat(r); } catch (e) { gagalToast(e); } };
  el.querySelector('[data-kirim]').onclick = async (e) => {
    if (!ta.value.trim()) return toast('Isi pesan kosong', '', 'warn');
    tombolMuat(e.currentTarget, true, 'Mengantrekan…');
    try { const res = await api('wa.kirim', { id_fasilitas: r.id_fasilitas, isi: ta.value }); toast('Pesan diantrekan', 'Dikirim otomatis dalam ±1 menit.', 'ok'); m.tutup(); tambahLogLokal(res.data); }
    catch (err) { gagalToast(err); tombolMuat(e.currentTarget, false); }
  };
  pv();
}
function tambahLogLokal(w) { if (S.cache.walog) S.cache.walog.d.unshift(w); delete S.cache['det_' + w.id_fasilitas]; S.ringkas.waAntri = (S.ringkas.waAntri || 0) + 1; perbaruiNotif(); if (S.route === 'wa') render('wa', true); }

// ── Halaman Pesan WA ──
S.wa = { tab: 'semua', sel: '', q: '' };
let POLL_WA = null, POLL_WA_N = 0;
async function muatWa(paksa) {
  const segar = (k, ms) => S.cache[k] && Date.now() - S.cache[k].t < ms;
  const tugas = [];
  if (paksa || !segar('walog', 30e3)) tugas.push(api('wa.log', {}).then((r) => { S.cache.walog = { t: Date.now(), d: r.data }; }));
  if (paksa || !segar('wast', 15e3)) tugas.push(api('wa.status', {}).then((r) => { S.cache.wast = { t: Date.now(), d: r.data }; S.ringkas.waAntri = r.data.antri; S.ringkas.waGagal = r.data.gagal; perbaruiNotif(); }));
  await Promise.all(tugas);
}
R.wa = async function (el, p) {
  if (p && p.tab) { S.wa.tab = p.tab; S.params = {}; }
  const awal = !S.cache.walog;
  el.innerHTML = `<div class="ph"><div><h2>Pesan &amp; WA Blast Nasabah</h2><p>Komunikasi resmi ke nasabah dan pengingat ke RM — antrean bertahap dengan jeda antar pesan untuk melindungi nomor pengirim.</p></div>
    <div class="tools" id="wa-st"></div></div><div id="wa-body">${awal ? `<div class="g g12"><div class="card c4">${skel(8)}</div><div class="card c8">${skel(10)}</div></div>` : ''}</div>`;
  try { await muatWa(false); } catch (e) { $('#wa-body').innerHTML = kosong('error', 'Gagal memuat pesan WA', e.message); return; }
  if (!el.isConnected || S.route !== 'wa') return;
  gambarWa(el);
  clearInterval(POLL_WA);
  POLL_WA = setInterval(async () => {
    if (S.route !== 'wa' || document.hidden) return;
    if (Date.now() - S.aktifTerakhir > 120e3 && (POLL_WA_N = (POLL_WA_N + 1) % 3)) return; // pengguna diam → tiap 45 dtk
    const st = S.cache.wast && S.cache.wast.d;
    if (!st || (!st.antri && !(st.blast || []).some((b) => b.status === 'Berjalan'))) return;
    try { await muatWa(true); if (S.route === 'wa') gambarWa(el, true); } catch (e) { }
  }, 15000);
};
function gambarWa(el, diam) {
  const st = S.cache.wast.d, log = S.cache.walog.d.filter((w) => S.cab === '*' || (S.pIdx[w.id_fasilitas] || {}).kode_cabang === S.cab);
  $('#wa-st').innerHTML = `<span class="chip" data-tip="Pesan terkirim hari ini / batas harian">${ic('sim_card_download', 's18 info')}Kuota <b>${n0(st.terpakaiHariIni)}</b>/${n0(st.kuota)}</span>
    <span class="chip">${ic('mark_email_read', 's18 ok')}Sukses <b class="ok">${pct(st.suksesPersen)}</b></span>
    <span class="chip">${ic('hourglass_top', 's18 info')}Antrean <b class="info">${n0(st.antri)}</b></span>
    ${st.gagal ? `<button class="chip" id="wa-retry" style="cursor:pointer">${ic('refresh', 's18 bad')}Gagal <b class="bad">${n0(st.gagal)}</b> • coba ulang</button>` : ''}
    <button class="btn btn-p" id="wa-blast">${ic('campaign', 's18')}Blast Baru</button>`;
  const grup = {};
  log.forEach((w) => { const k = w.id_fasilitas || w.penerima; (grup[k] = grup[k] || []).push(w); });
  const kunci = Object.keys(grup).filter((k) => {
    const g = grup[k];
    if (S.wa.tab === 'blast' && !g.some((w) => w.jenis === 'Blast')) return false;
    if (S.wa.tab === 'pengingat' && !g.some((w) => w.jenis === 'Pengingat')) return false;
    if (S.wa.tab === 'gagal') { if (!g.some((w) => w.status === 'Gagal' || w.status === 'Dilewati')) return false; }
    else if (!g.some((w) => w.status !== 'Dilewati')) return false; // nasabah yang hanya dilewati (tanpa persetujuan / nomor invalid) tidak memenuhi daftar
    const r = S.pIdx[k], q = S.wa.q.toLowerCase();
    return !q || ((r ? r._q : '') + ' ' + (g[0].nama_penerima || '')).toLowerCase().includes(q);
  });
  const baru = S.wa.q.length >= 2 ? P().filter((r) => !grup[r.id_fasilitas] && r._q.includes(S.wa.q.toLowerCase())).slice(0, 8) : [];
  if (!S.wa.sel || !grup[S.wa.sel] && !S.pIdx[S.wa.sel]) S.wa.sel = kunci[0] || '';
  const sel = S.wa.sel, r = S.pIdx[sel], pesan = (grup[sel] || []).slice().reverse();
  const tplOpsi = S.tplWA.filter((t) => t.status_aktif && t.jenis !== 'Pengingat');
  const qInp = $('#wa-q'), fokus = qInp && document.activeElement === qInp, pos = fokus ? qInp.selectionStart : 0;
  $('#wa-body').innerHTML = `<div class="wa-grid">
    <aside class="card p0" style="overflow:hidden"><div style="padding:14px" class="col"><label class="search" style="max-width:none"><span class="ms">search</span><input id="wa-q" class="inp" placeholder="Cari percakapan / nasabah…" value="${esc(S.wa.q)}"></label>
      <div class="seg mt12" style="overflow-x:auto">${[['semua', 'Semua'], ['blast', 'Blast'], ['pengingat', 'Pengingat RM'], ['gagal', 'Gagal / Dilewati']].map(([k, l]) => `<button data-wt="${k}" class="${S.wa.tab === k ? 'on' : ''}">${l}</button>`).join('')}</div></div>
      <div class="cv-list">${kunci.map((k) => { const g = grup[k], w = g[0], rr = S.pIdx[k], gagal = g.some((x) => x.status === 'Gagal'), s = STATUS_WA[w.status] || STATUS_WA.Antri;
        return `<button class="cv${k === sel ? ' on' : ''}" data-cv="${esc(k)}"><span class="mono-av" style="--c:${rr ? warnaMono(rr) : 'var(--accent-tx)'}">${esc(ini(rr ? rr.nama_nasabah : w.nama_penerima))}</span>
          <span class="sp trunc"><span class="row"><span class="nm trunc">${esc(rr ? rr.nama_nasabah : w.nama_penerima)}</span><span class="sp"></span><span class="fs11 dim nowrap">${esc(relatif(w.waktu))}</span></span>
          <span class="fs11 acc b trunc" style="display:block">${w.jenis === 'Pengingat' ? 'Pengingat → RM ' + esc(w.nama_penerima) : esc(w.penerima)}</span>
          <span class="row"><span class="pv trunc">${esc((w.isi || w.respon || '').replace(/\s+/g, ' '))}</span><span class="sp"></span><span class="${gagal ? 'bad' : s[2]}">${ic(gagal ? 'error' : s[0], 's16')}</span></span></span></button>`; }).join('')}
        ${baru.length ? `<div class="pop-h">Mulai percakapan baru</div>${baru.map((x) => `<button class="cv" data-cv="${esc(x.id_fasilitas)}"><span class="mono-av">${esc(ini(x.nama_nasabah))}</span><span class="sp trunc"><span class="nm trunc" style="display:block">${esc(x.nama_nasabah)}</span><span class="pv">${esc(x.no_rekening)} • ${x.wa_consent === 'Ya' ? 'WA disetujui' : 'tanpa persetujuan WA'}</span></span></button>`).join('')}` : ''}
        ${!kunci.length && !baru.length ? kosong('forum', 'Belum ada percakapan', 'Ketik nama nasabah di kolom cari untuk memulai.') : ''}</div></aside>
    <section class="card p0" style="overflow:hidden;display:flex;flex-direction:column">${r || grup[sel] ? `
      <div class="row wrap g12" style="padding:16px 20px;border-bottom:1px solid var(--line)"><span class="mono-av" style="width:44px;height:44px;--c:${r ? warnaMono(r) : 'var(--accent-tx)'}">${esc(ini(r ? r.nama_nasabah : ''))}</span>
        <div class="sp trunc" style="min-width:min(200px,100%)"><b class="fs16">${esc(r ? r.nama_nasabah : (grup[sel][0].nama_penerima || sel))}</b><div class="row wrap fs12 muted">${r ? esc(r.no_wa_nasabah || 'nomor kosong') + ' • ' + esc(r.no_rekening) : ''}${r ? (r.wa_consent === 'Ya' ? '<span class="bdg ok lc">WA consent: Ya</span>' : '<span class="bdg mut lc">Tanpa persetujuan / opt-out</span>') : ''}${r && r.status_wa ? `<span class="bdg ${r.status_wa === 'Terdaftar' ? 'info' : 'bad'} lc">${esc(r.status_wa)}</span>` : ''}</div></div>
        ${r ? `<button class="btn btn-sm btn-g" data-go="detail" data-p='${esc(JSON.stringify({ id: r.id_fasilitas }))}'>${ic('person', 's16')}Detail</button>${r.wa_consent === 'Ya' ? `<button class="btn btn-sm btn-g" id="wa-opt" data-tip="Nasabah menolak menerima WA">${ic('block', 's16')}Tandai opt-out</button>` : ''}` : ''}</div>
      <div class="stream" id="wa-stream">${pesan.length ? (() => { let hari = ''; return pesan.map((w) => { const h = String(w.waktu).slice(0, 10); const pemisah = h !== hari ? `<span class="day">${h === iso(new Date()) ? 'Hari ini' : tgl(h)}</span>` : ''; hari = h; return pemisah + htmlBubble(w); }).join(''); })() : kosong('chat_bubble', 'Belum ada pesan', 'Kirim pesan pertama di bawah.')}</div>
      ${r ? `<div class="cmp"><div class="row wrap"><span class="fs11 b muted">VARIABEL</span>${VAR_WA.slice(0, 6).map((k) => `<button class="vchip" data-var="${k}">{{${k}}}</button>`).join('')}<span class="sp"></span>
        <select class="sel sm" style="width:auto" id="wa-tpl" aria-label="Pola pesan"><option value="">Pola pesan…</option>${tplOpsi.map((t) => `<option value="${esc(t.id_template)}">${esc(t.nama)}</option>`).join('')}</select></div>
        <div class="cmp-in"><textarea id="wa-ta" rows="2" placeholder="${r.wa_consent === 'Ya' ? 'Ketik pesan resmi WhatsApp ke ' + esc(r.nama_nasabah) + '…' : 'Nasabah belum menyetujui menerima WA'}" ${r.wa_consent === 'Ya' && r.wa_valid ? '' : 'disabled'}></textarea>
          <button class="btn btn-p" id="wa-send" style="width:44px;padding:0;border-radius:12px" aria-label="Kirim" ${r.wa_consent === 'Ya' && r.wa_valid ? '' : 'disabled'}>${ic('send')}</button></div></div>` : ''}`
      : kosong('forum', 'Pilih percakapan', 'Atau mulai Blast Baru ke segmen nasabah.')}</section></div>
    ${(st.blast || []).length ? `<div class="card sec"><div class="card-h"><div><h3 class="card-t">Riwayat Blast</h3><p class="card-s">Status per kampanye</p></div></div><div class="col" style="gap:10px">${st.blast.slice(0, 8).map((b) => { const sel2 = b.terkirim + b.gagal, prs = b.total ? sel2 / b.total * 100 : 0; return `<div class="inner"><div class="row wrap"><b>${esc(b.judul)}</b><span class="bdg ${b.status === 'Selesai' ? 'ok' : b.status === 'Berjalan' ? 'info' : 'mut'} lc">${esc(b.status)}</span><span class="fs12 muted">${tglJam(b.waktu)} • ${esc(namaRm(b.dibuat_oleh))}</span><span class="sp"></span>
      ${b.gagal ? `<button class="btn btn-sm btn-g" data-bulang="${esc(b.id_blast)}">${ic('refresh')}Coba ulang ${b.gagal}</button>` : ''}${b.status === 'Berjalan' ? `<button class="btn btn-sm btn-d" data-bbatal="${esc(b.id_blast)}">${ic('stop_circle')}Hentikan</button>` : ''}</div>
      <div class="bar thin mt8"><i style="width:${prs}%"></i></div><div class="row fs12 muted mt4"><span>${b.terkirim} terkirim • ${b.gagal} gagal • ${b.dilewati} dilewati</span><span class="sp"></span><span>${n0(sel2)}/${n0(b.total)}</span></div></div>`; }).join('')}</div></div>` : ''}`;
  const aktifBlast = (st.blast || []).find((b) => b.status === 'Berjalan');
  let qb = $('#qbox');
  if (st.antri && S.route === 'wa' && S.wa.qx !== st.antri) {
    if (!qb) { qb = document.createElement('div'); qb.id = 'qbox'; qb.className = 'qbox'; $('#wa-body').prepend(qb); }
    const prs = aktifBlast && aktifBlast.total ? (aktifBlast.terkirim + aktifBlast.gagal) / aktifBlast.total * 100 : 0;
    qb.innerHTML = `<div class="row g12"><span class="ping"></span><div class="sp"><b>Antrean pengiriman: ${n0(st.antri)} pesan</b><div class="fs12 muted">Jeda ${esc(S.set.WA_JEDA || '3-8')} detik antar pesan • ${esc(st.status || 'menunggu putaran berikutnya')}</div></div><button class="btn-ic sm" aria-label="Sembunyikan" id="qb-x">${ic('close', 's18')}</button></div>
      ${aktifBlast ? `<div class="bar thin mt12"><i style="width:${prs}%"></i></div><div class="row fs12 muted mt4"><span class="trunc">${esc(aktifBlast.judul)}</span><span class="sp"></span><b class="num" style="color:var(--tx)">${pct(prs, 0)}</b></div>` : ''}
      ${!st.adaToken ? `<div class="note bad mt8 fs12">${ic('key_off')}Token Fonnte belum diisi — antrean tertahan.</div>` : ''}`;
    $('#qb-x').onclick = () => { S.wa.qx = st.antri; qb.remove(); };
  } else if (qb) qb.remove();
  const stream = $('#wa-stream'); if (stream) stream.scrollTop = stream.scrollHeight;
  if (fokus) { const q = $('#wa-q'); q.focus(); q.setSelectionRange(pos, pos); }
  if (diam) return;
  pasangWa(el);
}
function pasangWa(el) {
  el.onclick = async (e) => {
    const t = e.target;
    const cv = t.closest('[data-cv]'); if (cv) { S.wa.sel = cv.dataset.cv; gambarWa(el); return; }
    const wt = t.closest('[data-wt]'); if (wt) { S.wa.tab = wt.dataset.wt; S.wa.sel = ''; gambarWa(el); return; }
    const v = t.closest('[data-var]'); if (v && $('#wa-ta')) { const ta = $('#wa-ta'), s = ta.selectionStart || ta.value.length; ta.value = ta.value.slice(0, s) + '{{' + v.dataset.var + '}}' + ta.value.slice(s); ta.focus(); return; }
    if (t.closest('#wa-blast')) return bukaBlast();
    if (t.closest('#wa-retry')) { try { const r = await api('wa.ulang', { semua: true }); toast('Coba ulang', r.message, 'ok'); await muatWa(true); gambarWa(el); } catch (err) { gagalToast(err); } return; }
    const bu = t.closest('[data-bulang]'); if (bu) { try { const r = await api('wa.ulang', { id_blast: bu.dataset.bulang }); toast('Coba ulang', r.message, 'ok'); await muatWa(true); gambarWa(el); } catch (err) { gagalToast(err); } return; }
    const bb = t.closest('[data-bbatal]'); if (bb) { if (!(await konfirmasi({ judul: 'Hentikan blast?', pesan: 'Pesan yang masih dalam antrean akan dibatalkan. Pesan yang sudah terkirim tidak terpengaruh.', bahaya: true, ok: 'Hentikan' }))) return; try { const r = await api('wa.batal', { id_blast: bb.dataset.bbatal }); toast('Blast dihentikan', r.message, 'ok'); await muatWa(true); gambarWa(el); } catch (err) { gagalToast(err); } return; }
    if (t.closest('#wa-opt')) { const r = S.pIdx[S.wa.sel]; if (!(await konfirmasi({ judul: 'Tandai opt-out?', pesan: '<b>' + esc(r.nama_nasabah) + '</b> tidak akan menerima WA blast/manual lagi. Pesan dalam antrean untuk nasabah ini dibatalkan otomatis.', bahaya: true, ok: 'Tandai opt-out' }))) return; try { await api('nasabah.consent', { id: r.id_fasilitas, consent: 'Tidak' }); r.wa_consent = 'Tidak'; toast('Opt-out dicatat', r.nama_nasabah, 'ok'); gambarWa(el); } catch (err) { gagalToast(err); } return; }
    if (t.closest('#wa-send')) {
      const ta = $('#wa-ta'), r = S.pIdx[S.wa.sel]; if (!ta.value.trim()) return;
      const isi = ta.value, sementara = { id_log: 'tmp' + Date.now(), waktu: iso(new Date()) + ' ' + new Date().toTimeString().slice(0, 8), jenis: 'Manual', isi: isiTpl(isi, varWaKlien(r)), status: 'Antri', id_fasilitas: r.id_fasilitas, penerima: r.no_wa_nasabah, nama_penerima: r.nama_nasabah };
      S.cache.walog.d.unshift(sementara); ta.value = ''; gambarWa(el); // optimistic
      try { const res = await api('wa.kirim', { id_fasilitas: r.id_fasilitas, isi }); Object.assign(sementara, res.data); S.cache.wast.d.antri++; gambarWa(el); }
      catch (err) { sementara.status = 'Gagal'; sementara.respon = err.message; gambarWa(el); gagalToast(err); }
    }
  };
  el.onchange = (e) => { if (e.target.id === 'wa-tpl' && e.target.value) { const t = S.tplWA.find((x) => x.id_template === e.target.value); const ta = $('#wa-ta'); if (t && ta && !ta.disabled) { ta.value = t.isi_pesan; ta.focus(); } e.target.value = ''; } };
  el.oninput = deb((e) => { if (e.target.id === 'wa-q') { S.wa.q = e.target.value; gambarWa(el); } }, 150);
  el.onkeydown = (e) => { if (e.target.id === 'wa-ta' && e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); $('#wa-send').click(); } };
}

// ── Wizard Blast (3 langkah, konfirmasi dua langkah) ──
function bukaBlast() {
  const W = { step: 1, mode: 'cabang', cabang: isPim() ? S.me.kode_cabang : (S.cab !== '*' ? S.cab : ''), rm: '', kol: ['1'], jt: '90', aktif: true, tpl: '', hitung: null, judul: '' };
  const tpls = S.tplWA.filter((t) => t.status_aktif && t.jenis !== 'Pengingat');
  const idsFilter = filterNasabah().map((r) => r.id_fasilitas);
  const m = modal({ judul: 'Buat WhatsApp Blast', sub: 'Pengiriman bertahap ke segmen nasabah yang sudah memberi persetujuan', ikon: 'campaign', lebar: 'xl', isi: '<div id="bw"></div>', kaki: '<div id="bw-f" class="row" style="width:100%"></div>', kunci: true });
  const segmen = () => {
    const s = { hanyaAktif: W.aktif };
    if (W.mode === 'cabang' && W.cabang) s.cabang = W.cabang;
    if (W.mode === 'rm') s.rm = W.rm;
    if (W.mode === 'kol') s.kol = W.kol.join(',');
    if (W.mode === 'jt') s.jtHari = W.jt;
    if (W.mode === 'filter') s.ids = idsFilter;
    return s;
  };
  const gambar = () => {
    const st = [['Pilih sasaran', 'Segmentasi portofolio'], ['Pilih template', 'Variabel personalisasi'], ['Pratinjau & kirim', 'Konfirmasi dua langkah']];
    let isi = `<div class="stepper" style="--n:3">${st.map((x, i) => `<div class="stp ${W.step === i + 1 ? 'on' : W.step > i + 1 ? 'ok' : ''}"><em>${W.step > i + 1 ? '✓' : i + 1}</em><div><b>${x[0]}</b><small>${x[1]}</small></div></div>`).join('')}</div>`;
    if (W.step === 1) {
      const opsi = [['cabang', 'account_balance', 'Per cabang', isPim() ? esc(S.me.nama_cabang) : `<select class="sel sm mt8" data-w="cabang"><option value="">Semua cabang</option>${S.cabang.map((c) => `<option value="${esc(c.kode)}"${W.cabang === c.kode ? ' selected' : ''}>${esc(c.nama)}</option>`).join('')}</select>`],
        ['rm', 'badge', 'Per RM', `<select class="sel sm mt8" data-w="rm"><option value="">Pilih RM…</option>${uniq(P().map((r) => r.email_rm)).map((e) => `<option value="${esc(e)}"${W.rm === e ? ' selected' : ''}>${esc(namaRm(e))}</option>`).join('')}</select>`],
        ['kol', 'gpp_maybe', 'Per kolektibilitas', `<div class="row wrap mt8">${[1, 2, 3, 4, 5].map((k) => `<label class="chk"><input type="checkbox" data-wk="${k}" ${W.kol.includes(String(k)) ? 'checked' : ''}>Kol ${k}</label>`).join('')}</div>`],
        ['jt', 'event_repeat', 'Jatuh tempo dekat', `<select class="sel sm mt8" data-w="jt">${[30, 60, 90, 180].map((d) => `<option value="${d}"${W.jt === String(d) ? ' selected' : ''}>≤ ${d} hari</option>`).join('')}</select>`],
        ['filter', 'filter_alt', 'Hasil filter Nasabah', `<div class="fs12 muted mt8">${n0(idsFilter.length)} fasilitas dari filter halaman Nasabah saat ini</div>`]];
      isi += `<div class="g g3">${opsi.map(([k, i, l, x]) => `<div class="opt${W.mode === k ? ' on' : ''}" data-mode="${k}" role="radio" aria-checked="${W.mode === k}" tabindex="0"><div class="row">${ic(i, 'acc')}<b>${l}</b><span class="sp"></span><input type="radio" name="bm" ${W.mode === k ? 'checked' : ''} tabindex="-1"></div>${x}</div>`).join('')}</div>
        <label class="chk mt16"><input type="checkbox" data-wa-aktif ${W.aktif ? 'checked' : ''}>Hanya fasilitas berstatus aktif</label>
        <div class="note mt16">${ic('shield')}<div><b>Perlindungan otomatis</b><div class="mt4">Hanya nasabah dengan <b>wa_consent = Ya</b> dan nomor valid yang dikirimi. Opt-out, nomor ganda, dan nomor tidak terdaftar dilewati serta dicatat. Pengiriman dibatasi ${esc(S.set.WA_BATCH || 20)} pesan/menit dengan jeda acak ${esc(S.set.WA_JEDA || '3-8')} detik.</div></div></div>`;
    } else if (W.step === 2) {
      const h = W.hitung;
      isi += `<div class="g g12"><div class="c5"><div class="inner"><div class="fs11 b muted" style="letter-spacing:.06em">HASIL SEGMEN</div><div class="row mt8"><span class="kpi-v">${n0(h.layak)}</span><span class="muted">penerima layak</span></div>
        <div class="fs13 muted">${n0(h.total)} fasilitas di segmen • ${n0(h.dilewati)} dilewati</div>${Object.keys(h.alasan || {}).map((k) => `<div class="row fs12 mt4"><span class="muted">${esc(k)}</span><span class="sp"></span><b>${h.alasan[k]}</b></div>`).join('')}</div>
        <div class="fld mt16"><label for="bw-judul">Judul kampanye</label><input id="bw-judul" class="inp" value="${esc(W.judul)}" placeholder="Contoh: Pemberitahuan JT November"></div></div>
        <div class="c7"><div class="fld"><label>Template pesan</label><div class="col" style="gap:8px">${tpls.map((t) => `<div class="opt${W.tpl === t.id_template ? ' on' : ''}" data-tpl="${esc(t.id_template)}"><div class="row"><b>${esc(t.nama)}</b><span class="sp"></span><span class="bdg mut lc">${esc(t.jenis)}</span></div><div class="fs12 muted" style="white-space:pre-wrap;max-height:60px;overflow:hidden">${esc(t.isi_pesan)}</div></div>`).join('') || kosong('sms', 'Belum ada template', 'Admin dapat menambahkan di Pengaturan → Template WA.')}</div></div></div></div>`;
    } else {
      const h = W.hitung;
      isi += `<div class="g g12"><div class="c6"><div class="fs11 b muted mb8" style="letter-spacing:.06em">PRATINJAU (CONTOH: ${esc(h.contoh ? h.contoh.nama : '-')})</div><div class="stream" style="min-height:0;padding:16px;border-radius:12px"><div class="bub">${esc(h.contoh ? h.contoh.isi : '')}</div></div></div>
        <div class="c6"><div class="inner"><div class="row"><b class="fs16">${esc(W.judul || (tpls.find((t) => t.id_template === W.tpl) || {}).nama || 'Blast')}</b></div>
          <div class="kv mt12"><span class="muted">Penerima</span><b class="num">${n0(h.layak)} nasabah</b></div><div class="kv"><span class="muted">Dilewati & dicatat</span><b class="num">${n0(h.dilewati)}</b></div>
          <div class="kv"><span class="muted">Perkiraan selesai</span><b>± ${Math.max(1, Math.ceil(h.layak / (Number(S.set.WA_BATCH) || 20)))} menit</b></div></div>
          <div class="note warn mt12">${ic('warning')}<div><b>Anda akan mengirim ke ${n0(h.layak)} nasabah.</b><div class="mt4">Pesan yang sudah terkirim tidak dapat ditarik kembali.</div><label class="chk mt8"><input type="checkbox" id="bw-ok">Saya memahami dan sudah memeriksa isi pesan</label></div></div></div></div>`;
    }
    $('#bw', m.el).innerHTML = isi;
    $('#bw-f', m.el).innerHTML = `${W.step > 1 ? `<button class="btn btn-g" data-bw="back">${ic('arrow_back', 's18')}Kembali</button>` : '<button class="btn btn-g" data-bw="batal">Batal</button>'}<span class="sp"></span>
      ${W.step < 3 ? `<button class="btn btn-p" data-bw="next">${W.step === 1 ? 'Hitung penerima' : 'Lanjut ke pratinjau'}${ic('arrow_forward', 's18')}</button>` : `<button class="btn btn-p" data-bw="kirim" disabled>${ic('send', 's18')}Kirim ke ${n0(W.hitung.layak)} nasabah</button>`}`;
    const ok = $('#bw-ok', m.el); if (ok) ok.onchange = () => { $('[data-bw="kirim"]', m.el).disabled = !ok.checked; };
  };
  m.el.addEventListener('click', async (e) => {
    const t = e.target;
    const md = t.closest('[data-mode]'); if (md && !t.closest('select,input')) { W.mode = md.dataset.mode; gambar(); return; }
    const tp = t.closest('[data-tpl]'); if (tp) { W.tpl = tp.dataset.tpl; W.judul = ($('#bw-judul', m.el) || {}).value || W.judul; gambar(); return; }
    const b = t.closest('[data-bw]'); if (!b) return;
    if (b.dataset.bw === 'batal') return m.tutup();
    if (b.dataset.bw === 'back') { W.step--; gambar(); return; }
    if (b.dataset.bw === 'next') {
      if (W.step === 1) {
        if (W.mode === 'rm' && !W.rm) return toast('Pilih RM', '', 'warn');
        if (W.mode === 'kol' && !W.kol.length) return toast('Pilih kolektibilitas', '', 'warn');
        if (W.mode === 'filter' && !idsFilter.length) return toast('Filter kosong', 'Atur filter di halaman Nasabah terlebih dahulu.', 'warn');
        tombolMuat(b, true, 'Menghitung…');
        try { W.hitung = (await api('wa.blastHitung', { segmen: segmen() })).data; W.step = 2; gambar(); } catch (err) { gagalToast(err); tombolMuat(b, false); }
      } else {
        W.judul = ($('#bw-judul', m.el) || {}).value || '';
        if (!W.tpl) return toast('Pilih template', '', 'warn');
        if (!W.hitung.layak) return toast('Tidak ada penerima layak', 'Ubah segmen pada langkah 1.', 'warn');
        tombolMuat(b, true, 'Menyiapkan pratinjau…');
        try { W.hitung = (await api('wa.blastHitung', { segmen: segmen(), id_template: W.tpl })).data; W.step = 3; gambar(); } catch (err) { gagalToast(err); tombolMuat(b, false); }
      }
      return;
    }
    if (b.dataset.bw === 'kirim') {
      tombolMuat(b, true, 'Mengantrekan…');
      try {
        const r = await api('wa.blast', { segmen: segmen(), id_template: W.tpl, judul: W.judul, konfirmasi: W.hitung.layak });
        toast('Blast dijadwalkan', r.message, 'ok', { lama: 6000 }); m.tutup(); delete S.cache.walog; delete S.cache.wast; if (S.route === 'wa') render('wa', true); else go('wa');
      } catch (err) {
        tombolMuat(b, false);
        if (err.code === 'RECOUNT') { toast('Jumlah penerima berubah', err.message, 'warn'); W.step = 2; W.hitung = (await api('wa.blastHitung', { segmen: segmen(), id_template: W.tpl })).data; gambar(); } else gagalToast(err);
      }
    }
  });
  m.el.addEventListener('change', (e) => {
    const t = e.target;
    if (t.dataset.w) { W[t.dataset.w] = t.value; W.mode = t.dataset.w === 'cabang' ? 'cabang' : t.dataset.w; gambar(); }
    if (t.dataset.wk) { W.kol = $$('[data-wk]', m.el).filter((x) => x.checked).map((x) => x.dataset.wk); W.mode = 'kol'; }
    if (t.hasAttribute('data-wa-aktif')) W.aktif = t.checked;
  });
  gambar();
}

// ── Pengingat jatuh tempo ──
S.png = { win: '180', st: '', q: '', tab: 'jadwal' };
R.pengingat = async function (el, p) {
  if (p && p.st) { S.png.st = p.st; S.params = {}; }
  const bulan = Number(S.set.PENGINGAT_BULAN) || 3, catchup = Number(S.set.PENGINGAT_CATCHUP_HARI) || 30;
  el.innerHTML = `<div class="ph"><div><h2>Pengingat Jatuh Tempo</h2><p>Setiap hari pukul 08.00 WIB sistem mengirim WA ke RM pengelola untuk fasilitas yang jatuh tempo <b>${bulan} bulan lagi</b>. Dikirim sekali per jatuh tempo dan berhenti otomatis bila kredit lunas.</p></div>
    <div class="tools">${isAdm() ? `<button class="btn btn-g" id="pg-run">${ic('play_circle', 's18')}Jalankan sekarang</button>` : ''}</div></div><div id="pg-body">${skel(8)}</div>`;
  let log = S.cache.pnglog && Date.now() - S.cache.pnglog.t < 60e3 ? S.cache.pnglog.d : null;
  if (!log) { try { log = (await api('pengingat.log', {})).data; S.cache.pnglog = { t: Date.now(), d: log }; } catch (e) { $('#pg-body').innerHTML = kosong('error', 'Gagal memuat log pengingat', e.message); return; } }
  if (!el.isConnected || S.route !== 'pengingat') return;
  const peta = {}; log.forEach((x) => { const k = x.id_fasilitas + '|' + x.tgl_jatuh_tempo; if (!peta[k]) peta[k] = x; });
  const kini = hariIni();
  const statusP = (r) => {
    const x = peta[r.id_fasilitas + '|' + r.tgl_jatuh_tempo], jd = tambahBulan(parseT(r.tgl_jatuh_tempo), -bulan);
    if (x) return { k: x.status, l: x.status + (x.tgl_kirim ? ' ' + tgl(String(x.tgl_kirim).slice(0, 10)) : ''), c: x.status === 'Terkirim' ? 'ok' : x.status === 'Gagal' ? 'bad' : x.status === 'Antri' ? 'info' : 'mut', ket: x.keterangan, jd };
    if (r.pengingat_aktif !== 'Ya') return { k: 'Nonaktif', l: 'Nonaktif', c: 'mut', jd };
    if (kini < jd) return { k: 'Terjadwal', l: 'Terjadwal ' + tgl(jd), c: 'acc', jd };
    if ((kini - jd) / 864e5 <= catchup) return { k: 'Menunggu', l: 'Menunggu putaran 08.00', c: 'warn', jd };
    return { k: 'Terlewat', l: 'Di luar jendela catch-up', c: 'mut', jd };
  };
  const rows = P().filter((r) => aktif(r) && r._h !== null && r._h >= 0 && r._h <= +S.png.win).map((r) => Object.assign({ r }, { s: statusP(r) })).sort((a, b) => a.r._h - b.r._h);
  const bulanIni = iso(kini).slice(0, 7);
  const terjadwal30 = rows.filter((x) => x.s.k === 'Terjadwal' && (x.s.jd - kini) / 864e5 <= 30).length;
  const gagal = log.filter((x) => x.status === 'Gagal' && S.pIdx[x.id_fasilitas] && (S.cab === '*' || S.pIdx[x.id_fasilitas].kode_cabang === S.cab)).length;
  $('#pg-body').innerHTML = `<div class="g g4">
      ${kpiCard({ l: 'Terjadwal 30 hari ke depan', i: 'schedule_send', w: 'info', v: n0(terjadwal30), d: 'pengingat akan dikirim ke RM', dc: 'info' })}
      ${kpiCard({ l: 'Terkirim bulan ini', i: 'mark_chat_read', w: 'ok', v: n0(log.filter((x) => x.status === 'Terkirim' && String(x.tgl_kirim).slice(0, 7) === bulanIni).length), d: labelPeriode(bulanIni), dc: 'ok' })}
      ${kpiCard({ l: 'Gagal / perlu tindakan', i: 'error', w: gagal ? 'bad' : 'ok', v: n0(gagal), d: gagal ? 'Perbaiki nomor WA RM lalu kirim ulang' : 'Tidak ada kegagalan', dc: gagal ? 'bad' : 'ok' })}
      ${kpiCard({ l: 'Pengingat dinonaktifkan', i: 'notifications_off', v: n0(rows.filter((x) => x.r.pengingat_aktif !== 'Ya').length), d: 'dalam jendela ' + S.png.win + ' hari', dc: 'muted' })}</div>
    ${isAdm() ? `<div class="card sec"><div class="card-h wrap"><div><h3 class="card-t">Pengaturan pengingat (global)</h3><p class="card-s">Trigger harian 08.00 WIB • catch-up otomatis bila trigger sempat gagal</p></div>
      <label class="sw"><input type="checkbox" id="pg-on" ${/^ya$/i.test(S.set.PENGINGAT_AKTIF) ? 'checked' : ''}><span class="tr"></span><span class="fs13 b">Pengingat aktif</span></label></div>
      <div class="g g4">${fieldHtml({ k: 'PENGINGAT_BULAN', l: 'Kirim H-… bulan', t: 'number' }, S.set.PENGINGAT_BULAN)}${fieldHtml({ k: 'PENGINGAT_CATCHUP_HARI', l: 'Batas catch-up (hari)', t: 'number' }, S.set.PENGINGAT_CATCHUP_HARI)}
      ${fieldHtml({ k: 'PENGINGAT_TEMPLATE', l: 'Template pesan ke RM', t: 'select', opsi: S.tplWA.filter((t) => t.jenis === 'Pengingat').map((t) => ({ v: t.id_template, l: t.nama })) }, S.set.PENGINGAT_TEMPLATE)}
      <div class="fld"><label>&nbsp;</label><button class="btn btn-p" id="pg-sv">${ic('save', 's18')}Simpan</button></div></div></div>` : ''}
    <div class="card p0 sec" style="overflow:hidden"><div class="row wrap g12" style="padding:16px 20px"><div class="tabs" style="margin:0;border:0">${[['jadwal', 'Jadwal & status'], ['riwayat', 'Riwayat kirim']].map(([k, l]) => `<button class="tab${S.png.tab === k ? ' on' : ''}" data-pt="${k}">${l}</button>`).join('')}</div><span class="sp"></span>
      ${S.png.tab === 'jadwal' ? `<label class="fsel"><span>Jatuh tempo ≤</span><select id="pg-win">${[['90', '3 bulan'], ['180', '6 bulan'], ['365', '12 bulan']].map(([v, l]) => `<option value="${v}"${S.png.win === v ? ' selected' : ''}>${l}</option>`).join('')}</select></label>
      <label class="fsel"><span>Status:</span><select id="pg-st"><option value="">Semua</option>${['Terjadwal', 'Menunggu', 'Antri', 'Terkirim', 'Gagal', 'Dibatalkan', 'Nonaktif', 'Terlewat'].map((s) => `<option${S.png.st === s ? ' selected' : ''}>${s}</option>`).join('')}</select></label>` : ''}</div>
      <div id="pg-tab"></div></div>`;
  const tab = $('#pg-tab');
  if (S.png.tab === 'jadwal') {
    const r2 = rows.filter((x) => !S.png.st || x.s.k === S.png.st);
    tab.innerHTML = `<div class="tbl-wrap resp"><table class="tbl tbl-resp"><thead><tr><th>Nasabah</th><th>RM pengelola</th><th>Jatuh tempo</th><th>Jadwal pengingat</th><th>Status</th><th class="center">Aktif</th>${bolehWA() ? '<th></th>' : ''}</tr></thead><tbody>
      ${r2.map(({ r, s }) => `<tr><td class="first" data-l="Nasabah"><a href="javascript:void(0)" data-go="detail" data-p='${esc(JSON.stringify({ id: r.id_fasilitas }))}' class="b">${esc(r.nama_nasabah)}</a><span class="sub mono">${esc(r.no_rekening)}</span></td>
        <td data-l="RM">${esc(namaRm(r.email_rm))}${!(S.uIdx[r.email_rm] || {}).no_wa_rm ? '<span class="sub bad">Nomor WA RM kosong</span>' : ''}</td>
        <td data-l="Jatuh tempo" class="nowrap"><b>${tgl(r.tgl_jatuh_tempo)}</b><span class="sub ${r._h <= 30 ? 'warn b' : ''}">${r._h} hari lagi</span></td>
        <td data-l="Jadwal" class="nowrap">${tgl(s.jd)}</td><td data-l="Status"><span class="bdg ${s.c} lc" ${s.ket ? `data-tip="${esc(s.ket)}"` : ''}>${esc(s.l)}</span></td>
        <td class="center" data-l="Aktif"><label class="sw"><input type="checkbox" data-sw="${esc(r.id_fasilitas)}" ${r.pengingat_aktif === 'Ya' ? 'checked' : ''} aria-label="Pengingat aktif"><span class="tr"></span></label></td>
        ${bolehWA() ? `<td data-l="Aksi">${['Gagal', 'Terlewat', 'Menunggu', 'Dibatalkan'].includes(s.k) && r.pengingat_aktif === 'Ya' ? `<button class="btn btn-sm btn-g" data-ku="${esc(r.id_fasilitas)}">${ic('send')}Kirim${s.k === 'Gagal' ? ' ulang' : ' sekarang'}</button>` : ''}</td>` : ''}</tr>`).join('') || `<tr><td colspan="7" class="no-l">${kosong('event_available', 'Tidak ada fasilitas pada jendela ini')}</td></tr>`}</tbody></table></div>`;
  } else {
    const r2 = log.filter((x) => S.pIdx[x.id_fasilitas] && (S.cab === '*' || S.pIdx[x.id_fasilitas].kode_cabang === S.cab));
    tab.innerHTML = r2.length ? `<div class="tbl-wrap resp"><table class="tbl tbl-resp"><thead><tr><th>Nasabah</th><th>Jatuh tempo</th><th>RM</th><th>Status</th><th>Waktu kirim</th><th>Keterangan</th></tr></thead><tbody>${r2.slice(0, 300).map((x) => `<tr><td class="first" data-l="Nasabah">${esc(x.nama_nasabah)}</td><td data-l="JT">${tgl(x.tgl_jatuh_tempo)}</td><td data-l="RM">${esc(namaRm(x.email_rm))}</td><td data-l="Status"><span class="bdg ${x.status === 'Terkirim' ? 'ok' : x.status === 'Gagal' ? 'bad' : x.status === 'Antri' ? 'info' : 'mut'} lc">${esc(x.status)}</span></td><td data-l="Kirim">${x.tgl_kirim ? tglJam(x.tgl_kirim) : '—'}</td><td data-l="Ket" class="fs12 muted">${esc(x.keterangan || '')}</td></tr>`).join('')}</tbody></table></div>` : kosong('history', 'Belum ada riwayat pengingat');
  }
  el.onclick = async (e) => {
    const t = e.target;
    const pt = t.closest('[data-pt]'); if (pt) { S.png.tab = pt.dataset.pt; render('pengingat', true); return; }
    const ku = t.closest('[data-ku]'); if (ku) { tombolMuat(ku, true, '…'); try { const r = await api('pengingat.kirimUlang', { id_fasilitas: ku.dataset.ku }); toast('Pengingat diantrekan', r.message, 'ok'); delete S.cache.pnglog; render('pengingat', true); } catch (err) { gagalToast(err); tombolMuat(ku, false); } return; }
    if (t.closest('#pg-run')) { const b = t.closest('#pg-run'); tombolMuat(b, true, 'Menjalankan…'); try { const r = await api('pengingat.jalankan', {}); toast('Pengingat dijalankan', r.message, 'ok', { lama: 6000 }); delete S.cache.pnglog; render('pengingat', true); } catch (err) { gagalToast(err); tombolMuat(b, false); } return; }
    if (t.closest('#pg-sv')) { const b = t.closest('#pg-sv'); tombolMuat(b, true, 'Menyimpan…'); try { const set = { PENGINGAT_AKTIF: $('#pg-on').checked ? 'Ya' : 'Tidak', PENGINGAT_BULAN: $('[name=PENGINGAT_BULAN]').value, PENGINGAT_CATCHUP_HARI: $('[name=PENGINGAT_CATCHUP_HARI]').value, PENGINGAT_TEMPLATE: $('[name=PENGINGAT_TEMPLATE]').value }; const r = await api('setting.simpan', { set }); S.set = r.data; toast('Pengaturan pengingat disimpan', '', 'ok'); render('pengingat', true); } catch (err) { gagalToast(err); tombolMuat(b, false); } }
  };
  el.onchange = (e) => {
    const t = e.target;
    if (t.id === 'pg-win') { S.png.win = t.value; render('pengingat', true); }
    if (t.id === 'pg-st') { S.png.st = t.value; render('pengingat', true); }
    if (t.dataset.sw) togglePengingat(S.pIdx[t.dataset.sw], t.checked, t);
  };
};
// ── Impor & Sinkronisasi Data (Admin) ──
const TARGET_IMPOR = {
  Portofolio_Kredit: { l: 'Portofolio Kredit', i: 'account_balance_wallet', d: 'Upsert per no. rekening / id fasilitas', kol: ['no_rekening', 'nama_nasabah', 'email_rm', 'kode_cabang', 'plafon', 'baki_debet', 'saldo_efektif', 'saldo_blokir', 'tgl_jatuh_tempo', 'kolektibilitas', 'status_kredit', 'no_wa_nasabah', 'wa_consent', 'pengingat_aktif', 'jenis_fasilitas', 'sektor', 'suku_bunga', 'tgl_akad', 'nilai_agunan', 'npwp', 'dpd', 'catatan'] },
  Target_RM: { l: 'Target RM', i: 'flag', d: 'Upsert per email RM + periode + jenis', kol: ['email_rm', 'periode', 'jenis_target', 'target', 'realisasi'] },
  Master_RM_Cabang: { l: 'Master RM & Cabang', i: 'badge', d: 'Upsert per email pengguna', kol: ['email', 'nama', 'peran', 'kode_cabang', 'nama_cabang', 'tim', 'no_wa_rm', 'status_aktif'] }
};
S.imp = { step: 1, target: 'Portofolio_Kredit', sumber: 'file', url: '', sheet: '', file: null, id: '', hasil: null, run: null, prog: 0 };
const tabModeImpor = () => `<div class="tabs" role="tablist" aria-label="Jenis impor"><button class="tab${S.imp.mode !== 'migrasi' ? ' on' : ''}" role="tab" aria-selected="${S.imp.mode !== 'migrasi'}" data-imode="impor">${ic('upload_file', 's18')}Impor file / spreadsheet</button><button class="tab${S.imp.mode === 'migrasi' ? ' on' : ''}" role="tab" aria-selected="${S.imp.mode === 'migrasi'}" data-imode="migrasi">${ic('move_up', 's18')}Migrasi dari aplikasi v1</button></div>`;
function pasangModeImpor(el) { el.querySelectorAll('[data-imode]').forEach((b) => { b.onclick = () => { S.imp.mode = b.dataset.imode; render('impor', true); }; }); }
R.impor = function (el) {
  if (S.imp.mode === 'migrasi') return renderMigrasi(el);
  const I = S.imp, T = TARGET_IMPOR[I.target];
  const st = [['Pilih sumber', 'Spreadsheet / Excel / CSV'], ['Validasi', 'Pencocokan header'], ['Pratinjau', 'Dry-run perubahan'], ['Konfirmasi', 'Simpan & ringkasan']];
  let isi = '';
  if (I.step === 1) {
    isi = `<div class="g g3">${Object.keys(TARGET_IMPOR).map((k) => `<div class="opt${I.target === k ? ' on' : ''}" data-it="${k}" tabindex="0" role="radio" aria-checked="${I.target === k}"><div class="row">${ic(TARGET_IMPOR[k].i, 'acc')}<b>${TARGET_IMPOR[k].l}</b><span class="sp"></span><input type="radio" ${I.target === k ? 'checked' : ''} tabindex="-1"></div><div class="fs12 muted">${TARGET_IMPOR[k].d}</div></div>`).join('')}</div>
      <div class="tabs mt16"><button class="tab${I.sumber === 'file' ? ' on' : ''}" data-is="file">${ic('upload_file', 's18')}Unggah file Excel / CSV</button><button class="tab${I.sumber === 'sheet' ? ' on' : ''}" data-is="sheet">${ic('link', 's18')}Tautan Google Spreadsheet</button></div>
      ${I.sumber === 'file' ? `<label class="drop" id="imp-drop" tabindex="0">${ic('cloud_upload')}<div class="b mt8" style="color:var(--tx)">${I.file ? esc(I.file.name) + ' (' + ukuran(I.file.size) + ')' : 'Tarik & lepas berkas, atau klik untuk memilih'}</div><div class="fs12 mt4">.xlsx, .xls, .csv • baris pertama = header • urutan kolom bebas</div><input type="file" id="imp-f" hidden accept=".xlsx,.xls,.csv"></label>`
        : `<div class="form-g">${fieldHtml({ k: 'imp-url', l: 'Tautan / ID Google Spreadsheet sumber', ph: 'https://docs.google.com/spreadsheets/d/…', full: true, help: 'Hanya DIBACA. Bagikan spreadsheet ke akun pemilik aplikasi.' }, I.url)}${fieldHtml({ k: 'imp-sheet', l: 'Nama sheet (opsional)', ph: 'Kosong = sheet pertama' }, I.sheet)}</div>`}
      <div class="note mt16">${ic('info')}<div><b>Kolom yang dikenali untuk ${esc(T.l)}</b><div class="code-ref mt8">${T.kol.map((k) => `<code>${k}</code>`).join('')}</div><div class="fs12 mt8">Alias umum juga dikenali (mis. <i>Outstanding</i> → baki_debet, <i>Kol</i> → kolektibilitas, <i>Norek</i> → no_rekening). Kolom lain diabaikan.</div>
        <button class="btn btn-sm btn-g mt8" id="imp-tpl">${ic('download')}Unduh template CSV</button></div></div>
      <div class="row mt16"><span class="sp"></span><button class="btn btn-p" id="imp-go">${ic('fact_check', 's18')}Validasi &amp; Pratinjau</button></div>
      ${I.prog ? `<div class="mt12"><div class="bar"><i style="width:${I.prog}%"></i></div><div class="fs12 muted mt4" id="imp-prog-t">Mengunggah data…</div></div>` : ''}`;
  } else if (I.step === 2) {
    const h = I.hasil;
    isi = h.fatal ? `<div class="note bad">${ic('error')}<div><b>Tidak bisa melanjutkan</b><div class="mt4">${esc(h.fatal)}</div></div></div>` : '';
    isi += `<div class="g g2 mt12"><div><div class="fs11 b muted mb8">KOLOM DIKENALI (${Object.keys(h.header).length})</div><div class="tbl-wrap"><table class="tbl"><thead><tr><th>Kolom tujuan</th><th>Kolom di sumber</th></tr></thead><tbody>${Object.keys(h.header).map((k) => `<tr><td class="mono acc">${esc(k)}</td><td>${ic('arrow_back', 's16 dim')} ${esc(h.header[k])}</td></tr>`).join('')}</tbody></table></div></div>
      <div>${h.hilang.length ? `<div class="note warn mb12">${ic('warning')}<div><b>Kolom wajib untuk data BARU tidak ada</b><div class="code-ref mt8">${h.hilang.map((k) => `<code>${k}</code>`).join('')}</div><div class="fs12 mt8">Baris yang sudah ada tetap dapat diperbarui. Baris baru tanpa kolom ini ditandai bermasalah.</div></div></div>` : `<div class="note ok mb12">${ic('check_circle')}<div>Semua kolom wajib ditemukan.</div></div>`}
      ${h.abaikan.length ? `<div class="fs11 b muted mb8">DIABAIKAN (${h.abaikan.length})</div><div class="code-ref">${h.abaikan.map((k) => `<code style="color:var(--tx2)">${esc(k)}</code>`).join('')}</div>` : ''}
      <div class="inner mt12 fs13">Sumber: <b>${esc(I.nama || '')}</b> • ${n0(h.total)} baris data</div></div></div>
      <div class="row mt16"><button class="btn btn-g" data-ib="1">${ic('arrow_back', 's18')}Kembali</button><span class="sp"></span><button class="btn btn-p" data-ib="3" ${h.fatal ? 'disabled' : ''}>Lihat pratinjau perubahan${ic('arrow_forward', 's18')}</button></div>`;
  } else if (I.step === 3) {
    const h = I.hasil;
    isi = `<div class="g g4 ministat">${[['Baru', h.baru, 'ok', 'add_circle'], ['Berubah', h.berubah, 'info', 'sync_alt'], ['Sama (dilewati)', h.sama, 'mut', 'check'], ['Bermasalah', h.masalah, 'bad', 'error']].map(([l, v, c, i]) => `<div class="card kpi"><div class="kpi-top"><span class="kpi-l">${l}</span><span class="well ${c === 'mut' ? '' : c}">${ic(i)}</span></div><div class="kpi-v ${c === 'mut' ? '' : c}">${n0(v)}</div></div>`).join('')}</div>
      ${h.peringatan.length ? `<div class="note warn mt16">${ic('warning')}<div><b>${h.peringatan.length} peringatan</b><div class="fs12 mt4">${h.peringatan.slice(0, 6).map(esc).join('<br>')}${h.peringatan.length > 6 ? '<br>…' : ''}</div></div></div>` : ''}
      <div class="tabs mt16">${[['berubah', 'Berubah', h.berubah], ['baru', 'Baru', h.baru], ['masalah', 'Bermasalah', h.masalah]].map(([k, l, n]) => `<button class="tab${(I.tabP || 'berubah') === k ? ' on' : ''}" data-tp="${k}">${l}<span class="n">${n0(n)}</span></button>`).join('')}</div><div id="imp-tp"></div>
      <div class="row mt16 wrap"><button class="btn btn-g" data-ib="2">${ic('arrow_back', 's18')}Kembali</button>${h.masalah ? `<button class="btn btn-g" id="imp-dlm">${ic('download')}Unduh baris bermasalah</button>` : ''}<span class="sp"></span>
        <button class="btn btn-p" id="imp-run" ${h.baru + h.berubah ? '' : 'disabled'}>${ic('cloud_sync', 's18')}Jalankan impor (${n0(h.baru + h.berubah)} baris)</button></div>`;
  } else {
    const h = I.run;
    isi = `<div class="center" style="padding:12px 0"><span class="well ok" style="width:64px;height:64px;margin:auto">${ic('task_alt', 's28')}</span><h3 class="mt12" style="margin-bottom:4px">Impor selesai</h3><p class="muted" style="margin:0">${esc(I.pesan || '')}</p></div>
      <div class="g g4 mt16 ministat">${[['Ditambah', h.baru, 'ok'], ['Diperbarui', h.berubah, 'info'], ['Sama', h.sama, ''], ['Bermasalah', h.masalah, 'bad']].map(([l, v, c]) => `<div class="mini center"><span>${l}</span><b class="fs20 ${c}">${n0(v)}</b></div>`).join('')}</div>
      <div class="row wrap mt16" style="justify-content:center">${h.masalah ? `<button class="btn btn-g" id="imp-dlm">${ic('download')}Unduh baris gagal</button>` : ''}<button class="btn btn-g" id="imp-lagi">${ic('restart_alt')}Impor lagi</button><button class="btn btn-p" data-go="${I.target === 'Target_RM' ? 'achievement' : I.target === 'Master_RM_Cabang' ? 'pengaturan' : 'nasabah'}">${ic('visibility')}Lihat data</button></div>
      <div class="note mt16">${ic('tips_and_updates')}<div>Impor aman diulang (idempoten). Untuk <b>delta sync</b> menjelang cutover, jalankan impor yang sama sekali lagi — hanya perubahan yang ditulis.</div></div>`;
  }
  el.innerHTML = `<div class="ph"><div><h2>Impor &amp; Sinkronisasi Data</h2><p>Perbarui database dari tautan Google Spreadsheet atau unggahan Excel/CSV. Selalu dry-run dulu — data baru disimpan setelah Anda konfirmasi.</p></div></div>${tabModeImpor()}
    <div class="card"><div class="stepper" style="--n:4">${st.map((x, i) => `<div class="stp ${I.step === i + 1 ? 'on' : I.step > i + 1 ? 'ok' : ''}"><em>${I.step > i + 1 ? '✓' : i + 1}</em><div><b>${x[0]}</b><small>${x[1]}</small></div></div>`).join('')}</div>${isi}</div>`;
  if (I.step === 3) isiTabImpor();
  pasangImpor(el);
  pasangModeImpor(el);
};
function isiTabImpor() {
  const h = S.imp.hasil, t = S.imp.tabP || 'berubah', box = $('#imp-tp');
  if (t === 'berubah') box.innerHTML = h.contohBerubah.length ? `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Baris</th><th>Kunci</th><th>Perubahan</th></tr></thead><tbody>${h.contohBerubah.map((x) => `<tr><td class="num">${x.baris}</td><td><b>${esc(x.nama || x.kunci)}</b><span class="sub mono">${esc(x.kunci)}</span></td><td class="diff">${x.ubah.map((u) => `<div><span class="mono muted">${esc(u.kolom)}</span>: <del>${esc(fmtNilai(u.dari))}</del> → <ins>${esc(fmtNilai(u.ke))}</ins></div>`).join('')}</td></tr>`).join('')}</tbody></table></div>${h.berubah > h.contohBerubah.length ? `<p class="fs12 muted">Menampilkan ${h.contohBerubah.length} dari ${n0(h.berubah)}.</p>` : ''}` : kosong('sync_disabled', 'Tidak ada data yang berubah');
  else if (t === 'baru') box.innerHTML = h.contohBaru.length ? `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Baris</th><th>Kunci</th><th>Nama</th></tr></thead><tbody>${h.contohBaru.map((x) => `<tr><td class="num">${x.baris}</td><td class="mono">${esc(x.kunci)}</td><td>${esc(x.nama)}</td></tr>`).join('')}</tbody></table></div>` : kosong('playlist_add', 'Tidak ada data baru');
  else box.innerHTML = h.daftarMasalah.length ? `<div class="tbl-wrap" style="max-height:420px;overflow:auto"><table class="tbl"><thead><tr><th>Baris</th><th>Kunci</th><th>Alasan</th></tr></thead><tbody>${h.daftarMasalah.slice(0, 500).map((x) => `<tr class="t-bad"><td class="num">${x.baris}</td><td class="mono">${esc(x.kunci)}</td><td class="bad fs13">${esc(x.alasan)}</td></tr>`).join('')}</tbody></table></div>` : kosong('verified', 'Tidak ada baris bermasalah');
}
const fmtNilai = (v) => (typeof v === 'number' && Math.abs(v) >= 1000 ? n0(v) : v === '' ? '(kosong)' : String(v));
function unduhMasalah() {
  const h = S.imp.run || S.imp.hasil;
  const kol = [{ l: 'Baris', k: 'baris' }, { l: 'Kunci', k: 'kunci' }, { l: 'Alasan', k: 'alasan' }].concat((S.imp.headers || []).map((x, i) => ({ l: x, v: (r) => (r.data || [])[i] })));
  eksporCsv('Baris bermasalah impor ' + iso(new Date()), kol, h.daftarMasalah);
}
function bacaExcel(file) {
  return muatScript(LIB.xlsx).then(() => new Promise((res, rej) => {
    const fr = new FileReader();
    fr.onload = () => {
      try {
        const wb = XLSX.read(new Uint8Array(fr.result), { type: 'array', cellDates: true });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const aoa = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: '' });
        const awal = aoa.findIndex((r) => r.filter((x) => String(x).trim()).length >= 2);
        if (awal < 0) return rej(new Error('Berkas kosong atau header tidak ditemukan.'));
        const headers = aoa[awal].map((x) => String(x).trim());
        const rows = aoa.slice(awal + 1).filter((r) => r.some((x) => String(x).trim() !== '')).map((r) => headers.map((_, i) => { const v = r[i]; return v instanceof Date ? iso(new Date(v.getTime() + 12 * 3600e3)) : v === undefined ? '' : v; }));
        res({ headers, rows, sheet: wb.SheetNames[0] });
      } catch (e) { rej(new Error('Berkas tidak dapat dibaca: ' + e.message)); }
    };
    fr.onerror = () => rej(new Error('Berkas tidak dapat dibaca.'));
    fr.readAsArrayBuffer(file);
  }));
}
function pasangImpor(el) {
  const I = S.imp;
  el.onclick = async (e) => {
    const t = e.target;
    const it = t.closest('[data-it]'); if (it) { I.target = it.dataset.it; render('impor', true); return; }
    const is = t.closest('[data-is]'); if (is) { I.sumber = is.dataset.is; render('impor', true); return; }
    const ib = t.closest('[data-ib]'); if (ib) { I.step = +ib.dataset.ib; render('impor', true); return; }
    const tp = t.closest('[data-tp]'); if (tp) { I.tabP = tp.dataset.tp; $$('[data-tp]', el).forEach((x) => x.classList.toggle('on', x === tp)); isiTabImpor(); return; }
    if (t.closest('#imp-tpl')) { const T = TARGET_IMPOR[I.target]; eksporCsv('Template impor ' + T.l, T.kol.map((k) => ({ l: k, k })), []); return; }
    if (t.closest('#imp-dlm')) return unduhMasalah();
    if (t.closest('#imp-lagi')) { Object.assign(I, { step: 1, file: null, id: '', hasil: null, run: null, prog: 0 }); render('impor', true); return; }
    if (t.closest('#imp-go')) {
      const b = t.closest('#imp-go');
      if (I.sumber === 'sheet') { I.url = $('[name="imp-url"]').value.trim(); I.sheet = $('[name="imp-sheet"]').value.trim(); if (!I.url) return toast('Isi tautan spreadsheet', '', 'warn'); }
      else if (!I.file) return toast('Pilih berkas terlebih dahulu', '', 'warn');
      tombolMuat(b, true, 'Memproses…');
      try {
        if (I.sumber === 'sheet') {
          const r = await api('impor.mulai', { target: I.target, sumber: 'sheet', url: I.url, namaSheet: I.sheet });
          Object.assign(I, { id: r.data.importId, headers: r.data.headers, nama: r.data.nama });
        } else {
          const x = await bacaExcel(I.file), UK = 1500, pot = Math.max(1, Math.ceil(x.rows.length / UK));
          if (!x.rows.length) throw new Error('Tidak ada baris data di berkas.');
          const r = await api('impor.mulai', { target: I.target, sumber: 'file', nama: I.file.name, headers: x.headers, potongan: pot });
          Object.assign(I, { id: r.data.importId, headers: x.headers, nama: I.file.name + ' › ' + x.sheet });
          for (let i = 0; i < pot; i++) {
            await api('impor.potongan', { importId: I.id, idx: i, rows: x.rows.slice(i * UK, (i + 1) * UK) });
            I.prog = Math.round((i + 1) / pot * 100); const bar = $('#v-impor .bar i'); if (bar) bar.style.width = I.prog + '%'; else render('impor', true);
          }
        }
        const pr = await api('impor.pratinjau', { importId: I.id });
        Object.assign(I, { hasil: pr.data, step: 2, prog: 0, tabP: 'berubah' });
        render('impor', true);
      } catch (err) { I.prog = 0; gagalToast(err); tombolMuat(b, false); }
      return;
    }
    if (t.closest('#imp-run')) {
      const h = I.hasil;
      if (!(await konfirmasi({ judul: 'Jalankan impor?', pesan: `${n0(h.baru)} baris baru ditambahkan dan ${n0(h.berubah)} baris diperbarui di <b>${esc(TARGET_IMPOR[I.target].l)}</b>. ${n0(h.masalah)} baris bermasalah dilewati. Proses dicatat di log audit.`, ok: 'Jalankan impor', ikon: 'cloud_sync' }))) return;
      const b = t.closest('#imp-run'); tombolMuat(b, true, 'Menyimpan…');
      try {
        const r = await api('impor.jalankan', { importId: I.id });
        Object.assign(I, { run: r.data, pesan: r.message, step: 4 });
        toast('Impor selesai', r.message, 'ok', { lama: 7000 });
        if (I.file && I.file.size < 15 * 1048576) bacaBerkas(I.file).then((b64) => api('impor.arsip', { nama: I.file.name, mime: I.file.type, base64: b64 })).catch(() => { });
        await sinkron(true);
        render('impor', true);
      } catch (err) { gagalToast(err); tombolMuat(b, false); }
    }
  };
  const fi = $('#imp-f', el), dr = $('#imp-drop', el);
  if (fi) {
    fi.onchange = () => { if (fi.files[0]) { I.file = fi.files[0]; render('impor', true); } };
    ['dragenter', 'dragover'].forEach((ev) => dr.addEventListener(ev, (e) => { e.preventDefault(); dr.classList.add('on'); }));
    ['dragleave', 'drop'].forEach((ev) => dr.addEventListener(ev, (e) => { e.preventDefault(); dr.classList.remove('on'); }));
    dr.addEventListener('drop', (e) => { if (e.dataTransfer.files[0]) { I.file = e.dataTransfer.files[0]; render('impor', true); } });
    dr.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fi.click(); } });
  }
}

// ── Pengaturan (Admin) ──
S.peng = { tab: 'umum' };
const TAB_PENG = [['umum', 'tune', 'Umum'], ['pengguna', 'manage_accounts', 'Pengguna & RM'], ['tplsurat', 'description', 'Template Surat'], ['tplwa', 'sms', 'Template WA'],
  ['wa', 'chat', 'WhatsApp'], ['keamanan', 'shield_lock', 'Keamanan'], ['audit', 'policy', 'Log Audit'], ['instalasi', 'install_mobile', 'Instalasi HP']];
R.pengaturan = function (el, p) {
  if (p && p.tab) { S.peng.tab = p.tab; S.params = {}; }
  el.innerHTML = `<div class="ph"><div><h2>Pengaturan</h2><p>Identitas aplikasi, pengguna & MFA, template, gateway WhatsApp, keamanan, dan log audit.</p></div></div>
    <div class="tabs" role="tablist">${TAB_PENG.map(([k, i, l]) => `<button class="tab${S.peng.tab === k ? ' on' : ''}" data-pk="${k}" role="tab">${ic(i, 's18')}${l}</button>`).join('')}</div><div id="peng-isi"></div>`;
  $$('[data-pk]', el).forEach((b) => b.onclick = () => { S.peng.tab = b.dataset.pk; $$('[data-pk]', el).forEach((x) => x.classList.toggle('on', x === b)); TABP[S.peng.tab]($('#peng-isi')); });
  TABP[S.peng.tab]($('#peng-isi'));
};
async function simpanSetting(set, btn) {
  tombolMuat(btn, true, 'Menyimpan…');
  try { const r = await api('setting.simpan', { set }); S.set = r.data; toast('Pengaturan disimpan', '', 'ok'); S.ver.Pengaturan = 'x'; $('#sb-nama').textContent = S.set.NAMA_APLIKASI || 'Business Banking'; }
  catch (e) { gagalToast(e); } finally { tombolMuat(btn, false); }
}
function kartuSetting(judul, sub, kunci, opsi) {
  opsi = opsi || {};
  const f = kunci.map((k) => Object.assign({ k, l: k }, opsi[k] || {}));
  return { html: `<div class="card mb16"><div class="card-h"><div><h3 class="card-t">${judul}</h3><p class="card-s">${sub}</p></div></div><form class="form-g" novalidate>${f.map((x) => fieldHtml(x, S.set[x.k])).join('')}<div class="full row"><span class="sp"></span><button class="btn btn-p" type="submit">${ic('save', 's18')}Simpan</button></div></form></div>`, f };
}
function pasangKartu(root, kartu) {
  $$('form', root).forEach((fm, i) => {
    const k = kartu[i]; if (!k) return;
    fm.onsubmit = (e) => { e.preventDefault(); const v = bacaForm(fm, k.f); if (v) simpanSetting(v, fm.querySelector('[type=submit]')); };
  });
}
const TABP = {};
TABP.umum = (box) => {
  const k1 = kartuSetting('Identitas aplikasi & bank', 'Dipakai di judul, surat, dan pesan WA', ['NAMA_APLIKASI', 'NAMA_BANK', 'ALAMAT_BANK', 'LOGO_URL'], {
    NAMA_APLIKASI: { l: 'Nama aplikasi', wajib: true }, NAMA_BANK: { l: 'Nama bank / instansi', wajib: true }, ALAMAT_BANK: { l: 'Alamat kantor (kop surat)', full: true }, LOGO_URL: { l: 'URL logo (opsional)', full: true } });
  const k2 = kartuSetting('Indikator & tampilan', 'Benchmark dashboard, jenis target, dan privasi tampilan', ['BENCHMARK_ACHIEVEMENT', 'BATAS_NPL', 'JENIS_TARGET', 'MASKING'], {
    BENCHMARK_ACHIEVEMENT: { l: 'Benchmark achievement (%)', t: 'number' }, BATAS_NPL: { l: 'Batas maksimum NPL (%)', t: 'number', step: '0.01' },
    JENIS_TARGET: { l: 'Jenis target RM (pisahkan koma)', full: true }, MASKING: { l: 'Samarkan nomor WA', t: 'switch', teks: 'Tampilkan 0812-****-3456' } });
  const k3 = kartuSetting('Dokumen & surat', 'Batas unggahan dan format nomor surat', ['DOK_MAKS_MB', 'DOK_EKSTENSI', 'FORMAT_NOMOR_DEFAULT'], {
    DOK_MAKS_MB: { l: 'Batas ukuran berkas (MB)', t: 'number' }, DOK_EKSTENSI: { l: 'Ekstensi diizinkan', full: true },
    FORMAT_NOMOR_DEFAULT: { l: 'Format nomor surat bawaan', full: true, help: 'Token: {URUT} {KODE} {CABANG} {BULAN_ROMAWI} {BULAN} {TAHUN}' } });
  box.innerHTML = k1.html + k2.html + k3.html;
  pasangKartu(box, [k1, k2, k3]);
};
TABP.pengguna = async (box) => {
  box.innerHTML = `<div class="card">${skel(6)}</div>`;
  let list;
  try { list = (await api('pengguna.daftar', {})).data; } catch (e) { box.innerHTML = kosong('error', 'Gagal memuat pengguna', e.message); return; }
  const gambar = (q) => {
    const r = list.filter((u) => !q || (u.nama + ' ' + u.email + ' ' + u.kode_cabang).toLowerCase().includes(q.toLowerCase())).sort((a, b) => a.peran.localeCompare(b.peran) || a.nama.localeCompare(b.nama));
    $('#pg-tb').innerHTML = `<thead><tr><th>Pengguna</th><th>Peran</th><th>Cabang / tim</th><th>No. WA</th><th>MFA</th><th>Status</th><th></th></tr></thead><tbody>${r.map((u) => `<tr>
      <td class="first" data-l="Pengguna"><span class="row"><span class="av ${u.peran === 'Admin' ? 'acc' : ''}">${esc(ini(u.nama))}</span><span class="trunc"><b>${esc(u.nama)}</b><span class="sub">${esc(u.email)}</span></span></span></td>
      <td data-l="Peran"><span class="bdg ${u.peran === 'Admin' ? 'acc' : u.peran === 'Pimpinan' ? 'pink' : 'info'} lc">${esc(u.peran)}</span></td>
      <td data-l="Cabang">${esc(u.nama_cabang || u.kode_cabang)}<span class="sub">${esc(u.kode_cabang)}${u.tim ? ' • ' + esc(u.tim) : ''}</span></td>
      <td data-l="WA" class="mono">${u.no_wa_rm ? esc(u.no_wa_rm) : '<span class="bad fs12">kosong</span>'}</td>
      <td data-l="MFA"><span class="bdg ${u.mfa === 'Aktif' ? 'ok' : u.mfa === 'Terkunci' ? 'bad' : 'mut'} lc">${esc(u.mfa)}</span>${u.mfa === 'Aktif' ? `<span class="sub">${u.sisaCadangan} kode cadangan</span>` : ''}</td>
      <td data-l="Status">${u.status_aktif ? '<span class="bdg ok lc">Aktif</span>' : '<span class="bdg mut lc">Nonaktif</span>'}</td>
      <td data-l="Aksi"><span class="acts"><button class="btn-ic sm" data-ue="${esc(u.email)}" aria-label="Ubah" data-tip="Ubah">${ic('edit', 's18')}</button>${u.mfa !== 'Belum daftar' ? `<button class="btn-ic sm" data-um="${esc(u.email)}" aria-label="Reset MFA" data-tip="Reset MFA (ponsel hilang)">${ic('phonelink_erase', 's18')}</button>` : ''}</span></td></tr>`).join('')}</tbody>`;
  };
  box.innerHTML = `<div class="card p0" style="overflow:hidden"><div class="row wrap g12" style="padding:16px 20px"><div><h3 class="card-t">Pengguna & Master RM</h3><p class="card-s">${list.length} pengguna • hanya email terdaftar & aktif yang dapat masuk</p></div><span class="sp"></span>
    <label class="search" style="max-width:260px"><span class="ms">search</span><input class="inp" id="pg-q" placeholder="Cari pengguna…"></label><button class="btn btn-p" id="pg-add">${ic('person_add', 's18')}Tambah</button></div>
    <div class="tbl-wrap resp"><table class="tbl tbl-resp" id="pg-tb"></table></div></div>`;
  gambar('');
  $('#pg-q').oninput = deb((e) => gambar(e.target.value), 120);
  const form = (u) => formModal({ judul: u ? 'Ubah pengguna' : 'Tambah pengguna', sub: 'Master_RM_Cabang', ikon: 'manage_accounts',
    fields: [{ k: 'email', l: 'Email Google', t: 'email', wajib: true, ro: !!u }, { k: 'nama', l: 'Nama lengkap', wajib: true }, { k: 'peran', l: 'Peran', t: 'select', opsi: ['RM', 'Pimpinan', 'Admin'], wajib: true },
      { k: 'kode_cabang', l: 'Kode cabang', wajib: true, ph: 'KCSDM' }, { k: 'nama_cabang', l: 'Nama cabang', ph: 'KC Sudirman Utama' }, { k: 'tim', l: 'Tim / unit' },
      { k: 'no_wa_rm', l: 'No. WA (untuk pengingat)', t: 'tel', ph: '08…', validasi: (v) => (/^(\+?62|0)8\d{7,12}$/.test(v.replace(/[\s-]/g, '')) ? '' : 'Nomor WA tidak valid.') },
      { k: 'status_aktif', l: 'Status', t: 'switch', teks: 'Aktif (boleh masuk)', def: 'Ya' }],
    nilai: u ? Object.assign({}, u, { status_aktif: u.status_aktif ? 'Ya' : 'Tidak' }) : { peran: 'RM' },
    simpan: async (v) => { await api('pengguna.simpan', v); toast('Pengguna tersimpan', v.email, 'ok'); await sinkron(true); TABP.pengguna(box); } });
  $('#pg-add').onclick = () => form(null);
  box.onclick = async (e) => {
    const ue = e.target.closest('[data-ue]'); if (ue) return form(list.find((u) => u.email === ue.dataset.ue));
    const um = e.target.closest('[data-um]'); if (!um) return;
    if (!(await konfirmasi({ judul: 'Reset MFA pengguna?', pesan: `MFA <b>${esc(um.dataset.um)}</b> akan dihapus dan semua sesinya dicabut. Pengguna wajib mendaftarkan Microsoft Authenticator lagi saat masuk.`, bahaya: true, ok: 'Reset MFA' }))) return;
    try { const r = await api('mfa.reset', { email: um.dataset.um }); toast('MFA direset', r.message, 'ok'); TABP.pengguna(box); } catch (err) { gagalToast(err); }
  };
};
TABP.tplsurat = async (box) => {
  box.innerHTML = `<div class="card">${skel(5)}</div>`;
  let list;
  try { list = (await api('tplsurat.daftar', {})).data; } catch (e) { box.innerHTML = kosong('error', 'Gagal memuat template', e.message); return; }
  const semuaPh = PH_SISTEM.concat(PH_DATA);
  box.innerHTML = `<div class="g g12" style="align-items:start"><div class="card c8"><div class="card-h"><div><h3 class="card-t">Template surat</h3><p class="card-s">Google Docs dengan placeholder {{…}}. Word (.docx) dikonversi otomatis.</p></div><button class="btn btn-p" id="ts-add">${ic('note_add', 's18')}Tambah template</button></div>
    ${list.length ? list.map((t) => `<div class="doc-i"><span class="doc-ic" style="--c:var(--info)">${ic('description')}</span><div class="sp trunc"><b>${esc(t.nama_surat)}</b> <span class="pill-tag">${esc(t.kode)}</span> ${t.status_aktif ? '' : '<span class="bdg mut lc">Nonaktif</span>'}
      <div class="fs12 muted trunc">${t.placeholder.length} placeholder • format ${esc(t.format_nomor)} • diperbarui ${tglJam(t.diperbarui)}</div><div class="code-ref mt4">${t.placeholder.slice(0, 12).map((p) => `<code style="${semuaPh.includes(p) ? '' : 'color:var(--warn)'}">${esc(p)}</code>`).join('')}${t.placeholder.length > 12 ? '<code>…</code>' : ''}</div></div>
      <a class="btn btn-sm btn-g" href="https://docs.google.com/document/d/${esc(t.id_google_docs)}/edit" target="_blank" rel="noopener">${ic('open_in_new')}Edit di Docs</a><button class="btn-ic sm" data-te="${esc(t.id_template)}" aria-label="Ubah template">${ic('edit', 's18')}</button></div>`).join('') : kosong('description', 'Belum ada template')}</div>
    <div class="card c4"><h3 class="card-t">Placeholder tersedia</h3><p class="card-s mb12">Klik untuk menyalin. Warna kuning = isian tambahan yang otomatis menjadi form.</p>
      <div class="fs11 b muted mb8">SISTEM (diisi server)</div><div class="code-ref mb12">${PH_SISTEM.map((k) => `<code data-cp="{{${k}}}">{{${k}}}</code>`).join('')}</div>
      <div class="fs11 b muted mb8">DATA NASABAH / RM</div><div class="code-ref mb12">${PH_DATA.map((k) => `<code data-cp="{{${k}}}">{{${k}}}</code>`).join('')}</div>
      <div class="fs11 b muted mb8">PENGUBAH</div><div class="code-ref">${['|rupiah', '|ribuan', '|terbilang:rupiah', '|tanggal:dd/MM/yyyy', '|tanggal:pendek', '|kapital', '|judul', '|bawaan:Teks'].map((k) => `<code data-cp="${k}">${k}</code>`).join('')}</div>
      <div class="note mt12 fs12">${ic('info')}<div>Contoh: <span class="mono">{{plafon|terbilang:rupiah}}</span>, <span class="mono">{{QR}}</span> menyisipkan QR verifikasi.</div></div></div></div>`;
  box.onclick = (e) => { const c = e.target.closest('[data-cp]'); if (c) salin(c.dataset.cp, c.dataset.cp); const te = e.target.closest('[data-te]'); if (te) formTpl(list.find((t) => t.id_template === te.dataset.te)); };
  $('#ts-add').onclick = () => formTpl(null);
  const formTpl = (t) => {
    let b64 = '', namaF = '';
    const m = formModal({ judul: t ? 'Ubah template surat' : 'Tambah template surat', sub: 'Master milik Anda tidak diubah — aplikasi menyimpan salinannya sendiri', ikon: 'note_add',
      fields: [{ k: 'nama_surat', l: 'Nama surat', wajib: true, full: true, ph: 'Surat Pemberitahuan Jatuh Tempo' }, { k: 'kode', l: 'Kode surat', wajib: true, ph: 'SPJT' },
        { k: 'format_nomor', l: 'Format nomor', def: S.set.FORMAT_NOMOR_DEFAULT }, { k: 'sumber', l: 'Tautan Google Docs', full: true, ph: 'https://docs.google.com/document/d/…', help: t ? 'Kosongkan bila tidak mengganti dokumen' : 'Atau unggah berkas .docx di bawah' },
        { k: 'status_aktif', l: 'Status', t: 'switch', teks: 'Aktif', def: 'Ya' }],
      nilai: t ? { nama_surat: t.nama_surat, kode: t.kode, format_nomor: t.format_nomor, status_aktif: t.status_aktif ? 'Ya' : 'Tidak' } : {},
      bawah: `<div class="full fld"><label>Atau unggah template Word (.docx)</label><input type="file" accept=".docx" id="ts-docx" class="inp" style="padding:8px"><span class="help">Memerlukan layanan lanjutan Drive API (sudah tercantum di appsscript.json).</span></div>`,
      onBuka: (el) => { $('#ts-docx', el).onchange = async (e) => { const f = e.target.files[0]; if (!f) return; namaF = f.name; b64 = await bacaBerkas(f); toast('Berkas siap', f.name, 'info', { lama: 1800 }); }; },
      simpan: async (v) => {
        if (!t && !v.sumber && !b64) { toast('Sumber template kosong', 'Isi tautan Google Docs atau unggah .docx.', 'warn'); return false; }
        if (t) v.id_template = t.id_template;
        if (b64) { v.base64Docx = b64; v.namaFile = namaF; }
        const r = await api('tplsurat.simpan', v); toast('Template tersimpan', r.message, 'ok', { lama: 6000 }); await sinkron(true); TABP.tplsurat(box);
      } });
    void m;
  };
};
TABP.tplwa = (box) => {
  box.innerHTML = `<div class="card"><div class="card-h"><div><h3 class="card-t">Template pesan WhatsApp</h3><p class="card-s">Gunakan {{variabel}} — diisi otomatis per nasabah. Template jenis "Pengingat" dikirim ke RM.</p></div><button class="btn btn-p" id="tw-add">${ic('add', 's18')}Tambah template</button></div>
    ${S.tplWA.map((t) => `<div class="doc-i"><span class="doc-ic" style="--c:${t.jenis === 'Pengingat' ? 'var(--warn)' : 'var(--ok)'}">${ic(t.jenis === 'Pengingat' ? 'notifications_active' : 'sms')}</span><div class="sp trunc"><b>${esc(t.nama)}</b> <span class="bdg ${t.jenis === 'Pengingat' ? 'warn' : 'info'} lc">${esc(t.jenis)}</span> ${t.status_aktif ? '' : '<span class="bdg mut lc">Nonaktif</span>'}<div class="fs12 muted trunc">${esc(t.isi_pesan.replace(/\s+/g, ' '))}</div></div><span class="pill-tag mono">${esc(t.id_template)}</span><button class="btn-ic sm" data-tw="${esc(t.id_template)}" aria-label="Ubah">${ic('edit', 's18')}</button></div>`).join('') || kosong('sms', 'Belum ada template')}</div>`;
  const contoh = S.porto[0] ? varWaKlien(S.porto[0]) : {};
  const form = (t) => formModal({ judul: t ? 'Ubah template WA' : 'Tambah template WA', ikon: 'sms',
    fields: [{ k: 'nama', l: 'Nama template', wajib: true, full: true }, { k: 'jenis', l: 'Jenis', t: 'select', opsi: ['Blast', 'Umum', 'Pengingat'] }, { k: 'status_aktif', l: 'Status', t: 'switch', teks: 'Aktif', def: 'Ya' },
      { k: 'isi_pesan', l: 'Isi pesan', t: 'textarea', wajib: true, full: true, rows: 7 }],
    nilai: t ? Object.assign({}, t, { status_aktif: t.status_aktif ? 'Ya' : 'Tidak' }) : { jenis: 'Blast' },
    bawah: `<div class="full row wrap">${VAR_WA.concat(['no_wa_rm', 'kolektibilitas', 'jenis_fasilitas', 'nama_aplikasi']).map((k) => `<button type="button" class="vchip" data-var="${k}">{{${k}}}</button>`).join('')}</div><div class="full"><div class="fs11 b muted mb8">PRATINJAU (data contoh)</div><div class="stream" style="min-height:0;padding:14px;border-radius:12px"><div class="bub" id="tw-p"></div></div></div>`,
    onBuka: (el) => { const ta = $('[name=isi_pesan]', el), pv = () => { $('#tw-p', el).textContent = isiTpl(ta.value, contoh) || '…'; }; ta.oninput = pv; pv(); $$('[data-var]', el).forEach((b) => b.onclick = () => { const s = ta.selectionStart || ta.value.length; ta.value = ta.value.slice(0, s) + '{{' + b.dataset.var + '}}' + ta.value.slice(s); ta.focus(); pv(); }); },
    simpan: async (v) => { if (t) v.id_template = t.id_template; await api('tplwa.simpan', v); toast('Template WA tersimpan', v.nama, 'ok'); await sinkron(true); TABP.tplwa(box); } });
  $('#tw-add').onclick = () => form(null);
  box.onclick = (e) => { const b = e.target.closest('[data-tw]'); if (b) form(S.tplWA.find((t) => t.id_template === b.dataset.tw)); };
};
TABP.wa = async (box) => {
  box.innerHTML = `<div class="card">${skel(6)}</div>`;
  let rs; try { rs = (await api('rahasia.status', {})).data; } catch (e) { box.innerHTML = kosong('error', 'Gagal memuat status', e.message); return; }
  const k = kartuSetting('Pengaturan pengiriman', 'Batch, jeda acak, dan kuota harian (anti-banned)', ['WA_AKTIF', 'WA_BATCH', 'WA_JEDA', 'WA_KUOTA_HARIAN'], {
    WA_AKTIF: { l: 'Saklar utama WhatsApp', t: 'switch', teks: 'Pengiriman aktif' }, WA_BATCH: { l: 'Pesan per putaran (menit)', t: 'select', opsi: ['10', '20', '50'] },
    WA_JEDA: { l: 'Jeda antar pesan (detik)', ph: '3-8' }, WA_KUOTA_HARIAN: { l: 'Kuota harian', t: 'number' } });
  box.innerHTML = `<div class="g g12" style="align-items:start"><div class="c7"><div class="card mb16"><div class="card-h"><div><h3 class="card-t">Token gateway Fonnte</h3><p class="card-s">Disimpan di Script Properties — tidak pernah dikirim ke peramban</p></div>${rs.FONNTE_TOKEN.ada ? '<span class="bdg ok lc">Terpasang</span>' : '<span class="bdg bad lc">Belum diisi</span>'}</div>
      <div class="row wrap g12"><input class="inp" type="password" id="tok" autocomplete="off" placeholder="${rs.FONNTE_TOKEN.ada ? esc(rs.FONNTE_TOKEN.samar) : 'Tempel token dari dashboard Fonnte'}" style="flex:1;min-width:220px"><button class="btn btn-p" id="tok-sv">${ic('key', 's18')}Simpan token</button>${rs.FONNTE_TOKEN.ada ? `<button class="btn btn-d" id="tok-del">${ic('delete', 's18')}Hapus</button>` : ''}</div>
      <div class="row wrap mt16"><button class="btn btn-g" id="wa-dev">${ic('devices', 's18')}Cek status perangkat</button><button class="btn btn-g" id="wa-tes">${ic('send', 's18')}Kirim pesan tes</button><button class="btn btn-g" id="wa-val">${ic('verified', 's18')}Validasi nomor nasabah</button><button class="btn btn-g" id="wa-pro">${ic('play_circle', 's18')}Proses antrean sekarang</button></div>
      <div id="wa-out" class="mt12"></div><div class="fs12 muted mt12">Status antrean: ${esc(rs.waStatus)}</div></div>${k.html}</div>
    <div class="c5"><div class="card"><h3 class="card-t">Cara kerja aman</h3><div class="tl mt12">
      <div class="tl-i"><b>Transaksi hanya menulis antrean</b><small>Layar pengguna tidak menunggu gateway (0 ms blocking).</small></div>
      <div class="tl-i"><b>Trigger 1 menit memproses batch</b><small>${esc(S.set.WA_BATCH || 20)} pesan/menit, jeda acak ${esc(S.set.WA_JEDA || '3-8')} detik.</small></div>
      <div class="tl-i"><b>Persetujuan & opt-out dihormati</b><small>Hanya wa_consent = Ya; nomor tidak valid dilewati & dicatat.</small></div>
      <div class="tl-i" style="--c:var(--warn)"><b>Coba ulang otomatis 3×</b><small>Setelah itu status Gagal dan dapat dicoba ulang manual.</small></div></div>
      <div class="note warn mt12 fs12">${ic('warning')}<div>Fonnte adalah API tidak resmi. Untuk volume besar, rencanakan migrasi ke WhatsApp Business Platform resmi (PRD Fase 3).</div></div></div></div></div>`;
  pasangKartu(box, [k]);
  const out = $('#wa-out');
  const jalankan = async (btn, aksi, data, fmt) => { tombolMuat(btn, true, 'Memproses…'); try { const r = await api(aksi, data || {}); out.innerHTML = `<div class="note ok">${ic('check_circle')}<div>${fmt ? fmt(r) : esc(r.message)}</div></div>`; return r; } catch (e) { out.innerHTML = `<div class="note bad">${ic('error')}<div>${esc(e.message)}</div></div>`; } finally { tombolMuat(btn, false); } };
  $('#tok-sv').onclick = async (e) => { const v = $('#tok').value.trim(); if (!v) return toast('Token kosong', '', 'warn'); const r = await jalankan(e.currentTarget, 'rahasia.simpan', { kunci: 'FONNTE_TOKEN', nilai: v }, (x) => 'Token tersimpan: ' + esc(x.data.samar)); $('#tok').value = ''; if (r) TABP.wa(box); };
  const del = $('#tok-del'); if (del) del.onclick = async (e) => { if (await konfirmasi({ judul: 'Hapus token Fonnte?', pesan: 'Pengiriman WA akan berhenti sampai token baru diisi.', bahaya: true, ok: 'Hapus token' })) { await jalankan(e.currentTarget, 'rahasia.simpan', { kunci: 'FONNTE_TOKEN', nilai: '__HAPUS__' }); TABP.wa(box); } };
  $('#wa-dev').onclick = (e) => jalankan(e.currentTarget, 'wa.perangkat', {}, (r) => `Perangkat <b>${esc(r.data.perangkat)}</b> • status <b>${esc(r.data.status)}</b> • paket ${esc(r.data.paket || '-')} • kuota ${esc(r.data.kuota || '-')} • berlaku s.d. ${esc(r.data.kedaluwarsa || '-')}`);
  $('#wa-tes').onclick = (e) => { const b = e.currentTarget; formModal({ judul: 'Kirim pesan tes', ikon: 'send', lebar: 'sm', fields: [{ k: 'nomor', l: 'Nomor tujuan', t: 'tel', wajib: true, full: true, ph: '08…' }], tombol: 'Kirim', simpan: async (v) => { await jalankan(b, 'wa.tes', v); } }); };
  $('#wa-val').onclick = async (e) => { if (await konfirmasi({ judul: 'Validasi nomor WA nasabah?', pesan: 'Mengecek hingga 300 nomor ke gateway (memakai kuota API). Nomor tidak terdaftar otomatis dikeluarkan dari blast.', ok: 'Mulai validasi' })) { await jalankan(e.currentTarget, 'wa.validasi', { hanyaBaru: true }); sinkron(true); } };
  $('#wa-pro').onclick = (e) => jalankan(e.currentTarget, 'wa.proses', {}, (r) => `Antrean: ${r.data.antri} • terkirim hari ini: ${r.data.terkirimHariIni} • ${esc(r.data.status)}`);
};
TABP.keamanan = async (box) => {
  box.innerHTML = `<div class="card">${skel(6)}</div>`;
  let rs; try { rs = (await api('rahasia.status', {})).data; } catch (e) { box.innerHTML = kosong('error', 'Gagal memuat status', e.message); return; }
  const k = kartuSetting('Sesi', 'Token sesi HMAC + batas tidak aktif', ['SESI_JAM', 'IDLE_MENIT'], { SESI_JAM: { l: 'Masa berlaku sesi (jam)', t: 'number' }, IDLE_MENIT: { l: 'Sesi berakhir bila tidak aktif (menit)', t: 'number' } });
  const baris = (l, ok, ket) => `<div class="kv"><span class="row g4">${ic(ok ? 'check_circle' : 'cancel', 's18 ' + (ok ? 'ok' : 'bad'))}${esc(l)}</span><span class="fs12 muted">${ket || ''}</span></div>`;
  box.innerHTML = `<div class="g g12" style="align-items:start"><div class="c7">${k.html}
    <div class="card mb16"><div class="card-h"><div><h3 class="card-t">Login Google untuk aplikasi HP (PWA)</h3><p class="card-s">OAuth Client ID tipe "Web application" — origin GitHub Pages Anda</p></div>${rs.GOOGLE_CLIENT_ID.ada ? '<span class="bdg ok lc">Terpasang</span>' : '<span class="bdg warn lc">Belum diisi</span>'}</div>
      <div class="row wrap g12"><input class="inp mono" id="cid" placeholder="xxxx.apps.googleusercontent.com" value="${esc(rs.GOOGLE_CLIENT_ID.samar)}" style="flex:1;min-width:240px"><button class="btn btn-p" id="cid-sv">${ic('save', 's18')}Simpan</button></div></div>
    <div class="card"><div class="card-h"><div><h3 class="card-t">Tindakan darurat</h3><p class="card-s">Gunakan bila dicurigai ada kebocoran</p></div></div>
      <div class="row wrap"><button class="btn btn-d" id="rot">${ic('lock_reset', 's18')}Putar kunci sesi (semua keluar)</button><button class="btn btn-g" id="av">${ic('fact_check', 's18')}Verifikasi rantai log audit</button></div><div id="sec-out" class="mt12"></div></div></div>
    <div class="c5"><div class="card"><h3 class="card-t mb12">Status rahasia & sistem</h3>
      ${baris('SESSION_SECRET (Script Properties)', rs.sesiSecretAda, 'otomatis')}${baris('MFA_ENC_KEY — enkripsi kunci TOTP', rs.mfaKeyAda, 'otomatis')}${baris('FONNTE_TOKEN', rs.FONNTE_TOKEN.ada, rs.FONNTE_TOKEN.samar)}${baris('GOOGLE_CLIENT_ID', rs.GOOGLE_CLIENT_ID.ada, '')}
      ${baris('Trigger harian 08.00 WIB', rs.trigger.includes('jalankanHarian'), 'terakhir: ' + esc(rs.harianTerakhir))}${baris('Trigger antrean WA (1 menit)', rs.trigger.includes('prosesAntreanWA'), '')}
      <div class="kv"><span>Versi aplikasi</span><b>${esc(rs.versi)}</b></div>
      <div class="row wrap mt12">${rs.spreadsheetUrl ? `<a class="btn btn-sm btn-g" href="${esc(rs.spreadsheetUrl)}" target="_blank" rel="noopener">${ic('table_view')}Database</a>` : ''}${rs.folderUrl ? `<a class="btn btn-sm btn-g" href="${esc(rs.folderUrl)}" target="_blank" rel="noopener">${ic('folder')}Folder Drive</a>` : ''}</div>
      <div class="note warn mt12 fs12">${ic('warning')}<div>Siapa pun yang punya akses <b>edit</b> proyek Apps Script dapat melihat Script Properties. Batasi editor proyek & jangan bagikan spreadsheet database.</div></div></div></div></div>`;
  pasangKartu(box, [k]);
  const out = $('#sec-out');
  $('#cid-sv').onclick = async (e) => { const v = $('#cid').value.trim(); if (!v) return; tombolMuat(e.currentTarget, true, '…'); try { await api('rahasia.simpan', { kunci: 'GOOGLE_CLIENT_ID', nilai: v }); toast('Client ID disimpan', '', 'ok'); TABP.keamanan(box); } catch (err) { gagalToast(err); tombolMuat(e.currentTarget, false); } };
  $('#rot').onclick = async () => { if (!(await konfirmasi({ judul: 'Putar kunci sesi?', pesan: 'Semua pengguna — termasuk Anda — akan keluar dan harus login + MFA ulang.', bahaya: true, ok: 'Putar kunci' }))) return; try { await api('sesi.rotasi', {}); sesiHabis('Kunci sesi diputar. Silakan masuk kembali.'); } catch (err) { gagalToast(err); } };
  $('#av').onclick = async (e) => { tombolMuat(e.currentTarget, true, 'Memeriksa…'); try { const r = await api('audit.verifikasi', {}); out.innerHTML = `<div class="note ${r.data.utuh ? 'ok' : 'bad'}">${ic(r.data.utuh ? 'verified' : 'gpp_bad')}<div>${esc(r.message)}</div></div>`; } catch (err) { gagalToast(err); } finally { tombolMuat(e.currentTarget, false); } };
};
TABP.audit = (box) => {
  const A = S.aud = S.aud || { q: '', aksi: '', dari: '', sampai: '' };
  box.innerHTML = `<div class="card pad16"><div class="row wrap g12"><label class="search"><span class="ms">search</span><input class="inp" id="au-q" placeholder="Cari email, objek, keterangan…" value="${esc(A.q)}"></label>
    <select class="sel" style="width:auto" id="au-a"><option value="">Semua aksi</option>${['LOGIN', 'LOGIN_DITOLAK', 'MFA_GAGAL', 'MFA_TERKUNCI', 'MFA_DAFTAR', 'RESET_MFA', 'AKSES_DITOLAK', 'IMPOR_DATA', 'EKSPOR', 'KIRIM_WA', 'WA_BLAST', 'CETAK_SURAT', 'UNGGAH_DOKUMEN', 'BUKA_DOKUMEN', 'LIHAT_NOMOR', 'UBAH_PENGATURAN', 'UBAH_RAHASIA', 'SIMPAN_PENGGUNA', 'UBAH_FASILITAS', 'TUGAS_HARIAN', 'LOGOUT'].map((x) => `<option${A.aksi === x ? ' selected' : ''}>${x}</option>`).join('')}</select>
    <input type="date" class="inp" style="width:auto" id="au-d" value="${A.dari}" aria-label="Dari tanggal"><input type="date" class="inp" style="width:auto" id="au-s" value="${A.sampai}" aria-label="Sampai tanggal">
    <button class="btn btn-p" id="au-go">${ic('search', 's18')}Tampilkan</button><button class="btn btn-g" id="au-xls">${ic('table_view', 's18 ok')}Excel</button></div></div><div class="card p0 sec" style="overflow:hidden" id="au-tb">${skel(8)}</div>`;
  let data = [];
  const muat = async () => {
    Object.assign(A, { q: $('#au-q').value, aksi: $('#au-a').value, dari: $('#au-d').value, sampai: $('#au-s').value });
    $('#au-tb').innerHTML = `<div style="padding:20px">${skel(8)}</div>`;
    try {
      const r = await api('audit.daftar', A); data = r.data.rows;
      $('#au-tb').innerHTML = `<div class="row" style="padding:14px 20px"><b>${n0(data.length)} entri</b><span class="muted fs12">&nbsp;dari ${n0(r.data.total)} • log tidak dapat diubah dari antarmuka (rantai hash)</span></div>
        <div class="tbl-wrap resp" style="max-height:62vh;overflow:auto"><table class="tbl tbl-resp"><thead><tr><th>Waktu</th><th>Pengguna</th><th>Aksi</th><th>Objek</th><th>Keterangan</th></tr></thead><tbody>${data.map((x) => `<tr class="${/GAGAL|DITOLAK|TERKUNCI/.test(x.aksi) ? 't-bad' : ''}"><td class="first nowrap mono" data-l="Waktu">${esc(x.waktu)}</td><td data-l="Pengguna">${esc(x.email)}</td><td data-l="Aksi"><span class="bdg ${/GAGAL|DITOLAK|TERKUNCI/.test(x.aksi) ? 'bad' : /LOGIN/.test(x.aksi) ? 'ok' : 'acc'} lc">${esc(x.aksi)}</span></td><td data-l="Objek" class="mono fs12">${esc(x.objek)}</td><td data-l="Ket" class="fs12 muted" style="max-width:420px">${esc(x.keterangan)}</td></tr>`).join('')}</tbody></table></div>`;
    } catch (e) { $('#au-tb').innerHTML = kosong('error', 'Gagal memuat log', e.message); }
  };
  $('#au-go').onclick = muat;
  $('#au-q').onkeydown = (e) => { if (e.key === 'Enter') muat(); };
  $('#au-xls').onclick = () => eksporExcel('Log Audit ' + iso(new Date()), [{ l: 'Waktu', k: 'waktu', w: 20 }, { l: 'Email', k: 'email', w: 28 }, { l: 'Aksi', k: 'aksi', w: 20 }, { l: 'Objek', k: 'objek', w: 24 }, { l: 'Keterangan', k: 'keterangan', w: 60 }], data, 'Audit').catch(gagalToast);
  muat();
};
TABP.instalasi = (box) => {
  const k = kartuSetting('Alamat aplikasi', 'Dipakai untuk QR pemasangan di HP dan QR verifikasi di setiap surat', ['PWA_URL', 'URL_VERIFIKASI'], {
    PWA_URL: { l: 'Alamat aplikasi (GitHub Pages)', full: true, ph: 'https://nama-akun.github.io/business-banking/' },
    URL_VERIFIKASI: { l: 'Halaman verifikasi QR surat (opsional)', full: true, ph: 'Kosong = alamat aplikasi + verifikasi.html' } });
  const ver = (S.set.URL_VERIFIKASI || (S.set.PWA_URL ? S.set.PWA_URL.replace(/[#?].*$/, '').replace(/\/index\.html$/, '').replace(/\/+$/, '') + '/verifikasi.html' : ''));
  box.innerHTML = `<div class="g g12" style="align-items:start"><div class="c7">${k.html}<div class="card"><h3 class="card-t">Arsitektur v2</h3>
    <p class="card-s mb12">Frontend statis di GitHub Pages memanggil REST API Apps Script (URL /exec di <code>js/config.js</code>). Tidak ada halaman HtmlService.</p>
    <div class="inner fs13"><div class="row g8 wrap"><span class="dim">Backend</span><b class="mono" style="word-break:break-all">${esc(CFG.GAS_URL || '-')}</b></div>
    <div class="row g8 wrap mt8"><span class="dim">Verifikasi QR</span><b class="mono" style="word-break:break-all">${esc(ver || 'isi alamat aplikasi dulu')}</b></div>
    <div class="row g8 wrap mt8"><span class="dim">Waktu respons terakhir</span><b>${API.terakhir ? esc(API.terakhir.rtt + ' ms (server ' + API.terakhir.server + ' ms)') : '-'}</b></div></div></div></div>
    <div class="c5"><div class="card"><h3 class="card-t">Pasang di HP</h3><p class="card-s mb12">Bagikan QR ini ke pegawai.</p><button class="btn btn-p" id="ins-qr">${ic('qr_code_2', 's18')}Tampilkan QR & panduan</button>
      <div class="note mt12 fs12">${ic('info')}<div>Login tetap akun Google + Microsoft Authenticator. Di Android pilih <b>Instal aplikasi</b>, di iPhone <b>Bagikan → Tambahkan ke Layar Utama</b>.</div></div></div></div></div>`;
  pasangKartu(box, [k]);
  $('#ins-qr').onclick = bukaPasang;
};

// ── Migrasi dari aplikasi v1 (gas-migrasi-database): pindai dry-run → jalankan per sheet → delta sync ──
S.mig = { tahap: 'awal', sumber: LS.get('mig_sumber', ''), opsi: { lewatiContoh: true, bersihkanV2: true, matikanKirim: true, arsip: true, timpa: false }, pindai: null, jalan: {}, aktif: '' };
const OPSI_MIG = [
  ['lewatiContoh', 'Lewati data contoh v1 (email @contoh.co.id) beserta data terkaitnya'],
  ['bersihkanV2', 'Hapus data contoh bawaan v2 lebih dulu'],
  ['matikanKirim', 'Matikan pengingat otomatis & pengiriman WA v2 sampai cutover (agar tidak dobel dengan v1)'],
  ['arsip', 'Arsipkan salinan utuh database v1 ke folder Impor_Arsip (sekali)'],
  ['timpa', 'Timpa data v2 yang sudah ada (abaikan aturan "data yang lebih baru menang")']
];
function tabelMigrasi(laporan, jalan) {
  return `<div class="tbl-wrap resp"><table class="tbl tbl-resp"><thead><tr><th>Data</th><th class="right">Di v1</th><th class="right">Ditambah</th><th class="right">Diperbarui</th><th class="right">Dilewati</th><th>Catatan</th></tr></thead><tbody>
    ${laporan.map((l) => { const j = jalan && jalan[l.sheet]; const r = j && j.hasil ? j.hasil : l;
      const st = !jalan ? '' : !j ? `<span class="bdg mut">Menunggu</span>` : j.galat ? `<span class="bdg bad">Galat</span>` : j.hasil ? `<span class="bdg ok">Selesai</span>` : `<span class="bdg info"><span class="spin" style="width:12px;height:12px;border-width:2px"></span>Berjalan</span>`;
      return `<tr><td class="first" data-l="Data"><b>${esc(l.label)}</b><span class="sub mono">${esc(l.sheet)}</span>${st ? `<div class="mt4">${st}</div>` : ''}</td>
      <td class="right num" data-l="Di v1">${n0(l.sumber)}</td><td class="right num ok" data-l="Ditambah">${n0(r.ditambah)}</td><td class="right num info" data-l="Diperbarui">${n0(r.diperbarui)}</td><td class="right num dim" data-l="Dilewati">${n0(r.dilewati)}</td>
      <td class="fs12 muted" data-l="Catatan">${esc((j && j.galat) || (r.catatan || []).join(' • ') || '—')}</td></tr>`; }).join('')}</tbody></table></div>`;
}
function renderMigrasi(el) {
  const M = S.mig, st = [['Sumber', 'Database v1 (hanya dibaca)'], ['Pindai', 'Dry-run tanpa menulis'], ['Jalankan', 'Per sheet, master dulu'], ['Selesai', 'Delta sync & cutover']];
  const idx = { awal: 1, hasil: 2, jalan: 3, selesai: 4 }[M.tahap];
  let isi = '';
  if (M.tahap === 'awal') {
    isi = `<div class="form-g one">${fieldHtml({ k: 'mig-src', l: 'URL atau ID spreadsheet database v1 (DB Business Banking)', ph: 'https://docs.google.com/spreadsheets/d/…/edit', full: true, help: 'Spreadsheet v1 hanya DIBACA — tidak ada satu sel pun yang diubah. Harus milik akun Google yang sama dengan proyek Apps Script v2.' }, M.sumber)}</div>
      <fieldset class="mt16" style="border:0;padding:0;margin:0"><legend class="fs11 b muted mb8">OPSI</legend>
      ${OPSI_MIG.map(([k, l]) => `<label class="chk" style="display:flex;margin:8px 0"><input type="checkbox" data-mo="${k}" ${M.opsi[k] ? 'checked' : ''}><span>${esc(l)}</span></label>`).join('')}</fieldset>
      <div class="note mt16">${ic('info')}<div><b>Yang dipindah</b><div class="fs12 mt4">Pengguna, portofolio, target, template, penomoran surat (melanjutkan nomor terakhir), riwayat surat & dokumen, CRM, blast & log WA, log pengingat, snapshot, dan — bila kunci MFA sama — pendaftaran Microsoft Authenticator. Berkas Drive lama tetap dipakai (ID-nya disalin, berkasnya tidak).</div></div></div>
      <div class="row mt16"><span class="sp"></span><button class="btn btn-p" id="mig-scan">${ic('travel_explore', 's18')}Pindai (dry-run)</button></div>`;
  } else if (M.tahap === 'hasil' || M.tahap === 'jalan' || M.tahap === 'selesai') {
    const P = M.pindai, tot = M.tahap === 'hasil' ? P.total : Object.values(M.jalan).reduce((a, j) => { if (j.hasil) { a.ditambah += j.hasil.ditambah; a.diperbarui += j.hasil.diperbarui; a.dilewati += j.hasil.dilewati; } return a; }, { ditambah: 0, diperbarui: 0, dilewati: 0 });
    const selesai = Object.values(M.jalan).filter((j) => j.hasil || j.galat).length, n = P.laporan.length;
    isi = `<div class="inner fs13 mb16">Sumber: <b>${esc(P.sumber.nama)}</b> <span class="mono dim">${esc(P.sumber.id.slice(0, 12))}…</span></div>
      <div class="g g4 ministat">${[['Ditambah', tot.ditambah, 'ok', 'add_circle'], ['Diperbarui', tot.diperbarui, 'info', 'sync_alt'], ['Dilewati', tot.dilewati, 'mut', 'skip_next'], ['Sheet', M.tahap === 'hasil' ? n : selesai + '/' + n, '', 'table_view']].map(([l, v, c, i]) => `<div class="mini"><span class="row g4">${ic(i, 's18 ' + c)}${l}</span><b class="fs20 ${c}">${typeof v === 'number' ? n0(v) : v}</b></div>`).join('')}</div>
      ${M.tahap === 'jalan' ? `<div class="mt16"><div class="bar"><i style="width:${Math.round(selesai / n * 100)}%"></i></div><div class="fs12 muted mt4">Memproses ${esc(M.aktif || '…')} — jangan tutup halaman ini.</div></div>` : ''}
      ${M.tahap === 'hasil' && P.peringatan.length ? `<div class="note warn mt16">${ic('warning')}<div><b>${P.peringatan.length} hal yang perlu diketahui</b><ul class="fs12 mt4" style="margin:4px 0 0;padding-left:18px">${P.peringatan.map((x) => `<li>${esc(x)}</li>`).join('')}</ul></div></div>` : ''}
      <div class="mt16">${tabelMigrasi(P.laporan, M.tahap === 'hasil' ? null : M.jalan)}</div>
      ${M.tahap === 'hasil' ? `<div class="row mt16 wrap"><button class="btn btn-g" id="mig-back">${ic('arrow_back', 's18')}Kembali</button><span class="sp"></span><button class="btn btn-p" id="mig-run" ${tot.ditambah + tot.diperbarui ? '' : 'disabled'}>${ic('cloud_sync', 's18')}Jalankan migrasi (${n0(tot.ditambah + tot.diperbarui)} baris)</button></div>` : ''}
      ${M.tahap === 'selesai' ? `<div class="note ok mt16">${ic('task_alt')}<div><b>Migrasi selesai</b><div class="fs12 mt4">Langkah berikutnya: (1) uji dengan 1 akun RM; (2) <b>tepat sebelum pindah</b>, jalankan migrasi sekali lagi (delta — hanya perubahan yang ditulis); (3) hapus pemicu di proyek v1, lalu nyalakan saklar di menu <b>Pengingat</b> dan <b>Pengaturan → WhatsApp</b> v2; (4) umumkan alamat baru.</div></div></div>
        <div class="row mt16 wrap" style="justify-content:center"><button class="btn btn-g" id="mig-lagi">${ic('restart_alt')}Pindai ulang (delta sync)</button><button class="btn btn-p" data-go="dashboard">${ic('dashboard')}Ke dashboard</button></div>` : ''}`;
  }
  el.innerHTML = `<div class="ph"><div><h2>Impor &amp; Sinkronisasi Data</h2><p>Pindahkan seluruh data aplikasi v1 ke v2 dengan aman: pindai dulu, jalankan, lalu ulangi sebagai delta sync tepat sebelum cutover.</p></div></div>${tabModeImpor()}
    <div class="card"><div class="stepper" style="--n:4">${st.map((x, i) => `<div class="stp ${idx === i + 1 ? 'on' : idx > i + 1 ? 'ok' : ''}"><em>${idx > i + 1 ? '✓' : i + 1}</em><div><b>${x[0]}</b><small>${x[1]}</small></div></div>`).join('')}</div><div class="mt16">${isi}</div></div>`;
  pasangModeImpor(el);
  el.querySelectorAll('[data-mo]').forEach((c) => { c.onchange = () => { M.opsi[c.dataset.mo] = c.checked; }; });
  const scan = $('#mig-scan', el);
  if (scan) scan.onclick = async () => {
    M.sumber = ($('#f_mig-src', el).value || '').trim();
    if (!M.sumber) { toast('Sumber kosong', 'Tempel URL atau ID spreadsheet database v1.', 'warn'); return; }
    LS.set('mig_sumber', M.sumber); tombolMuat(scan, true, 'Memindai…');
    try { const r = await api('migrasi.pindai', { sumber: M.sumber, opsi: M.opsi }); M.pindai = r.data; M.tahap = 'hasil'; M.jalan = {}; render('impor', true); }
    catch (e) { tombolMuat(scan, false); gagalToast(e); }
  };
  const back = $('#mig-back', el); if (back) back.onclick = () => { M.tahap = 'awal'; render('impor', true); };
  const lagi = $('#mig-lagi', el); if (lagi) lagi.onclick = () => { M.tahap = 'awal'; M.jalan = {}; render('impor', true); };
  const run = $('#mig-run', el);
  if (run) run.onclick = async () => {
    const tot = M.pindai.total;
    if (!(await konfirmasi({ judul: 'Jalankan migrasi?', pesan: `${n0(tot.ditambah)} baris ditambah dan ${n0(tot.diperbarui)} diperbarui di database v2. Database v1 tidak diubah. Proses berjalan per sheet dan aman diulang.`, ok: 'Ya, jalankan', ikon: 'cloud_sync' }))) return;
    M.tahap = 'jalan'; M.jalan = {}; render('impor', true);
    const urut = M.pindai.urutan;
    for (let i = 0; i < urut.length; i++) {
      const u = urut[i]; M.aktif = u.label; M.jalan[u.sheet] = {};
      if (S.route === 'impor') render('impor', true);
      try { const r = await api('migrasi.jalankan', { sumber: M.sumber, sheet: u.sheet, pertama: i === 0, terakhir: i === urut.length - 1, opsi: M.opsi }); M.jalan[u.sheet] = { hasil: r.data }; }
      catch (e) { M.jalan[u.sheet] = { galat: e.message }; if (e.code === 'AUTH') return; }
    }
    M.tahap = 'selesai'; M.aktif = '';
    const galat = Object.values(M.jalan).filter((j) => j.galat).length;
    toast(galat ? 'Migrasi selesai dengan galat' : 'Migrasi selesai', galat ? galat + ' sheet gagal — periksa tabel lalu jalankan ulang (aman diulang).' : 'Data v1 sudah ada di v2. Memuat ulang data…', galat ? 'warn' : 'ok');
    try { await sinkron(true); } catch (e) { }
    if (S.route === 'impor') render('impor', true);
  };
}
// ── Jalankan ──
mulai();
