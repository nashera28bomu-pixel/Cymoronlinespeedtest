// ─── utils/ytdlp.js ───────────────────────────────────────────────────────────
import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const YTDLP     = process.env.YTDLP_PATH || 'yt-dlp';
const YT_KEY    = process.env.YT_API_KEY  || '';
const TMP       = path.resolve(__dirname, '../tmp');

if (!fs.existsSync(TMP)) fs.mkdirSync(TMP, { recursive: true });

// ─── Free Piped instances (no API key, no bot detection) ──────────────────────
const PIPED_INSTANCES = [
  'https://pipedapi.kavin.rocks',
  'https://piped-api.garudalinux.org',
  'https://api.piped.projectsegfau.lt',
  'https://pipedapi.coldvibes.top',
];

// ─── Free Invidious instances ─────────────────────────────────────────────────
const INVIDIOUS_INSTANCES = [
  'https://invidious.nerdvpn.de',
  'https://invidious.privacydev.net',
  'https://inv.tux.pizza',
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

// ─── Main Search ──────────────────────────────────────────────────────────────
export async function searchYoutube(query, limit = 12) {
  // Priority: Official API → Piped → Invidious → yt-dlp fallback
  if (YT_KEY) {
    try { return await searchViaAPI(query, limit); } catch (e) {
      console.warn('[Search] YouTube API failed, falling back:', e.message);
    }
  }

  // Try Piped instances
  for (const base of PIPED_INSTANCES) {
    try {
      const results = await searchViaPiped(base, query, limit);
      if (results.length) {
        console.log(`[Search] Piped success via ${base}`);
        return results;
      }
    } catch (e) {
      console.warn(`[Search] Piped failed (${base}):`, e.message);
    }
  }

  // Try Invidious instances
  for (const base of INVIDIOUS_INSTANCES) {
    try {
      const results = await searchViaInvidious(base, query, limit);
      if (results.length) {
        console.log(`[Search] Invidious success via ${base}`);
        return results;
      }
    } catch (e) {
      console.warn(`[Search] Invidious failed (${base}):`, e.message);
    }
  }

  // Last resort: yt-dlp with anti-bot headers
  console.log('[Search] All APIs failed, trying yt-dlp with anti-bot headers...');
  return searchViaYtdlp(query, limit);
}

// ─── Piped API Search ─────────────────────────────────────────────────────────
async function searchViaPiped(baseUrl, query, limit) {
  const url = `${baseUrl}/search?q=${encodeURIComponent(query)}&filter=videos`;
  const res = await fetch(url, {
    signal: AbortSignal.timeout(10000),
    headers: { 'User-Agent': 'CymorTune/1.0' },
  });
  if (!res.ok) throw new Error(`Piped HTTP ${res.status}`);
  const data = await res.json();

  const items = (data.items || []).filter(i => i.type === 'stream' || i.url?.startsWith('/watch'));
  if (!items.length) throw new Error('No results');

  return items.slice(0, limit).map(item => {
    const videoId = (item.url || '').replace('/watch?v=', '');
    return {
      id: videoId,
      title: item.title || 'Unknown',
      duration: formatDuration(item.duration || 0),
      thumbnail: item.thumbnail || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
      author: item.uploaderName || item.uploader || '',
      url: `https://www.youtube.com/watch?v=${videoId}`,
      platform: 'youtube',
      views: formatViews(item.views),
    };
  });
}

// ─── Invidious API Search ─────────────────────────────────────────────────────
async function searchViaInvidious(baseUrl, query, limit) {
  const url = `${baseUrl}/api/v1/search?q=${encodeURIComponent(query)}&type=video&page=1`;
  const res = await fetch(url, {
    signal: AbortSignal.timeout(10000),
    headers: { 'User-Agent': 'CymorTune/1.0' },
  });
  if (!res.ok) throw new Error(`Invidious HTTP ${res.status}`);
  const items = await res.json();
  if (!Array.isArray(items) || !items.length) throw new Error('No results');

  return items.slice(0, limit).map(item => ({
    id: item.videoId,
    title: item.title || 'Unknown',
    duration: formatDuration(item.lengthSeconds || 0),
    thumbnail: `https://i.ytimg.com/vi/${item.videoId}/hqdefault.jpg`,
    author: item.author || '',
    url: `https://www.youtube.com/watch?v=${item.videoId}`,
    platform: 'youtube',
    views: formatViews(item.viewCount),
  }));
}

// ─── Official YouTube API ─────────────────────────────────────────────────────
async function searchViaAPI(query, limit) {
  const url = `https://www.googleapis.com/youtube/v3/search?part=snippet&q=${encodeURIComponent(query)}&maxResults=${limit}&type=video&key=${YT_KEY}`;
  const res  = await fetch(url, { signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error(`YouTube API error: ${res.status}`);
  const data = await res.json();
  if (!data.items?.length) throw new Error('No results found');

  return data.items.map(item => ({
    id: item.id.videoId,
    title: item.snippet.title,
    duration: '',
    thumbnail: item.snippet.thumbnails?.high?.url || '',
    author: item.snippet.channelTitle,
    url: `https://www.youtube.com/watch?v=${item.id.videoId}`,
    platform: 'youtube',
    views: null,
  }));
}

// ─── yt-dlp fallback with anti-bot headers ────────────────────────────────────
async function searchViaYtdlp(query, limit) {
  return new Promise((resolve, reject) => {
    const args = [
      `ytsearch${limit}:${query}`,
      '--dump-json',
      '--no-playlist',
      '--no-warnings',
      '--add-header', 'User-Agent:Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      '--add-header', 'Accept-Language:en-US,en;q=0.9',
      '--sleep-interval', '1',
      '--extractor-retries', '3',
    ];
    const proc = spawn(YTDLP, args);
    let out = '';
    let errOut = '';
    proc.stdout.on('data', d => out += d);
    proc.stderr.on('data', d => errOut += d);

    const t = setTimeout(() => { proc.kill(); reject(new Error('Search timed out after 30s')); }, 30000);

    proc.on('close', code => {
      clearTimeout(t);
      if (code !== 0) {
        console.error('[yt-dlp stderr]', errOut.slice(0, 300));
        return reject(new Error('Search tool failed'));
      }
      try {
        const results = out.trim().split('\n')
          .filter(Boolean)
          .map(line => {
            const d = JSON.parse(line);
            return {
              id: d.id,
              title: d.title,
              duration: formatDuration(d.duration || 0),
              thumbnail: d.thumbnail,
              author: d.uploader || d.channel,
              url: d.webpage_url,
              platform: 'youtube',
              views: formatViews(d.view_count),
            };
          });
        resolve(results);
      } catch (e) {
        reject(new Error('Could not parse search results'));
      }
    });
  });
}

// ─── Get media info from URL ──────────────────────────────────────────────────
export async function getMediaInfo(url) {
  const platform = detectPlatform(url);
  if (platform === 'youtube' && YT_KEY) {
    try { return await getYouTubeInfo(url); } catch {}
  }

  // Try Piped for YouTube URLs
  if (platform === 'youtube') {
    const videoId = extractYouTubeId(url);
    if (videoId) {
      for (const base of PIPED_INSTANCES) {
        try {
          const res = await fetch(`${base}/streams/${videoId}`, {
            signal: AbortSignal.timeout(8000),
            headers: { 'User-Agent': 'CymorTune/1.0' },
          });
          if (res.ok) {
            const d = await res.json();
            return {
              id: videoId,
              title: d.title || 'Unknown',
              author: d.uploader || '',
              duration: formatDuration(d.duration || 0),
              thumbnail: d.thumbnailUrl || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
              url,
              platform,
              views: formatViews(d.views),
              formats: [
                { label: 'MP3 128kbps', type: 'mp3', quality: '128' },
                { label: 'MP3 320kbps', type: 'mp3', quality: '320' },
                { label: 'MP4 720p',    type: 'mp4', quality: '720'  },
                { label: 'MP4 1080p',   type: 'mp4', quality: '1080' },
              ],
            };
          }
        } catch (e) {
          console.warn(`[Info] Piped failed (${base}):`, e.message);
        }
      }
    }
  }

  return getInfoViaYtdlp(url, platform);
}

async function getYouTubeInfo(url) {
  const videoId = extractYouTubeId(url);
  if (!videoId) return getInfoViaYtdlp(url, 'youtube');
  const apiUrl = `https://www.googleapis.com/youtube/v3/videos?part=snippet,contentDetails,statistics&id=${videoId}&key=${YT_KEY}`;
  const res = await fetch(apiUrl, { signal: AbortSignal.timeout(10000) });
  const data = await res.json();
  const item = data.items?.[0];
  if (!item) return getInfoViaYtdlp(url, 'youtube');

  return {
    id: videoId,
    title: item.snippet.title,
    author: item.snippet.channelTitle,
    duration: parseDuration(item.contentDetails.duration),
    thumbnail: item.snippet.thumbnails?.maxres?.url || item.snippet.thumbnails?.high?.url || '',
    url: `https://www.youtube.com/watch?v=${videoId}`,
    platform: 'youtube',
    views: formatViews(parseInt(item.statistics?.viewCount)),
    likes: formatViews(parseInt(item.statistics?.likeCount)),
    formats: [
      { label: 'MP3 128kbps', type: 'mp3', quality: '128' },
      { label: 'MP3 320kbps', type: 'mp3', quality: '320' },
      { label: 'MP4 720p',    type: 'mp4', quality: '720'  },
      { label: 'MP4 1080p',   type: 'mp4', quality: '1080' },
    ],
  };
}

function getInfoViaYtdlp(url, platform) {
  return new Promise((resolve, reject) => {
    const args = [
      '--dump-json', '--no-playlist', '--no-warnings', '--skip-download',
      '--add-header', 'User-Agent:Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      url,
    ];
    const proc = spawn(YTDLP, args);
    let out = '';
    proc.stdout.on('data', d => out += d);

    const t = setTimeout(() => { proc.kill(); reject(new Error('Info fetch timed out')); }, 20000);

    proc.on('close', code => {
      clearTimeout(t);
      if (code !== 0) return reject(new Error('Could not fetch media info'));
      try {
        const d = JSON.parse(out.trim().split('\n')[0]);
        resolve({
          id: d.id,
          title: d.title || 'Unknown',
          author: d.uploader || d.channel || '',
          duration: formatDuration(d.duration || 0),
          thumbnail: d.thumbnail || '',
          url: d.webpage_url || url,
          platform,
          views: formatViews(d.view_count),
          formats: [
            { label: 'MP3 128kbps', type: 'mp3', quality: '128' },
            { label: 'MP3 320kbps', type: 'mp3', quality: '320' },
            { label: 'MP4 720p',    type: 'mp4', quality: '720'  },
            { label: 'MP4 1080p',   type: 'mp4', quality: '1080' },
          ],
        });
      } catch { reject(new Error('Parsing failed')); }
    });
  });
}

// ─── Stream download ──────────────────────────────────────────────────────────
export function streamDownload(url, format, quality, res, filename) {
  const args = [
    '--no-warnings', '--no-playlist',
    '-o', '-',
    '--add-header', 'User-Agent:Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  ];

  if (format === 'mp3') {
    args.push('-x', '--audio-format', 'mp3', '--audio-quality', quality === '320' ? '0' : '5');
  } else {
    const h = quality === '1080' ? '1080' : quality === '720' ? '720' : quality === '480' ? '480' : '360';
    args.push('--format', `bestvideo[height<=${h}]+bestaudio/best[height<=${h}]/best`);
  }

  args.push(url);

  const proc = spawn(YTDLP, args);
  res.setHeader('Content-Type', format === 'mp3' ? 'audio/mpeg' : 'video/mp4');
  res.setHeader('Content-Disposition', `attachment; filename="${filename || 'cymortune'}.${format}"`);
  proc.stdout.pipe(res);
  proc.stderr.on('data', d => console.warn('[Download stderr]', d.toString().slice(0, 100)));
  proc.on('close', () => res.end());
  res.on('close', () => proc.kill());
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function extractYouTubeId(url) {
  const m = url.match(/(?:v=|youtu\.be\/|embed\/)([a-zA-Z0-9_-]{11})/);
  return m?.[1] || null;
}
function parseDuration(iso) {
  const m = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!m) return '';
  const h = m[1] ? `${m[1]}:` : '';
  return `${h}${m[2] || '0'}:${String(m[3] || '0').padStart(2, '0')}`;
}
function formatDuration(s) {
  if (!s || isNaN(s)) return '0:00';
  const m = Math.floor(s / 60), sec = Math.floor(s % 60);
  return `${m}:${String(sec).padStart(2, '0')}`;
}
function formatViews(n) {
  if (!n || isNaN(n)) return null;
  return n >= 1e6 ? (n / 1e6).toFixed(1) + 'M' : n >= 1e3 ? (n / 1e3).toFixed(1) + 'K' : String(n);
}
