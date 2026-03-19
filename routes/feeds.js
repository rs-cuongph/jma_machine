const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const { buildFeed } = require('../generators/feedGenerator');

const EVENTS_DIR = path.join(__dirname, '..', 'events');

// Helper: scan a category dir and build feed entries
function getEntriesForCategories(categories, baseUrl) {
  const entries = [];
  for (const cat of categories) {
    const dir = path.join(EVENTS_DIR, cat);
    if (!fs.existsSync(dir)) continue;
    const files = fs.readdirSync(dir).filter(f => f.endsWith('.xml')).sort().reverse();
    for (const filename of files) {
      const filePath = path.join(dir, filename);
      let title = cat, updated = new Date().toISOString(), author = '気象庁', content = '';
      try {
        const xml = fs.readFileSync(filePath, 'utf-8');
        const headTitle = xml.match(/<Head[^>]*>[\s\S]*?<Title>([\s\S]*?)<\/Title>/)?.[1]?.trim();
        const ctrlTitle = xml.match(/<Control>[\s\S]*?<Title>([\s\S]*?)<\/Title>/)?.[1]?.trim();
        const dt = xml.match(/<DateTime>([\s\S]*?)<\/DateTime>/)?.[1]?.trim();
        const headline = xml.match(/<Headline>[\s\S]*?<Text>([\s\S]*?)<\/Text>/)?.[1]?.trim();
        if (headTitle) title = headTitle;
        else if (ctrlTitle) title = ctrlTitle;
        if (dt) updated = dt;
        if (headline) content = headline.replace(/\n/g, '');
      } catch (_) {}

      const dataUrl = `${baseUrl}/data/${cat}/${filename}`;
      entries.push({ title, id: dataUrl, updated, author, linkHref: dataUrl, content });
    }
  }
  return entries;
}

// GET /feed/extra.xml → weather + landslide
router.get('/extra.xml', (req, res) => {
  const baseUrl = process.env.PUBLIC_BASE_URL || `${req.protocol}://${req.headers.host}`;
  const entries = getEntriesForCategories(['weather', 'landslide'], baseUrl);
  const xml = buildFeed({ title: '高頻度（随時）', selfUrl: `${baseUrl}/feed/extra.xml`, entries });
  res.set('Content-Type', 'application/xml; charset=utf-8').send(xml);
});

// GET /feed/eqvol.xml → earthquake + volcano
router.get('/eqvol.xml', (req, res) => {
  const baseUrl = process.env.PUBLIC_BASE_URL || `${req.protocol}://${req.headers.host}`;
  const entries = getEntriesForCategories(['earthquake', 'volcano'], baseUrl);
  const xml = buildFeed({ title: '高頻度（地震火山）', selfUrl: `${baseUrl}/feed/eqvol.xml`, entries });
  res.set('Content-Type', 'application/xml; charset=utf-8').send(xml);
});

// GET /feed/other.xml → tsunami
router.get('/other.xml', (req, res) => {
  const baseUrl = process.env.PUBLIC_BASE_URL || `${req.protocol}://${req.headers.host}`;
  const entries = getEntriesForCategories(['tsunami'], baseUrl);
  const xml = buildFeed({ title: '随時（その他）', selfUrl: `${baseUrl}/feed/other.xml`, entries });
  res.set('Content-Type', 'application/xml; charset=utf-8').send(xml);
});

module.exports = router;
