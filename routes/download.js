// ─── routes/download.js ───────────────────────────────────────────────────────
// Replace your existing download route with this file entirely

import express from 'express';
import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const YTDLP     = process.env.YTDLP_PATH || 'yt-dlp';
const BROWSER_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

const router = express.Router();

// POST /api/download  { url, format, quality, filename }
router.post('/', async (req, res) => {
  const { url, format = 'mp3', quality = '128', filename = 'cymortune' } = req.body;
  if (!url?.trim()) return res.status(400).json({ error: 'URL is required' });

  console.log(`[Download] ${format} ${quality} — ${url.slice(0, 80)}`);

  const safeName = (filename || 'cymortune').replace(/[^\w\s-]/g, '').trim() || 'cymortune';

  res.setHeader('Content-Type', format === 'mp3' ? 'audio/mpeg' : 'video/mp4');
  res.setHeader('Content-Disposition', `attachment; filename="${safeName}.${format}"`);

  const args = buildArgs(url, format, quality);
  const proc = spawn(YTDLP, args);

  proc.stdout.pipe(res);
  proc.stderr.on('data', d => {
    const msg = d.toString();
    console.warn('[DL stderr]', msg.slice(0, 150));
  });

  proc.on('close', code => {
    console.log(`[Download] done (code ${code})`);
    try { res.end(); } catch {}
  });

  res.on('close', () => {
    try { proc.kill(); } catch {}
  });
});

// GET /api/download?url=...&format=mp3&quality=128&filename=song
router.get('/', async (req, res) => {
  const { url, format = 'mp3', quality = '128', filename = 'cymortune' } = req.query;
  if (!url?.trim()) return res.status(400).json({ error: 'URL is required' });

  console.log(`[Download] ${format} ${quality} — ${url.slice(0, 80)}`);

  const safeName = (filename || 'cymortune').replace(/[^\w\s-]/g, '').trim() || 'cymortune';

  res.setHeader('Content-Type', format === 'mp3' ? 'audio/mpeg' : 'video/mp4');
  res.setHeader('Content-Disposition', `attachment; filename="${safeName}.${format}"`);

  const args = buildArgs(url, format, quality);
  const proc = spawn(YTDLP, args);

  proc.stdout.pipe(res);
  proc.stderr.on('data', d => console.warn('[DL stderr]', d.toString().slice(0, 150)));
  proc.on('close', code => { try { res.end(); } catch {} });
  res.on('close', () => { try { proc.kill(); } catch {} });
});

function buildArgs(url, format, quality) {
  const args = [
    '--no-warnings',
    '--no-playlist',
    '-o', '-',
    // ── KEY FIX: Android client bypasses "sign in to confirm" bot detection ──
    '--extractor-args', 'youtube:player_client=android,web',
    '--add-header', `User-Agent:${BROWSER_UA}`,
    '--add-header', 'Accept-Language:en-US,en;q=0.9',
    '--no-check-certificates',
  ];

  if (format === 'mp3') {
    args.push(
      '-x',
      '--audio-format', 'mp3',
      '--audio-quality', quality === '320' ? '0' : '5',
    );
  } else {
    const h = ['1080', '720', '480', '360'].includes(quality) ? quality : '720';
    args.push(
      '--format',
      `bestvideo[height<=${h}][ext=mp4]+bestaudio[ext=m4a]/bestvideo[height<=${h}]+bestaudio/best[height<=${h}]/best`,
      '--merge-output-format', 'mp4',
    );
  }

  args.push(url);
  return args;
}

export default router;
