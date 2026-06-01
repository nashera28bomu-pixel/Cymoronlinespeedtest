// ─── js/downloader.js ─────────────────────────────────────────────────────────

let currentDownload = null;

function startDownload(url, format, quality, title, thumbnail, platform) {
  // Show modal
  const overlay = document.getElementById('modal-overlay');
  const mThumb  = document.getElementById('modal-thumb');
  const mTitle  = document.getElementById('modal-title');
  const mFormat = document.getElementById('modal-format');
  const mLabel  = document.getElementById('progress-label');

  mThumb.src   = thumbnail || '/icons/icon-192.png';
  mTitle.textContent  = title || 'Downloading...';
  mFormat.textContent = `${format?.toUpperCase()} · ${quality}${format === 'mp3' ? 'kbps' : 'p'}`;
  mLabel.textContent  = 'Starting download...';
  overlay.hidden      = false;
  document.body.style.overflow = 'hidden';

  // Build download URL
  const params = new URLSearchParams({ url, format, quality, title: title || 'cymortune' });
  const dlUrl  = `/api/download?${params.toString()}`;

  // Use anchor download
  const a = document.createElement('a');
  a.href  = dlUrl;
  a.download = `${(title || 'cymortune').replace(/[^a-z0-9_\s\-]/gi,'_').slice(0,60)}.${format === 'mp3' ? 'mp3' : 'mp4'}`;
  a.style.display = 'none';
  document.body.appendChild(a);

  currentDownload = a;

  // Track in history
  addDownload({ url, format, quality, title, thumbnail, platform });

  mLabel.textContent = 'Download started! Check your downloads folder.';

  // Trigger download
  a.click();

  // Close modal after 3 seconds
  setTimeout(() => {
    closeModal();
    document.body.removeChild(a);
    currentDownload = null;
  }, 3000);
}

function closeModal() {
  const overlay = document.getElementById('modal-overlay');
  overlay.hidden = true;
  document.body.style.overflow = '';
}

// Cancel button
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('modal-cancel')?.addEventListener('click', () => {
    closeModal();
  });

  // Close on backdrop click
  document.getElementById('modal-overlay')?.addEventListener('click', (e) => {
    if (e.target === e.currentTarget) closeModal();
  });
});

window.startDownload = startDownload;
window.closeModal    = closeModal;
