/* ============================================================
   SEA — Synthetic Evidence Analyzer
   script.js  —  UI logic, SFX, SSE-powered Gemini upload,
                 media players, timeline auto-seek
   ============================================================ */

'use strict';

// ── Global state
let currentFile      = 'vishing';
let isScanning       = false;
let waveInterval     = null;
let uploadedScanData = null;
let currentMediaType = null;
let mediaDuration    = 0;

// ── Web Audio context (lazy-init)
let audioCtx = null;
function getAudioCtx() {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  return audioCtx;
}

/* ============================================================
   SFX — synthesised via Web Audio API
   ============================================================ */
function playSfxScanStart() {
  try {
    const ctx = getAudioCtx();
    [300, 500, 700].forEach((freq, i) => {
      const osc = ctx.createOscillator(), gain = ctx.createGain();
      osc.connect(gain); gain.connect(ctx.destination);
      osc.type = 'sine'; osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.15, ctx.currentTime + i * 0.08);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i * 0.08 + 0.15);
      osc.start(ctx.currentTime + i * 0.08);
      osc.stop(ctx.currentTime  + i * 0.08 + 0.15);
    });
  } catch (_) {}
}

function playSfxAnomaly() {
  try {
    const ctx = getAudioCtx();
    const osc = ctx.createOscillator(), gain = ctx.createGain();
    osc.connect(gain); gain.connect(ctx.destination);
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(220, ctx.currentTime);
    osc.frequency.linearRampToValueAtTime(110, ctx.currentTime + 0.3);
    gain.gain.setValueAtTime(0.2, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
    osc.start(ctx.currentTime); osc.stop(ctx.currentTime + 0.4);
  } catch (_) {}
}

function playSfxComplete() {
  try {
    const ctx = getAudioCtx();
    [440, 554, 659].forEach((freq, i) => {
      const osc = ctx.createOscillator(), gain = ctx.createGain();
      osc.connect(gain); gain.connect(ctx.destination);
      osc.type = 'triangle'; osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.13, ctx.currentTime + i * 0.12);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i * 0.12 + 0.25);
      osc.start(ctx.currentTime + i * 0.12);
      osc.stop(ctx.currentTime  + i * 0.12 + 0.25);
    });
  } catch (_) {}
}

function playSfxClick() {
  try {
    const ctx = getAudioCtx();
    const buf = ctx.createBuffer(1, ctx.sampleRate * 0.04, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
    const src = ctx.createBufferSource(), gain = ctx.createGain();
    gain.gain.value = 0.15; src.buffer = buf;
    src.connect(gain); gain.connect(ctx.destination); src.start();
  } catch (_) {}
}

/* ============================================================
   DOM Ready
   ============================================================ */
document.addEventListener('DOMContentLoaded', () => {
  initWaveform();
  startWaveformAnimation();
  animateSpectrogram();
  initAudioWaveformLive();
  setupModeToggle();
  setupDemoTabs();
  setupDemoButtons();
  setupUploadZone();
  setupModalButtons();
  setupLabCloseBtn();
  setupCtaForm();
  switchTerminalFile('vishing');
});

/* ============================================================
   MODE TOGGLE
   ============================================================ */
function setupModeToggle() {
  document.querySelectorAll('.mode-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      const mode = btn.getAttribute('data-mode');
      playSfxClick();
      document.querySelectorAll('.mode-tab').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById('panel-demo').classList.toggle('d-none', mode !== 'demo');
      document.getElementById('panel-upload').classList.toggle('d-none', mode !== 'upload');
    });
  });
}

/* ============================================================
   DEMO FILE TABS
   ============================================================ */
function setupDemoTabs() {
  document.querySelectorAll('.file-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      const ft = tab.getAttribute('data-file');
      if (ft) { playSfxClick(); switchTerminalFile(ft); }
    });
  });
}

function setupDemoButtons() {
  const scanBtn   = document.getElementById('diagnostic-scan-btn');
  const reportBtn = document.getElementById('court-report-btn');
  if (scanBtn)   scanBtn.addEventListener('click', runDiagnosticScan);
  if (reportBtn) reportBtn.addEventListener('click', () => generateCourtReport(null));
  const closeBtn = document.getElementById('close-report-btn');
  if (closeBtn)  closeBtn.addEventListener('click', () => {
    document.getElementById('report-modal').classList.add('d-none');
  });
  const printBtn = document.getElementById('print-report-btn');
  if (printBtn)  printBtn.addEventListener('click', () => window.print());
}

/* ============================================================
   WAVEFORM (Demo terminal)
   ============================================================ */
function initWaveform() {
  const c = document.querySelector('.waveform-container');
  if (!c) return;
  c.innerHTML = '';
  for (let i = 0; i < 28; i++) {
    const b = document.createElement('div');
    b.className = 'wave-bar';
    b.style.height = (Math.floor(Math.random() * 60) + 15) + '%';
    c.appendChild(b);
  }
  updateWaveformColorClass();
}

function updateWaveformColorClass() {
  const c = document.querySelector('.waveform-container');
  if (!c) return;
  c.className = 'waveform-container d-flex align-end justify-between py-4 border-b border-t my-4';
  if      (isScanning)               c.classList.add('scanning');
  else if (currentFile === 'authentic') c.classList.add('natural');
  else                               c.classList.add('synthetic');
}

function startWaveformAnimation() {
  if (waveInterval) clearInterval(waveInterval);
  const bars = document.querySelectorAll('.wave-bar');
  if (!bars.length) return;
  waveInterval = setInterval(() => {
    bars.forEach((bar, idx) => {
      let t;
      if (isScanning) {
        t = Math.floor(Math.random() * 85) + 10;
      } else {
        const m = currentFile === 'authentic' ? 0.7 : 1.3;
        t = Math.floor(Math.sin((Date.now() / 240) + idx) * 25 * m) + 50;
        t += (Math.random() - 0.5) * 8;
        t = Math.max(10, Math.min(95, t));
      }
      bar.style.height = t + '%';
    });
  }, 100);
}

/* ============================================================
   AUDIO WAVEFORM LIVE (Player panel)
   ============================================================ */
function initAudioWaveformLive() {
  const c = document.getElementById('audio-waveform-live');
  if (!c) return;
  c.innerHTML = '';
  for (let i = 0; i < 48; i++) {
    const b = document.createElement('div');
    b.className = 'audio-live-bar';
    c.appendChild(b);
  }
  setInterval(() => {
    const p = document.getElementById('audio-player');
    const playing = p && !p.paused;
    document.querySelectorAll('.audio-live-bar').forEach((bar, idx) => {
      const h = playing
        ? 10 + Math.abs(Math.sin((Date.now() / 120) + idx * 0.5)) * 80 + Math.random() * 10
        : 5  + Math.abs(Math.sin((Date.now() / 600) + idx * 0.3)) * 20;
      bar.style.height = Math.min(100, h) + '%';
    });
  }, 80);
}

/* ============================================================
   DEMO TERMINAL: fetch metadata
   ============================================================ */
function switchTerminalFile(fileType) {
  if (isScanning) return;
  document.querySelectorAll('.file-tab').forEach(t =>
    t.classList.toggle('active', t.getAttribute('data-file') === fileType)
  );
  currentFile = fileType;
  updateWaveformColorClass();

  const reportBtn = document.getElementById('court-report-btn');
  if (reportBtn) { reportBtn.disabled = true; reportBtn.style.opacity = '0.5'; reportBtn.style.cursor = 'not-allowed'; }

  const statusEl = document.getElementById('scan-status');
  if (statusEl) { statusEl.innerText = 'BUFFERING...'; statusEl.style.color = 'var(--color-accent)'; }

  fetch('/api/scan', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fileType })
  })
  .then(r => r.json())
  .then(data => {
    if (statusEl) { statusEl.innerText = 'READY'; statusEl.style.color = 'var(--color-mono)'; }
    const fn = document.getElementById('term-filename');
    const mt = document.getElementById('term-file-meta');
    const vd = document.getElementById('term-verdict');
    const ev = document.getElementById('term-evidence');
    if (fn) fn.innerText = data.filename;
    if (mt) mt.innerText = data.meta;
    if (vd) { vd.innerText = data.verdict; vd.style.color = data.isSynthetic ? 'var(--color-danger)' : 'var(--color-mono)'; }
    if (ev) {
      ev.innerHTML = data.evidence.map((e, i) =>
        `<li><span class="text-accent">[0${i+1}]</span> ${e.substring(5)}</li>`
      ).join('');
    }
    updateWaveformColorClass();
  })
  .catch(() => { if (statusEl) { statusEl.innerText = 'ERROR'; statusEl.style.color = 'var(--color-danger)'; }});
}

/* ============================================================
   DEMO TERMINAL: diagnostic scan
   ============================================================ */
function runDiagnosticScan() {
  if (isScanning) return;
  isScanning = true;
  playSfxScanStart();
  updateWaveformColorClass();

  const statusEl  = document.getElementById('scan-status');
  const verdictEl = document.getElementById('term-verdict');
  const evidenceEl = document.getElementById('term-evidence');
  const reportBtn  = document.getElementById('court-report-btn');

  if (statusEl)   { statusEl.innerText = 'SCANNING...'; statusEl.style.color = 'var(--color-danger)'; }
  if (verdictEl)  { verdictEl.innerText = 'COMPUTING LOCAL TENSOR GRADIENTS...'; verdictEl.style.color = 'var(--color-text-secondary)'; }
  if (evidenceEl) {
    evidenceEl.innerHTML = `
      <li class="loading-line">[01] Evaluating spatial dimensions and mesh coords...</li>
      <li class="loading-line" style="animation-delay:0.2s">[02] Mapping high-frequency phase coherence...</li>
      <li class="loading-line" style="animation-delay:0.4s">[03] Resolving codec quantization variables...</li>
    `;
  }
  if (reportBtn) { reportBtn.disabled = true; reportBtn.style.opacity = '0.5'; reportBtn.style.cursor = 'not-allowed'; }

  setTimeout(() => {
    isScanning = false;
    playSfxComplete();
    if (statusEl) { statusEl.innerText = 'READY'; statusEl.style.color = 'var(--color-mono)'; }
    if (reportBtn) { reportBtn.disabled = false; reportBtn.style.opacity = '1'; reportBtn.style.cursor = 'pointer'; reportBtn.classList.add('text-accent'); }
    const cur = currentFile; currentFile = ''; switchTerminalFile(cur);
  }, 2200);
}

/* ============================================================
   COURT REPORT MODAL
   ============================================================ */
function generateCourtReport(uploadData) {
  const modal     = document.getElementById('report-modal');
  const contentEl = document.getElementById('report-markdown-content');
  if (!modal || !contentEl) return;
  contentEl.innerHTML = "<div class='text-mono text-secondary'>GENERATING SECURE CRYPTOGRAPHIC HANDSHAKE...</div>";
  modal.classList.remove('d-none');

  const body = uploadData ? { uploadedData: uploadData } : { fileType: currentFile };
  fetch('/api/generate-report', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  })
  .then(r => r.json())
  .then(data => { contentEl.innerHTML = formatMarkdownToHtml(data.markdown); })
  .catch(() => { contentEl.innerHTML = "<div class='text-danger'>ERROR GENERATING REPORT.</div>"; });
}

/* ============================================================
   MARKDOWN → HTML
   ============================================================ */
function formatMarkdownToHtml(md) {
  let html = md
    .replace(/^## (.*$)/gim, '<h2>$1</h2>')
    .replace(/^### (.*$)/gim, '<h3>$1</h3>')
    .replace(/\*\*(.*?)\*\*/gim, '<strong>$1</strong>')
    .replace(/`(.*?)`/gim, '<code style="background:var(--color-surface-raised);padding:2px 6px;font-family:var(--font-mono);color:var(--color-accent)">$1</code>')
    .replace(/\$(.*?)\$/gim, '<em>$1</em>');
  const lines = html.split('\n');
  let inTable = false, tableRows = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line.startsWith('|')) {
      if (!inTable) { inTable = true; tableRows = []; }
      const cols = line.split('|').map(c => c.trim()).filter((c, idx, a) => idx > 0 && idx < a.length - 1);
      if (cols.every(c => c.match(/^:?-+:?$/))) continue;
      tableRows.push(cols); lines[i] = '';
    } else if (inTable) {
      inTable = false;
      let t = '<table><thead><tr>';
      tableRows[0].forEach(h => { t += `<th>${h}</th>`; });
      t += '</tr></thead><tbody>';
      for (let r = 1; r < tableRows.length; r++) {
        t += '<tr>';
        tableRows[r].forEach(cell => { t += `<td>${cell}</td>`; });
        t += '</tr>';
      }
      t += '</tbody></table>';
      lines[i - 1] = t;
    }
  }
  html = lines.join('\n')
    .replace(/^\* (.*$)/gim, '<li>$1</li>')
    .replace(/(<li>.*<\/li>)/gim, '<ul>$1</ul>')
    .replace(/<\/ul>\s*<ul>/gim, '');
  return html;
}

/* ============================================================
   SPECTROGRAM ANIMATION
   ============================================================ */
function animateSpectrogram() {
  const bars = document.querySelectorAll('.spec-bar');
  if (!bars.length) return;
  setInterval(() => {
    bars.forEach(bar => {
      bar.style.height = bar.classList.contains('spec-bar-danger')
        ? (Math.floor(Math.random() * 20) + 75) + '%'
        : (Math.floor(Math.random() * 45) + 15) + '%';
    });
  }, 300);
}

/* ============================================================
   UPLOAD ZONE SETUP
   ============================================================ */
function setupUploadZone() {
  const zone       = document.getElementById('upload-zone');
  const input      = document.getElementById('file-input');
  const browseLink = document.getElementById('upload-browse-link');
  if (!zone || !input) return;

  browseLink.addEventListener('click', () => { playSfxClick(); input.click(); });
  zone.addEventListener('click', e => { if (e.target !== browseLink) input.click(); });
  zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('drag-over'); });
  zone.addEventListener('dragleave', () => zone.classList.remove('drag-over'));
  zone.addEventListener('drop', e => {
    e.preventDefault(); zone.classList.remove('drag-over');
    const f = e.dataTransfer.files[0];
    if (f) handleFileUpload(f);
  });
  input.addEventListener('change', () => {
    if (input.files[0]) handleFileUpload(input.files[0]);
  });

  const rescanBtn = document.getElementById('up-rescan-btn');
  const reportBtn = document.getElementById('up-report-btn');
  if (rescanBtn) rescanBtn.addEventListener('click', () => { playSfxClick(); resetUploadPanel(); });
  if (reportBtn) reportBtn.addEventListener('click', () => { if (uploadedScanData) generateCourtReport(uploadedScanData); });
}

function resetUploadPanel() {
  document.getElementById('upload-zone').classList.remove('d-none');
  document.getElementById('upload-progress-panel').classList.add('d-none');
  document.getElementById('upload-result-panel').classList.add('d-none');
  document.getElementById('file-input').value = '';
  // Clear gemini log
  const log = document.getElementById('gemini-log');
  if (log) log.innerHTML = '<div class="gemini-log-line">&gt; INITIALIZING FORENSIC ENGINE...</div>';
}

/* ============================================================
   FILE UPLOAD → SSE STREAMING ANALYSIS
   ============================================================ */
function handleFileUpload(file) {
  playSfxScanStart();

  // Show progress panel
  document.getElementById('upload-zone').classList.add('d-none');
  document.getElementById('upload-progress-panel').classList.remove('d-none');
  document.getElementById('upload-result-panel').classList.add('d-none');

  const progressBar   = document.getElementById('upload-progress-bar');
  const progressLabel = document.getElementById('upload-progress-label');
  const geminiLog     = document.getElementById('gemini-log');

  // Reset log
  if (geminiLog) geminiLog.innerHTML = '';

  // Fake upload progress (0→70% while uploading, then Gemini takes over via SSE)
  let fakeProgress = 0;
  const fakeTimer = setInterval(() => {
    fakeProgress = Math.min(fakeProgress + Math.random() * 8, 70);
    if (progressBar) progressBar.style.width = fakeProgress + '%';
    if (progressLabel) progressLabel.innerText = 'UPLOADING... ' + Math.floor(fakeProgress) + '%';
  }, 150);

  const formData = new FormData();
  formData.append('evidence', file);

  // Step 1: POST the file — get back { scanId, pending, fileUrl, mediaType }
  fetch('/api/upload-and-scan', { method: 'POST', body: formData })
    .then(r => { if (!r.ok) throw new Error('Upload failed'); return r.json(); })
    .then(({ scanId, fileUrl, mediaType }) => {
      clearInterval(fakeTimer);
      if (progressBar) progressBar.style.width = '75%';
      if (progressLabel) progressLabel.innerText = 'UPLOAD COMPLETE — GEMINI ANALYSIS IN PROGRESS...';

      // Step 2: Open SSE stream for live log
      openSseStream(scanId, fileUrl, mediaType, file, progressBar, progressLabel, geminiLog);
    })
    .catch(err => {
      clearInterval(fakeTimer);
      console.error('[SEA] Upload error:', err);
      if (progressLabel) progressLabel.innerText = 'UPLOAD FAILED. Check server.';
    });
}

function openSseStream(scanId, fileUrl, mediaType, file, progressBar, progressLabel, geminiLog) {
  const es = new EventSource(`/api/scan-status/${scanId}`);
  let lineCount = 0;

  es.onmessage = (event) => {
    const msg = JSON.parse(event.data);

    if (msg.type === 'log') {
      // Append log line to the Gemini log panel
      appendGeminiLog(geminiLog, msg.msg);
      lineCount++;
      // Advance progress bar as logs come in (75→95%)
      const p = Math.min(75 + lineCount * 3, 95);
      if (progressBar) progressBar.style.width = p + '%';
      if (progressLabel) progressLabel.innerText = msg.msg;
    }

    if (msg.type === 'result') {
      es.close();
      if (progressBar) progressBar.style.width = '100%';
      if (progressLabel) progressLabel.innerText = 'ANALYSIS COMPLETE';

      if (msg.data.error) {
        appendGeminiLog(geminiLog, 'ERROR: ' + msg.data.error, true);
        return;
      }

      uploadedScanData = msg.data;

      setTimeout(() => {
        msg.data.localObjectUrl = URL.createObjectURL(file);
        renderUploadResult(msg.data, file.name);
        openMediaLab(msg.data);
        playSfxComplete();
        if (msg.data.suspiciousSegments && msg.data.suspiciousSegments.length > 0) {
          setTimeout(playSfxAnomaly, 600);
        }
      }, 400);
    }
  };

  es.onerror = () => {
    es.close();
    appendGeminiLog(geminiLog, 'SSE CONNECTION LOST — CHECK SERVER', true);
  };
}

function appendGeminiLog(container, text, isError = false) {
  if (!container) return;
  const line = document.createElement('div');
  line.className = 'gemini-log-line' + (isError ? ' gemini-log-error' : '');
  line.textContent = '> ' + text;
  container.appendChild(line);
  container.scrollTop = container.scrollHeight;
}

/* ============================================================
   RENDER UPLOAD RESULT
   ============================================================ */
function renderUploadResult(data, originalFilename) {
  document.getElementById('upload-progress-panel').classList.add('d-none');
  document.getElementById('upload-result-panel').classList.remove('d-none');

  const fn = document.getElementById('up-filename');
  const mt = document.getElementById('up-file-meta');
  const vd = document.getElementById('up-verdict');
  const ev = document.getElementById('up-evidence');
  const el = document.getElementById('up-engine-label');

  if (fn) fn.innerText = data.filename || originalFilename;
  if (mt) mt.innerText = data.meta;
  if (vd) { vd.innerText = data.verdict; vd.style.color = data.isSynthetic ? 'var(--color-danger)' : 'var(--color-mono)'; }
  if (ev) {
    ev.innerHTML = (data.evidence || []).map((e, i) =>
      `<li><span class="text-accent">[0${i+1}]</span> ${e.replace(/^\[\d+\]\s*/, '')}</li>`
    ).join('');
  }
  if (el) {
    el.innerText = data.poweredByGemini
      ? 'POWERED BY GEMINI 2.0 FLASH'
      : 'DEMO MODE — ADD GEMINI_API_KEY';
    el.style.color = data.poweredByGemini ? 'var(--color-accent)' : 'var(--color-text-secondary)';
  }
}

/* ============================================================
   OPEN MEDIA LAB
   ============================================================ */
function openMediaLab(data) {
  const lab = document.getElementById('upload-lab');
  lab.classList.remove('d-none');
  lab.scrollIntoView({ behavior: 'smooth', block: 'start' });

  const labTitle   = document.getElementById('lab-title');
  const labSummary = document.getElementById('lab-summary');
  const labBadge   = document.getElementById('gemini-badge-lab');

  if (labTitle)   labTitle.innerText   = 'ANALYZING: ' + (data.filename || '—').toUpperCase();
  if (labSummary) labSummary.innerText = data.summary || '';
  if (labBadge)   labBadge.style.display = data.poweredByGemini ? 'flex' : 'none';

  // Hide all players first
  ['video-player-wrap', 'audio-player-wrap', 'image-viewer-wrap'].forEach(id =>
    document.getElementById(id).classList.add('d-none')
  );

  currentMediaType = data.mediaType;
  mediaDuration    = data.duration || 60;

  const mediaSrc = data.localObjectUrl || data.fileUrl;

  if (data.mediaType === 'video') {
    const p = document.getElementById('video-player');
    p.src = mediaSrc;
    document.getElementById('video-player-wrap').classList.remove('d-none');
    setupMediaPlayer(p, data);
  } else if (data.mediaType === 'audio') {
    const p = document.getElementById('audio-player');
    p.src = mediaSrc;
    document.getElementById('audio-player-wrap').classList.remove('d-none');
    setupMediaPlayer(p, data);
  } else if (data.mediaType === 'image') {
    const img = document.getElementById('image-viewer');
    img.src = mediaSrc;
    document.getElementById('image-viewer-wrap').classList.remove('d-none');
  }

  renderTimeline(data);
}

/* ============================================================
   MEDIA PLAYER SETUP
   ============================================================ */
function setupMediaPlayer(player, data) {
  player.removeEventListener('timeupdate', onTimeUpdate);
  player.addEventListener('timeupdate', onTimeUpdate);

  if (data.suspiciousSegments && data.suspiciousSegments.length > 0) {
    const first = data.suspiciousSegments[0];
    player.addEventListener('loadedmetadata', () => {
      mediaDuration = player.duration || data.duration;
      updateTimelineDurationLabel();
      setTimeout(() => {
        player.currentTime = Math.max(0, first.start - 1);
        player.play().catch(() => {});
        playSfxAnomaly();
        highlightAnomalyItem(0);
      }, 800);
    }, { once: true });
  }
}

function onTimeUpdate(e) {
  const dur = e.target.duration || mediaDuration;
  if (!dur) return;
  const pct = (e.target.currentTime / dur) * 100;
  const ph  = document.getElementById('timeline-playhead');
  if (ph) ph.style.left = pct + '%';
}

/* ============================================================
   TIMELINE RENDERING
   ============================================================ */
function renderTimeline(data) {
  const track      = document.getElementById('timeline-track');
  const anomalyList = document.getElementById('anomaly-list');
  if (!track || !anomalyList) return;

  // Remove old markers
  Array.from(track.children).forEach(c => {
    if (c.id !== 'timeline-playhead') c.remove();
  });

  mediaDuration = data.duration || 60;
  updateTimelineDurationLabel();

  const segs = data.suspiciousSegments || [];

  if (!segs.length) {
    anomalyList.innerHTML = `
      <div class="anomaly-item" style="border-color:var(--color-mono);">
        <div class="text-mono text-xs" style="color:var(--color-mono);">✓ NO ANOMALIES DETECTED</div>
        <div class="anomaly-desc">File integrity verified — signal appears authentic.</div>
      </div>`;
    return;
  }

  // Render track markers
  segs.forEach((seg, idx) => {
    const leftPct  = (seg.start / mediaDuration) * 100;
    const widthPct = ((seg.end - seg.start) / mediaDuration) * 100;
    const m = document.createElement('div');
    m.className = 'timeline-marker';
    m.style.left  = leftPct + '%';
    m.style.width = Math.max(widthPct, 1.5) + '%';
    m.setAttribute('title', `${seg.type} @ ${seg.start}s [${seg.confidence}]`);
    m.addEventListener('click', () => seekToSegment(seg, idx));
    track.appendChild(m);
  });

  // Render anomaly list
  anomalyList.innerHTML = '';
  segs.forEach((seg, idx) => {
    const item = document.createElement('div');
    item.className = 'anomaly-item';
    item.id = `anomaly-item-${idx}`;
    item.innerHTML = `
      <div class="anomaly-header d-flex justify-between align-center">
        <span class="text-danger text-mono text-xs font-bold">[${String(idx+1).padStart(2,'0')}] ${seg.type}</span>
        <span class="text-accent text-mono text-xs">${seg.confidence} CONFIDENCE</span>
      </div>
      <div class="anomaly-desc text-secondary text-xs mt-1">${seg.description}</div>
      <div class="anomaly-time text-mono text-xs mt-1" style="color:var(--color-accent-dim);">
        <span>&#9654; ${formatTime(seg.start)} — ${formatTime(seg.end)}</span>
        <button class="jump-btn text-mono text-xs text-accent ml-4" data-start="${seg.start}" data-idx="${idx}">JUMP TO TIMESTAMP</button>
      </div>
    `;
    item.querySelector('.jump-btn').addEventListener('click', e => {
      e.stopPropagation(); playSfxClick(); seekToSegment(seg, idx);
    });
    item.addEventListener('click', () => seekToSegment(seg, idx));
    anomalyList.appendChild(item);
  });
}

function seekToSegment(seg, idx) {
  playSfxAnomaly();
  highlightAnomalyItem(idx);
  const p = currentMediaType === 'video'
    ? document.getElementById('video-player')
    : document.getElementById('audio-player');
  if (p && p.readyState >= 1) {
    p.currentTime = Math.max(0, seg.start);
    p.play().catch(() => {});
  }
  const item = document.getElementById(`anomaly-item-${idx}`);
  if (item) item.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function highlightAnomalyItem(idx) {
  document.querySelectorAll('.anomaly-item').forEach((el, i) =>
    el.classList.toggle('anomaly-active', i === idx)
  );
}

function updateTimelineDurationLabel() {
  const l = document.getElementById('timeline-duration-label');
  if (l) l.innerText = formatTime(mediaDuration);
}

function formatTime(s) {
  return `${String(Math.floor(s / 60)).padStart(2,'0')}:${String(Math.floor(s % 60)).padStart(2,'0')}`;
}

/* ============================================================
   CLOSE MEDIA LAB
   ============================================================ */
function setupLabCloseBtn() {
  const btn = document.getElementById('lab-close-btn');
  if (!btn) return;
  btn.addEventListener('click', () => {
    playSfxClick();
    document.getElementById('upload-lab').classList.add('d-none');
    ['video-player', 'audio-player'].forEach(id => {
      const p = document.getElementById(id);
      if (p) { p.pause(); p.src = ''; }
    });
    resetUploadPanel();
  });
}

/* ============================================================
   MODAL BUTTONS
   ============================================================ */
function setupModalButtons() {
  const c = document.getElementById('close-report-btn');
  if (c) c.addEventListener('click', () => document.getElementById('report-modal').classList.add('d-none'));
  const p = document.getElementById('print-report-btn');
  if (p) p.addEventListener('click', () => window.print());
}

/* ============================================================
   CTA FORM
   ============================================================ */
function setupCtaForm() {
  const form = document.getElementById('cta-form');
  if (!form) return;
  form.addEventListener('submit', e => {
    e.preventDefault(); playSfxComplete();
    const input    = form.querySelector('input');
    const feedback = document.getElementById('cta-feedback');
    if (!feedback) return;
    feedback.innerText = 'TRANSMITTING HANDSHAKE... SECURITY CLEARANCE CONFIRMED.';
    feedback.style.color = 'var(--color-mono)';
    const v = input ? input.value : '';
    setTimeout(() => {
      feedback.innerText = 'OFFICIAL BRIEFING PROTOCOL TRANSMITTED SECURELY TO: ' + v.toUpperCase();
      feedback.style.color = 'var(--color-accent)';
      if (input) input.value = '';
    }, 1200);
  });
}
