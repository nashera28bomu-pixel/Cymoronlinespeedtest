// ─── routes/download.js ───────────────────────────────────────────────────────
import express from 'express';
import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname  = path.dirname(fileURLToPath(import.meta.url));
const YTDLP      = process.env.YTDLP_PATH || 'yt-dlp';
const BROWSER_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

const router = express.Router();

// ─── Helper: extract YouTube video ID ────────────────────────────────────────
function extractYouTubeId(url) {
  return url.match(/(?:v=|youtu\.be\/|embed\/|shorts\/)([a-zA-Z0-9_-]{11})/)?.[1] || null;
}

// ─── GET /api/download/redirect?url=...&format=mp3&quality=128&filename=song ──
// Sends the user's browser directly to a working download URL.
// Nothing proxied through Render — zero bot detection issues.
router.get('/redirect', async (req, res) => {
  const { url, format = 'mp3', quality = '128' } = req.query;
  if (!url?.trim()) return res.status(400).json({ error: 'URL is required' });

  const videoId = extractYouTubeId(url);
  if (!videoId) return res.status(400).json({ error: 'Invalid YouTube URL' });

  // ── Strategy 1: cobalt.tools direct redirect (browser hits cobalt, not Render) ──
  // cobalt.tools has a share URL that works as a direct download link
  const cobaltRedirect = `https://cobalt.tools/?u=${encodeURIComponent(url)}`;

  // ── Strategy 2: y2mate-style free APIs that accept GET requests ──
  // These are hit by the USER'S browser, not Render's server
  const downloadLinks = {
    mp3: [
      `https://www.yt-download.org/api/button/mp3/${videoId}`,
      `https://loader.to/api/button/?url=${encodeURIComponent(url)}&f=mp3`,
    ],
    mp4: [
      `https://www.yt-download.org/api/button/mp4/${videoId}`,
      `https://loader.to/api/button/?url=${encodeURIComponent(url)}&f=mp4`,
    ],
  };

  // Return JSON with all options — frontend picks the best one
  res.json({
    success: true,
    videoId,
    cobalt: cobaltRedirect,
    links: downloadLinks[format] || downloadLinks.mp3,
    // Primary recommended link — open this in a new tab
    primary: format === 'mp3'
      ? `https://www.yt-download.org/api/button/mp3/${videoId}`
      : `https://www.yt-download.org/api/button/mp4/${videoId}`,
  });
});

// ─── GET & POST /api/download ─────────────────────────────────────────────────
// Tries yt-dlp with every client trick available.
// If all fail, returns a JSON with redirect links instead of crashing.
async function handleDownload(req, res) {
  const params   = req.method === 'POST' ? req.body : req.query;
  const { url, format = 'mp3', quality = '128', filename = 'cymortune' } = params;

  if (!url?.trim()) return res.status(400).json({ error: 'URL is required' });

  const safeName = (filename || 'cymortune').replace(/[^\w\s-]/g, '').trim() || 'cymortune';
  const videoId  = extractYouTubeId(url);

  console.log(`[Download] ${format} ${quality} — ${url.slice(0, 80)}`);

  // ── yt-dlp with every bypass trick ───────────────────────────────────────
  const args = buildYtdlpArgs(url.trim(), format, quality);
  const proc  = spawn(YTDLP, args);

  let hasData     = false;
  let errorOutput = '';

  // Watch stderr for bot detection error
  proc.stderr.on('data', d => {
    const msg = d.toString();
    errorOutput += msg;
    console.warn('[DL stderr]', msg.slice(0, 150));
  });

  // As soon as stdout data flows, commit the response as a file download
  proc.stdout.once('data', chunk => {
    hasData = true;
    res.setHeader('Content-Type', format === 'mp3' ? 'audio/mpeg' : 'video/mp4');
    res.setHeader('Content-Disposition', `attachment; filename="${safeName}.${format}"`);
    res.write(chunk);
    proc.stdout.pipe(res);
  });

  proc.on('close', code => {
    if (hasData) {
      try { res.end(); } catch {}
      return;
    }

    // yt-dlp failed — send redirect links as fallback
    console.log('[Download] yt-dlp failed, sending redirect links');
    if (res.headersSent) return;

    if (videoId) {
      return res.status(200).json({
        success: false,
        fallback: true,
        message: 'Direct download unavailable from this server. Use one of these links:',
        links: {
          cobalt: `https://cobalt.tools/?u=${encodeURIComponent(url)}`,
          ytDownload: format === 'mp3'
            ? `https://www.yt-download.org/api/button/mp3/${videoId}`
            : `https://www.yt-download.org/api/button/mp4/${videoId}`,
          loader: `https://loader.to/api/button/?url=${encodeURIComponent(url)}&f=${format}`,
        },
      });
    }

    res.status(500).json({ success: false, error: 'Download failed. Please try again.' });
  });

  res.on('close', () => { try { proc.kill(); } catch {} });
}

function buildYtdlpArgs(url, format, quality) {
  const args = [
    '--no-warnings', '--no-playlist', '-o', '-',
    // Try all available client types
    '--extractor-args', 'youtube:player_client=android,tv_embedded,ios,web_creator',
    '--add-header', `User-Agent:${BROWSER_UA}`,
    '--add-header', 'Accept-Language:en-US,en;q=0.9',
    '--no-check-certificates',
    '--geo-bypass',
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
