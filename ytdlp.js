// ─── utils/ytdlp.js ───────────────────────────────────────────────────────────
import { spawn, exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import fs from 'fs';

const execAsync  = promisify(exec);
const YTDLP      = process.env.YTDLP_PATH || 'yt-dlp';
const TMP        = './tmp';

if (!fs.existsSync(TMP)) fs.mkdirSync(TMP, { recursive: true });

// ─── Detect platform from URL ─────────────────────────────────────────────────
export function detectPlatform(url) {
  if (!url) return 'unknown';
  if (/youtube\.com|youtu\.be/i.test(url))   return 'youtube';
  if (/tiktok\.com/i.test(url))              return 'tiktok';
  if (/instagram\.com/i.test(url))           return 'instagram';
  if (/twitter\.com|x\.com/i.test(url))      return 'twitter';
  if (/facebook\.com|fb\.watch/i.test(url))  return 'facebook';
  if (/soundcloud\.com/i.test(url))          return 'soundcloud';
  if (/spotify\.com/i.test(url))             return 'spotify';
  return 'unknown';
}

// ─── Search YouTube ───────────────────────────────────────────────────────────
export async function searchYoutube(query, limit = 12) {
  const cmd = `${YTDLP} "ytsearch${limit}:${query}" --dump-json --flat-playlist --no-warnings --no-check-certificate`;
  try {
    const { stdout } = await execAsync(cmd, { timeout: 30000, maxBuffer: 10 * 1024 * 1024 });
    const lines  = stdout.trim().split('\n').filter(Boolean);
    const results = [];
    for (const line of lines) {
      try {
        const d = JSON.parse(line);
        results.push({
          id:        d.id,
          title:     d.title     || 'Unknown Title',
          duration:  formatDuration(d.duration),
          thumbnail: d.thumbnail || `https://i.ytimg.com/vi/${d.id}/hqdefault.jpg`,
          author:    d.uploader  || d.channel || 'Unknown',
          url:       d.url       || `https://www.youtube.com/watch?v=${d.id}`,
          platform:  'youtube',
          views:     formatViews(d.view_count),
        });
      } catch {}
    }
    return results;
  } catch (err) {
    throw new Error('Search failed: ' + err.message);
  }
}

// ─── Get media info from URL ──────────────────────────────────────────────────
export async function getMediaInfo(url) {
  const platform = detectPlatform(url);

  // For Spotify — search on YouTube instead
  if (platform === 'spotify') {
    const cmd = `${YTDLP} --dump-json --no-warnings --no-check-certificate "${url}"`;
    try {
      const { stdout } = await execAsync(cmd, { timeout: 20000 });
      const d = JSON.parse(stdout.trim().split('\n')[0]);
      return buildInfoObject(d, 'spotify');
    } catch {
      throw new Error('Spotify: could not fetch track info. Try searching by name.');
    }
  }

  const cmd = `${YTDLP} --dump-json --no-warnings --no-check-certificate --no-playlist "${url}"`;
  try {
    const { stdout } = await execAsync(cmd, { timeout: 25000 });
    const d = JSON.parse(stdout.trim().split('\n')[0]);
    return buildInfoObject(d, platform);
  } catch (err) {
    throw new Error('Could not fetch media info: ' + err.message.slice(0, 100));
  }
}

function buildInfoObject(d, platform) {
  // Available qualities
  const formats = [];
  if (d.formats) {
    const hasAudio = d.formats.some(f => f.acodec && f.acodec !== 'none');
    if (hasAudio) {
      formats.push({ label: 'MP3 128kbps', type: 'mp3', quality: '128' });
      formats.push({ label: 'MP3 320kbps', type: 'mp3', quality: '320' });
    }
    const videoFmts = d.formats.filter(f => f.vcodec && f.vcodec !== 'none' && f.height);
    const heights   = [...new Set(videoFmts.map(f => f.height))].sort((a,b) => b-a);
    for (const h of heights.slice(0, 4)) {
      if (h >= 360) formats.push({ label: `MP4 ${h}p`, type: 'mp4', quality: String(h) });
    }
  } else {
    formats.push(
      { label: 'MP3 128kbps', type: 'mp3', quality: '128' },
      { label: 'MP3 320kbps', type: 'mp3', quality: '320' },
      { label: 'MP4 720p',    type: 'mp4', quality: '720'  },
      { label: 'MP4 1080p',   type: 'mp4', quality: '1080' },
    );
  }

  return {
    id:        d.id,
    title:     d.title     || 'Unknown Title',
    author:    d.uploader  || d.channel || d.creator || 'Unknown',
    duration:  formatDuration(d.duration),
    thumbnail: d.thumbnail || '',
    url:       d.webpage_url || d.original_url || '',
    platform,
    formats,
    views:     formatViews(d.view_count),
    likes:     d.like_count ? formatViews(d.like_count) : null,
  };
}

// ─── Stream download to response ─────────────────────────────────────────────
export function streamDownload(url, format, quality, res, filename) {
  let args = [
    '--no-warnings',
    '--no-check-certificate',
    '--no-playlist',
    '-o', '-',   // output to stdout — stream directly
  ];

  if (format === 'mp3') {
    args = args.concat([
      '-x',
      '--audio-format', 'mp3',
      '--audio-quality', quality === '320' ? '0' : '5',
      '--embed-thumbnail',
      '--add-metadata',
    ]);
    res.setHeader('Content-Type', 'audio/mpeg');
  } else {
    // MP4
    const heightMap = { '1080': 'bestvideo[height<=1080]+bestaudio/best[height<=1080]', '720': 'bestvideo[height<=720]+bestaudio/best[height<=720]', '480': 'bestvideo[height<=480]+bestaudio/best[height<=480]', '360': 'bestvideo[height<=360]+bestaudio/best[height<=360]' };
    args = args.concat([
      '-f', heightMap[quality] || `bestvideo[height<=${quality}]+bestaudio/best`,
      '--merge-output-format', 'mp4',
    ]);
    res.setHeader('Content-Type', 'video/mp4');
  }

  args.push(url);

  const safeFilename = (filename || 'cymortune_download')
    .replace(/[^a-z0-9_\-\s]/gi, '_')
    .replace(/\s+/g, '_')
    .slice(0, 80);

  res.setHeader('Content-Disposition', `attachment; filename="${safeFilename}.${format === 'mp3' ? 'mp3' : 'mp4'}"`);

  const proc = spawn(YTDLP, args);

  proc.stdout.pipe(res);

  proc.stderr.on('data', (d) => {
    // Log progress but don't crash
    const msg = d.toString();
    if (msg.includes('ERROR')) console.error('yt-dlp error:', msg.slice(0, 200));
  });

  proc.on('error', (err) => {
    if (!res.headersSent) {
      res.status(500).json({ error: 'Download process failed: ' + err.message });
    }
  });

  proc.on('close', (code) => {
    if (code !== 0 && !res.writableEnded) {
      try { res.end(); } catch {}
    }
  });

  // Handle client disconnect
  res.on('close', () => {
    try { proc.kill('SIGTERM'); } catch {}
  });

  return proc;
}

// ─── Cleanup tmp folder ───────────────────────────────────────────────────────
export function cleanTmp() {
  try {
    const files = fs.readdirSync(TMP);
    const now   = Date.now();
    for (const f of files) {
      const fp   = path.join(TMP, f);
      const stat = fs.statSync(fp);
      if (now - stat.mtimeMs > 10 * 60 * 1000) {
        fs.unlinkSync(fp);
      }
    }
  } catch {}
}

setInterval(cleanTmp, 5 * 60 * 1000);

// ─── Helpers ──────────────────────────────────────────────────────────────────
function formatDuration(seconds) {
  if (!seconds) return '0:00';
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
