// ─── js/search.js ─────────────────────────────────────────────────────────────

const TRENDING = [
  { icon:'🎵', text:'Rema Calm Down' },
  { icon:'🔥', text:'Burna Boy Last Last' },
  { icon:'🎶', text:'Wizkid Essence' },
  { icon:'💃', text:'Ayra Starr Rush' },
  { icon:'🎸', text:'Tyla Water' },
  { icon:'🌟', text:'Asake Organise' },
  { icon:'🎤', text:'Omah Lay Godly' },
  { icon:'🎧', text:'Davido Unavailable' },
  { icon:'🎵', text:'Chris Brown Angel' },
  { icon:'🔥', text:'Drake Rich Baby Daddy' },
  { icon:'💜', text:'The Weeknd Blinding Lights' },
  { icon:'🎶', text:'Bad Bunny Tití Me Preguntó' },
];

let lastQuery    = '';
let lastResults  = [];
let activePlatform = 'all';

function isURL(str) {
  try { new URL(str); return true; } catch { return false; }
}

function detectPlatformFromUrl(url) {
  if (/youtube|youtu\.be/i.test(url))   return 'youtube';
  if (/tiktok/i.test(url))              return 'tiktok';
  if (/instagram/i.test(url))           return 'instagram';
  if (/twitter|x\.com/i.test(url))      return 'twitter';
  if (/facebook|fb\.watch/i.test(url))  return 'facebook';
  if (/soundcloud/i.test(url))          return 'soundcloud';
  if (/spotify/i.test(url))             return 'spotify';
  return 'web';
}

function platformLabel(p) {
  const map = { youtube:'▶ YouTube', tiktok:'♪ TikTok', instagram:'📸 Instagram', twitter:'🐦 Twitter', facebook:'👍 Facebook', soundcloud:'☁ SoundCloud', spotify:'🎵 Spotify' };
  return map[p] || p || 'Web';
}

function showLoading(text = 'Searching...') {
  hide('trending-section'); hide('results-section'); hide('info-card'); hide('error-card');
  show('loading-wrap');
  document.getElementById('loading-text').textContent = text;
}

function showError(msg) {
  hide('loading-wrap'); hide('results-section'); hide('info-card');
  show('error-card');
  document.getElementById('error-text').textContent = msg;
}

function showResults(results, query) {
  hide('loading-wrap'); hide('info-card'); hide('trending-section'); hide('error-card');
  show('results-section');
  const grid  = document.getElementById('results-grid');
  const title = document.getElementById('results-title');
  const count = document.getElementById('results-count');
  title.textContent = `Results for "${query}"`;
  count.textContent = `${results.length} found`;
  grid.innerHTML = results.map(buildResultCard).join('');
}

function buildResultCard(item) {
  const thumb = item.thumbnail || `https://i.ytimg.com/vi/${item.id}/hqdefault.jpg`;
  return `
    <div class="result-card" onclick="handleCardClick('${esc(item.url)}','${esc(item.title)}','${esc(thumb)}','${item.platform||'youtube'}')">
      <div class="rc-thumb-wrap">
        <img class="rc-thumb" src="${esc(thumb)}" alt="${esc(item.title)}" loading="lazy" onerror="this.src='/icons/icon-192.png'"/>
        <span class="rc-duration">${item.duration || ''}</span>
        <span class="rc-platform">${platformLabel(item.platform)}</span>
      </div>
      <div class="rc-body">
        <div class="rc-title">${esc(item.title)}</div>
        <div class="rc-author">${esc(item.author || '')}${item.views ? ' · ' + item.views + ' views' : ''}</div>
        <div class="rc-actions">
          <button class="rc-btn rc-btn-mp3" onclick="event.stopPropagation();startDownload('${esc(item.url)}','mp3','320','${esc(item.title)}','${esc(thumb)}','${item.platform||'youtube'}')">
            🎵 MP3
          </button>
          <button class="rc-btn rc-btn-mp4" onclick="event.stopPropagation();startDownload('${esc(item.url)}','mp4','720','${esc(item.title)}','${esc(thumb)}','${item.platform||'youtube'}')">
            🎬 MP4
          </button>
        </div>
      </div>
    </div>`;
}

async function handleCardClick(url, title, thumbnail, platform) {
  showLoading('Fetching media info...');
  try {
    const res  = await fetch(`/api/search/info?url=${encodeURIComponent(url)}`);
    const data = await res.json();
    if (!data.success) throw new Error(data.error || 'Failed to fetch info');
    showInfoCard(data.info);
  } catch {
    // fallback — just show download buttons with known formats
    showInfoCardFallback(url, title, thumbnail, platform);
  }
}

function showInfoCard(info) {
  hide('loading-wrap'); hide('results-section'); hide('trending-section'); hide('error-card');
  show('info-card');

  document.getElementById('info-thumb').src      = info.thumbnail || '/icons/icon-192.png';
  document.getElementById('info-title').textContent   = info.title || '';
  document.getElementById('info-author').textContent  = info.author || '';
  document.getElementById('info-duration').textContent= info.duration || '';
  document.getElementById('info-platform-badge').textContent = platformLabel(info.platform);

  const meta = document.getElementById('info-meta');
  meta.innerHTML = [
    info.views ? `<span>👁 ${info.views} views</span>` : '',
    info.likes ? `<span>❤ ${info.likes}</span>` : '',
    info.duration ? `<span>⏱ ${info.duration}</span>` : '',
  ].filter(Boolean).join('');

  const fmts = document.getElementById('format-grid');
  fmts.innerHTML = (info.formats || []).map(f => `
    <button class="fmt-btn fmt-btn-${f.type}" onclick="startDownload('${esc(info.url)}','${f.type}','${f.quality}','${esc(info.title)}','${esc(info.thumbnail||'')}','${info.platform}')">
      ${f.type === 'mp3' ? '🎵' : '🎬'} ${f.label}
    </button>`).join('');
}

function showInfoCardFallback(url, title, thumbnail, platform) {
  const info = {
    url, title, thumbnail, platform,
    formats: [
      { label:'MP3 128kbps', type:'mp3', quality:'128' },
      { label:'MP3 320kbps', type:'mp3', quality:'320' },
      { label:'MP4 720p',    type:'mp4', quality:'720'  },
      { label:'MP4 1080p',   type:'mp4', quality:'1080' },
    ],
  };
  showInfoCard(info);
}

async function doSearch(query) {
  query = query.trim();
  if (!query) return;
  lastQuery = query;

  if (isURL(query)) {
    showLoading('Fetching media info...');
    try {
      const res  = await fetch(`/api/search/info?url=${encodeURIComponent(query)}`);
      const data = await res.json();
      if (!data.success) throw new Error(data.error || 'Could not fetch info');
      showInfoCard(data.info);
    } catch (err) {
      showError(err.message || 'Could not load URL. Try searching by name instead.');
    }
    return;
  }

  showLoading(`Searching for "${query}"...`);
  try {
    const res   = await fetch(`/api/search?q=${encodeURIComponent(query)}&limit=12`);
    const data  = await res.json();
    if (!data.success) throw new Error(data.error || 'Search failed');
    lastResults = data.results || [];
    if (!lastResults.length) throw new Error('No results found. Try a different search term.');
    showResults(lastResults, query);
  } catch (err) {
    showError(err.message);
  }
}

// ── Utils ──────────────────────────────────────────────────────────────────────
function show(id) { const el = document.getElementById(id); if (el) el.hidden = false; }
function hide(id) { const el = document.getElementById(id); if (el) el.hidden = true; }
function esc(str) { return String(str||'').replace(/'/g,"\\'").replace(/"/g,'&quot;').replace(/\n/g,' '); }

// ── Init ───────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  // Trending
  const grid = document.getElementById('trending-grid');
  if (grid) {
    grid.innerHTML = TRENDING.map(t => `
      <div class="trending-item" onclick="document.getElementById('search-input').value='${t.text}';doSearch('${t.text}')">
        <div class="ti-icon">${t.icon}</div>
        <div class="ti-text">${t.text}</div>
      </div>`).join('');
  }

  // Search button
  document.getElementById('search-btn')?.addEventListener('click', () => {
    doSearch(document.getElementById('search-input').value);
  });

  // Enter key
  document.getElementById('search-input')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') doSearch(e.target.value);
  });

  // Input → show/hide clear button
  document.getElementById('search-input')?.addEventListener('input', (e) => {
    document.getElementById('search-clear').hidden = !e.target.value;
  });

  // Clear button
  document.getElementById('search-clear')?.addEventListener('click', () => {
    const inp = document.getElementById('search-input');
    inp.value = '';
    inp.focus();
    document.getElementById('search-clear').hidden = true;
    hide('results-section'); hide('info-card'); hide('error-card');
    show('trending-section');
  });

  // Retry
  document.getElementById('retry-btn')?.addEventListener('click', () => {
    if (lastQuery) doSearch(lastQuery);
    else { hide('error-card'); show('trending-section'); }
  });

  // Platform pills
  document.querySelectorAll('.pill').forEach(pill => {
    pill.addEventListener('click', () => {
      document.querySelectorAll('.pill').forEach(p => p.classList.remove('active'));
      pill.classList.add('active');
      activePlatform = pill.dataset.platform;
    });
  });

  // Downloads clear
  document.getElementById('clear-btn')?.addEventListener('click', clearDownloads);
});

window.doSearch           = doSearch;
window.handleCardClick    = handleCardClick;
window.showInfoCard       = showInfoCard;
