# 🎵 CymorTune
### *Free Music & Video Downloader — by Cymor Tech Services*
> **"Always a winner"** — Legendary Smiley Cymor
> 💡 **Idea credit: Joyce** — the one who started it all 💜

---

## ✨ What is CymorTune?

A beautiful, ad-free music and video downloader that works in the browser and installs as a PWA (Progressive Web App). Download from YouTube, TikTok, Instagram, Twitter, Facebook, and SoundCloud — free, no signup, no ads.

---

## 🌟 Features

| Feature | Detail |
|---------|--------|
| 🎵 MP3 Download | 128kbps and 320kbps |
| 🎬 MP4 Download | 360p, 480p, 720p, 1080p |
| 🔍 Search | Search by song name or artist |
| 🔗 URL Support | Paste any supported URL |
| 📱 PWA | Installs on phone like a native app |
| 📦 Downloads Tab | Full download history with re-download |
| 🌙 Dark/Light Mode | Toggle with one tap |
| 🚫 Zero Ads | Completely ad-free |
| 🚫 No Signup | No account needed |
| ⚡ Streaming | Files stream directly — no server storage |

### Supported Platforms
YouTube · TikTok · Instagram · Twitter/X · Facebook · SoundCloud · Spotify*

*Spotify matched via YouTube

---

## 📁 Project Structure

```
cymortune/
├── server.js                 ← Express server (API + static files)
├── routes/
│   ├── search.js             ← Search + media info endpoints
│   └── download.js           ← Streaming download endpoint
├── utils/
│   └── ytdlp.js              ← yt-dlp wrapper (search, info, stream)
├── assets/                   ← All frontend files (served statically)
│   ├── index.html            ← App shell
│   ├── manifest.json         ← PWA manifest
│   ├── sw.js                 ← Service worker (offline + caching)
│   ├── css/
│   │   └── style.css         ← Complete UI stylesheet
│   ├── js/
│   │   ├── app.js            ← Tab switching, theme toggle
│   │   ├── search.js         ← Search logic, results, URL info
│   │   ├── downloader.js     ← Download flow + modal
│   │   ├── history.js        ← Downloads tab + localStorage
│   │   └── sw-register.js    ← PWA registration + install prompt
│   └── icons/
│       ├── icon-192.png      ← PWA icon
│       ├── icon-512.png      ← PWA icon large
│       └── icon.svg          ← Source SVG for custom icons
├── tmp/                      ← Temp files (auto-cleaned, auto-created)
├── .env.example
├── package.json
├── render.yaml               ← One-click Render deploy
└── README.md
```

---

## 🛠 Local Setup

### Requirements
- Node.js v18+
- Python 3 + pip (for yt-dlp)
- ffmpeg (for MP3 conversion)

### Install

```bash
# 1. Install Node dependencies
npm install

# 2. Install yt-dlp
pip3 install yt-dlp
# or on Windows:
pip install yt-dlp

# 3. Install ffmpeg (required for MP3)
# Ubuntu/Debian:
sudo apt install ffmpeg
# macOS:
brew install ffmpeg
# Windows: download from https://ffmpeg.org/download.html

# 4. Configure
cp .env.example .env

# 5. Run
npm start
```

Open http://localhost:3000

---

## ☁ Deploy on Render (Free)

### Step 1 — Push to GitHub
```bash
git init
git add .
git commit -m "CymorTune v1.0"
git remote add origin https://github.com/YOU/cymortune.git
git push -u origin main
```

### Step 2 — Create Render Web Service
1. Go to [render.com](https://render.com) → **New → Web Service**
2. Connect your GitHub repo
3. Settings:
   | Field | Value |
   |-------|-------|
   | Environment | Node |
   | Build Command | `npm install && pip3 install yt-dlp` |
   | Start Command | `node server.js` |
   | Plan | Free |

### Step 3 — Environment Variables
Add in Render dashboard:
- `NODE_ENV` → `production`
- `PORT` → `3000`

### Step 4 — Keep Alive
Add a [UptimeRobot](https://uptimerobot.com) monitor:
- URL: `https://your-app.onrender.com/health`
- Interval: 5 minutes

---

## 📱 Install as PWA

### On Android
1. Open the site in Chrome
2. Tap the **⋮ menu** → **Add to Home Screen**
3. OR tap the **Install CymorTune** banner that appears

### On iPhone
1. Open in Safari
2. Tap **Share** → **Add to Home Screen**

Once installed, CymorTune works like a native app — full screen, no browser UI, works offline (cached UI).

---

## 🔌 API Reference

### Search
```
GET /api/search?q=Rema+Calm+Down&limit=12
```
Returns array of search results with thumbnails, titles, durations.

### Media Info
```
GET /api/search/info?url=https://youtube.com/watch?v=xxx
```
Returns full media info including all available formats and qualities.

### Download (streaming)
```
GET /api/download?url=URL&format=mp3&quality=320&title=Song+Name
```
Streams the file directly to browser — no temp storage on server.

| Param | Options |
|-------|---------|
| format | `mp3`, `mp4` |
| quality | `128`, `320` (mp3) · `360`, `480`, `720`, `1080` (mp4) |

---

## ⚠ Legal Notice

CymorTune is built for **personal use only**. Downloading copyrighted content may be restricted in your country. Always respect the copyright laws and terms of service of the platforms you download from. The creator assumes no liability for misuse.

---

## 🔧 Troubleshooting

| Problem | Solution |
|---------|----------|
| Downloads failing | Update yt-dlp: `pip3 install -U yt-dlp` |
| No audio in MP4 | Install ffmpeg |
| Slow on Render | First request wakes the server (15-30s). Use UptimeRobot |
| TikTok not working | Try pasting the full TikTok URL |
| Instagram failing | Only works for public posts/reels |

---

*Powered by Cymor Tech Services* | *Always a winner* 🏆
*Idea by Joyce 💜*
