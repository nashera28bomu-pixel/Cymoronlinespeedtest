// ─── routes/download.js ───────────────────────────────────────────────────────
import express from 'express';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname  = path.dirname(fileURLToPath(import.meta.url));
const YTDLP      = process.env.YTDLP_PATH || 'yt-dlp';
const BROWSER_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

const router = express.Router();

// ─── Platform detection ───────────────────────────────────────────────────────
function detectPlatform(url) {
  if (!url) return 'unknown';
  if (/youtube\.com|youtu\.be/i.test(url))        return 'youtube';
  if (/soundcloud\.com/i.test(url))               return 'soundcloud';
  if (/dailymotion\.com|dai\.ly/i.test(url))      return 'dailymotion';
  if (/vimeo\.com/i.test(url))                    return 'vimeo';
  if (/archive\.org/i.test(url))                  return 'archive';
  if (/odysee\.com|lbry\.tv/i.test(url))          return 'odysee';
  if (/mixcloud\.com/i.test(url))                 return 'mixcloud';
  if (/bandcamp\.com/i.test(url))                 return 'bandcamp';
  if (/tiktok\.com/i.test(url))                   return 'tiktok';
  if (/instagram\.com/i.test(url))                return 'instagram';
  if (/twitter\.com|x\.com/i.test(url))           return 'twitter';
  if (/facebook\.com|fb\.watch/i.test(url))       return 'facebook';
  return 'generic';
}

function isYouTube(url) {
  return /youtube\.com|youtu\.be/i.test(url);
}

function extractYouTubeId(url) {
  return url.match(/(?:v=|youtu\.be\/|embed\/|shorts\/)([a-zA-Z0-9_-]{11})/)?.[1] || null;
}

// ─── Build yt-dlp args per platform ──────────────────────────────────────────
function buildArgs(url, format, quality, platform) {
  const safeName = 'cymortune';

  const base = [
    '--no-warnings',
    '--no-playlist',
    '-o', '-',
    '--no-check-certificates',
    '--add-header', `User-Agent:${BROWSER_UA}`,
    '--add-header', 'Accept-Language:en-US,en;q=0.9',
  ];

  // Platform-specific tweaks
  const platformArgs = {
    soundcloud: [
      '--extractor-args', 'soundcloud:formats=progressive',
    ],
    dailymotion: [
      '--extractor-args', 'dailymotion:formats=progressive_mp4',
    ],
    tiktok: [
      '--extractor-args', 'tiktok:webpage_download=1',
    ],
    instagram: [
      '--add-header', 'Cookie:',   // helps with public posts
    ],
    twitter: [],
    facebook: [],
    dailymotion: [],
    vimeo: [],
    archive: [],
    odysee: [],
    mixcloud: [],
    bandcamp: [],
    generic: [
      '--extractor-args', 'generic:impersonate',
    ],
  };

  const extra = platformArgs[platform] || platformArgs.generic;

  // Format args
  let formatArgs;
  if (format === 'mp3') {
    formatArgs = [
      '-x',
      '--audio-format', 'mp3',
      '--audio-quality', quality === '320' ? '0' : '5',
    ];
  } else {
    const h = ['1080', '720', '480', '360'].includes(quality) ? quality : '720';
    formatArgs = [
      '--format',
      `bestvideo[height<=${h}][ext=mp4]+bestaudio[ext=m4a]/bestvideo[height<=${h}]+bestaudio/best[height<=${h}]/best`,
      '--merge-output-format', 'mp4',
    ];
  }

  return [...base, ...extra, ...formatArgs, url.trim()];
}

// ─── GET/POST /api/download ───────────────────────────────────────────────────
async function handleDownload(req, res) {
  const params   = req.method === 'POST' ? req.body : req.query;
  const { url, format = 'mp3', quality = '128', filename = 'cymortune' } = params;

  if (!url?.trim()) return res.status(400).json({ error: 'URL is required' });

  const platform = detectPlatform(url.trim());

  // ── YouTube: redirect to external service ────────────────────────────────
  if (platform === 'youtube') {
    const videoId = extractYouTubeId(url);
    return res.json({
      success: false,
      youtube: true,
      videoId,
      redirectUrl: format === 'mp3'
        ? `https://yt1s.io/youtube-to-mp3?q=${encodeURIComponent(url)}`
        : `https://yt1s.io/youtube-to-mp4?q=${encodeURIComponent(url)}`,
      embedUrl: videoId ? `https://www.youtube.com/embed/${videoId}?autoplay=1` : null,
      message: 'YouTube downloads open in external service',
    });
  }

  // ── All supported platforms: stream via yt-dlp ───────────────────────────
  const safeName = (filename || 'cymortune').replace(/[^\w\s-]/g, '').trim() || 'cymortune';
  const ext      = format === 'mp3' ? 'mp3' : 'mp4';

  console.log(`[Download] platform=${platform} format=${format} quality=${quality} — ${url.slice(0, 80)}`);

  const args = buildArgs(url, format, quality, platform);
  const proc = spawn(YTDLP, args);

  let hasData   = false;
  let errOutput = '';

  proc.stderr.on('data', d => {
    errOutput += d.toString();
    console.warn(`[DL stderr][${platform}]`, d.toString().slice(0, 150));
  });

  proc.stdout.once('data', chunk => {
    hasData = true;
    res.setHeader('Content-Type', format === 'mp3' ? 'audio/mpeg' : 'video/mp4');
    res.setHeader('Content-Disposition', `attachment; filename="${safeName}.${ext}"`);
    res.write(chunk);
    proc.stdout.pipe(res);
  });

  proc.on('close', code => {
    if (hasData) { try { res.end(); } catch {} return; }
    console.error(`[Download][${platform}] yt-dlp failed, code=${code}`);
    console.error('[Download] stderr tail:', errOutput.slice(-400));
    if (!res.headersSent) {
      res.status(500).json({
        success: false,
        error: `Download failed for ${platform}. Make sure the URL is public and supported.`,
        platform,
      });
    }
  });

  res.on('close', () => { try { proc.kill(); } catch {} });
}

router.get('/',  handleDownload);
router.post('/', handleDownload);

export default router;
