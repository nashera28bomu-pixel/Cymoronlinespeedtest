// ─── routes/download.js ───────────────────────────────────────────────────────
import express from 'express';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const YTDLP      = process.env.YTDLP_PATH || 'yt-dlp';
const BROWSER_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

const router = express.Router();

// ─── Cobalt instance cache ────────────────────────────────────────────────────
let _cobaltInstances = [];
let _cobaltCacheTime = 0;

async function getCobaltInstances() {
  const now = Date.now();
  if (_cobaltInstances.length && now - _cobaltCacheTime < 600000) return _cobaltInstances;

  try {
    const res = await fetch('https://instances.cobalt.best/api', {
      signal: AbortSignal.timeout(8000),
      headers: { 'User-Agent': 'CymorTune/1.0 (+https://cymortune.onrender.com)' },
    });
    if (!res.ok) throw new Error(`instances HTTP ${res.status}`);
    const data = await res.json();

    // Pick online instances that support YouTube, no auth required
    const list = (Array.isArray(data[0]) ? data[0] : data)
      .filter(i =>
        i.online?.api === true &&
        i.services?.youtube === true &&
        i.cors === true &&
        i.score >= 70
      )
      .sort((a, b) => (b.score || 0) - (a.score || 0))
      .slice(0, 6)
      .map(i => `https://${i.api}`);

    if (list.length) {
      _cobaltInstances = list;
      _cobaltCacheTime = now;
      console.log(`[Cobalt] Loaded ${list.length} instances:`, list);
      return list;
    }
  } catch (e) {
    console.warn('[Cobalt] Could not fetch instances:', e.message);
  }

  // Hardcoded fallback instances (no-auth, cors-enabled)
  _cobaltInstances = [
    'https://co.wuk.sh',
    'https://cobalt.api.bahn.gay',
    'https://cobalt.vert.lt',
    'https://api.cobalt.tools',
  ];
  return _cobaltInstances;
}

// ─── Try Cobalt download — returns a redirect URL ────────────────────────────
async function tryCoabltDownload(videoUrl, format, quality) {
  const instances = await getCobaltInstances();

  const body = {
    url: videoUrl,
    videoQuality: quality === '1080' ? '1080' : quality === '480' ? '480' : quality === '360' ? '360' : '720',
    audioFormat: 'mp3',
    audioBitrate: quality === '320' ? '320' : '128',
    downloadMode: format === 'mp3' ? 'audio' : 'auto',
    filenameStyle: 'basic',
  };

  for (const base of instances) {
    try {
      const res = await fetch(`${base}/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'User-Agent': 'CymorTune/1.0 (+https://cymortune.onrender.com)',
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(12000),
      });

      if (!res.ok) {
        console.warn(`[Cobalt] ${base} HTTP ${res.status}`);
        continue;
      }

      const data = await res.json();
      console.log(`[Cobalt] ${base} status:`, data.status);

      if ((data.status === 'redirect' || data.status === 'tunnel') && data.url) {
        console.log(`[Cobalt] ✓ Got download URL from ${base}`);
        return data.url;
      }
    } catch (e) {
      console.warn(`[Cobalt] ${base} failed:`, e.message);
    }
  }

  return null;
}

// ─── Route: GET & POST /api/download ─────────────────────────────────────────
async function handleDownload(req, res) {
  const params   = req.method === 'POST' ? req.body : req.query;
  const { url, format = 'mp3', quality = '128', filename = 'cymortune' } = params;

  if (!url?.trim()) return res.status(400).json({ error: 'URL is required' });

  const safeName = (filename || 'cymortune').replace(/[^\w\s-]/g, '').trim() || 'cymortune';
  console.log(`[Download] ${format} ${quality} — ${url.slice(0, 80)}`);

  // ── Step 1: Try Cobalt (runs on their servers, not Render's blocked IP) ──
  try {
    const cobaltUrl = await tryCoabltDownload(url.trim(), format, quality);
    if (cobaltUrl) {
      // Proxy the stream through our server so the user gets a clean download
      const stream = await fetch(cobaltUrl, {
        signal: AbortSignal.timeout(60000),
        headers: { 'User-Agent': BROWSER_UA },
      });

      if (stream.ok) {
        res.setHeader('Content-Type', format === 'mp3' ? 'audio/mpeg' : 'video/mp4');
        res.setHeader('Content-Disposition', `attachment; filename="${safeName}.${format}"`);
        if (stream.headers.get('content-length')) {
          res.setHeader('Content-Length', stream.headers.get('content-length'));
        }
        // Pipe the cobalt stream to the client
        const reader = stream.body.getReader();
        const pump = async () => {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            res.write(value);
          }
          res.end();
        };
        pump().catch(() => { try { res.end(); } catch {} });
        return;
      }
    }
  } catch (e) {
    console.warn('[Download] Cobalt proxy failed:', e.message);
  }

  // ── Step 2: yt-dlp fallback with android+tv client ──
  console.log('[Download] Cobalt failed, trying yt-dlp...');
  const args = buildYtdlpArgs(url.trim(), format, quality);
  const proc = spawn(YTDLP, args);

  res.setHeader('Content-Type', format === 'mp3' ? 'audio/mpeg' : 'video/mp4');
  res.setHeader('Content-Disposition', `attachment; filename="${safeName}.${format}"`);

  proc.stdout.pipe(res);
  proc.stderr.on('data', d => console.warn('[DL stderr]', d.toString().slice(0, 150)));
  proc.on('close', code => {
    console.log(`[Download] yt-dlp done (code ${code})`);
    try { res.end(); } catch {}
  });
  res.on('close', () => { try { proc.kill(); } catch {} });
}

function buildYtdlpArgs(url, format, quality) {
  const args = [
    '--no-warnings', '--no-playlist', '-o', '-',
    '--extractor-args', 'youtube:player_client=android,tv_embedded,web',
    '--add-header', `User-Agent:${BROWSER_UA}`,
    '--add-header', 'Accept-Language:en-US,en;q=0.9',
    '--no-check-certificates',
  ];

  if (format === 'mp3') {
    args.push('-x', '--audio-format', 'mp3', '--audio-quality', quality === '320' ? '0' : '5');
  } else {
    const h = ['1080', '720', '480', '360'].includes(quality) ? quality : '720';
    args.push(
      '--format', `bestvideo[height<=${h}][ext=mp4]+bestaudio[ext=m4a]/bestvideo[height<=${h}]+bestaudio/best[height<=${h}]/best`,
      '--merge-output-format', 'mp4',
    );
  }

  args.push(url);
  return args;
}

router.get('/', handleDownload);
router.post('/', handleDownload);

export default router;
