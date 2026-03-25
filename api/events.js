const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const { generateEarthquakeXml, formatEventId, toJST } = require('../generators/earthquakeXml');
const { generateTsunamiXml } = require('../generators/tsunamiXml');
const { generateWeatherXml } = require('../generators/weatherXml');
const { generateLandslideXml } = require('../generators/landslideXml');
const { generateVolcanoXml } = require('../generators/volcanoXml');

const EVENTS_DIR = path.join(__dirname, '..', 'events');
const CATEGORIES = ['earthquake', 'tsunami', 'weather', 'landslide', 'volcano'];

// -- Filename logic (mirrors JMA format) --
// {YYYYMMDDHHMMSS}_0_{TYPE_CODE}_{AREA_CODE}.xml
const TYPE_CODES = {
  earthquake: 'VXSE53', tsunami: 'VTSE41',
  weather: 'VPWW53', landslide: 'VXWW50', volcano: 'VFVO50'
};

function makeFilename(type, areaCode) {
  const now = new Date();
  const ts = now.toISOString().replace(/[-:.TZ]/g, '').slice(0, 14);
  const code = TYPE_CODES[type] || 'UNKNOWN';
  const area = String(areaCode || '000000').padStart(6, '0');
  return `${ts}_0_${code}_${area}.xml`;
}

// GET /api/events — list all events
router.get('/events', (req, res) => {
  const result = {};
  for (const cat of CATEGORIES) {
    const dir = path.join(EVENTS_DIR, cat);
    if (!fs.existsSync(dir)) { result[cat] = []; continue; }
    const files = fs.readdirSync(dir).filter(f => f.endsWith('.xml')).sort().reverse();
    result[cat] = files.map(filename => {
      const filePath = path.join(dir, filename);
      const stat = fs.statSync(filePath);
      let meta = { filename, category: cat, createdAt: stat.mtime.toISOString() };
      try {
        const content = fs.readFileSync(filePath, 'utf-8');
        const titleMatch = content.match(/<Head[^>]*>[\s\S]*?<Title>([\s\S]*?)<\/Title>/);
        const dtMatch = content.match(/<ReportDateTime>([\s\S]*?)<\/ReportDateTime>/);
        const infoTypeMatch = content.match(/<InfoType>([\s\S]*?)<\/InfoType>/);
        const ctrlTitleMatch = content.match(/<Control>[\s\S]*?<Title>([\s\S]*?)<\/Title>/);
        if (titleMatch) meta.title = titleMatch[1].trim();
        if (dtMatch) meta.reportDateTime = dtMatch[1].trim();
        if (infoTypeMatch) meta.infoType = infoTypeMatch[1].trim();
        if (ctrlTitleMatch) meta.controlTitle = ctrlTitleMatch[1].trim();
      } catch (_) {}
      return meta;
    });
  }
  res.json(result);
});

// GET /api/events/:type/:filename/meta — form payload saved at create time (for Duplicate)
router.get('/events/:type/:filename/meta', (req, res) => {
  const { type, filename } = req.params;
  if (!CATEGORIES.includes(type)) return res.status(400).json({ error: 'Invalid type' });
  if (!filename.endsWith('.xml') || filename.includes('/') || filename.includes('..')) {
    return res.status(400).json({ error: 'Invalid filename' });
  }
  const metaPath = path.join(EVENTS_DIR, type, filename.replace(/\.xml$/i, '.meta.json'));
  if (!fs.existsSync(metaPath)) {
    return res.status(404).json({ error: 'No saved form data for this file (only events created after duplicate support)' });
  }
  try {
    const raw = fs.readFileSync(metaPath, 'utf-8');
    res.json(JSON.parse(raw));
  } catch (e) {
    res.status(500).json({ error: 'Failed to read metadata' });
  }
});

// POST /api/events — create new event (generate XML and save)
router.post('/events', (req, res) => {
  const { type, data } = req.body;
  if (!CATEGORIES.includes(type)) {
    return res.status(400).json({ error: 'Invalid event type' });
  }
  try {
    const xmlContent = generateXml(type, data);
    const areaCode = extractAreaCode(type, data);
    const filename = makeFilename(type, areaCode);
    const filePath = path.join(EVENTS_DIR, type, filename);
    fs.writeFileSync(filePath, xmlContent, 'utf-8');
    const metaPath = filePath.replace(/\.xml$/i, '.meta.json');
    try {
      fs.writeFileSync(metaPath, JSON.stringify({ type, data }, null, 2), 'utf-8');
    } catch (e) {
      console.error('Failed to write meta:', e);
    }
    res.json({ success: true, filename, path: `/data/${type}/${filename}` });
  } catch (err) {
    console.error('Generate XML error:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/events/preview — preview XML without saving
router.post('/events/preview', (req, res) => {
  const { type, data } = req.body;
  if (!CATEGORIES.includes(type)) {
    return res.status(400).json({ error: 'Invalid event type' });
  }
  try {
    const xmlContent = generateXml(type, data);
    res.set('Content-Type', 'application/json');
    res.json({ xml: xmlContent });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/events/:type/:filename
router.delete('/events/:type/:filename', (req, res) => {
  const { type, filename } = req.params;
  if (!CATEGORIES.includes(type)) return res.status(400).json({ error: 'Invalid type' });
  if (!filename.endsWith('.xml') || filename.includes('/') || filename.includes('..')) {
    return res.status(400).json({ error: 'Invalid filename' });
  }
  const filePath = path.join(EVENTS_DIR, type, filename);
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'File not found' });
  fs.unlinkSync(filePath);
  const metaPath = filePath.replace(/\.xml$/i, '.meta.json');
  if (fs.existsSync(metaPath)) {
    try { fs.unlinkSync(metaPath); } catch (_) {}
  }
  res.json({ success: true });
});

// DELETE /api/events — delete ALL generated XML files
router.delete('/events', (req, res) => {
  let count = 0;
  for (const cat of CATEGORIES) {
    const dir = path.join(EVENTS_DIR, cat);
    if (!fs.existsSync(dir)) continue;
    const files = fs.readdirSync(dir).filter(f => f.endsWith('.xml'));
    for (const f of files) {
      if (!f.endsWith('.xml')) continue;
      fs.unlinkSync(path.join(dir, f));
      const meta = f.replace(/\.xml$/i, '.meta.json');
      const mp = path.join(dir, meta);
      if (fs.existsSync(mp)) {
        try { fs.unlinkSync(mp); } catch (_) {}
      }
      count++;
    }
  }
  res.json({ success: true, deleted: count });
});

function generateXml(type, data) {
  switch (type) {
    case 'earthquake': return generateEarthquakeXml(data);
    case 'tsunami': return generateTsunamiXml(data);
    case 'weather': return generateWeatherXml(data);
    case 'landslide': return generateLandslideXml(data);
    case 'volcano': return generateVolcanoXml(data);
    default: throw new Error(`Unknown type: ${type}`);
  }
}

function extractAreaCode(type, data) {
  switch (type) {
    case 'earthquake': return data.areaCode || '270000';
    case 'tsunami': return '000000';
    case 'weather': return data.prefectureCode || '290000';
    case 'landslide': return data.prefectureCode || '330000';
    case 'volcano': return data.volcanoCode || '010000';
    default: return '000000';
  }
}

module.exports = router;
