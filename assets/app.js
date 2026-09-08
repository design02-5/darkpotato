(() => {
  'use strict';

  const SHEET_ID = '1aExAx2rQsyy52fXXjUtHX7Ib-Uihcs8APSOA-gNwKu8';
  const SHEET_GID = '0';
  const CACHE_KEY = 'summer-lie-jokes-v1';
  const PREF_KEY = 'summer-lie-style-v1';

  const elements = {
    syncStatus: document.getElementById('syncStatus'),
    syncButton: document.getElementById('syncButton'),
    episodeSelect: document.getElementById('episodeSelect'),
    jokeSelect: document.getElementById('jokeSelect'),
    textInput: document.getElementById('textInput'),
    imageInput: document.getElementById('imageInput'),
    removeImageButton: document.getElementById('removeImageButton'),
    dropZone: document.getElementById('dropZone'),
    canvasShell: document.getElementById('canvasShell'),
    emptyState: document.getElementById('emptyState'),
    canvas: document.getElementById('editorCanvas'),
    imageInfo: document.getElementById('imageInfo'),
    autoLayoutButton: document.getElementById('autoLayoutButton'),
    fontFamily: document.getElementById('fontFamily'),
    fontSize: document.getElementById('fontSize'),
    fontSizeOutput: document.getElementById('fontSizeOutput'),
    lineHeight: document.getElementById('lineHeight'),
    lineHeightOutput: document.getElementById('lineHeightOutput'),
    textColor: document.getElementById('textColor'),
    strokeColor: document.getElementById('strokeColor'),
    strokeWidth: document.getElementById('strokeWidth'),
    strokeWidthOutput: document.getElementById('strokeWidthOutput'),
    textAlign: document.getElementById('textAlign'),
    shadowEnabled: document.getElementById('shadowEnabled'),
    backgroundEnabled: document.getElementById('backgroundEnabled'),
    outputFormat: document.getElementById('outputFormat'),
    qualityField: document.getElementById('qualityField'),
    jpegQuality: document.getElementById('jpegQuality'),
    qualityOutput: document.getElementById('qualityOutput'),
    fileName: document.getElementById('fileName'),
    downloadButton: document.getElementById('downloadButton'),
    controlPanel: document.getElementById('controlPanel'),
    mobileTabs: document.getElementById('mobileTabs'),
    mobilePanelCloseButton: document.getElementById('mobilePanelCloseButton'),
    moreStyleButton: document.getElementById('moreStyleButton'),
    advancedStyleFields: document.getElementById('advancedStyleFields'),
    mobileAutoLayoutButton: document.getElementById('mobileAutoLayoutButton'),
    mobileRemoveImageButton: document.getElementById('mobileRemoveImageButton'),
    toast: document.getElementById('toast')
  };

  const ctx = elements.canvas.getContext('2d', { alpha: false });
  const state = {
    image: null,
    imageName: '',
    jokes: {},
    x: 0,
    y: 0,
    maxWidth: 0,
    lines: [],
    box: null,
    dragging: false,
    resizing: false,
    dragOffsetX: 0,
    dragOffsetY: 0,
    resizeStartY: 0,
    resizeStartSize: 64,
    toastTimer: null,
    activePointers: new Map(),
    gestureMode: null,
    tapStart: null,
    pinchStartDistance: 0,
    pinchStartSize: 64,
    panelTouchStartY: null,
    savedEpisode: '',
    savedJoke: ''
  };

  function showToast(message) {
    elements.toast.textContent = message;
    elements.toast.classList.add('show');
    clearTimeout(state.toastTimer);
    state.toastTimer = setTimeout(() => elements.toast.classList.remove('show'), 2400);
  }

  function setSyncStatus(message, isError = false) {
    elements.syncStatus.textContent = message;
    elements.syncStatus.classList.toggle('error', isError);
  }

  function loadPreferences() {
    try {
      const saved = JSON.parse(localStorage.getItem(PREF_KEY) || '{}');
      state.savedEpisode = saved.episodeSelect || '';
      state.savedJoke = saved.jokeSelect || '';
      const keys = ['fontFamily', 'fontSize', 'lineHeight', 'textColor', 'strokeColor', 'strokeWidth', 'textAlign', 'shadowEnabled', 'backgroundEnabled', 'outputFormat', 'jpegQuality', 'textInput', 'fileName'];
      keys.forEach(key => {
        if (!(key in saved) || !elements[key]) return;
        if (elements[key].type === 'checkbox') elements[key].checked = Boolean(saved[key]);
        else elements[key].value = String(saved[key]);
      });
    } catch (_) {
      localStorage.removeItem(PREF_KEY);
    }
    updateOutputs();
  }

  function savePreferences() {
    const values = {};
    ['fontFamily', 'fontSize', 'lineHeight', 'textColor', 'strokeColor', 'strokeWidth', 'textAlign', 'shadowEnabled', 'backgroundEnabled', 'outputFormat', 'jpegQuality', 'textInput', 'fileName', 'episodeSelect', 'jokeSelect'].forEach(key => {
      values[key] = elements[key].type === 'checkbox' ? elements[key].checked : elements[key].value;
    });
    localStorage.setItem(PREF_KEY, JSON.stringify(values));
  }

  function parseSheetRows(response) {
    if (!response || response.status === 'error' || !response.table || !Array.isArray(response.table.rows)) return {};
    const grouped = {};
    response.table.rows.forEach(row => {
      const cells = row.c || [];
      const episode = cells[0] && cells[0].v != null ? String(cells[0].v).trim() : '';
      const jokesText = cells[1] && cells[1].v != null ? String(cells[1].v).trim() : '';
      if (!/^EP\d+$/i.test(episode) || !jokesText) return;
      const jokes = jokesText.split(/[,，]/).map(item => item.trim()).filter(Boolean);
      if (jokes.length) grouped[episode.toUpperCase()] = Array.from(new Set(jokes));
    });
    return grouped;
  }

  function episodeNumber(value) {
    const match = String(value).match(/\d+/);
    return match ? Number(match[0]) : 0;
  }

  function populateEpisodes(preferredEpisode = '') {
    const episodes = Object.keys(state.jokes).sort((a, b) => episodeNumber(b) - episodeNumber(a));
    elements.episodeSelect.innerHTML = '';
    if (!episodes.length) {
      elements.episodeSelect.append(new Option('沒有同步資料', ''));
      elements.jokeSelect.innerHTML = '<option value="">請手動輸入</option>';
      return;
    }
    episodes.forEach(episode => elements.episodeSelect.append(new Option(episode, episode)));
    const wantedEpisode = preferredEpisode || state.savedEpisode;
    elements.episodeSelect.value = episodes.includes(wantedEpisode) ? wantedEpisode : episodes[0];
    populateJokes(state.savedJoke);
  }

  function populateJokes(preferredJoke = '') {
    const episode = elements.episodeSelect.value;
    const jokes = state.jokes[episode] || [];
    elements.jokeSelect.innerHTML = '';
    elements.jokeSelect.append(new Option('請選擇內梗', ''));
    jokes.forEach(joke => elements.jokeSelect.append(new Option(joke, joke)));
    if (jokes.includes(preferredJoke)) elements.jokeSelect.value = preferredJoke;
  }

  function loadCache() {
    try {
      const cache = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null');
      if (cache && cache.jokes && Object.keys(cache.jokes).length) {
        state.jokes = cache.jokes;
        populateEpisodes();
        const date = cache.savedAt ? new Date(cache.savedAt).toLocaleDateString('zh-TW') : '先前';
        setSyncStatus(`使用上次同步資料｜${date}`);
        return true;
      }
    } catch (_) {
      localStorage.removeItem(CACHE_KEY);
    }
    populateEpisodes();
    return false;
  }

  function syncSheet() {
    setSyncStatus('正在同步內梗…');
    elements.syncButton.disabled = true;
    const previousEpisode = elements.episodeSelect.value;
    const callbackName = `summerLieSheetCallback_${Date.now()}`;
    const script = document.createElement('script');
    let finished = false;
    const finish = () => {
      finished = true;
      elements.syncButton.disabled = false;
      script.remove();
      delete window[callbackName];
    };
    const timer = setTimeout(() => {
      if (finished) return;
      finish();
      const hasCache = loadCache();
      setSyncStatus(hasCache ? '同步逾時｜使用上次資料' : '無法同步｜仍可手動輸入', true);
    }, 9000);

    window[callbackName] = response => {
      if (finished) return;
      clearTimeout(timer);
      const grouped = parseSheetRows(response);
      if (!Object.keys(grouped).length) {
        finish();
        const hasCache = loadCache();
        setSyncStatus(hasCache ? '格式異常｜使用上次資料' : '找不到內梗｜仍可手動輸入', true);
        return;
      }
      state.jokes = grouped;
      localStorage.setItem(CACHE_KEY, JSON.stringify({ savedAt: new Date().toISOString(), jokes: grouped }));
      populateEpisodes(previousEpisode);
      setSyncStatus(`● 內梗已同步｜${Object.keys(grouped).length} 集`);
      finish();
    };

    script.onerror = () => {
      if (finished) return;
      clearTimeout(timer);
      finish();
      const hasCache = loadCache();
      setSyncStatus(hasCache ? '連線失敗｜使用上次資料' : '無法同步｜仍可手動輸入', true);
    };
    const query = encodeURIComponent('select A,D where A is not null');
    const tqx = encodeURIComponent(`out:json;responseHandler:${callbackName}`);
    script.src = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?gid=${SHEET_GID}&headers=0&tq=${query}&tqx=${tqx}`;
    document.head.appendChild(script);
  }

  function updateOutputs() {
    elements.fontSizeOutput.textContent = `${elements.fontSize.value} px`;
    elements.lineHeightOutput.textContent = (Number(elements.lineHeight.value) / 100).toFixed(2);
    elements.strokeWidthOutput.textContent = `${elements.strokeWidth.value} px`;
    elements.qualityOutput.textContent = `${elements.jpegQuality.value}%`;
    const isJpeg = elements.outputFormat.value === 'jpeg';
    elements.qualityField.classList.toggle('hidden', !isJpeg);
    elements.downloadButton.textContent = `下載 ${isJpeg ? 'JPG' : 'PNG'}`;
  }

  function validateImage(file) {
    if (!file) return false;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      showToast('請選擇 JPG、PNG 或 WebP 圖片');
      return false;
    }
    if (file.size > 40 * 1024 * 1024) {
      showToast('圖片超過 40 MB，請先縮小檔案');
      return false;
    }
    return true;
  }

  function loadImage(file) {
    if (!validateImage(file)) return;
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      state.image = image;
      state.imageName = file.name.replace(/\.[^.]+$/, '');
      elements.canvas.width = image.naturalWidth;
      elements.canvas.height = image.naturalHeight;
      state.maxWidth = Math.round(image.naturalWidth * 0.52);
      elements.fontSize.value = String(Math.max(28, Math.min(180, Math.round(image.naturalWidth / 18))));
      elements.fileName.value = safeFileName(`夏躺_${elements.episodeSelect.value || ''}_${state.imageName}`);
      elements.imageInfo.textContent = `${image.naturalWidth} × ${image.naturalHeight} px｜${file.name}`;
      elements.canvasShell.classList.remove('empty');
      elements.autoLayoutButton.disabled = false;
      elements.mobileAutoLayoutButton.disabled = false;
      elements.downloadButton.disabled = false;
      elements.removeImageButton.disabled = false;
      elements.mobileRemoveImageButton.disabled = false;
      autoLayout();
      updateOutputs();
      savePreferences();
      showToast('圖片已載入');
      closeMobilePanel();
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      showToast('圖片無法讀取，請換一個檔案');
    };
    image.src = url;
  }

  function imagePointFromEvent(event) {
    const rect = elements.canvas.getBoundingClientRect();
    return {
      x: (event.clientX - rect.left) * elements.canvas.width / rect.width,
      y: (event.clientY - rect.top) * elements.canvas.height / rect.height,
      scale: rect.width / elements.canvas.width
    };
  }

  function removeImage() {
    state.image = null;
    state.imageName = '';
    state.lines = [];
    state.box = null;
    state.dragging = false;
    state.resizing = false;
    elements.imageInput.value = '';
    elements.canvas.width = 1;
    elements.canvas.height = 1;
    ctx.clearRect(0, 0, 1, 1);
    elements.canvasShell.classList.add('empty');
    elements.imageInfo.textContent = '尚未載入圖片';
    elements.autoLayoutButton.disabled = true;
    elements.mobileAutoLayoutButton.disabled = true;
    elements.downloadButton.disabled = true;
    elements.removeImageButton.disabled = true;
    elements.mobileRemoveImageButton.disabled = true;
    elements.fileName.value = '夏躺梗圖';
    showToast('圖片已移除');
    openMobilePanel('image');
  }

  function analyzeRegion(x, y, width, height) {
    const sampleCanvas = document.createElement('canvas');
    const sw = 48;
    const sh = Math.max(20, Math.round(48 * height / width));
    sampleCanvas.width = sw;
    sampleCanvas.height = sh;
    const sampleCtx = sampleCanvas.getContext('2d', { willReadFrequently: true });
    sampleCtx.drawImage(state.image, x, y, width, height, 0, 0, sw, sh);
    const pixels = sampleCtx.getImageData(0, 0, sw, sh).data;
    const luminance = [];
    for (let i = 0; i < pixels.length; i += 4) luminance.push(pixels[i] * .2126 + pixels[i + 1] * .7152 + pixels[i + 2] * .0722);
    const mean = luminance.reduce((sum, value) => sum + value, 0) / luminance.length;
    let variance = 0;
    let edges = 0;
    luminance.forEach(value => { variance += (value - mean) ** 2; });
    for (let row = 1; row < sh; row += 1) {
      for (let col = 1; col < sw; col += 1) {
        const index = row * sw + col;
        edges += Math.abs(luminance[index] - luminance[index - 1]);
        edges += Math.abs(luminance[index] - luminance[index - sw]);
      }
    }
    return variance / luminance.length + edges / (luminance.length * 2) * 22;
  }

  function autoLayout() {
    if (!state.image) return;
    const width = elements.canvas.width;
    const height = elements.canvas.height;
    const margin = Math.max(24, Math.round(Math.min(width, height) * .055));
    const regionWidth = Math.round(width * .48);
    const regionHeight = Math.round(height * .36);
    const candidates = [
      { x: margin, y: margin },
      { x: width - regionWidth - margin, y: margin },
      { x: margin, y: height - regionHeight - margin },
      { x: width - regionWidth - margin, y: height - regionHeight - margin }
    ];
    candidates.forEach(candidate => { candidate.score = analyzeRegion(candidate.x, candidate.y, regionWidth, regionHeight); });
    candidates.sort((a, b) => a.score - b.score);
    state.x = candidates[0].x;
    state.y = candidates[0].y;
    state.maxWidth = regionWidth;
    draw(true);
    showToast('已重新尋找較乾淨的位置');
  }

  function wrapParagraph(text, maxWidth) {
    if (!text) return [''];
    const output = [];
    let line = '';
    Array.from(text).forEach(char => {
      const test = line + char;
      if (line && ctx.measureText(test).width > maxWidth) {
        output.push(line.trim());
        line = char.trimStart();
      } else {
        line = test;
      }
    });
    if (line || !output.length) output.push(line.trim());
    return output;
  }

  function getLines(maxWidth) {
    return elements.textInput.value.split(/\r?\n/).flatMap(paragraph => wrapParagraph(paragraph, maxWidth));
  }

  function getTextMetrics() {
    const fontSize = Number(elements.fontSize.value);
    const lineHeight = fontSize * Number(elements.lineHeight.value) / 100;
    ctx.font = `700 ${fontSize}px "${elements.fontFamily.value}", sans-serif`;
    const lines = getLines(state.maxWidth);
    const widths = lines.map(line => ctx.measureText(line).width);
    const width = Math.min(state.maxWidth, Math.max(1, ...widths));
    const height = Math.max(lineHeight, lines.length * lineHeight);
    return { fontSize, lineHeight, lines, widths, width, height };
  }

  function draw(showSelection = true) {
    if (!state.image) return;
    const width = elements.canvas.width;
    const height = elements.canvas.height;
    ctx.save();
    ctx.clearRect(0, 0, width, height);
    ctx.drawImage(state.image, 0, 0, width, height);

    const metrics = getTextMetrics();
    state.lines = metrics.lines;
    const pad = Math.max(10, metrics.fontSize * .24);
    const boxWidth = Math.min(state.maxWidth, Math.max(metrics.width, metrics.fontSize * 2));
    const boxHeight = metrics.height;
    state.x = Math.max(pad, Math.min(width - boxWidth - pad, state.x));
    state.y = Math.max(pad, Math.min(height - boxHeight - pad, state.y));
    state.box = { x: state.x, y: state.y, width: boxWidth, height: boxHeight };

    if (elements.backgroundEnabled.checked && elements.textInput.value) {
      ctx.fillStyle = 'rgba(20, 16, 22, .58)';
      roundedRect(ctx, state.x - pad, state.y - pad * .7, boxWidth + pad * 2, boxHeight + pad * 1.4, pad * .6);
      ctx.fill();
    }

    ctx.font = `700 ${metrics.fontSize}px "${elements.fontFamily.value}", sans-serif`;
    ctx.textBaseline = 'top';
    ctx.lineJoin = 'round';
    ctx.miterLimit = 2;
    ctx.fillStyle = elements.textColor.value;
    ctx.strokeStyle = elements.strokeColor.value;
    ctx.lineWidth = Number(elements.strokeWidth.value) * Math.max(1, width / 1600);
    if (elements.shadowEnabled.checked) {
      ctx.shadowColor = 'rgba(0, 0, 0, .58)';
      ctx.shadowBlur = metrics.fontSize * .18;
      ctx.shadowOffsetY = metrics.fontSize * .11;
    }

    metrics.lines.forEach((line, index) => {
      const lineWidth = metrics.widths[index];
      let lineX = state.x;
      if (elements.textAlign.value === 'center') lineX = state.x + (boxWidth - lineWidth) / 2;
      if (elements.textAlign.value === 'right') lineX = state.x + boxWidth - lineWidth;
      const lineY = state.y + index * metrics.lineHeight;
      if (Number(elements.strokeWidth.value) > 0) ctx.strokeText(line, lineX, lineY);
      ctx.fillText(line, lineX, lineY);
    });

    ctx.shadowColor = 'transparent';
    if (showSelection && elements.textInput.value) drawSelection(metrics.fontSize);
    ctx.restore();
  }

  function roundedRect(context, x, y, width, height, radius) {
    const r = Math.min(radius, width / 2, height / 2);
    context.beginPath();
    context.moveTo(x + r, y);
    context.arcTo(x + width, y, x + width, y + height, r);
    context.arcTo(x + width, y + height, x, y + height, r);
    context.arcTo(x, y + height, x, y, r);
    context.arcTo(x, y, x + width, y, r);
    context.closePath();
  }

  function drawSelection(fontSize) {
    const box = state.box;
    const handle = Math.max(14, fontSize * .2);
    ctx.save();
    ctx.strokeStyle = '#d0d0d0';
    ctx.lineWidth = Math.max(2, elements.canvas.width / 900);
    ctx.setLineDash([Math.max(6, elements.canvas.width / 220), Math.max(5, elements.canvas.width / 260)]);
    ctx.strokeRect(box.x - 7, box.y - 7, box.width + 14, box.height + 14);
    ctx.setLineDash([]);
    ctx.fillStyle = '#f5f5f5';
    ctx.strokeStyle = '#171717';
    ctx.lineWidth = Math.max(2, elements.canvas.width / 1200);
    ctx.beginPath();
    ctx.arc(box.x + box.width + 7, box.y + box.height + 7, handle, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  function isInsideBox(point) {
    if (!state.box) return false;
    return point.x >= state.box.x - 12 && point.x <= state.box.x + state.box.width + 12 && point.y >= state.box.y - 12 && point.y <= state.box.y + state.box.height + 12;
  }

  function isOnResizeHandle(point) {
    if (!state.box) return false;
    const hx = state.box.x + state.box.width + 7;
    const hy = state.box.y + state.box.height + 7;
    const radius = Math.max(22, Number(elements.fontSize.value) * .34);
    return Math.hypot(point.x - hx, point.y - hy) <= radius;
  }

  function isMobileLayout() {
    return window.matchMedia('(max-width: 960px)').matches;
  }

  function openMobilePanel(name) {
    if (!isMobileLayout()) return;
    elements.controlPanel.classList.add('is-open');
    document.querySelectorAll('[data-panel-content]').forEach(section => section.classList.toggle('mobile-active', section.dataset.panelContent === name));
    document.querySelectorAll('[data-mobile-panel]').forEach(button => {
      const active = button.dataset.mobilePanel === name;
      button.classList.toggle('active', active);
      button.setAttribute('aria-selected', String(active));
    });
  }

  function closeMobilePanel() {
    elements.controlPanel.classList.remove('is-open');
  }

  function pointerDistance() {
    const points = Array.from(state.activePointers.values());
    if (points.length < 2) return 0;
    return Math.hypot(points[1].clientX - points[0].clientX, points[1].clientY - points[0].clientY);
  }

  function beginPinch() {
    state.gestureMode = 'pinch';
    state.dragging = false;
    state.resizing = false;
    state.pinchStartDistance = pointerDistance();
    state.pinchStartSize = Number(elements.fontSize.value);
  }

  function updatePinch() {
    const distance = pointerDistance();
    if (!distance || !state.pinchStartDistance) return;
    const min = Number(elements.fontSize.min);
    const max = Number(elements.fontSize.max);
    const next = Math.round(state.pinchStartSize * distance / state.pinchStartDistance);
    elements.fontSize.value = String(Math.max(min, Math.min(max, next)));
    updateOutputs();
    draw(true);
  }

  function pointerDown(event) {
    if (!state.image || !elements.textInput.value) return;
    state.activePointers.set(event.pointerId, { clientX: event.clientX, clientY: event.clientY });
    elements.canvas.setPointerCapture(event.pointerId);
    if (state.activePointers.size === 2) {
      beginPinch();
      return;
    }
    const point = imagePointFromEvent(event);
    state.tapStart = { clientX: event.clientX, clientY: event.clientY, time: Date.now(), inside: isInsideBox(point) };
    if (isOnResizeHandle(point)) {
      state.resizing = true;
      state.resizeStartY = point.y;
      state.resizeStartSize = Number(elements.fontSize.value);
      return;
    }
    if (isInsideBox(point)) {
      state.dragging = true;
      state.dragOffsetX = point.x - state.x;
      state.dragOffsetY = point.y - state.y;
      state.gestureMode = 'drag';
    }
  }

  function pointerMove(event) {
    if (state.activePointers.has(event.pointerId)) state.activePointers.set(event.pointerId, { clientX: event.clientX, clientY: event.clientY });
    if (state.gestureMode === 'pinch') {
      updatePinch();
      return;
    }
    if (!state.dragging && !state.resizing) return;
    const point = imagePointFromEvent(event);
    if (state.dragging) {
      state.x = point.x - state.dragOffsetX;
      state.y = point.y - state.dragOffsetY;
    } else {
      const delta = (point.y - state.resizeStartY) / 3;
      elements.fontSize.value = String(Math.max(20, Math.min(180, Math.round(state.resizeStartSize + delta))));
      updateOutputs();
    }
    draw(true);
  }

  function pointerUp(event) {
    const tap = state.tapStart;
    const distance = tap ? Math.hypot(event.clientX - tap.clientX, event.clientY - tap.clientY) : Infinity;
    const isTap = tap && tap.inside && distance <= 6 && Date.now() - tap.time <= 350 && state.gestureMode !== 'pinch';
    state.activePointers.delete(event.pointerId);
    state.dragging = false;
    state.resizing = false;
    if (state.activePointers.size < 2 && state.gestureMode === 'pinch') state.gestureMode = null;
    if (!state.activePointers.size) state.gestureMode = null;
    if (elements.canvas.hasPointerCapture(event.pointerId)) elements.canvas.releasePointerCapture(event.pointerId);
    savePreferences();
    if (isTap && isMobileLayout()) {
      openMobilePanel('text');
      setTimeout(() => elements.textInput.focus(), 120);
    }
  }

  function safeFileName(value) {
    return String(value || '夏躺梗圖').replace(/[\\/:*?"<>|]/g, '_').replace(/\s+/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '').slice(0, 90) || '夏躺梗圖';
  }

  function downloadImage() {
    if (!state.image) return;
    const format = elements.outputFormat.value;
    const mime = format === 'jpeg' ? 'image/jpeg' : 'image/png';
    const extension = format === 'jpeg' ? 'jpg' : 'png';
    const quality = Number(elements.jpegQuality.value) / 100;
    draw(false);
    elements.canvas.toBlob(blob => {
      draw(true);
      if (!blob) {
        showToast('輸出失敗，請再試一次');
        return;
      }
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = `${safeFileName(elements.fileName.value)}.${extension}`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(link.href), 1000);
      showToast(`${extension.toUpperCase()} 已下載｜${elements.canvas.width} × ${elements.canvas.height}`);
    }, mime, quality);
  }

  elements.imageInput.addEventListener('change', () => loadImage(elements.imageInput.files[0]));
  elements.removeImageButton.addEventListener('click', removeImage);
  elements.mobileRemoveImageButton.addEventListener('click', removeImage);
  elements.mobileAutoLayoutButton.addEventListener('click', autoLayout);
  ['dragenter', 'dragover'].forEach(type => elements.canvasShell.addEventListener(type, event => {
    event.preventDefault(); elements.canvasShell.classList.add('dragover');
  }));
  ['dragleave', 'drop'].forEach(type => elements.canvasShell.addEventListener(type, event => {
    event.preventDefault(); elements.canvasShell.classList.remove('dragover');
  }));
  elements.canvasShell.addEventListener('drop', event => loadImage(event.dataTransfer.files[0]));
  elements.canvasShell.addEventListener('click', event => {
    if (!state.image) elements.imageInput.click();
  });

  elements.episodeSelect.addEventListener('change', () => {
    populateJokes();
    if (state.imageName) elements.fileName.value = safeFileName(`夏躺_${elements.episodeSelect.value}_${state.imageName}`);
    savePreferences();
  });
  elements.jokeSelect.addEventListener('change', () => {
    if (!elements.jokeSelect.value) return;
    elements.textInput.value = elements.jokeSelect.value;
    if (state.image) autoLayout();
    savePreferences();
  });
  elements.textInput.addEventListener('input', () => { draw(true); savePreferences(); });
  elements.fileName.addEventListener('input', savePreferences);
  elements.autoLayoutButton.addEventListener('click', autoLayout);
  elements.syncButton.addEventListener('click', syncSheet);
  elements.downloadButton.addEventListener('click', downloadImage);
  elements.outputFormat.addEventListener('change', () => { updateOutputs(); savePreferences(); });

  ['fontFamily', 'fontSize', 'lineHeight', 'textColor', 'strokeColor', 'strokeWidth', 'textAlign', 'shadowEnabled', 'backgroundEnabled', 'jpegQuality'].forEach(key => {
    elements[key].addEventListener('input', () => { updateOutputs(); draw(true); savePreferences(); });
    elements[key].addEventListener('change', () => { updateOutputs(); draw(true); savePreferences(); });
  });

  elements.canvas.addEventListener('pointerdown', pointerDown);
  elements.canvas.addEventListener('pointermove', pointerMove);
  elements.canvas.addEventListener('pointerup', pointerUp);
  elements.canvas.addEventListener('pointercancel', pointerUp);

  elements.mobileTabs.addEventListener('click', event => {
    const button = event.target.closest('[data-mobile-panel]');
    if (!button) return;
    const isCurrentPanel = button.classList.contains('active');
    const isOpen = elements.controlPanel.classList.contains('is-open');
    if (isCurrentPanel && isOpen) {
      closeMobilePanel();
      return;
    }
    openMobilePanel(button.dataset.mobilePanel);
  });
  elements.mobilePanelCloseButton.addEventListener('click', closeMobilePanel);
  elements.moreStyleButton.addEventListener('click', () => {
    const expanded = elements.moreStyleButton.getAttribute('aria-expanded') === 'true';
    elements.moreStyleButton.setAttribute('aria-expanded', String(!expanded));
    elements.moreStyleButton.textContent = expanded ? '更多設定' : '收起設定';
    elements.advancedStyleFields.classList.toggle('mobile-collapsed', expanded);
  });
  elements.advancedStyleFields.classList.add('mobile-collapsed');

  elements.mobilePanelCloseButton.addEventListener('pointerdown', event => { state.panelTouchStartY = event.clientY; });
  elements.mobilePanelCloseButton.addEventListener('pointerup', event => {
    if (state.panelTouchStartY !== null && event.clientY - state.panelTouchStartY > 35) closeMobilePanel();
    state.panelTouchStartY = null;
  });

  loadPreferences();
  loadCache();
  syncSheet();
})();
