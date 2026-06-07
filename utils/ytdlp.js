// ─── utils/ytdlp.js ───────────────────────────────────────────────────────────
import { spawn, exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const execAsync = promisify(exec);
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const YTDLP = process.env.YTDLP_PATH || 'yt-dlp';
const TMP = path.resolve(__dirname, '../tmp');
const BROWSER_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
const INNERTUBE_KEY = 'AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8';
const INNERTUBE_VER = '2.20240101.00.00';

// Piped instances - add more if one goes down
const PIPED_INSTANCES = [
  'https://pipedapi.kavin.rocks',
  'https://pipedapi.leptons.xyz',
  'https://pipedapi.syncpundit.io'
];

if (!fs.existsSync(TMP)) fs.mkdirSync(TMP, { recursive: true });

// ─── Platform Detection ──────────────────────────────────────────────────────
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

// ─── Search ──────────────────────────────────
export async function searchYoutube(query, limit = 12) {
  try {
    const r = await searchViaInnerTube(query, limit);
    if (r.length) return r;
  } catch (e) {
    console.warn('[Search] InnerTube failed:', e.message);
  }

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
      if (code!== 0) return reject(new Error('Search failed'));
      try {
        resolve(out.trim().split('\n').filter(Boolean).map(line => {
          const d = JSON.parse(line);
          return { id: d.id, title: d.title, url: d.webpage_url, platform: 'youtube', thumbnail: d.thumbnail };
        }));
      } catch { reject(new Error('Parse error')); }
    });
  });
}

// ─── Media Info ──────────────────────────────────────────────────────────────
export async function getMediaInfo(url) {
  const platform = detectPlatform(url);
  const proc = spawn(YTDLP, [
    '--dump-json', '--no-playlist',
    '--add-header', `User-Agent:${BROWSER_UA}`,
    url
  ]);
  let out = '';
  proc.stdout.on('data', d => out += d);
  return new Promise((resolve, reject) => {
    proc.on('close', code => {
      if (code!== 0) return reject(new Error('Info failed'));
      try {
        const d = JSON.parse(out.trim().split('\n')[0]);
        resolve({
          id: d.id,
          title: d.title,
          url: d.webpage_url,
          platform,
          duration: d.duration,
          thumbnail: d.thumbnail
        });
      } catch { reject(new Error('Parse error')); }
    });
  });
}

// ─── Download with Piped Fallback ────────────────────────────────────────────
export async function streamDownload(req, res) {
  const { url, format = 'mp3', quality = '720' } = req.query;
  if (!url) return res.status(400).json({ error: 'URL required' });

  const platform = detectPlatform(url);
  const formatArg = format === 'mp3'
   ? 'bestaudio[ext=m4a]/bestaudio/best'
    : `bestvideo[height<=${quality}]+bestaudio/best`;

  // Try yt-dlp first to get direct URL
  try {
    const args = [
      url,
      '-g', // get URL only, don't download
      '-f', formatArg,
      '--no-warnings',
      '--no-playlist',
      '--no-check-certificates',
      '--extractor-retries', '3',
      '--sleep-requests', '1',
      '--add-header', `User-Agent:${BROWSER_UA}`
    ];

    const { stdout } = await execAsync(`"${YTDLP}" ${args.join(' ')}`, { timeout: 20000 });
    const directUrl = stdout.split('\n').find(line => line.startsWith('http'));

    if (directUrl) {
      res.setHeader('Content-Type', format === 'mp3'? 'audio/mpeg' : 'video/mp4');
      return res.redirect(302, directUrl); // redirect saves Render bandwidth
    }
    throw new Error('No URL extracted');
  } catch (err) {
    console.log('[yt-dlp] Failed:', err.message);

    // Fallback to Piped for YouTube only
    if (platform === 'youtube') {
      try {
        const pipedUrl = await getPipedStream(url, format, quality);
        if (pipedUrl) {
          res.setHeader('Content-Type', format === 'mp3'? 'audio/mpeg' : 'video/mp4');
          return res.redirect(302, pipedUrl);
        }
      } catch (pipedErr) {
        console.log('[Piped] Failed:', pipedErr.message);
      }
    }

    return res.status(500).json({
      error: 'Download failed',
      details: 'YouTube blocked + Piped fallback failed. Try again later.'
    });
  }
}

async function getPipedStream(url, format, quality) {
  const videoId = url.match(/(?:v=|\/)([0-9A-Za-z_-]{11})/)?.[1];
  if (!videoId) throw new Error('Invalid YouTube URL');

  for (const instance of PIPED_INSTANCES) {
    try {
      const res = await fetch(`${instance}/streams/${videoId}`, {
        signal: AbortSignal.timeout(8000)
      });
      if (!res.ok) continue;

      const data = await res.json();
      const stream = format === 'mp3'
       ? data.audioStreams?.[0]?.url
        : data.videoStreams?.find(s => s.quality?.includes(quality))?.url || data.videoStreams?.[0]?.url;

      if (stream) {
        console.log(`[Piped] Success via ${instance}`);
        return stream;
      }
    } catch (e) {
      continue; // try next instance
    }
  }
  throw new Error('All Piped instances failed');
}
