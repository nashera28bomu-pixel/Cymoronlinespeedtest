// ─── js/sw-register.js ───────────────────────────────────────────────────────

// ── Register service worker ───────────────────────────────────────────────────
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js')
      .then(reg => {
        console.log('[CymorTune] SW registered:', reg.scope);

        // Check for updates
        reg.addEventListener('updatefound', () => {
          const newWorker = reg.installing;
          newWorker?.addEventListener('statechange', () => {
            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
              // New version available — show subtle notification
              showUpdateToast();
            }
          });
        });
      })
      .catch(err => console.log('[CymorTune] SW registration failed:', err));
  });
}

// ── PWA Install prompt ────────────────────────────────────────────────────────
let deferredPrompt = null;

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPrompt = e;

  // Only show banner if not dismissed before
  const dismissed = localStorage.getItem('cymortune_pwa_dismissed');
  if (!dismissed) {
    const banner = document.getElementById('pwa-banner');
    if (banner) banner.hidden = false;
  }
});

document.getElementById('pwa-install-btn')?.addEventListener('click', async () => {
  if (!deferredPrompt) return;
  deferredPrompt.prompt();
  const { outcome } = await deferredPrompt.userChoice;
  if (outcome === 'accepted') {
    console.log('[CymorTune] PWA installed!');
  }
  deferredPrompt = null;
  document.getElementById('pwa-banner').hidden = true;
});

document.getElementById('pwa-dismiss')?.addEventListener('click', () => {
  document.getElementById('pwa-banner').hidden = true;
  localStorage.setItem('cymortune_pwa_dismissed', '1');
});

// App installed event
window.addEventListener('appinstalled', () => {
  console.log('[CymorTune] App installed successfully');
  document.getElementById('pwa-banner').hidden = true;
  deferredPrompt = null;
});

// ── Update toast ──────────────────────────────────────────────────────────────
function showUpdateToast() {
  const toast = document.createElement('div');
  toast.style.cssText = `
    position:fixed;bottom:20px;left:50%;transform:translateX(-50%);
    background:#6d28d9;color:#fff;padding:12px 20px;border-radius:24px;
    font-size:13px;font-weight:600;z-index:9999;box-shadow:0 8px 24px rgba(0,0,0,.4);
    cursor:pointer;white-space:nowrap;
  `;
  toast.textContent = '🔄 New version available — tap to refresh';
  toast.addEventListener('click', () => window.location.reload());
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 8000);
}
