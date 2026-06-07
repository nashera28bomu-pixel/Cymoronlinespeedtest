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

// ─── Search Function ──────────────────────────────────────────────────────────
export async function searchYoutube(query, limit = 12) {
  if (YT_KEY) return searchViaAPI(query, limit);
  return searchViaYtdlp(query, limit);
}

// Official YouTube Data API v3
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

// Robust Search via yt-dlp (No API Key Required)
async function searchViaYtdlp(query, limit) {
  return new Promise((resolve, reject) => {
    // ytsearch: prefix tells yt-dlp to perform a search
    const args = [`ytsearch${limit}:${query}`, '--dump-json', '--no-playlist', '--no-warnings'];
    const proc = spawn(YTDLP, args);
    let out = '';
    proc.stdout.on('data', d => out += d);

    const t = setTimeout(() => { proc.kill(); reject(new Error('Search timed out')); }, 25000);

    proc.on('close', code => {
      clearTimeout(t);
      if (code !== 0) return reject(new Error('Search tool failed'));
      try {
        const results = out.trim().split('\n').map(line => {
          const d = JSON.parse(line);
          return {
            id: d.id,
            title: d.title,
            duration: formatDuration(d.duration),
            thumbnail: d.thumbnail,
            author: d.uploader || d.channel,
            url: d.webpage_url,
            platform: 'youtube',
            views: formatViews(d.view_count),
          };
        });
        resolve(results);
      } catch { reject(new Error('Could not parse search results')); }
    });
  });
}

// ─── Get media info from URL ──────────────────────────────────────────────────
export async function getMediaInfo(url) {
  const platform = detectPlatform(url);
  if (platform === 'youtube' && YT_KEY) return getYouTubeInfo(url);
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
      { label:'MP3 128kbps', type:'mp3', quality:'128' },
      { label:'MP4 720p',    type:'mp4', quality:'720'  },
    ],
  };
}

function getInfoViaYtdlp(url, platform) {
  return new Promise((resolve, reject) => {
    const args = ['--dump-json', '--no-playlist', '--no-warnings', '--skip-download', url];
    const proc = spawn(YTDLP, args);
    let out = '';
    proc.stdout.on('data', d => out += d);
    
    proc.on('close', code => {
      if (code !== 0) return reject(new Error('Could not fetch media info'));
      try {
        const d = JSON.parse(out.trim().split('\n')[0]);
        resolve({
          id: d.id,
          title: d.title || 'Unknown',
          author: d.uploader || d.channel || '',
          duration: formatDuration(d.duration),
          thumbnail: d.thumbnail || '',
          url: d.webpage_url || url,
          platform,
          views: formatViews(d.view_count),
          formats: [{ label:'MP3 128kbps', type:'mp3', quality:'128' }, { label:'MP4 720p', type:'mp4', quality:'720' }],
        });
      } catch { reject(new Error('Parsing failed')); }
    });
  });
}

// ─── Stream download ──────────────────────────────────────────────────────────
export function streamDownload(url, format, quality, res, filename) {
  const args = ['--no-warnings', '--no-playlist', '-o', '-', '--format', quality === '1080' ? 'bestvideo[height<=1080]+bestaudio/best' : 'best'];
  if (format === 'mp3') args.push('-x', '--audio-format', 'mp3');
  args.push(url);

  const proc = spawn(YTDLP, args);
  res.setHeader('Content-Type', format === 'mp3' ? 'audio/mpeg' : 'video/mp4');
  proc.stdout.pipe(res);
  proc.on('close', () => res.end());
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function extractYouTubeId(url) { const m = url.match(/(?:v=|youtu\.be\/|embed\/)([a-zA-Z0-9_-]{11})/); return m?.[1] || null; }
function parseDuration(iso) { const m = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/); if (!m) return ''; return `${m[2] || '0'}:${String(m[3] || '0').padStart(2,'0')}`; }
function formatDuration(s) { const m = Math.floor(s / 60), sec = s % 60; return `${m}:${String(sec).padStart(2,'0')}`; }
function formatViews(n) { if (!n) return null; return n >= 1e6 ? (n/1e6).toFixed(1) + 'M' : n >= 1e3 ? (n/1e3).toFixed(1) + 'K' : String(n); }
