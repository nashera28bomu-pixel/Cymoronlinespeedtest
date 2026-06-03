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

let lastQuery   = '';
let lastResults = [];

function isURL(str) {
  try { new URL(str); return true; } catch { return false; }
}

function platformLabel(p) {
  const map = {
    youtube:'▶ YouTube', tiktok:'♪ TikTok', instagram:'📸 Instagram',
    twitter:'🐦 Twitter', facebook:'👍 Facebook', soundcloud:'☁ SoundCloud', spotify:'🎵 Spotify'
  };
  return map[p] || '🌐 Web';
}

// ── UI state helpers ───────────────────────────────────────────────────────────
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
  document.getElementById('results-title').textContent = `Results for "${query}"`;
  document.getElementById('results-count').textContent = `${results.length} found`;
  document.getElementById('results-grid').innerHTML = results.map(buildResultCard).join('');
}

function buildResultCard(item) {
  const thumb = item.thumbnail || `https://i.ytimg.com/vi/${item.id}/hqdefault.jpg`;
  const safeTitle   = esc(item.title);
  const safeThumb   = esc(thumb);
  const safeUrl     = esc(item.url);
  const safePlatform= item.platform || 'youtube';

  return `
    <div class="result-card">
      <div class="rc-thumb-wrap" onclick="handleCardClick('${safeUrl}','${safeTitle}','${safeThumb}','${safePlatform}')">
        <img class="rc-thumb" src="${safeThumb}" alt="${safeTitle}" loading="lazy"
          onerror="this.src='/icons/icon-192.png'"/>
        ${item.duration ? `<span class="rc-duration">${item.duration}</span>` : ''}
        <span class="rc-platform">${platformLabel(safePlatform)}</span>
      </div>
      <div class="rc-body">
        <div class="rc-title">${safeTitle}</div>
        <div class="rc-author">${esc(item.author || '')}${item.views ? ' · ' + item.views : ''}</div>
        <div class="rc-actions">
          <button class="rc-btn rc-btn-mp3"
            onclick="startDownload('${safeUrl}','mp3','320','${safeTitle}','${safeThumb}','${safePlatform}')">
            🎵 MP3
          </button>
          <button class="rc-btn rc-btn-mp4"
            onclick="startDownload('${safeUrl}','mp4','720','${safeTitle}','${safeThumb}','${safePlatform}')">
            🎬 MP4
          </button>
        </div>
      </div>
    </div>`;
}

async function handleCardClick(url, title, thumbnail, platform) {
  showLoading('Fetching formats...');
  try {
    const res  = await fetch(`/api/search/info?url=${encodeURIComponent(url)}`);
    const data = await res.json();
    if (data.success && data.info) {
      showInfoCard(data.info);
    } else {
      // Fallback with default formats
      showInfoCardFallback(url, title, thumbnail, platform);
    }
  } catch {
    showInfoCardFallback(url, title, thumbnail, platform);
  }
}

function showInfoCard(info) {
  hide('loading-wrap'); hide('results-section'); hide('trending-section'); hide('error-card');
  show('info-card');

  document.getElementById('info-thumb').src               = info.thumbnail || '/icons/icon-192.png';
  document.getElementById('info-title').textContent        = info.title    || '';
  document.getElementById('info-author').textContent       = info.author   || '';
  document.getElementById('info-duration').textContent     = info.duration || '';
  document.getElementById('info-platform-badge').textContent = platformLabel(info.platform);

  const meta = document.getElementById('info-meta');
  meta.innerHTML = [
    info.views    ? `<span>👁 ${info.views}</span>`    : '',
    info.duration ? `<span>⏱ ${info.duration}</span>` : '',
    info.likes    ? `<span>❤ ${info.likes}</span>`    : '',
  ].filter(Boolean).join('');

  document.getElementById('format-grid').innerHTML = (info.formats || []).map(f => `
    <button class="fmt-btn fmt-btn-${f.type}"
      onclick="startDownload('${esc(info.url)}','${f.type}','${f.quality}','${esc(info.title)}','${esc(info.thumbnail||'')}','${info.platform}')">
      ${f.type === 'mp3' ? '🎵' : '🎬'} ${f.label}
    </button>`).join('');
}

function showInfoCardFallback(url, title, thumbnail, platform) {
  showInfoCard({
    url, title, thumbnail, platform,
    formats: [
      { label:'MP3 128kbps', type:'mp3', quality:'128' },
      { label:'MP3 320kbps', type:'mp3', quality:'320' },
      { label:'MP4 720p',    type:'mp4', quality:'720'  },
      { label:'MP4 1080p',   type:'mp4', quality:'1080' },
    ],
  });
}

// ── Main search function ───────────────────────────────────────────────────────
async function doSearch(query) {
  query = (query || '').trim();
  if (!query) return;
  lastQuery = query;

  // URL pasted — fetch info directly
  if (isURL(query)) {
    showLoading('Fetching media info...');
    try {
      const res  = await fetch(`/api/search/info?url=${encodeURIComponent(query)}`);
      const data = await res.json();
      if (data.success && data.info) { showInfoCard(data.info); return; }
      throw new Error(data.error || 'Could not load URL');
    } catch (err) {
      showError(`Could not load URL: ${err.message}. Try searching by name instead.`);
    }
    return;
  }

  // Text search
  showLoading(`Searching for "${query}"...`);
  try {
    const res  = await fetch(`/api/search?q=${encodeURIComponent(query)}&limit=12`);
    const data = await res.json();

    if (!data.success) throw new Error(data.error || 'Search failed');

    lastResults = data.results || [];
    if (!lastResults.length) throw new Error('No results found. Try a different search term.');

    showResults(lastResults, query);
  } catch (err) {
    showError(err.message || 'Search failed. Please try again.');
  }
}

// ── Utils ──────────────────────────────────────────────────────────────────────
function show(id) { const el = document.getElementById(id); if (el) el.hidden = false; }
function hide(id) { const el = document.getElementById(id); if (el) el.hidden = true; }
function esc(str) {
  return String(str || '')
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/"/g, '&quot;')
    .replace(/\n/g, ' ')
    .replace(/\r/g, '');
}

// ── Init ───────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {

  // Render trending grid
  const grid = document.getElementById('trending-grid');
  if (grid) {
    grid.innerHTML = TRENDING.map(t => `
      <div class="trending-item"
        onclick="document.getElementById('search-input').value='${t.text}';doSearch('${t.text}')">
        <div class="ti-icon">${t.icon}</div>
        <div class="ti-text">${t.text}</div>
      </div>`).join('');
  }

  // Search button click
  document.getElementById('search-btn')?.addEventListener('click', () => {
    const q = document.getElementById('search-input').value;
    if (q.trim()) doSearch(q);
  });

  // Enter key
  document.getElementById('search-input')?.addEventListener('keydown', e => {
    if (e.key === 'Enter') {
      const q = e.target.value;
      if (q.trim()) doSearch(q);
    }
  });

  // Show/hide clear button
  document.getElementById('search-input')?.addEventListener('input', e => {
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

  // Retry button
  document.getElementById('retry-btn')?.addEventListener('click', () => {
    if (lastQuery) doSearch(lastQuery);
    else { hide('error-card'); show('trending-section'); }
  });

  // Platform pills (UI only — filtering not yet implemented server-side)
  document.querySelectorAll('.pill').forEach(pill => {
    pill.addEventListener('click', () => {
      document.querySelectorAll('.pill').forEach(p => p.classList.remove('active'));
      pill.classList.add('active');
    });
  });

  // Downloads clear
  document.getElementById('clear-btn')?.addEventListener('click', clearDownloads);
});

window.doSearch        = doSearch;
window.handleCardClick = handleCardClick;
window.showInfoCard    = showInfoCard;
