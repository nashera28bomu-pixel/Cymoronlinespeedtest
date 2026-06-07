// ─── routes/download.js ───────────────────────────────────────────────────────
import express from 'express';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname  = path.dirname(fileURLToPath(import.meta.url));
const YTDLP      = process.env.YTDLP_PATH || 'yt-dlp';
const BROWSER_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

const router = express.Router();

function isYouTube(url) {
  return /youtube\.com|youtu\.be/i.test(url);
}
function extractYouTubeId(url) {
  return url.match(/(?:v=|youtu\.be\/|embed\/|shorts\/)([a-zA-Z0-9_-]{11})/)?.[1] || null;
}

// ─── GET /api/download ────────────────────────────────────────────────────────
async function handleDownload(req, res) {
  const params   = req.method === 'POST' ? req.body : req.query;
  const { url, format = 'mp3', quality = '128', filename = 'cymortune' } = params;

  if (!url?.trim()) return res.status(400).json({ error: 'URL is required' });

  // ── YouTube: return redirect info, don't attempt yt-dlp ──────────────────
  if (isYouTube(url)) {
    const videoId = extractYouTubeId(url);
    return res.json({
      success: false,
      youtube: true,
      videoId,
      // yt1s and loader.to are free, no signup, work great on mobile
      redirectUrl: format === 'mp3'
        ? `https://yt1s.io/youtube-to-mp3?q=${encodeURIComponent(url)}`
        : `https://yt1s.io/youtube-to-mp4?q=${encodeURIComponent(url)}`,
      embedUrl: videoId ? `https://www.youtube.com/embed/${videoId}?autoplay=1` : null,
      message: 'YouTube downloads open in external service',
    });
  }

  // ── All other platforms: stream via yt-dlp (works fine on Render) ────────
  const safeName = (filename || 'cymortune').replace(/[^\w\s-]/g, '').trim() || 'cymortune';
  console.log(`[Download] ${format} ${quality} — ${url.slice(0, 80)}`);

  const args = [
    '--no-warnings', '--no-playlist', '-o', '-',
    '--extractor-args', 'generic:impersonate',
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
      '--merge-output-format', 'mp4'
    );
  }

  args.push(url.trim());

  const proc    = spawn(YTDLP, args);
  let hasData   = false;
  let errOutput = '';

  proc.stderr.on('data', d => {
    errOutput += d.toString();
    console.warn('[DL stderr]', d.toString().slice(0, 150));
  });

  proc.stdout.once('data', chunk => {
    hasData = true;
    res.setHeader('Content-Type', format === 'mp3' ? 'audio/mpeg' : 'video/mp4');
    res.setHeader('Content-Disposition', `attachment; filename="${safeName}.${format}"`);
    res.write(chunk);
    proc.stdout.pipe(res);
  });

  proc.on('close', code => {
    if (hasData) { try { res.end(); } catch {} return; }
    console.error('[Download] yt-dlp failed code', code);
    if (!res.headersSent) {
      res.status(500).json({ success: false, error: 'Download failed. Try a direct URL.' });
    }
  });

  res.on('close', () => { try { proc.kill(); } catch {} });
}

router.get('/', handleDownload);
router.post('/', handleDownload);

export default router;
