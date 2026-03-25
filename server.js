const express = require('express');
const path = require('path');
const feedsRouter = require('./routes/feeds');
const dataRouter = require('./routes/data');
const eventsRouter = require('./api/events');

// Load .env if present
try {
  require('dotenv').config();
} catch (_) {}

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: '2mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// Routes
app.use('/feed', feedsRouter);
app.use('/data', dataRouter);
app.use('/api', eventsRouter);

// SPA: serve index.html for non-API GET routes (do not return HTML for missing .js/.css — browser would parse HTML as JS → SyntaxError)
app.get('*', (req, res, next) => {
  const ext = path.extname(req.path);
  if (['.js', '.css', '.map', '.json', '.ico', '.png', '.svg', '.woff', '.woff2'].includes(ext)) {
    return res.status(404).type('text/plain').send('Not found');
  }
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`🌐 JMA XML Machine v2 → http://localhost:${PORT}`);
  console.log(`📡 /feed/extra.xml | /feed/eqvol.xml | /feed/other.xml`);
});

module.exports = app;
