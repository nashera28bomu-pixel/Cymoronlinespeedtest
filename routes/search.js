// ─── routes/search.js ─────────────────────────────────────────────────────────
import express from 'express';
import { searchYoutube, getMediaInfo } from '../utils/ytdlp.js';

const router = express.Router();

// GET /api/search?q=query&limit=12
router.get('/', async (req, res) => {
  const { q, limit = 12 } = req.query;
  if (!q?.trim()) return res.status(400).json({ error: 'Query is required' });

  try {
    console.log(`[Search] "${q}"`);
    const results = await searchYoutube(q.trim(), Math.min(parseInt(limit) || 12, 20));
    console.log(`[Search] Found ${results.length} results for "${q}"`);
    res.json({ success: true, results, query: q });
  } catch (err) {
    console.error(`[Search error] ${err.message}`);
    // Return user-friendly error, not raw yt-dlp message
    res.status(500).json({
      success: false,
      error: 'Search temporarily unavailable. Please try again.',
      detail: err.message,
    });
  }
});

// GET /api/search/info?url=...
router.get('/info', async (req, res) => {
  const { url } = req.query;
  if (!url?.trim()) return res.status(400).json({ error: 'URL is required' });

  try {
    console.log(`[Info] ${url.slice(0, 80)}`);
    const info = await getMediaInfo(url.trim());
    res.json({ success: true, info });
  } catch (err) {
    console.error(`[Info error] ${err.message}`);
    res.status(500).json({
      success: false,
      error: 'Could not fetch media info. Check the URL and try again.',
      detail: err.message,
    });
  }
});

export default router;
