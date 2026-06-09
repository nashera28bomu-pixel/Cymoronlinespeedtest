// ─── utils/ytdlp.js ───────────────────────────────────────────────────────────
import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __dirname    = path.dirname(fileURLToPath(import.meta.url));
const YTDLP        = process.env.YTDLP_PATH     || 'yt-dlp';
const YT_KEY       = process.env.YT_API_KEY     || '';
const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY   || '';
const SC_CLIENT_ID = process.env.SC_CLIENT_ID   || '';   // ← SoundCloud Client ID
const TMP          = path.resolve(__dirname, '../tmp');

if (!fs.existsSync(TMP)) fs.mkdirSync(TMP, { recursive: true });

const INNERTUBE_KEY = 'AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8';
const INNERTUBE_VER = '2.20240101.00.00';
const BROWSER_UA    = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

// ─── Standard download formats ────────────────────────────────────────────────
const STANDARD_FORMATS = [
  { label: 'MP3 128kbps', type: 'mp3', quality: '128' },
  { label: 'MP3 320kbps', type: 'mp3', quality: '320' },
  { label: 'MP4 360p',    type: 'mp4', quality: '360'  },
  { label: 'MP4 720p',    type: 'mp4', quality: '720'  },
  { label: 'MP4 1080p',   type: 'mp4', quality: '1080' },
];

const AUDIO_FORMATS = [
  { label: 'MP3 128kbps', type: 'mp3', quality: '128' },
  { label: 'MP3 320kbps', type: 'mp3', quality: '320' },
];

// ─── Platform detection ───────────────────────────────────────────────────────
export function detectPlatform(url) {
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

// ─── Unified search — SoundCloud first, YouTube fallback ─────────────────────
// mode: 'music' (default) = SoundCloud primary
//       'video'           = YouTube primary
export async function searchTracks(query, limit = 12, mode = 'music') {

  if (mode === 'music') {
    // PRIMARY: SoundCloud search (works perfectly on Render, no IP blocking)
    try {
      const r = await searchViaSoundCloud(query, limit);
      if (r.length) { console.log('[Search] ✓ SoundCloud'); return r; }
    } catch (e) { console.warn('[Search] SoundCloud failed:', e.message); }

    // FALLBACK: YouTube via InnerTube (for music not on SoundCloud)
    try {
      const r = await searchViaInnerTube(query, limit);
      if (r.length) { console.log('[Search] ✓ InnerTube fallback'); return r; }
    } catch (e) { console.warn('[Search] InnerTube failed:', e.message); }

  } else {
    // VIDEO MODE: Dailymotion first (no Render IP block), YouTube fallback
    try {
      const r = await searchViaDailymotion(query, limit);
      if (r.length) { console.log('[Search] ✓ Dailymotion'); return r; }
    } catch (e) { console.warn('[Search] Dailymotion failed:', e.message); }

    // YouTube fallbacks (may or may not work depending on Render IP)
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

    // Last resort: yt-dlp Dailymotion search
    console.log('[Search] Falling back to yt-dlp Dailymotion search...');
    return searchViaYtdlpDailymotion(query, limit);
  }

  // LAST RESORT for music mode: yt-dlp SoundCloud search
  console.log('[Search] Falling back to yt-dlp SoundCloud search...');
  return searchViaYtdlpSoundCloud(query, limit);
}

// Keep old export name working so existing routes don't break
export const searchYoutube = (query, limit) => searchTracks(query, limit, 'video');

// ─── SoundCloud Search ────────────────────────────────────────────────────────
// Two strategies: (A) official API with client_id, (B) scrape resolve endpoint
async function searchViaSoundCloud(query, limit) {

  // Strategy A: Official API (requires SC_CLIENT_ID env var)
  if (SC_CLIENT_ID) {
    try {
      const url = `https://api-v2.soundcloud.com/search/tracks?q=${encodeURIComponent(query)}&limit=${limit}&client_id=${SC_CLIENT_ID}`;
      const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
      if (!res.ok) throw new Error(`SC API ${res.status}`);
      const data = await res.json();
      const tracks = data?.collection || [];
      if (!tracks.length) throw new Error('No SC results');
      return tracks.map(t => ({
        id: String(t.id),
        title: t.title || 'Unknown',
        duration: formatDuration(Math.floor((t.duration || 0) / 1000)),
        thumbnail: t.artwork_url?.replace('-large', '-t300x300') || t.user?.avatar_url || '',
        author: t.user?.username || '',
        url: t.permalink_url,
        platform: 'soundcloud',
        views: formatViews(t.playback_count),
        genre: t.genre || '',
      }));
    } catch (e) {
      console.warn('[SC] Official API failed:', e.message);
    }
  }

  // Strategy B: SoundCloud oEmbed / resolve (no key needed, limited)
  // Use yt-dlp scsearch as the reliable no-key path
  return searchViaYtdlpSoundCloud(query, limit);
}

// ─── yt-dlp SoundCloud search (scsearch:) ────────────────────────────────────
// yt-dlp can search SoundCloud directly — no IP blocking, works on Render
function searchViaYtdlpSoundCloud(query, limit) {
  return new Promise((resolve, reject) => {
    const proc = spawn(YTDLP, [
      `scsearch${limit}:${query}`,
      '--dump-json', '--no-playlist', '--no-warnings',
      '--add-header', `User-Agent:${BROWSER_UA}`,
    ]);
    let out = '', err = '';
    proc.stdout.on('data', d => out += d);
    proc.stderr.on('data', d => err += d);
    const t = setTimeout(() => { proc.kill(); reject(new Error('yt-dlp SC search timed out')); }, 35000);
    proc.on('close', code => {
      clearTimeout(t);
      if (code !== 0) {
        console.error('[yt-dlp SC]', err.slice(0, 400));
        return reject(new Error('yt-dlp SoundCloud search failed'));
      }
      try {
        const results = out.trim().split('\n').filter(Boolean).map(line => {
          const d = JSON.parse(line);
          return {
            id: d.id,
            title: d.title || 'Unknown',
            duration: formatDuration(d.duration || 0),
            thumbnail: d.thumbnail || '',
            author: d.uploader || d.creator || '',
            url: d.webpage_url,
            platform: 'soundcloud',
            views: formatViews(d.view_count),
            genre: d.genre || '',
          };
        });
        if (!results.length) return reject(new Error('No SC results from yt-dlp'));
        resolve(results);
      } catch { reject(new Error('yt-dlp SC parse failed')); }
    });
  });
}

// ─── Dailymotion Search (public API, no key, no Render IP block) ─────────────
async function searchViaDailymotion(query, limit) {
  const fields = 'id,title,duration,thumbnail_720_url,thumbnail_480_url,owner.screenname,views_total,url';
  const apiUrl = `https://api.dailymotion.com/videos?search=${encodeURIComponent(query)}&limit=${limit}&fields=${encodeURIComponent(fields)}&sort=relevance`;
  const res = await fetch(apiUrl, { signal: AbortSignal.timeout(12000) });
  if (!res.ok) throw new Error(`Dailymotion API ${res.status}`);
  const data = await res.json();
  const items = data?.list || [];
  if (!items.length) throw new Error('Dailymotion returned 0 results');
  return items.map(v => ({
    id: v.id,
    title: v.title || 'Unknown',
    duration: formatDuration(v.duration || 0),
    thumbnail: v.thumbnail_720_url || v.thumbnail_480_url || '',
    author: v['owner.screenname'] || '',
    url: v.url || `https://www.dailymotion.com/video/${v.id}`,
    platform: 'dailymotion',
    views: formatViews(v.views_total),
  }));
}

// ─── yt-dlp Dailymotion search fallback (dmsearch:) ──────────────────────────
function searchViaYtdlpDailymotion(query, limit) {
  return new Promise((resolve, reject) => {
    const proc = spawn(YTDLP, [
      `dmsearch${limit}:${query}`,
      '--dump-json', '--no-playlist', '--no-warnings',
      '--add-header', `User-Agent:${BROWSER_UA}`,
    ]);
    let out = '', err = '';
    proc.stdout.on('data', d => out += d);
    proc.stderr.on('data', d => err += d);
    const t = setTimeout(() => { proc.kill(); reject(new Error('yt-dlp DM search timed out')); }, 35000);
    proc.on('close', code => {
      clearTimeout(t);
      if (code !== 0) {
        console.error('[yt-dlp DM]', err.slice(0, 400));
        return reject(new Error('yt-dlp Dailymotion search failed'));
      }
      try {
        const results = out.trim().split('\n').filter(Boolean).map(line => {
          const d = JSON.parse(line);
          return {
            id: d.id,
            title: d.title || 'Unknown',
            duration: formatDuration(d.duration || 0),
            thumbnail: d.thumbnail || '',
            author: d.uploader || d.creator || '',
            url: d.webpage_url,
            platform: 'dailymotion',
            views: formatViews(d.view_count),
          };
        });
        if (!results.length) return reject(new Error('No DM results from yt-dlp'));
        resolve(results);
      } catch { reject(new Error('yt-dlp DM parse failed')); }
    });
  });
}

// ─── YouTube InnerTube search ─────────────────────────────────────────────────
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
          client: { clientName: 'WEB', clientVersion: INNERTUBE_VER, hl: 'en', gl: 'US', userAgent: BROWSER_UA },
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
      views: v.viewCountText?.simpleText?.replace(/ views?/, '') || null,
    });
  }
  if (!results.length) throw new Error('InnerTube returned 0 videos');
  return results;
}

// ─── YouTube RapidAPI search ──────────────────────────────────────────────────
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

// ─── YouTube Official API search ─────────────────────────────────────────────
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

// ─── Get media info (all platforms) ──────────────────────────────────────────
export async function getMediaInfo(url) {
  const platform = detectPlatform(url);
  const videoId  = platform === 'youtube' ? extractYouTubeId(url) : null;

  if (platform === 'youtube') {
    if (videoId) {
      try {
        const info = await getInfoViaInnerTube(videoId, url);
        if (info) return info;
      } catch (e) { console.warn('[Info] InnerTube failed:', e.message); }
      if (YT_KEY) {
        try { return await getYouTubeAPIInfo(url, videoId); } catch {}
      }
    }
    return getInfoViaYtdlp(url, platform);
  }

  if (platform === 'soundcloud') {
    try {
      const info = await getInfoViaSoundCloud(url);
      if (info) return info;
    } catch (e) { console.warn('[Info] SoundCloud oEmbed failed:', e.message); }
  }

  return getInfoViaYtdlp(url, platform);
}

// ─── SoundCloud oEmbed info (no key needed) ───────────────────────────────────
async function getInfoViaSoundCloud(url) {
  const oembed = `https://soundcloud.com/oembed?format=json&url=${encodeURIComponent(url)}`;
  const res = await fetch(oembed, { signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error(`SoundCloud oEmbed ${res.status}`);
  const d = await res.json();
  return {
    id: url,
    title: d.title || 'Unknown',
    author: d.author_name || '',
    duration: '',
    thumbnail: d.thumbnail_url || '',
    url,
    platform: 'soundcloud',
    views: null,
    formats: AUDIO_FORMATS,
  };
}

// ─── YouTube InnerTube player info ────────────────────────────────────────────
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
    formats: STANDARD_FORMATS,
  };
}

async function getYouTubeAPIInfo(url, videoId) {
  const res  = await fetch(
    `https://www.googleapis.com/youtube/v3/videos?part=snippet,contentDetails,statistics&id=${videoId}&key=${YT_KEY}`,
    { signal: AbortSignal.timeout(10000) }
  );
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
    formats: STANDARD_FORMATS,
  };
}

// ─── yt-dlp info fallback (all platforms) ────────────────────────────────────
function getInfoViaYtdlp(url, platform) {
  return new Promise((resolve, reject) => {
    const proc = spawn(YTDLP, [
      '--dump-json', '--no-playlist', '--no-warnings', '--skip-download',
      '--add-header', `User-Agent:${BROWSER_UA}`,
      url,
    ]);
    let out = '';
    proc.stdout.on('data', d => out += d);
    const t = setTimeout(() => { proc.kill(); reject(new Error('Info timed out')); }, 20000);
    proc.on('close', code => {
      clearTimeout(t);
      if (code !== 0) return reject(new Error(`Could not fetch media info for ${platform}`));
      try {
        const d = JSON.parse(out.trim().split('\n')[0]);
        const isAudioOnly = ['soundcloud', 'mixcloud', 'bandcamp'].includes(platform);
        resolve({
          id: d.id,
          title: d.title || 'Unknown',
          author: d.uploader || d.channel || d.creator || '',
          duration: formatDuration(d.duration || 0),
          thumbnail: d.thumbnail || '',
          url: d.webpage_url || url,
          platform,
          views: formatViews(d.view_count),
          formats: isAudioOnly ? AUDIO_FORMATS : STANDARD_FORMATS,
        });
      } catch { reject(new Error('Parsing failed')); }
    });
  });
}

// ─── streamDownload ───────────────────────────────────────────────────────────
export function streamDownload(url, format, quality, res, filename) {
  const args = [
    '--no-warnings', '--no-playlist', '-o', '-',
    '--add-header', `User-Agent:${BROWSER_UA}`,
    '--add-header', 'Accept-Language:en-US,en;q=0.9',
    '--no-check-certificates',
  ];

  // Only apply YouTube-specific extractor args for YouTube URLs
  if (/youtube\.com|youtu\.be/i.test(url)) {
    args.push('--extractor-args', 'youtube:player_client=android,web');
  }

  if (format === 'mp3') {
    args.push('-x', '--audio-format', 'mp3', '--audio-quality', quality === '320' ? '0' : '5');
  } else {
    const h = ['1080','720','480','360'].includes(quality) ? quality : '720';
    args.push(
      '--format', `bestvideo[height<=${h}][ext=mp4]+bestaudio[ext=m4a]/bestvideo[height<=${h}]+bestaudio/best[height<=${h}]/best`,
      '--merge-output-format', 'mp4',
    );
  }

  args.push(url);

  const proc = spawn(YTDLP, args);
  res.setHeader('Content-Type', format === 'mp3' ? 'audio/mpeg' : 'video/mp4');
  res.setHeader('Content-Disposition', `attachment; filename="${(filename || 'cymortune').replace(/[^\w\s-]/g, '')}.${format}"`);
  proc.stdout.pipe(res);
  proc.stderr.on('data', d => console.warn('[DL]', d.toString().slice(0, 120)));
  proc.on('close', () => { try { res.end(); } catch {} });
  res.on('close',  () => { try { proc.kill(); } catch {} });
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function extractYouTubeId(url) {
  return url.match(/(?:v=|youtu\.be\/|embed\/|shorts\/)([a-zA-Z0-9_-]{11})/)?.[1] || null;
}
function parseDuration(iso) {
  const m = iso?.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!m) return '0:00';
  return `${m[1] ? m[1]+':' : ''}${m[2]||'0'}:${String(m[3]||'0').padStart(2,'0')}`;
}
function formatDuration(s) {
  if (!s || isNaN(s)) return '0:00';
  return `${Math.floor(s/60)}:${String(Math.floor(s%60)).padStart(2,'0')}`;
}
function formatViews(n) {
  if (!n || isNaN(n)) return null;
  return n >= 1e6 ? (n/1e6).toFixed(1)+'M' : n >= 1e3 ? (n/1e3).toFixed(1)+'K' : String(n);
}
