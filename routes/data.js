const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');

const EVENTS_DIR = path.join(__dirname, '..', 'events');
const CATEGORIES = ['earthquake', 'tsunami', 'weather', 'landslide', 'volcano'];

// GET /data/:category/:filename
router.get('/:category/:filename', (req, res) => {
  const { category, filename } = req.params;
  if (!CATEGORIES.includes(category)) {
    return res.status(404).set('Content-Type', 'application/xml').send(
      '<?xml version="1.0"?><error>Invalid category</error>'
    );
  }
  if (!filename.endsWith('.xml') || filename.includes('/') || filename.includes('..')) {
    return res.status(400).set('Content-Type', 'application/xml').send(
      '<?xml version="1.0"?><error>Invalid filename</error>'
    );
  }
  const filePath = path.join(EVENTS_DIR, category, filename);
  if (!fs.existsSync(filePath)) {
    return res.status(404).set('Content-Type', 'application/xml').send(
      `<?xml version="1.0"?><error>File not found: ${filename}</error>`
    );
  }
  res.set('Content-Type', 'application/xml; charset=utf-8');
  res.sendFile(filePath);
});

module.exports = router;
