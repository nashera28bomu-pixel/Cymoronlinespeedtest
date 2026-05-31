// ─── js/history.js ────────────────────────────────────────────────────────────
const HISTORY_KEY = 'cymortune_downloads';
const MAX_HISTORY = 100;

function getHistory() {
  try { return JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]'); } catch { return []; }
}

function saveHistory(arr) {
  try { localStorage.setItem(HISTORY_KEY, JSON.stringify(arr.slice(0, MAX_HISTORY))); } catch {}
}

function addDownload(item) {
  const history = getHistory();
  // Remove duplicate by url+format+quality
  const filtered = history.filter(h => !(h.url === item.url && h.format === item.format && h.quality === item.quality));
  filtered.unshift({ ...item, date: new Date().toISOString(), id: Date.now() });
  saveHistory(filtered);
  renderDownloads();
  updateBadge();
}

function clearDownloads() {
  if (!confirm('Clear all download history?')) return;
  saveHistory([]);
  renderDownloads();
  updateBadge();
}

function updateBadge() {
  const count = getHistory().length;
  const badge = document.getElementById('dl-badge');
  if (!badge) return;
  if (count > 0) { badge.textContent = count > 99 ? '99+' : count; badge.hidden = false; }
  else { badge.hidden = true; }
}

function formatDate(iso) {
  try {
    const d = new Date(iso);
    const now = new Date();
    const diff = (now - d) / 1000;
    if (diff < 60)   return 'Just now';
    if (diff < 3600) return Math.floor(diff/60) + 'm ago';
    if (diff < 86400)return Math.floor(diff/3600) + 'h ago';
    return d.toLocaleDateString();
  } catch { return ''; }
}

function platformEmoji(platform) {
  const map = { youtube:'▶', tiktok:'♪', instagram:'📸', twitter:'🐦', facebook:'👍', soundcloud:'☁', spotify:'🎵' };
  return map[platform] || '🌐';
}

function renderDownloads() {
  const history = getHistory();
  const list    = document.getElementById('downloads-list');
  const empty   = document.getElementById('downloads-empty');
  const stats   = document.getElementById('dl-stats');
  if (!list) return;

  if (stats) stats.textContent = history.length ? `${history.length} item${history.length !== 1 ? 's' : ''}` : '';

  if (!history.length) {
    empty?.removeAttribute('hidden');
    list.innerHTML = '';
    return;
  }

  empty?.setAttribute('hidden', '');

  list.innerHTML = history.map(item => `
    <div class="dl-item" data-id="${item.id}">
      <img class="dl-item-thumb" src="${item.thumbnail || '/icons/icon-192.png'}" alt="" onerror="this.src='/icons/icon-192.png'"/>
      <div class="dl-item-body">
        <div class="dl-item-title">${escHtml(item.title || 'Unknown')}</div>
        <div class="dl-item-meta">
          <span class="dl-meta-tag tag-${item.format}">${item.format?.toUpperCase()} ${item.quality}${item.format==='mp3'?'kbps':'p'}</span>
          <span class="dl-meta-tag tag-platform">${platformEmoji(item.platform)} ${item.platform || 'web'}</span>
        </div>
        <div class="dl-item-date">${formatDate(item.date)}</div>
      </div>
      <button class="dl-redl-btn" onclick="reDownload(${item.id})">↓ Again</button>
    </div>
  `).join('');
}

function reDownload(id) {
  const item = getHistory().find(h => h.id === id);
  if (!item) return;
  startDownload(item.url, item.format, item.quality, item.title, item.thumbnail, item.platform);
}

function escHtml(str) {
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// Expose globals
window.getHistory    = getHistory;
window.addDownload   = addDownload;
window.clearDownloads= clearDownloads;
window.updateBadge   = updateBadge;
window.renderDownloads = renderDownloads;
window.reDownload    = reDownload;
