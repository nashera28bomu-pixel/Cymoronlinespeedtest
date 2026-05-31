// ─── server.js ────────────────────────────────────────────────────────────────
import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import path from 'path';
import { fileURLToPath } from 'url';
import searchRouter   from './routes/search.js';
import downloadRouter from './routes/download.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app  = express();
const PORT = process.env.PORT || 3000;

// ─── Middleware ───────────────────────────────────────────────────────────────
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'assets')));

// ─── Rate limiting ────────────────────────────────────────────────────────────
const searchLimit = rateLimit({
  windowMs: 60 * 1000,
  max:      30,
  message:  { error: 'Too many requests. Please slow down.' },
});

const downloadLimit = rateLimit({
  windowMs: 60 * 1000,
  max:      10,
  message:  { error: 'Too many downloads. Please wait a minute.' },
});

// ─── API Routes ───────────────────────────────────────────────────────────────
app.use('/api/search',   searchLimit,   searchRouter);
app.use('/api/download', downloadLimit, downloadRouter);

// ─── Health check ─────────────────────────────────────────────────────────────
app.get('/health', (req, res) => {
  res.json({
    status:  'alive',
    app:     'CymorTune',
    creator: 'Legendary Smiley Cymor',
    uptime:  Math.floor(process.uptime()) + 's',
  });
});

// ─── Serve index.html for all other routes ────────────────────────────────────
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'assets', 'index.html'));
});

// ─── Start ────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log('\n╔══════════════════════════════════════════╗');
  console.log('║   🎵 CYMORTUNE — Music Downloader        ║');
  console.log('║   👑 Legendary Smiley Cymor              ║');
  console.log('║   💡 Idea by Joyce                       ║');
  console.log('║   🌐 Cymor Tech Services                 ║');
  console.log(`║   🚀 Running on port ${String(PORT).padEnd(20)} ║`);
  console.log('╚══════════════════════════════════════════╝\n');
});
