// ─── utils/ytdlp.js ───────────────────────────────────────────────────────────
import { spawn } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const YTDLP     = process.env.YTDLP_PATH || 'yt-dlp';
const TMP       = path.resolve(__dirname, '../tmp');

if (!fs.existsSync(TMP)) fs.mkdirSync(TMP, { recursive: true });

// ─── Run yt-dlp and collect stdout ───────────────────────────────────────────
function runYtdlp(args, timeoutMs = 40000) {
  return new Promise((resolve, reject) => {
    const proc   = spawn(YTDLP, args);
    let stdout   = '';
    let stderr   = '';

    proc.stdout.on('data', d => { stdout += d.toString(); });
    proc.stderr.on('data', d => { stderr += d.toString(); });

    const timer = setTimeout(() => {
      proc.kill('SIGTERM');
      reject(new Error('yt-dlp timed out'));
    }, timeoutMs);

    proc.on('close', code => {
      clearTimeout(timer);
      if (code === 0 || stdout.trim()) {
        resolve(stdout);
      } else {
        const msg = stderr.slice(-400);
        reject(new Error(msg || `yt-dlp exited with code ${code}`));
      }
    });

    proc.on('error', err => {
      clearTimeout(timer);
      reject(new Error('yt-dlp not found. Make sure it is installed: pip3 install yt-dlp'));
    });
  });
}

// ─── Shared bypass args ───────────────────────────────────────────────────────
// Uses android client to bypass YouTube bot detection on server IPs
const BYPASS = [
  '--extractor-args', 'youtube:player_client=android,web',
  '--user-agent', 'Mozilla/5.0 (Linux; Android 12; Pixel 6) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/112.0.0.0 Mobile Safari/537.36',
  '--no-warnings',
  '--no-check-certificate',
  '--socket-timeout', '30',
  '--retries', '3',
];

// ─── Detect platform ──────────────────────────────────────────────────────────
export function detectPlatform(url) {
  if (!url) return 'unknown';
  if (/youtube\.com|youtu\.be/i.test(url))  return 'youtube';
  if (/tiktok\.com/i.test(url))             return 'tiktok';
  if (/instagram\.com/i.test(url))          return 'instagram';
  if (/twitter\.com|x\.com/i.test(url))     return 'twitter';
  if (/facebook\.com|fb\.watch/i.test(url)) return 'facebook';
  if (/soundcloud\.com/i.test(url))         return 'soundcloud';
  if (/spotify\.com/i.test(url))            return 'spotify';
  return 'unknown';
}

// ─── Search YouTube ───────────────────────────────────────────────────────────
export async function searchYoutube(query, limit = 12) {
  const args = [
    ...BYPASS,
    '--flat-playlist',
    '--dump-json',
    '--no-playlist',
    `ytsearch${limit}:${query}`,
  ];

  try {
    const stdout  = await runYtdlp(args, 45000);
    const lines   = stdout.trim().split('\n').filter(Boolean);
    const results = [];

    for (const line of lines) {
      try {
        const d = JSON.parse(line);
        if (!d.id) continue;
        results.push({
          id:        d.id,
          title:     d.title    || 'Unknown Title',
          duration:  formatDuration(d.duration),
          thumbnail: d.thumbnail || `https://i.ytimg.com/vi/${d.id}/hqdefault.jpg`,
          author:    d.uploader || d.channel || 'Unknown',
          url:       `https://www.youtube.com/watch?v=${d.id}`,
          platform:  'youtube',
          views:     formatViews(d.view_count),
        });
      } catch {}
    }

    if (!results.length) throw new Error('No results found for: ' + query);
    return results;

  } catch (err) {
    console.error('[Search error]', err.message?.slice(0, 200));
    throw new Error('Search failed: ' + err.message?.slice(0, 100));
  }
}

// ─── Get media info from URL ──────────────────────────────────────────────────
export async function getMediaInfo(url) {
  const platform = detectPlatform(url);
  const args = [
    ...BYPASS,
    '--dump-json',
    '--no-playlist',
    url,
  ];

  try {
    const stdout = await runYtdlp(args, 30000);
    const d      = JSON.parse(stdout.trim().split('\n')[0]);
    return buildInfoObject(d, platform);
  } catch (err) {
    console.error('[Info error]', err.message?.slice(0, 200));
    throw new Error('Could not fetch media info. Try searching by name instead.');
  }
}

function buildInfoObject(d, platform) {
  const formats = [
    { label: 'MP3 128kbps', type: 'mp3', quality: '128' },
    { label: 'MP3 320kbps', type: 'mp3', quality: '320' },
  ];

  if (d.formats) {
    const heights = [...new Set(
      d.formats
        .filter(f => f.vcodec && f.vcodec !== 'none' && f.height)
        .map(f => f.height)
    )].sort((a, b) => b - a);

    for (const h of heights.slice(0, 4)) {
      if (h >= 360) formats.push({ label: `MP4 ${h}p`, type: 'mp4', quality: String(h) });
    }
  } else {
    formats.push(
      { label: 'MP4 720p',  type: 'mp4', quality: '720'  },
      { label: 'MP4 1080p', type: 'mp4', quality: '1080' },
    );
  }

  return {
    id:        d.id,
    title:     d.title    || 'Unknown Title',
    author:    d.uploader || d.channel || d.creator || 'Unknown',
    duration:  formatDuration(d.duration),
    thumbnail: d.thumbnail || '',
    url:       d.webpage_url || d.original_url || '',
    platform,
    formats,
    views:     formatViews(d.view_count),
    likes:     d.like_count ? formatViews(d.like_count) : null,
  };
}

// ─── Stream download directly to Express response ────────────────────────────
export function streamDownload(url, format, quality, res, filename) {
  const qualityMap = {
    '1080': 'bestvideo[height<=1080][ext=mp4]+bestaudio[ext=m4a]/bestvideo[height<=1080]+bestaudio/best[height<=1080]',
    '720':  'bestvideo[height<=720][ext=mp4]+bestaudio[ext=m4a]/bestvideo[height<=720]+bestaudio/best[height<=720]',
    '480':  'bestvideo[height<=480]+bestaudio/best[height<=480]',
    '360':  'bestvideo[height<=360]+bestaudio/best[height<=360]',
  };

  const args = [
    ...BYPASS,
    '--no-playlist',
    '-o', '-',
  ];

  if (format === 'mp3') {
    args.push('-x', '--audio-format', 'mp3', '--audio-quality', quality === '320' ? '0' : '5');
    res.setHeader('Content-Type', 'audio/mpeg');
  } else {
    args.push(
      '-f', qualityMap[quality] || `bestvideo[height<=${quality}]+bestaudio/best`,
      '--merge-output-format', 'mp4'
    );
    res.setHeader('Content-Type', 'video/mp4');
  }

  args.push(url);

  const safe = (filename || 'cymortune')
    .replace(/[^a-z0-9_\-\s]/gi, '_')
    .replace(/\s+/g, '_')
    .slice(0, 80);

  res.setHeader('Content-Disposition', `attachment; filename="${safe}.${format === 'mp3' ? 'mp3' : 'mp4'}"`);
  res.setHeader('X-Accel-Buffering', 'no');
  res.setHeader('Cache-Control', 'no-cache');

  console.log(`[Download] ${format} ${quality} — ${url.slice(0, 70)}`);

  const proc = spawn(YTDLP, args);
  proc.stdout.pipe(res);

  let errBuf = '';
  proc.stderr.on('data', d => {
    const line = d.toString().trim();
    errBuf += line;
    if (line && !line.startsWith('[download]') && !line.startsWith('[info]')) {
      console.log('[yt-dlp stderr]', line.slice(0, 150));
    }
  });

  proc.on('error', err => {
    console.error('[Proc error]', err.message);
    if (!res.headersSent) res.status(500).json({ error: 'Download failed: ' + err.message });
  });

  proc.on('close', code => {
    if (code !== 0) console.error(`[yt-dlp] Exit ${code}:`, errBuf.slice(-300));
    try { if (!res.writableEnded) res.end(); } catch {}
  });

  res.on('close', () => { try { proc.kill('SIGTERM'); } catch {} });
  return proc;
}

// ─── Cleanup tmp ──────────────────────────────────────────────────────────────
export function cleanTmp() {
  try {
    fs.readdirSync(TMP).forEach(f => {
      const fp = path.join(TMP, f);
      try {
        if (Date.now() - fs.statSync(fp).mtimeMs > 10 * 60 * 1000) fs.unlinkSync(fp);
      } catch {}
    });
  } catch {}
}
setInterval(cleanTmp, 5 * 60 * 1000);

// ─── Helpers ──────────────────────────────────────────────────────────────────
function formatDuration(seconds) {
  if (!seconds) return '';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
  return `${m}:${String(s).padStart(2,'0')}`;
}

function formatViews(n) {
  if (!n) return null;
  if (n >= 1e9) return (n/1e9).toFixed(1) + 'B';
  if (n >= 1e6) return (n/1e6).toFixed(1) + 'M';
  if (n >= 1e3) return (n/1e3).toFixed(1) + 'K';
  return String(n);
}
