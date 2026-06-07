// ─── utils/ytdlp.js ───────────────────────────────────────────────────────────
import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const YTDLP        = process.env.YTDLP_PATH     || 'yt-dlp';
const YT_KEY       = process.env.YT_API_KEY      || '';
const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY    || '';
const TMP          = path.resolve(__dirname, '../tmp');

if (!fs.existsSync(TMP)) fs.mkdirSync(TMP, { recursive: true });

const INNERTUBE_KEY = 'AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8';
const INNERTUBE_VER = '2.20240101.00.00';
const BROWSER_UA    = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

// ─── Platform Detection ──────────────────────────────────────────────────────
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

// ─── Search ──────────────────────────────────────────────────────────────────
export async function searchYoutube(query, limit = 12) {
  try {
    const r = await searchViaInnerTube(query, limit);
    if (r.length) return r;
  } catch (e) { console.warn('[Search] InnerTube failed:', e.message); }

  console.log('[Search] Falling back to yt-dlp...');
  return searchViaYtdlp(query, limit);
}

async function searchViaInnerTube(query, limit) {
  const res = await fetch(`https://www.youtube.com/youtubei/v1/search?key=${INNERTUBE_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'User-Agent': BROWSER_UA },
    body: JSON.stringify({
      query,
      params: 'EgIQAQ%3D%3D',
      context: { client: { clientName: 'WEB', clientVersion: INNERTUBE_VER } },
    }),
    signal: AbortSignal.timeout(12000),
  });
  if (!res.ok) throw new Error(`InnerTube HTTP ${res.status}`);
  const data = await res.json();
  const contents = data?.contents?.twoColumnSearchResultsRenderer?.primaryContents?.sectionListRenderer?.contents?.[0]?.itemSectionRenderer?.contents || [];
  
  return contents
    .filter(item => item.videoRenderer?.videoId)
    .slice(0, limit)
    .map(item => ({
      id: item.videoRenderer.videoId,
      title: item.videoRenderer.title?.runs?.[0]?.text || 'Unknown',
      duration: item.videoRenderer.lengthText?.simpleText || '',
      thumbnail: `https://i.ytimg.com/vi/${item.videoRenderer.videoId}/hqdefault.jpg`,
      author: item.videoRenderer.ownerText?.runs?.[0]?.text || '',
      url: `https://www.youtube.com/watch?v=${item.videoRenderer.videoId}`,
      platform: 'youtube',
      views: item.videoRenderer.viewCountText?.simpleText || null
    }));
}

async function searchViaYtdlp(query, limit) {
  return new Promise((resolve, reject) => {
    const proc = spawn(YTDLP, [
      `ytsearch${limit}:${query}`,
      '--dump-json', '--no-playlist', '--no-warnings',
      '--add-header', `User-Agent:${BROWSER_UA}`,
    ]);
    let out = '';
    proc.stdout.on('data', d => out += d);
    proc.on('close', code => {
      if (code !== 0) return reject(new Error('Search failed'));
      try {
        resolve(out.trim().split('\n').map(line => {
          const d = JSON.parse(line);
          return { id: d.id, title: d.title, url: d.webpage_url, platform: 'youtube', thumbnail: d.thumbnail };
        }));
      } catch { reject(new Error('Parse error')); }
    });
  });
}

// ─── Download & Info ─────────────────────────────────────────────────────────
export async function getMediaInfo(url) {
  const platform = detectPlatform(url);
  const proc = spawn(YTDLP, ['--dump-json', '--no-playlist', '--add-header', `User-Agent:${BROWSER_UA}`, url]);
  let out = '';
  proc.stdout.on('data', d => out += d);
  return new Promise((resolve, reject) => {
    proc.on('close', code => {
      if (code !== 0) return reject(new Error('Info failed'));
      try {
        const d = JSON.parse(out.trim().split('\n')[0]);
        resolve({ id: d.id, title: d.title, url: d.webpage_url, platform });
      } catch { reject(new Error('Parse error')); }
    });
  });
}

export function streamDownload(url, format, quality, res, filename) {
  const args = [
    '--no-warnings', '--no-playlist', '-o', '-',
    '--extractor-args', 'youtube:player_client=web',
    '--add-header', `User-Agent:${BROWSER_UA}`,
  ];
  if (format === 'mp3') {
    args.push('-x', '--audio-format', 'mp3', '--audio-quality', '5');
  } else {
    args.push('--format', `bestvideo[height<=720]+bestaudio/best`);
  }
  args.push(url);

  const proc = spawn(YTDLP, args);
  res.setHeader('Content-Type', format === 'mp3' ? 'audio/mpeg' : 'video/mp4');
  proc.stdout.pipe(res);
  proc.on('close', () => res.end());
}
