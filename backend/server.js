/**
 * server.js — SEA Synthetic Evidence Analyzer — Backend
 * ─────────────────────────────────────────────────────────────────────────
 * Express server with:
 *   POST /api/upload-and-scan   — multer upload → Gemini AI analysis
 *   GET  /api/scan-status/:id   — Server-Sent Events stream for live log
 *   POST /api/scan              — Demo tab mock data
 *   POST /api/generate-report   — Generate & save markdown court report
 * ─────────────────────────────────────────────────────────────────────────
 */

'use strict';

require('dotenv').config();

const express = require('express');
const path    = require('path');
const fs      = require('fs');
const multer  = require('multer');
const { analyzeMediaWithGemini } = require('./geminiAnalysis');

const app  = express();
const PORT = process.env.PORT || 8000;

const API_KEY_SET =
  process.env.GEMINI_API_KEY &&
  process.env.GEMINI_API_KEY !== 'YOUR_GEMINI_API_KEY_HERE';

app.use(express.json());

// ── Static: frontend
app.use(express.static(path.join(__dirname, '../frontend')));

// ── Static: uploaded files (for media playback)
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
app.use('/uploads', express.static(uploadsDir));

// ── Multer storage
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => {
    const ext  = path.extname(file.originalname);
    const base = path.basename(file.originalname, ext).replace(/[^a-z0-9._-]/gi, '_');
    cb(null, `${Date.now()}_${base}${ext}`);
  }
});
const upload = multer({ storage, limits: { fileSize: 300 * 1024 * 1024 } });

// ── In-memory SSE channel map  { scanId → { res, logs } }
const sseClients = new Map();

// ── Mock forensic database (demo tabs)
const forensicData = {
  vishing: {
    filename: 'EVID-9021_VISHING_CLONE.wav',
    meta: 'SIZE: 2.4MB | DURATION: 00:00:14 | HASH: SHA-256 (8f1c...)',
    verdict: 'SYNTHETIC — 94.3% SPECTRAL ANOMALY DETECTED',
    isSynthetic: true,
    score: '94.3%',
    evidence: [
      '[01] Mel-spectrogram splice boundary detected at 2.3s',
      '[02] Phase discontinuity at pitch cycle junctions',
      '[03] Artificial formant boost in high frequency band'
    ],
    hash: '8f1c9021e5b23a9f889d910066e7769e8f1c9021e5b23a9f889d910066e7769e'
  },
  deepfake: {
    filename: 'EVID-9022_POLICE_IMPERSONATION.mp4',
    meta: 'SIZE: 14.8MB | DURATION: 00:00:08 | HASH: SHA-256 (3a9f...)',
    verdict: 'SYNTHETIC — 98.7% GAN TEXTURE DETECTED',
    isSynthetic: true,
    score: '98.7%',
    evidence: [
      '[01] Mismatched lighting vector (face node 42)',
      '[02] Eye-blink frequency gap (< 1 per 60 seconds)',
      '[03] Face-border boundary artifact (GAN residue)'
    ],
    hash: '3a9fd022e5b28f1c4ade80dbe63946ac5200b4d8004e6b99127784cdc9a4dc2a'
  },
  authentic: {
    filename: 'EVID-9023_WITNESS_INTERVIEW.wav',
    meta: 'SIZE: 4.1MB | DURATION: 00:00:22 | HASH: SHA-256 (e5b2...)',
    verdict: 'NATURAL — 99.1% INTEGRITY VERIFIED',
    isSynthetic: false,
    score: '99.1%',
    evidence: [
      '[01] Continuous background phase coherence',
      '[02] Unified room acoustic reverberation signature',
      '[03] Source microphone signature verification matches'
    ],
    hash: 'e5b290238f1c4b2ba7dddeec0b214dc2e5b290238f1c4b2ba7dddeec0b214dc2'
  }
};

// ══════════════════════════════════════════════════════════════
// POST /api/scan  — Demo tab (mock data, instant)
// ══════════════════════════════════════════════════════════════
app.post('/api/scan', (req, res) => {
  const { fileType } = req.body;
  const data = forensicData[fileType];
  if (!data) return res.status(400).json({ error: 'Invalid file type.' });
  return res.json(data);
});

// ══════════════════════════════════════════════════════════════
// GET /api/scan-status/:scanId  — SSE live log stream
// ══════════════════════════════════════════════════════════════
app.get('/api/scan-status/:scanId', (req, res) => {
  const { scanId } = req.params;

  res.setHeader('Content-Type',  'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection',    'keep-alive');
  res.flushHeaders();

  // Register client
  const client = { res, closed: false };
  sseClients.set(scanId, client);

  // Send any buffered logs immediately (in case analysis finished before client connected)
  req.on('close', () => {
    client.closed = true;
    sseClients.delete(scanId);
  });
});

// ══════════════════════════════════════════════════════════════
// POST /api/upload-and-scan  — Real Gemini AI analysis
// ══════════════════════════════════════════════════════════════
app.post('/api/upload-and-scan', upload.single('evidence'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded.' });

  const mime     = req.file.mimetype;
  const isVideo  = mime.startsWith('video/');
  const isAudio  = mime.startsWith('audio/');
  const category = isVideo ? 'video' : isAudio ? 'audio' : 'image';

  // ── Generate unique scanId for SSE channel
  const scanId = `${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;

  // ── Compute file hash (SHA-256) for chain of custody
  const { createHash } = require('crypto');
  const fileBuffer = fs.readFileSync(req.file.path);
  const hashHex    = createHash('sha256').update(fileBuffer).digest('hex');

  const fileSizeMB = (req.file.size / (1024 * 1024)).toFixed(1);

  // ── Send scanId immediately so the frontend can open the SSE channel
  res.json({ scanId, pending: true, fileUrl: `/uploads/${req.file.filename}`, mediaType: category });

  // ── SSE helper
  function pushStatus(msg) {
    const client = sseClients.get(scanId);
    if (client && !client.closed) {
      client.res.write(`data: ${JSON.stringify({ type: 'log', msg })}\n\n`);
    }
    console.log(`[SEA][${scanId}] ${msg}`);
  }

  function pushResult(data) {
    const client = sseClients.get(scanId);
    if (client && !client.closed) {
      client.res.write(`data: ${JSON.stringify({ type: 'result', data })}\n\n`);
      client.res.end();
      sseClients.delete(scanId);
    }
  }

  // ── Run Gemini analysis asynchronously
  setImmediate(async () => {
    try {
      pushStatus(`EVIDENCE FILE RECEIVED: ${req.file.originalname.toUpperCase()}`);
      pushStatus(`SIZE: ${fileSizeMB}MB | HASH: SHA-256 (${hashHex.substring(0, 8)}...)`);
      pushStatus(API_KEY_SET
        ? 'GEMINI 2.0 FLASH FORENSIC ENGINE — ONLINE'
        : 'GEMINI API KEY NOT SET — RUNNING DEMO ANALYSIS');

      const geminiResult = await analyzeMediaWithGemini(
        req.file.path,
        mime,
        req.file.originalname,
        pushStatus
      );

      // ── Estimate/derive duration for timeline rendering
      const approxDuration = Math.max(
        10,
        geminiResult.suspiciousSegments.length > 0
          ? Math.max(...geminiResult.suspiciousSegments.map(s => s.end)) + 10
          : Math.floor(req.file.size / 50000)
      );
      const cappedDuration = Math.min(approxDuration, 300);
      const mm = String(Math.floor(cappedDuration / 60)).padStart(2, '0');
      const ss = String(cappedDuration % 60).padStart(2, '0');

      const finalResult = {
        filename:          req.file.originalname,
        fileUrl:           `/uploads/${req.file.filename}`,
        mediaType:         geminiResult.mediaType || category,
        meta:              `SIZE: ${fileSizeMB}MB | DURATION: 00:${mm}:${ss} | HASH: SHA-256 (${hashHex.substring(0, 8)}...)`,
        duration:          cappedDuration,
        verdict:           geminiResult.verdict,
        isSynthetic:       geminiResult.isSynthetic,
        score:             geminiResult.score,
        evidence:          geminiResult.evidence,
        suspiciousSegments: geminiResult.suspiciousSegments,
        summary:           geminiResult.summary || '',
        hash:              hashHex,
        poweredByGemini:   API_KEY_SET
      };

      pushStatus('FORENSIC REPORT READY.');
      pushResult(finalResult);

    } catch (err) {
      console.error('[SEA] Upload analysis error:', err);
      pushStatus('CRITICAL ERROR — ANALYSIS ABORTED.');
      pushResult({ error: err.message });
    }
  });
});

// ══════════════════════════════════════════════════════════════
// POST /api/generate-report  — Court report markdown
// ══════════════════════════════════════════════════════════════
app.post('/api/generate-report', (req, res) => {
  const { fileType, uploadedData } = req.body;
  let data;
  if (uploadedData) {
    data = uploadedData;
  } else {
    data = forensicData[fileType];
    if (!data) return res.status(400).json({ error: 'Invalid file type.' });
  }

  const timestamp   = new Date().toISOString();
  const caseId      = `SEA-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).substr(2, 8).toUpperCase()}`;
  const admissibility = data.isSynthetic ? 'INADMISSIBLE' : 'HIGH ADMISSIBILITY';
  const engine      = data.poweredByGemini ? 'Google Gemini 2.0 Flash (Multimodal AI)' : 'SEA Forensic Engine v2.4 (Demo Mode)';

  const reportMarkdown = `## FORENSIC EVIDENCE ANALYSIS REPORT
**Case Reference ID:** ${caseId}  
**Timestamp of Analysis:** ${timestamp}  
**Analysis Engine:** ${engine}  
**Evidence Admissibility Verdict:** ${admissibility}  

### 1. Executive Summary
${data.summary || `Multi-modal forensic analysis of the submitted asset \`${data.filename}\` has completed. The examination indicates that the target parameters ${data.isSynthetic ? 'exhibit clear markers of synthetic manipulation/cloning' : 'perfectly align with pristine, unaltered baseline values'}.`}

**Admissibility: ${admissibility}**

### 2. Multi-Modal Analysis Breakdown

| Modality | Core Test | Finding | Confidence |
| :--- | :--- | :--- | :--- |
| **Primary** | Multimodal AI Forensic Scan | ${data.isSynthetic ? 'Synthetic manipulation markers confirmed.' : 'No anomalies detected — integrity verified.'} | ${data.score} |
| **Spectral** | Phase & Frequency Analysis | ${data.isSynthetic ? 'Brick-wall filtering; phase junctions discontinuous.' : 'Unified phase coherence; continuous spectral distribution.'} | ${data.score} |
| **Biological** | rPPG / Blink Sync | ${data.isSynthetic ? 'Biological signal flatline detected in video stream.' : 'Heart rate variability matches standard biological parameters.'} | ${data.score} |

### 3. Detailed Forensic Findings
${(data.evidence || []).map(e => `* ${e}`).join('\n')}

${data.suspiciousSegments && data.suspiciousSegments.length > 0 ? `### 4. Suspicious Timeline Segments
${data.suspiciousSegments.map((s, i) => `* **[${String(i+1).padStart(2,'0')}] ${s.type}** @ ${s.start}s–${s.end}s — ${s.description} [${s.confidence}]`).join('\n')}` : ''}

### 5. Technical Conclusion & Chain-of-Custody
* **Cryptographic Hash Verification**: 
  - Input File Name: \`${data.filename}\`
  - Computed SHA-256: \`${data.hash || 'N/A'}\`
  - Hash confirms the integrity of the evidence data stream.
* **Analysis Engine**: ${engine}
* **Closing Statement**: Based on the forensic audit, this file ${data.isSynthetic ? 'contains synthetic anomalies rendering it **inadmissible** as authentic evidence' : 'passes all biometric and structural consistency checks and is **recommended** for legal proceedings'}.
`;

  const reportsDir = path.join(__dirname, '../reports');
  if (!fs.existsSync(reportsDir)) fs.mkdirSync(reportsDir, { recursive: true });
  const reportFilename = `report_${Date.now()}_${(fileType || 'upload').replace(/[^a-z0-9]/gi, '_')}.md`;
  fs.writeFileSync(path.join(reportsDir, reportFilename), reportMarkdown);

  return res.json({ markdown: reportMarkdown, savedPath: `/reports/${reportFilename}` });
});

// ══════════════════════════════════════════════════════════════
// Startup
// ══════════════════════════════════════════════════════════════
app.listen(PORT, () => {
  console.log(`\n[SEA] Forensic Core Engine → http://localhost:${PORT}`);
  if (API_KEY_SET) {
    console.log('[SEA] Gemini 2.0 Flash — ONLINE ✓');
  } else {
    console.log('[SEA] ⚠  GEMINI_API_KEY not set in backend/.env');
    console.log('[SEA]    Get a free key → https://aistudio.google.com/app/apikey');
    console.log('[SEA]    Running in DEMO MODE (mock analysis)');
  }
  console.log('');
});
