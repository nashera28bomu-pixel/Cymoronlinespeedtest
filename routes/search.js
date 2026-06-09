// ─── routes/search.js ────────────────────────────────────────────────────────
import express from 'express';
import { searchTracks } from '../utils/ytdlp.js';

const router = express.Router();

// GET /api/search?q=rema+calm+down&mode=music&limit=12
// mode: 'music' (default) → SoundCloud first  |  'video' → YouTube first
router.get('/', async (req, res) => {
  const { q, query, mode = 'music', limit = '12' } = req.query;
  const searchQuery = (q || query || '').trim();

  if (!searchQuery) {
    return res.status(400).json({ error: 'Query parameter ?q= is required' });
  }

  const parsedLimit = Math.min(Math.max(parseInt(limit) || 12, 1), 20);

  try {
    const results = await searchTracks(searchQuery, parsedLimit, mode);
    return res.json({
      success: true,
      query: searchQuery,
      mode,
      source: results[0]?.platform || 'unknown',
      count: results.length,
      results,
    });
  } catch (err) {
    console.error('[Search route] Error:', err.message);
    return res.status(500).json({
      success: false,
      error: 'Search failed. Please try again.',
      details: err.message,
    });
  }
});

export default router;
