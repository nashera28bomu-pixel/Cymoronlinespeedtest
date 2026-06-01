// ─── routes/search.js ─────────────────────────────────────────────────────────
import express from 'express';
import { searchYoutube, getMediaInfo, detectPlatform } from '../utils/ytdlp.js';

const router = express.Router();

// GET /api/search?q=query
router.get('/', async (req, res) => {
  const { q, limit = 12 } = req.query;
  if (!q?.trim()) return res.status(400).json({ error: 'Query is required' });

  try {
    const results = await searchYoutube(q.trim(), Math.min(parseInt(limit), 20));
    res.json({ success: true, results, query: q });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/info?url=...
router.get('/info', async (req, res) => {
  const { url } = req.query;
  if (!url?.trim()) return res.status(400).json({ error: 'URL is required' });

  try {
    const info = await getMediaInfo(url.trim());
    res.json({ success: true, info });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
