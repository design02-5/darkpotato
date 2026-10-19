/**
 * 夏躺每日一籤（純前端，不需伺服器）
 *
 * 每人每天一支：籤號 = hash(裝置代碼 + 台灣日期) % 籤數，同一天重開還是同一支。
 * 裝置代碼存在 localStorage；被清掉就等於換一台裝置（沒有獎品，不需要防作弊）。
 * 預覽：網址加 ?fortune=大吉 指定運勢、?reset 清掉今天的紀錄。
 */
(() => {
  'use strict';

  const $ = id => document.getElementById(id);
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const qs = new URLSearchParams(location.search);
  const SIGNS = window.SIGNS || [];

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

  function todaySign() {
    let i = hash(deviceId() + '|' + today) % SIGNS.length;
    const force = qs.get('fortune');
    if (force) {
      const j = SIGNS.findIndex(s => s[0] === force);
      if (j >= 0) i = j;
    }
    const [fortune, text, comment] = SIGNS[i];
    return { no: i + 1, fortune, text, comment };
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
    await sleep(1600);
    wrap.classList.remove('shaking');
    const s = todaySign();
    store.set(drawnKey, '1');
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
  mountSticks();
  wrap.onclick = btn.onclick = shake;
  $('close').onclick = () => { $('modal').hidden = true; };
  $('modal').onclick = e => { if (e.target === $('modal')) $('modal').hidden = true; };
  // 今天抽過：直接顯示抽出的籤
  if (store.get(drawnKey)) showDrawn(todaySign());
})();
