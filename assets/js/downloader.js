// ─── js/downloader.js ─────────────────────────────────────────────────────────

let currentDownload = null;

async function startDownload(url, format, quality, title, thumbnail, platform) {
  const overlay = document.getElementById('modal-overlay');
  const mThumb  = document.getElementById('modal-thumb');
  const mTitle  = document.getElementById('modal-title');
  const mFormat = document.getElementById('modal-format');
  const mLabel  = document.getElementById('progress-label');

  mThumb.src          = thumbnail || '/icons/icon-192.png';
  mTitle.textContent  = title || 'Downloading...';
  mFormat.textContent = `${format?.toUpperCase()} · ${quality}${format === 'mp3' ? 'kbps' : 'p'}`;
  mLabel.textContent  = 'Starting download...';
  overlay.hidden      = false;
  document.body.style.overflow = 'hidden';

  // Track in history
  addDownload({ url, format, quality, title, thumbnail, platform });

  const safeName = `${(title || 'cymortune').replace(/[^a-z0-9_\s\-]/gi, '_').slice(0, 60)}.${format === 'mp3' ? 'mp3' : 'mp4'}`;
  const params   = new URLSearchParams({ url, format, quality, filename: title || 'cymortune' });
  const dlUrl    = `/api/download?${params.toString()}`;

  try {
    mLabel.textContent = 'Connecting...';

    // Fetch with a HEAD-like probe — if server returns JSON (fallback), handle it
    // If server streams binary, trigger save
    const response = await fetch(dlUrl);

    const contentType = response.headers.get('content-type') || '';

    // ── Server returned JSON → yt-dlp failed, use fallback links ──
    if (contentType.includes('application/json')) {
      const data = await response.json();

      if (data.fallback && data.links) {
        mLabel.textContent = 'Opening via external service...';

        // Try cobalt.tools first — opens in new tab, handles the download
        const cobaltUrl = data.links.cobalt ||
          `https://cobalt.tools/?u=${encodeURIComponent(url)}`;

        setTimeout(() => {
          window.open(cobaltUrl, '_blank', 'noopener');
          mLabel.textContent = '✅ Opened in cobalt.tools — select format there.';
        }, 500);

        setTimeout(closeModal, 4000);
        return;
      }

      // Some other JSON error
      throw new Error(data.error || 'Download failed');
    }

    // ── Server is streaming binary — pipe it to a blob download ──
    mLabel.textContent = 'Downloading...';

    const blob = await response.blob();

    if (blob.size < 1000) throw new Error('File too small — download failed');

    const blobUrl = URL.createObjectURL(blob);
    const a       = document.createElement('a');
    a.href        = blobUrl;
    a.download    = safeName;
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();

    setTimeout(() => {
      URL.revokeObjectURL(blobUrl);
      document.body.removeChild(a);
    }, 1000);

    mLabel.textContent = '✅ Download complete! Check your downloads folder.';
    setTimeout(closeModal, 3000);

  } catch (err) {
    console.error('[Download]', err.message);

    // ── Final fallback — always open cobalt.tools, never show a dead error ──
    mLabel.textContent = 'Redirecting to cobalt.tools...';

    const cobaltUrl = `https://cobalt.tools/?u=${encodeURIComponent(url)}`;

    setTimeout(() => {
      window.open(cobaltUrl, '_blank', 'noopener');
      mLabel.textContent = '✅ Opened in cobalt.tools — select format and download there.';
    }, 600);

    setTimeout(closeModal, 4500);
  }
}

function closeModal() {
  document.getElementById('modal-overlay').hidden = true;
  document.body.style.overflow = '';
  currentDownload = null;
}

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('modal-cancel')?.addEventListener('click', closeModal);
  document.getElementById('modal-overlay')?.addEventListener('click', e => {
    if (e.target === e.currentTarget) closeModal();
  });
});

window.startDownload = startDownload;
window.closeModal    = closeModal;
