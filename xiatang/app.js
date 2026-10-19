/**
 * 夏躺每日一籤（純前端，不需伺服器）
 *
 * 每人每天一支：籤號 = hash(裝置代碼 + 台灣日期) % 籤數，同一天重開還是同一支。
 * 裝置代碼存在 localStorage；被清掉就等於換一台裝置（沒有獎品，不需要防作弊）。
 * 預覽：網址加 ?fortune=大吉 指定運勢、?reset 清掉今天的紀錄。
 *
 * 籤池來源：Google 試算表「發布到網路」的 CSV（SHEET_CSV），每次開頁讀最新的；
 * 讀不到（網路問題、還沒設定）就用 signs.js 內建的籤。
 * 抽到的籤會存起來，當天試算表改了也不會讓已經抽的人換籤。
 */
(() => {
  'use strict';

  // 夏躺籤池試算表（共用設定要是「知道連結的人都能檢視」）；gid＝分頁編號，換分頁就改 gid
  const SHEET_CSV_URL = 'https://docs.google.com/spreadsheets/d/1SRJ8WYowdZhfAEpOLeLKiLsolbfcoSWbEHsItqKQqbY/gviz/tq?tqx=out:csv&gid=0';

  const $ = id => document.getElementById(id);
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const qs = new URLSearchParams(location.search);
  let SIGNS = window.SIGNS || [];
  // 預覽可用 ?csv=網址 測試別的試算表
  const SHEET_CSV = qs.get('csv') || SHEET_CSV_URL;

  /**
   * 讀試算表 CSV，欄位用標題認、順序不限：
   *   ID（籤號，選填）、運勢、文字（籤文＋「解曰→」＋解曰 寫在同一格；也接受分開的 籤文／解曰 欄）、
   *   啟用（填 Y 才抽；沒有這欄＝全部都抽）
   */
  async function loadSheet() {
    if (!SHEET_CSV) return;
    try {
      const res = await fetch(SHEET_CSV + (SHEET_CSV.includes('?') ? '&' : '?') + 't=' + Date.now());
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const rows = parseCsv(await res.text());
      const head = (rows.shift() || []).map(h => h.trim());
      const col = names => head.findIndex(h => names.includes(h));
      const id = col(['ID', '籤號']), f = col(['運勢', '建議運勢']), t = col(['文字', '籤文', '情境文字']);
      const c = col(['解曰', '每日指引']), on = col(['啟用']);
      if (f < 0 || t < 0) throw new Error('找不到「運勢」「文字」欄');
      const cell = (r, i) => (i >= 0 ? String(r[i] || '').trim() : '');
      const list = rows
        .filter(r => cell(r, f) && cell(r, t) && (on < 0 || /^(Y|YES|V|是|TRUE|1)$/i.test(cell(r, on))))
        .map(r => {
          // 「文字」格裡用「解曰→」分開籤文與解曰
          const [text, inline = ''] = cell(r, t).split(/\s*解曰\s*[→:：]?\s*/);
          return [cell(r, f), text.trim(), cell(r, c) || inline.trim(), parseInt(cell(r, id), 10) || 0];
        });
      if (list.length) SIGNS = list;
    } catch (err) {
      console.warn('讀試算表失敗，改用內建籤池', err);
    }
  }

  /** 標準 CSV 解析（支援引號內的逗號與換行） */
  function parseCsv(text) {
    const rows = [[]];
    let cell = '', q = false;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (q) {
        if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; }
        else if (ch === '"') q = false;
        else cell += ch;
      } else if (ch === '"') q = true;
      else if (ch === ',') { rows[rows.length - 1].push(cell); cell = ''; }
      else if (ch === '\n' || ch === '\r') {
        if (ch === '\r' && text[i + 1] === '\n') i++;
        rows[rows.length - 1].push(cell); cell = ''; rows.push([]);
      } else cell += ch;
    }
    rows[rows.length - 1].push(cell);
    return rows.filter(r => r.some(v => v.trim()));
  }

  const store = {
    get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* 無痕模式存不了，照樣能抽 */ } },
    del(k) { try { localStorage.removeItem(k); } catch (e) { /* 同上 */ } },
  };

  /** 台灣日期 2026-10-19 */
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Taipei', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  const drawnKey = 'xt_drawn_' + today;

  function deviceId() {
    let id = store.get('xt_uid');
    if (!id) {
      id = Math.random().toString(36).slice(2) + Date.now().toString(36);
      store.set('xt_uid', id);
    }
    return id;
  }

  /** FNV-1a，字串 → 32 位元整數 */
  function hash(str) {
    let h = 0x811c9dc5;
    for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193); }
    return h >>> 0;
  }

  /** 今天已抽過的籤（存的是內容，試算表當天改了也不受影響） */
  function savedSign() {
    try { return JSON.parse(store.get(drawnKey)); } catch (e) { return null; }
  }

  function todaySign() {
    const saved = savedSign();
    if (saved && saved.fortune && !qs.get('fortune')) return saved;
    let i = hash(deviceId() + '|' + today) % SIGNS.length;
    const force = qs.get('fortune');
    if (force) {
      const j = SIGNS.findIndex(s => s[0] === force);
      if (j >= 0) i = j;
    }
    const [fortune, text, comment, no] = SIGNS[i];
    return { no: no || i + 1, fortune, text, comment };
  }

  // ===================== 畫面 =====================

  const wrap = $('tubeWrap');
  const btn = $('btn');

  function mountSticks() {
    // 竹籤從筒口呈扇形散開，高低錯落
    for (let i = 0; i < 15; i++) {
      const el = document.createElement('i');
      const x = (i - 7) * 7.5;
      el.style.cssText = 'left:calc(50% + ' + x + 'px);height:' + (96 + ((i * 41) % 34)) + 'px;transform:rotate(' + (x / 5.5) + 'deg)';
      $('sticks').appendChild(el);
    }
  }

  async function shake() {
    if (wrap.classList.contains('shaking')) return;
    if (wrap.classList.contains('drawn')) return showSlip(todaySign(), true);
    btn.disabled = true;
    $('hint').textContent = '喀啦喀啦…';
    wrap.classList.add('shaking');
    if (navigator.vibrate) navigator.vibrate([30, 40, 30, 40, 30]);
    // 搖動同時等試算表讀完（最少搖 1.6 秒）
    await Promise.all([sleep(1600), sheetReady]);
    wrap.classList.remove('shaking');
    const s = todaySign();
    store.set(drawnKey, JSON.stringify(s));
    showDrawn(s);
    await sleep(1100);
    showSlip(s, false);
  }

  function showDrawn(s) {
    $('stickText').textContent = s.fortune;
    $('stickOut').classList.toggle('bad', s.fortune.includes('凶'));
    wrap.classList.add('drawn');
    btn.disabled = false;
    btn.textContent = '看我的籤';
    $('hint').textContent = '今日運勢：' + s.fortune + '・明天再來抽新的一支';
  }

  function showSlip(s, again) {
    const d = new Date(today + 'T00:00:00');
    const date = cnNum(d.getMonth() + 1) + '月' + cnNum(d.getDate()) + '日';
    $('slip').innerHTML =
      '<div class="slip' + (s.fortune.includes('凶') ? ' bad' : '') + '"><div class="slip-frame">' +
      '<div class="slip-head">夏躺每日一籤</div>' +
      '<div class="slip-body">' +
      '<div class="slip-fortune"><span>第' + cnNum(s.no) + '籤</span><b>' + esc(s.fortune) + '</b></div>' +
      '<p class="slip-text">' + esc(s.text) + '</p>' +
      (s.comment ? '<p class="slip-comment"><em>解曰</em>' + esc(s.comment) + '</p>' : '') +
      '</div>' +
      '<div class="slip-foot"><span>' + date + (again ? '・今日已抽' : '') + '</span><i class="seal">夏躺</i></div>' +
      '</div></div>';
    $('modal').hidden = false;
    fitSlip($('slip').querySelector('.slip-body'));
  }

  /** 直書排不下時：先拉高籤紙，再一級一級縮小字，直到整支籤放得進去（不出現捲軸） */
  function fitSlip(body) {
    const maxH = Math.min(window.innerHeight * 0.62, 460);
    let h = Math.min(window.innerHeight * 0.46, 330);
    let size = 17;
    const fits = () => body.scrollWidth <= body.clientWidth + 1;
    body.style.height = h + 'px';
    while (!fits() && h < maxH) { h += 20; body.style.height = h + 'px'; }
    while (!fits() && size > 13) { size -= 1; body.style.setProperty('--fs', size + 'px'); }
  }

  /** 23 → 二十三（1～999） */
  function cnNum(n) {
    const d = '〇一二三四五六七八九';
    const h = Math.floor(n / 100), t = Math.floor(n / 10) % 10, u = n % 10;
    let s = h ? d[h] + '百' : '';
    if (t) s += (h || t > 1 ? d[t] : '') + '十';
    else if (h && u) s += '〇';
    return s + (u ? d[u] : '');
  }

  // ===================== 啟動 =====================

  if (qs.has('reset')) store.del(drawnKey);
  const sheetReady = loadSheet();
  mountSticks();
  wrap.onclick = btn.onclick = shake;
  $('close').onclick = () => { $('modal').hidden = true; };
  $('modal').onclick = e => { if (e.target === $('modal')) $('modal').hidden = true; };
  // 今天抽過：直接顯示抽出的籤（舊版只存 '1'，等籤池讀完再算）
  if (store.get(drawnKey)) {
    if ((savedSign() || {}).fortune) showDrawn(todaySign());
    else sheetReady.then(() => showDrawn(todaySign()));
  }
})();
