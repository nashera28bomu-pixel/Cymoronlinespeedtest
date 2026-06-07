// ─── server.js ────────────────────────────────────────────────────────────────
import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import path from 'path';
import { fileURLToPath } from 'url';
import searchRouter from './routes/search.js';
import downloadRouter from './routes/download.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3000;

// ─── Middleware ───────────────────────────────────────────────────────────────
app.set('trust proxy', 1);
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'assets')));

// ─── Rate limiting ────────────────────────────────────────────────────────────
const searchLimit = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  message: { error: 'Search limit reached. Slow down.' },
});

const downloadLimit = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  message: { error: 'Download limit reached. Please wait a minute.' },
});

// ─── API Routes ───────────────────────────────────────────────────────────────
app.use('/api/search', searchLimit, searchRouter);
app.use('/api/download', downloadLimit, downloadRouter);

// ─── Health check ─────────────────────────────────────────────────────────────
app.get('/health', (req, res) => {
  res.json({
    status: 'alive',
    app: 'CymorTune',
    memoryUsage: process.memoryUsage().heapUsed / 1024 / 1024 + ' MB',
    uptime: Math.floor(process.uptime()) + 's',
  });
});

// ─── Serve index.html ─────────────────────────────────────────────────────────
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'assets', 'index.html'));
});

// ─── Global Error Handler ─────────────────────────────────────────────────────
// Prevents the server from crashing on unhandled promise rejections
app.use((err, req, res, next) => {
  console.error('[Global Error]', err.stack);
  res.status(500).json({ error: 'Something went wrong on the server.' });
});

// ─── Start ────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`[CymorTune] Server started on port ${PORT}`);
  console.log(`[System] FFmpeg detected: ${process.env.YTDLP_PATH ? 'Yes' : 'Check config'}`);
});
