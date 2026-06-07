// ─── utils/ytdlp.js ───────────────────────────────────────────────────────────
import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const YTDLP = process.env.YTDLP_PATH || 'yt-dlp';
const YT_KEY = process.env.YT_API_KEY || '';
const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY || '';
const TMP = path.resolve(__dirname, '../tmp');
const COOKIE_FILE = process.env.YTDLP_COOKIES || path.resolve(__dirname, '../cookies.txt');

if (!fs.existsSync(TMP)) fs.mkdirSync(TMP, { recursive: true });

const INNERTUBE_KEY = 'AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8';
const INNERTUBE_VER = '2.20240101.00.00';
const BROWSER_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

export function detectPlatform(url) {
  if (!url) return 'unknown';
  if (/youtube\.com|youtu\.be/i.test(url)) return 'youtube';
  if (/tiktok\.com/i.test(url)) return 'tiktok';
  if (/instagram\.com/i.test(url)) return 'instagram';
  if (/twitter\.com|x\.com/i.test(url)) return 'twitter';
  if (/facebook\.com|fb\.watch/i.test(url)) return 'facebook';
  if (/soundcloud\.com/i.test(url)) return 'soundcloud';
  if (/spotify\.com/i.test(url)) return 'spotify';
  return 'unknown';
}

export async function searchYoutube(query, limit = 12) {
  try {
    const r = await searchViaInnerTube(query, limit);
    if (r.length) { console.log('[Search] ✓ InnerTube'); return r; }
  } catch (e) { console.warn('[Search] InnerTube failed:', e.message); }

  if (RAPIDAPI_KEY) {
    try {
      const r = await searchViaRapidAPI(query, limit);
      if (r.length) { console.log('[Search] ✓ RapidAPI'); return r; }
    } catch (e) { console.warn('[Search] RapidAPI failed:', e.message); }
  }

  if (YT_KEY) {
    try {
      const r = await searchViaOfficialAPI(query, limit);
      if (r.length) { console.log('[Search] ✓ Official API'); return r; }
    } catch (e) { console.warn('[Search] Official API failed:', e.message); }
  }

  console.log('[Search] Falling back to yt-dlp...');
  return searchViaYtdlp(query, limit);
}

async function searchViaInnerTube(query, limit) {
  const res = await fetch(
    `https://www.youtube.com/youtubei/v1/search?key=${INNERTUBE_KEY}`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-YouTube-Client-Name': '1',
        'X-YouTube-Client-Version': INNERTUBE_VER,
        'User-Agent': BROWSER_UA,
        'Origin': 'https://www.youtube.com',
        'Referer': 'https://www.youtube.com/',
      },
      body: JSON.stringify({
        query,
        params: 'EgIQAQ%3D%3D',
        context: {
          client: {
            clientName: 'WEB',
            clientVersion: INNERTUBE_VER,
            hl: 'en', gl: 'US',
            userAgent: BROWSER_UA,
          },
        },
      }),
      signal: AbortSignal.timeout(12000),
    }
  );

  if (!res.ok) throw new Error(`InnerTube HTTP ${res.status}`);
  const data = await res.json();

  const contents =
    data?.contents?.twoColumnSearchResultsRenderer?.primaryContents
     ?.sectionListRenderer?.contents?.[0]?.itemSectionRenderer?.contents || [];

  const results = [];
  for (const item of contents) {
    if (results.length >= limit) break;
    const v = item.videoRenderer;
    if (!v?.videoId) continue;
    results.push({
      id: v.videoId,
      title: v.title?.runs?.[0]?.text || 'Unknown',
      duration: v.lengthText?.simpleText || '',
      thumbnail: `https://i.ytimg.com/vi/${v.videoId}/hqdefault.jpg`,
      author: v.ownerText?.runs?.[0]?.text || v.shortBylineText?.runs?.[0]?.text || '',
      url: `https://www.youtube.com/watch?v=${v.videoId}`,
      platform: 'youtube',
      views: v.viewCountText?.simpleText?.replace(' views', '').replace(' view', '') || null,
    });
  }

  if (!results.length) throw new Error('InnerTube returned 0 videos');
  return results;
}

async function searchViaRapidAPI(query, limit) {
  const res = await fetch(
    `https://youtube-search-and-download.p.rapidapi.com/search?query=${encodeURIComponent(query)}&hl=en&gl=US`,
    {
      headers: {
        'x-rapidapi-key': RAPIDAPI_KEY,
        'x-rapidapi-host': 'youtube-search-and-download.p.rapidapi.com',
      },
      signal: AbortSignal.timeout(10000),
    }
  );
  if (!res.ok) throw new Error(`RapidAPI HTTP ${res.status}`);
  const data = await res.json();

  const items = data?.contents || [];
  const results = [];
  for (const item of items) {
    if (results.length >= limit) break;
    const v = item?.video;
    if (!v?.videoId) continue;
    results.push({
      id: v.videoId,
      title: v.title || 'Unknown',
      duration: v.lengthText || '',
      thumbnail: `https://i.ytimg.com/vi/${v.videoId}/hqdefault.jpg`,
      author: v.author || '',
      url: `https://www.youtube.com/watch?v=${v.videoId}`,
      platform: 'youtube',
      views: v.viewCount || null,
    });
  }

  if (!results.length) throw new Error('RapidAPI returned 0 videos');
  return results;
}

async function searchViaOfficialAPI(query, limit) {
  const url = `https://www.googleapis.com/youtube/v3/search?part=snippet&q=${encodeURIComponent(query)}&maxResults=${limit}&type=video&key=${YT_KEY}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error(`YouTube API ${res.status}`);
  const data = await res.json();
  if (!data.items?.length) throw new Error('No results');
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

async function searchViaYtdlp(query, limit) {
  return new Promise((resolve, reject) => {
    const args = [
      `ytsearch${limit}:${query}`,
      '--dump-json', '--no-playlist', '--no-warnings',
      '--add-header', `User-Agent:${BROWSER_UA}`,
      '--add-header', 'Accept-Language:en-US,en;q=0.9',
      '--extractor-retries', '3',
      '--sleep-requests', '1',
    ];

    // Add cookies if available - this fixes "sign in to confirm" error
    if (fs.existsSync(COOKIE_FILE)) {
      args.push('--cookies', COOKIE_FILE);
      console.log('[yt-dlp] Using cookies.txt');
    }

    const proc = spawn(YTDLP, args);
    let out = '', err = '';
    proc.stdout.on('data', d => out += d);
    proc.stderr.on('data', d => err += d);
    const t = setTimeout(() => { proc.kill(); reject(new Error('yt-dlp timed out')); }, 35000);
    proc.on('close', code => {
      clearTimeout(t);
      if (code!== 0) {
        console.error('[yt-dlp]', err.slice(0, 400));
        return reject(new Error('yt-dlp search failed'));
      }
      try {
        resolve(
          out.trim().split('\n').filter(Boolean).map(line => {
            const d = JSON.parse(line);
            return {
              id: d.id, title: d.title,
              duration: formatDuration(d.duration || 0),
              thumbnail: d.thumbnail,
              author: d.uploader || d.channel,
              url: d.webpage_url, platform: 'youtube',
              views: formatViews(d.view_count),
            };
          })
        );
      } catch { reject(new Error('yt-dlp parse failed')); }
    });
  });
}

export async function getMediaInfo(url) {
  const platform = detectPlatform(url);
  const videoId = platform === 'youtube'? extractYouTubeId(url) : null;

  if (videoId) {
    try {
      const info = await getInfoViaInnerTube(videoId, url);
      if (info) return info;
    } catch (e) { console.warn('[Info] InnerTube failed:', e.message); }
  }

  if (YT_KEY && videoId) {
    try { return await getYouTubeAPIInfo(url, videoId); } catch {}
  }

  return getInfoViaYtdlp(url, platform);
}

async function getInfoViaInnerTube(videoId, originalUrl) {
  const res = await fetch(
    `https://www.youtube.com/youtubei/v1/player?key=${INNERTUBE_KEY}`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-YouTube-Client-Name': '1',
        'X-YouTube-Client-Version': INNERTUBE_VER,
        'User-Agent': BROWSER_UA,
        'Origin': 'https://www.youtube.com',
      },
      body: JSON.stringify({
        videoId,
        context: { client: { clientName: 'WEB', clientVersion: INNERTUBE_VER, hl: 'en', gl: 'US' } },
      }),
      signal: AbortSignal.timeout(10000),
    }
  );
  if (!res.ok) throw new Error(`InnerTube player HTTP ${res.status}`);
  const d = await res.json();
  const det = d?.videoDetails;
  if (!det) throw new Error('No videoDetails');
  return {
    id: videoId,
    title: det.title || 'Unknown',
    author: det.author || '',
    duration: formatDuration(parseInt(det.lengthSeconds) || 0),
    thumbnail: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
    url: originalUrl, platform: 'youtube',
    views: formatViews(parseInt(det.viewCount)),
    formats: [
      { label: 'MP3 128kbps', type: 'mp3', quality: '128' },
      { label: 'MP3 320kbps', type: 'mp3', quality: '320' },
      { label: 'MP4 360p', type: 'mp4', quality: '360' },
      { label: 'MP4 720p', type: 'mp4', quality: '720' },
      { label: 'MP4 1080p', type: 'mp4', quality: '1080' },
    ],
  };
}

async function getYouTubeAPIInfo(url, videoId) {
  const res = await fetch(`https://www.googleapis.com/youtube/v3/videos?part=snippet,contentDetails,statistics&id=${videoId}&key=${YT_KEY}`, { signal: AbortSignal.timeout(10000) });
  const data = await res.json();
  const item = data.items?.[0];
  if (!item) throw new Error('No item');
  return {
    id: videoId,
    title: item.snippet.title,
    author: item.snippet.channelTitle,
    duration: parseDuration(item.contentDetails.duration),
    thumbnail: item.snippet.thumbnails?.maxres?.url || item.snippet.thumbnails?.high?.url || '',
    url: `https://www.youtube.com/watch?v=${videoId}`,
    platform: 'youtube',
    views: formatViews(parseInt(item.statistics?.viewCount)),
    formats: [
      { label: 'MP3 128kbps', type: 'mp3', quality: '128' },
      { label: 'MP3 320kbps', type: 'mp3', quality: '320' },
      { label: 'MP4 720p', type: 'mp4', quality: '720' },
      { label: 'MP4 1080p', type: 'mp4', quality: '1080' },
    ],
  };
}

function getInfoViaYtdlp(url, platform) {
  return new Promise((resolve, reject) => {
    const args = [
      '--dump-json', '--no-playlist', '--no-warnings', '--skip-download',
      '--add-header', `User-Agent:${BROWSER_UA}`,
      url,
    ];

    if (fs.existsSync(COOKIE_FILE)) {
      args.push('--cookies', COOKIE_FILE);
    }

    const proc = spawn(YTDLP, args);
    let out = '';
    proc.stdout.on('data', d => out += d);
    const t = setTimeout(() => { proc.kill(); reject(new Error('Info timed out')); }, 20000);
    proc.on('close', code => {
      clearTimeout(t);
      if (code!== 0) return reject(new Error('Could not fetch media info'));
      try {
        const d = JSON.parse(out.trim().split('\n')[0]);
        resolve({
          id: d.id, title: d.title || 'Unknown',
          author: d.uploader || d.channel || '',
          duration: formatDuration(d.duration || 0),
          thumbnail: d.thumbnail || '',
          url: d.webpage_url || url, platform,
          views: formatViews(d.view_count),
          formats: [
            { label: 'MP3 128kbps', type: 'mp3', quality: '128' },
            { label: 'MP3 320kbps', type: 'mp3', quality: '320' },
            { label: 'MP4 720p', type: 'mp4', quality: '720' },
            { label: 'MP4 1080p', type: 'mp4', quality: '1080' },
          ],
        });
      } catch { reject(new Error('Parsing failed')); }
    });
  });
}

export function streamDownload(url, format, quality, res, filename) {
  const args = [
    '--no-warnings', '--no-playlist', '-o', '-',
    '--add-header', `User-Agent:${BROWSER_UA}`,
    '--add-header', 'Accept-Language:en-US,en;q=0.9',
    '--extractor-retries', '3',
    '--sleep-requests', '1',
  ];

  // Critical: Use cookies to bypass YouTube bot detection
  if (fs.existsSync(COOKIE_FILE)) {
    args.push('--cookies', COOKIE_FILE);
  }

  if (format === 'mp3') {
    args.push('-x', '--audio-format', 'mp3', '--audio-quality', quality === '320'? '0' : '5');
  } else {
    const h = ['1080','720','480','360'].includes(quality)? quality : '720';
    args.push('--format', `bestvideo[height<=${h}][ext=mp4]+bestaudio[ext=m4a]/bestvideo[height<=${h}]+bestaudio/best[height<=${h}]/best`);
  }
  args.push(url);

  const proc = spawn(YTDLP, args);
  res.setHeader('Content-Type', format === 'mp3'? 'audio/mpeg' : 'video/mp4');
  res.setHeader('Content-Disposition', `attachment; filename="${(filename || 'cymortune').replace(/[^\w\s-]/g, '')}.${format}"`);
  proc.stdout.pipe(res);
  proc.stderr.on('data', d => console.warn('[DL]', d.toString().slice(0, 200)));
  proc.on('close', (code) => {
    if (code!== 0) console.error('[DL] yt-dlp exited with code', code);
    try { res.end(); } catch {}
  });
  res.on('close', () => { try { proc.kill(); } catch {} });
}

function extractYouTubeId(url) {
  return url.match(/(?:v=|youtu\.be\/|embed\/|shorts\/)([a-zA-Z0-9_-]{11})/)?.[1] || null;
}
function parseDuration(iso) {
  const m = iso?.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!m) return '0:00';
  return `${m[1]? m[1]+':' : ''}${m[2]||'0'}:${String(m[3]||'0').padStart(2,'0')}`;
}
function formatDuration(s) {
  if (!s || isNaN(s)) return '0:00';
  return `${Math.floor(s/60)}:${String(Math.floor(s%60)).padStart(2,'0')}`;
}
function formatViews(n) {
  if (!n || isNaN(n)) return null;
  return n >= 1e6? (n/1e6).toFixed(1)+'M' : n >= 1e3? (n/1e3).toFixed(1)+'K' : String(n);
}
