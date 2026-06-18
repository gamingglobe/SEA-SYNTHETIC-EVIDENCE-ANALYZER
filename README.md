# SEA — Synthetic Evidence Analyzer

A multimodal, AI-powered deepfake and synthetic media forensics platform for police cyber-cells and forensic labs. Upload audio, video, or image evidence — SEA uses **Google Gemini 2.0 Flash** to detect manipulation, mark suspicious timestamps on a visual timeline, and generate court-admissible reports.

---

## Features

- 🔍 **AI-Powered Analysis** — Google Gemini 2.0 Flash multimodal forensics
- 🎬 **Video & Audio Players** — Native playback with timeline integration  
- ⏱️ **Suspicious Timestamp Detection** — Auto-seek to anomaly start points
- 📊 **Live Scan Log** — Real-time streaming (SSE) analysis progress
- 📄 **Court-Admissible Reports** — SHA-256 chain-of-custody markdown reports
- 🎵 **SFX Feedback** — Web Audio API sound effects for scan events
- 🔒 **On-Premise Ready** — Air-gapped deployment, no cloud dependency required

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Vanilla HTML, CSS, JavaScript |
| Backend | Node.js + Express |
| File Upload | Multer (up to 300MB) |
| AI Analysis | Google Gemini 2.0 Flash (`@google/generative-ai`) |
| Streaming | Server-Sent Events (SSE) |

---

## Project Structure

```
sea-deepfake-analyzer/
├── backend/
│   ├── server.js            # Express server + SSE endpoints
│   ├── geminiAnalysis.js    # Gemini AI forensic analysis module
│   ├── .env.example         # Environment variable template
│   ├── package.json
│   └── uploads/             # Uploaded evidence (gitignored)
├── frontend/
│   ├── index.html           # Main SPA
│   ├── css/style.css        # Full design system
│   └── js/script.js        # UI logic, SSE client, players
├── reports/                 # Generated court reports (gitignored)
└── .gitignore
```

---

## Setup

### 1. Get a Gemini API Key (free)
Go to [aistudio.google.com/app/apikey](https://aistudio.google.com/app/apikey) and generate a key.

### 2. Configure environment
```bash
cd backend
cp .env.example .env
# Edit .env and set GEMINI_API_KEY=your_key_here
```

### 3. Install dependencies
```bash
cd backend && npm install
```

### 4. Start the server
```bash
node server.js
# Server starts at http://localhost:8000
```

---

## Usage

1. Open [http://localhost:8000](http://localhost:8000)
2. Click **"UPLOAD EVIDENCE"** tab in the terminal panel
3. Drag & drop or browse for a video, audio, or image file
4. Watch the **live Gemini analysis log** stream in real-time
5. View detected suspicious segments on the **visual timeline**
6. Click **"JUMP TO TIMESTAMP"** to auto-seek the player to each anomaly
7. Generate a **court-admissible forensic report** with SHA-256 hash

---

## Without a Gemini Key

The app runs in **DEMO MODE** with realistic mock forensic data — no API key required to test the UI.

---

## License

MIT — For forensic research and law enforcement use.
