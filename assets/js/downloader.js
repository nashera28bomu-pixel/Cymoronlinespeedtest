// ─── js/downloader.js ─────────────────────────────────────────────────────────

let currentDownload = null;

async function startDownload(url, format, quality, title, thumbnail, platform) {
  const overlay = document.getElementById('modal-overlay');
  const mThumb  = document.getElementById('modal-thumb');
  const mTitle  = document.getElementById('modal-title');
  const mFormat = document.getElementById('modal-format');
  const mLabel  = document.getElementById('progress-label');
  const mCancel = document.getElementById('modal-cancel');

  mThumb.src          = thumbnail || '/icons/icon-192.png';
  mTitle.textContent  = title || 'Downloading...';
  mFormat.textContent = `${format?.toUpperCase()} · ${quality}${format === 'mp3' ? 'kbps' : 'p'}`;
  mLabel.textContent  = 'Starting...';
  overlay.hidden      = false;
  document.body.style.overflow = 'hidden';

  addDownload({ url, format, quality, title, thumbnail, platform });

  const safeName = `${(title || 'cymortune').replace(/[^a-z0-9_\s\-]/gi, '_').slice(0, 60)}.${format === 'mp3' ? 'mp3' : 'mp4'}`;
  const params   = new URLSearchParams({ url, format, quality, filename: title || 'cymortune' });

  try {
    mLabel.textContent = 'Connecting...';
    const response = await fetch(`/api/download?${params}`);
    const contentType = response.headers.get('content-type') || '';

    // ── JSON response = YouTube or error ─────────────────────────────────────
    if (contentType.includes('application/json')) {
      const data = await response.json();

      if (data.youtube) {
        // Show YouTube-specific UI — stream or external download
        mLabel.innerHTML = `
          <div style="display:flex;flex-direction:column;gap:10px;margin-top:8px">
            <p style="margin:0;font-size:13px;opacity:0.8">YouTube direct download unavailable.<br/>Choose an option:</p>
            ${data.embedUrl ? `
            <button onclick="openYouTubeEmbed('${data.embedUrl}', '${(title||'').replace(/'/g,"\\'")}', '${thumbnail||''}')"
              style="background:#6d28d9;color:#fff;border:none;padding:10px 16px;border-radius:10px;font-size:14px;cursor:pointer;font-weight:600">
              ▶ Stream / Play Now
            </button>` : ''}
            <button onclick="window.open('${data.redirectUrl}','_blank','noopener')"
              style="background:#059669;color:#fff;border:none;padding:10px 16px;border-radius:10px;font-size:14px;cursor:pointer;font-weight:600">
              ⬇ Download via yt1s
            </button>
          </div>`;

        // Change cancel button to Close
        mCancel.textContent = '✕ Close';
        return;
      }

      throw new Error(data.error || 'Download failed');
    }

    // ── Binary stream = direct download ──────────────────────────────────────
    mLabel.textContent = 'Downloading...';
    const blob = await response.blob();

    if (blob.size < 1000) throw new Error('File too small');

    const blobUrl = URL.createObjectURL(blob);
    const a       = document.createElement('a');
    a.href        = blobUrl;
    a.download    = safeName;
    a.style.display = 'none';
    document.body.appendChild(a);
    currentDownload = a;
    a.click();

    setTimeout(() => {
      URL.revokeObjectURL(blobUrl);
      try { document.body.removeChild(a); } catch {}
    }, 2000);

    mLabel.textContent = '✅ Download complete! Check your downloads folder.';
    setTimeout(closeModal, 3000);

  } catch (err) {
    console.error('[Download]', err.message);
    mLabel.textContent = `❌ ${err.message}. Please try again.`;
    mCancel.textContent = '✕ Close';
  }
}

// ── YouTube embed / stream player ─────────────────────────────────────────────
function openYouTubeEmbed(embedUrl, title, thumbnail) {
  closeModal();

  const player = document.createElement('div');
  player.id = 'yt-player-overlay';
  player.style.cssText = `
    position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,0.95);
    display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;
    padding:16px;box-sizing:border-box;
  `;
  player.innerHTML = `
    <div style="width:100%;max-width:640px">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
        <p style="color:#fff;font-size:14px;font-weight:600;margin:0;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${title || 'Now Playing'}</p>
        <button onclick="document.getElementById('yt-player-overlay').remove();document.body.style.overflow=''"
          style="background:rgba(255,255,255,0.15);color:#fff;border:none;width:32px;height:32px;border-radius:50%;font-size:16px;cursor:pointer;flex-shrink:0;margin-left:10px">✕</button>
      </div>
      <div style="position:relative;padding-bottom:56.25%;height:0;overflow:hidden;border-radius:12px">
        <iframe
          src="${embedUrl}"
          style="position:absolute;top:0;left:0;width:100%;height:100%;border:none;border-radius:12px"
          allow="autoplay;encrypted-media;picture-in-picture"
          allowfullscreen>
        </iframe>
      </div>
      <p style="color:rgba(255,255,255,0.5);font-size:11px;text-align:center;margin-top:8px">
        Streaming via YouTube embed · 
        <span onclick="window.open('https://yt1s.io/youtube-to-mp3?q=${encodeURIComponent(embedUrl)}','_blank')" 
          style="color:#a78bfa;cursor:pointer;text-decoration:underline">Download instead</span>
      </p>
    </div>
  `;

  document.body.appendChild(player);
  document.body.style.overflow = 'hidden';
}

function closeModal() {
  document.getElementById('modal-overlay').hidden = true;
  document.body.style.overflow = '';
  currentDownload = null;
  // Reset cancel button text
  const mCancel = document.getElementById('modal-cancel');
  if (mCancel) mCancel.textContent = '✕ Cancel';
  // Reset label
  const mLabel = document.getElementById('progress-label');
  if (mLabel) mLabel.innerHTML = 'Starting download...';
}

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('modal-cancel')?.addEventListener('click', closeModal);
  document.getElementById('modal-overlay')?.addEventListener('click', e => {
    if (e.target === e.currentTarget) closeModal();
  });
});

window.startDownload     = startDownload;
window.closeModal        = closeModal;
window.openYouTubeEmbed  = openYouTubeEmbed;
