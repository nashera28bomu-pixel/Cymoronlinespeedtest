// ─── routes/download.js ───────────────────────────────────────────────────────
import express from 'express';
import { streamDownload, detectPlatform } from '../utils/ytdlp.js';

const router = express.Router();

// Active downloads counter (prevent abuse)
let activeDownloads = 0;
const MAX_CONCURRENT = 5;

// GET /api/download?url=...&format=mp3&quality=320&title=...
router.get('/', async (req, res) => {
  const { url, format = 'mp3', quality = '320', title = 'cymortune_download' } = req.query;

  if (!url?.trim()) return res.status(400).json({ error: 'URL is required' });

  const validFormats   = ['mp3', 'mp4'];
  const validQualities = ['128', '320', '360', '480', '720', '1080'];

  if (!validFormats.includes(format))   return res.status(400).json({ error: 'Invalid format' });
  if (!validQualities.includes(quality)) return res.status(400).json({ error: 'Invalid quality' });

  if (activeDownloads >= MAX_CONCURRENT) {
    return res.status(429).json({ error: 'Server busy. Please try again in a moment.' });
  }

  activeDownloads++;

  try {
    streamDownload(url.trim(), format, quality, res, title);

    res.on('finish', () => { activeDownloads = Math.max(0, activeDownloads - 1); });
    res.on('close',  () => { activeDownloads = Math.max(0, activeDownloads - 1); });

  } catch (err) {
    activeDownloads = Math.max(0, activeDownloads - 1);
    if (!res.headersSent) {
      res.status(500).json({ error: err.message });
    }
  }
});

export default router;
