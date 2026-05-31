// ─── js/app.js ────────────────────────────────────────────────────────────────

// ── Tab switching ─────────────────────────────────────────────────────────────
function switchTab(name) {
  document.querySelectorAll('.tab').forEach(t => {
    t.classList.toggle('active', t.dataset.tab === name);
  });
  document.querySelectorAll('.tab-content').forEach(s => {
    s.classList.remove('active');
  });
  const content = document.getElementById(`tab-${name}-content`);
  if (content) content.classList.add('active');

  if (name === 'downloads') renderDownloads();
}

document.querySelectorAll('.tab').forEach(tab => {
  tab.addEventListener('click', () => switchTab(tab.dataset.tab));
});

// ── Theme toggle ──────────────────────────────────────────────────────────────
function initTheme() {
  const saved = localStorage.getItem('cymortune_theme') || 'dark';
  if (saved === 'light') document.body.classList.add('light-mode');
  updateThemeBtn(saved);
}

function updateThemeBtn(theme) {
  const btn = document.getElementById('theme-btn');
  if (btn) btn.textContent = theme === 'dark' ? '🌙' : '☀';
}

document.getElementById('theme-btn')?.addEventListener('click', () => {
  const isLight = document.body.classList.toggle('light-mode');
  const theme   = isLight ? 'light' : 'dark';
  localStorage.setItem('cymortune_theme', theme);
  updateThemeBtn(theme);
});

// ── Init ──────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  initTheme();
  updateBadge();
  renderDownloads();
});

window.switchTab = switchTab;
