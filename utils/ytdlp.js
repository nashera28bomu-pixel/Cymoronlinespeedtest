// ─── utils/ytdlp.js ───────────────────────────────────────────────────────────
// Search  → YouTube Data API v3 (free, reliable, no bot issues)
// Info    → YouTube Data API v3
// Download → yt-dlp (streaming only, no search)

import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const YTDLP     = process.env.YTDLP_PATH || 'yt-dlp';
const YT_KEY    = process.env.YT_API_KEY  || '';
const TMP       = path.resolve(__dirname, '../tmp');

if (!fs.existsSync(TMP)) fs.mkdirSync(TMP, { recursive: true });

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

// ─── Search via YouTube Data API v3 ──────────────────────────────────────────
export async function searchYoutube(query, limit = 12) {
  // If API key available — use official API (most reliable)
  if (YT_KEY) {
    return searchViaAPI(query, limit);
  }
  // Fallback: scrape YouTube search page (no key needed)
  return searchViaScrape(query, limit);
}

// Official YouTube Data API v3
async function searchViaAPI(query, limit) {
  const url = `https://www.googleapis.com/youtube/v3/search?part=snippet&q=${encodeURIComponent(query)}&maxResults=${limit}&type=video&key=${YT_KEY}`;
  const res  = await fetch(url, { signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error(`YouTube API error: ${res.status}`);
  const data = await res.json();

  if (!data.items?.length) throw new Error('No results found for: ' + query);

  return data.items.map(item => ({
    id:        item.id.videoId,
    title:     item.snippet.title,
    duration:  '',
    thumbnail: item.snippet.thumbnails?.high?.url || item.snippet.thumbnails?.default?.url || '',
    author:    item.snippet.channelTitle,
    url:       `https://www.youtube.com/watch?v=${item.id.videoId}`,
    platform:  'youtube',
    views:     null,
  }));
}

// Scrape YouTube search (no API key needed — uses public search endpoint)
async function searchViaScrape(query, limit) {
  const searchUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}&sp=EgIQAQ%3D%3D`;

  const res = await fetch(searchUrl, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Linux; Android 12; Pixel 6) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/112.0.0.0 Mobile Safari/537.36',
      'Accept-Language': 'en-US,en;q=0.9',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    },
    signal: AbortSignal.timeout(20000),
  });

  if (!res.ok) throw new Error(`YouTube returned ${res.status}`);

  const html = await res.text();

  // Extract ytInitialData JSON from page
  const match = html.match(/var ytInitialData = ({.+?});<\/script>/s)
    || html.match(/ytInitialData\s*=\s*({.+?});\s*(?:var|window|<\/script>)/s);

  if (!match) throw new Error('Could not parse YouTube search results');

  let data;
  try { data = JSON.parse(match[1]); } catch { throw new Error('Failed to parse YouTube data'); }

  // Navigate to video results
  const contents =
    data?.contents?.twoColumnSearchResultsRenderer
      ?.primaryContents?.sectionListRenderer
      ?.contents?.[0]?.itemSectionRenderer
      ?.contents || [];

  const results = [];

  for (const item of contents) {
    if (results.length >= limit) break;
    const v = item?.videoRenderer;
    if (!v?.videoId) continue;

    const thumb = v.thumbnail?.thumbnails?.slice(-1)[0]?.url
      || `https://i.ytimg.com/vi/${v.videoId}/hqdefault.jpg`;

    const durationText = v.lengthText?.simpleText || '';
    const viewText     = v.shortViewCountText?.simpleText || v.viewCountText?.simpleText || '';
    const author       = v.ownerText?.runs?.[0]?.text || v.shortBylineText?.runs?.[0]?.text || '';
    const title        = v.title?.runs?.[0]?.text || v.title?.accessibility?.accessibilityData?.label || '';

    if (!title) continue;

    results.push({
      id:        v.videoId,
      title,
      duration:  durationText,
      thumbnail: thumb.split('?')[0], // remove query params for cleaner URL
      author,
      url:       `https://www.youtube.com/watch?v=${v.videoId}`,
      platform:  'youtube',
      views:     viewText,
    });
  }

  if (!results.length) throw new Error('No results found for: ' + query);
  return results;
}

// ─── Get media info from URL ──────────────────────────────────────────────────
export async function getMediaInfo(url) {
  const platform = detectPlatform(url);

  // For YouTube — use API if key available
  if (platform === 'youtube' && YT_KEY) {
    return getYouTubeInfo(url);
  }

  // For all others (and YouTube without key) — use yt-dlp metadata only (faster, no download)
  return getInfoViaYtdlp(url, platform);
}

async function getYouTubeInfo(url) {
  const videoId = extractYouTubeId(url);
  if (!videoId) return getInfoViaYtdlp(url, 'youtube');

  const apiUrl = `https://www.googleapis.com/youtube/v3/videos?part=snippet,contentDetails,statistics&id=${videoId}&key=${YT_KEY}`;
  const res    = await fetch(apiUrl, { signal: AbortSignal.timeout(10000) });
  const data   = await res.json();
  const item   = data.items?.[0];
  if (!item) return getInfoViaYtdlp(url, 'youtube');

  return {
    id:        videoId,
    title:     item.snippet.title,
    author:    item.snippet.channelTitle,
    duration:  parseDuration(item.contentDetails.duration),
    thumbnail: item.snippet.thumbnails?.maxres?.url || item.snippet.thumbnails?.high?.url || '',
    url:       `https://www.youtube.com/watch?v=${videoId}`,
    platform:  'youtube',
    views:     formatViews(parseInt(item.statistics?.viewCount)),
    likes:     formatViews(parseInt(item.statistics?.likeCount)),
    formats: [
      { label:'MP3 128kbps', type:'mp3', quality:'128' },
      { label:'MP3 320kbps', type:'mp3', quality:'320' },
      { label:'MP4 720p',    type:'mp4', quality:'720'  },
      { label:'MP4 1080p',   type:'mp4', quality:'1080' },
    ],
  };
}

function getInfoViaYtdlp(url, platform) {
  return new Promise((resolve, reject) => {
    const args = [
      '--dump-json', '--no-playlist',
      '--no-warnings', '--no-check-certificate',
      '--extractor-args', 'youtube:player_client=android',
      '--skip-download',
      url,
    ];

    const proc = spawn(YTDLP, args);
    let out = '', err = '';
    proc.stdout.on('data', d => out += d);
    proc.stderr.on('data', d => err += d);

    const t = setTimeout(() => { proc.kill(); reject(new Error('Timeout fetching info')); }, 25000);

    proc.on('close', code => {
      clearTimeout(t);
      try {
        const d = JSON.parse(out.trim().split('\n')[0]);
        resolve({
          id:        d.id,
          title:     d.title || 'Unknown',
          author:    d.uploader || d.channel || '',
          duration:  formatDuration(d.duration),
          thumbnail: d.thumbnail || '',
          url:       d.webpage_url || url,
          platform,
          views:     formatViews(d.view_count),
          formats: [
            { label:'MP3 128kbps', type:'mp3', quality:'128' },
            { label:'MP3 320kbps', type:'mp3', quality:'320' },
            { label:'MP4 720p',    type:'mp4', quality:'720'  },
            { label:'MP4 1080p',   type:'mp4', quality:'1080' },
          ],
        });
      } catch {
        reject(new Error('Could not fetch media info'));
      }
    });

    proc.on('error', () => reject(new Error('yt-dlp not found')));
  });
}

// ─── Stream download ──────────────────────────────────────────────────────────
export function streamDownload(url, format, quality, res, filename) {
  const qualityMap = {
    '1080': 'bestvideo[height<=1080][ext=mp4]+bestaudio[ext=m4a]/bestvideo[height<=1080]+bestaudio/best',
    '720':  'bestvideo[height<=720][ext=mp4]+bestaudio[ext=m4a]/bestvideo[height<=720]+bestaudio/best',
    '480':  'bestvideo[height<=480]+bestaudio/best',
    '360':  'bestvideo[height<=360]+bestaudio/best',
  };

  const args = [
    '--no-warnings', '--no-check-certificate', '--no-playlist',
    '--extractor-args', 'youtube:player_client=android,web',
    '--user-agent', 'Mozilla/5.0 (Linux; Android 12; Pixel 6) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/112.0.0.0 Mobile Safari/537.36',
    '-o', '-',
  ];

  if (format === 'mp3') {
    args.push('-x', '--audio-format', 'mp3', '--audio-quality', quality === '320' ? '0' : '5');
    res.setHeader('Content-Type', 'audio/mpeg');
  } else {
    args.push('-f', qualityMap[quality] || `bestvideo[height<=${quality}]+bestaudio/best`, '--merge-output-format', 'mp4');
    res.setHeader('Content-Type', 'video/mp4');
  }

  args.push(url);

  const safe = (filename || 'cymortune').replace(/[^a-z0-9_\-\s]/gi, '_').replace(/\s+/g, '_').slice(0, 80);
  res.setHeader('Content-Disposition', `attachment; filename="${safe}.${format === 'mp3' ? 'mp3' : 'mp4'}"`);
  res.setHeader('X-Accel-Buffering', 'no');
  res.setHeader('Cache-Control', 'no-cache');

  console.log(`[Download] ${format} ${quality} — ${url.slice(0, 60)}`);

  const proc = spawn(YTDLP, args);
  proc.stdout.pipe(res);

  let errBuf = '';
  proc.stderr.on('data', d => {
    const line = d.toString().trim();
    errBuf += line;
    if (line && !line.startsWith('[download]') && !line.startsWith('[info]') && !line.startsWith('[ffmpeg]')) {
      console.log('[yt-dlp]', line.slice(0, 120));
    }
  });

  proc.on('error', err => {
    console.error('[Proc error]', err.message);
    if (!res.headersSent) res.status(500).json({ error: 'Download failed: ' + err.message });
  });

  proc.on('close', code => {
    if (code !== 0) console.error(`[yt-dlp exit ${code}]`, errBuf.slice(-200));
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
      try { if (Date.now() - fs.statSync(fp).mtimeMs > 600000) fs.unlinkSync(fp); } catch {}
    });
  } catch {}
}
setInterval(cleanTmp, 300000);

// ─── Helpers ──────────────────────────────────────────────────────────────────
function extractYouTubeId(url) {
  const m = url.match(/(?:v=|youtu\.be\/|embed\/)([a-zA-Z0-9_-]{11})/);
  return m?.[1] || null;
}

function parseDuration(iso) {
  // PT4M13S → 4:13
  if (!iso) return '';
  const m = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!m) return '';
  const h = parseInt(m[1] || 0), min = parseInt(m[2] || 0), s = parseInt(m[3] || 0);
  if (h > 0) return `${h}:${String(min).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
  return `${min}:${String(s).padStart(2,'0')}`;
}

function formatDuration(seconds) {
  if (!seconds) return '';
  const h = Math.floor(seconds / 3600), m = Math.floor((seconds % 3600) / 60), s = Math.floor(seconds % 60);
  if (h > 0) return `${h}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
  return `${m}:${String(s).padStart(2,'0')}`;
}

function formatViews(n) {
  if (!n || isNaN(n)) return null;
  if (n >= 1e9) return (n/1e9).toFixed(1) + 'B';
  if (n >= 1e6) return (n/1e6).toFixed(1) + 'M';
  if (n >= 1e3) return (n/1e3).toFixed(1) + 'K';
  return String(n);
}
