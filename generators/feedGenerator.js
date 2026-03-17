/**
 * Build an Atom XML feed string for JMA-compatible feeds
 */
function buildFeed({ title, selfUrl, entries }) {
  const now = toJSTString(new Date());
  const idHash = Date.now();

  const entryXml = entries.map(entry => `  <entry>
    <title>${escapeXml(entry.title)}</title>
    <id>${escapeXml(entry.id)}</id>
    <updated>${entry.updated}</updated>
    <author>
      <name>${escapeXml(entry.author)}</name>
    </author>
    <link type="application/xml" href="${escapeXml(entry.linkHref)}"/>
    <content type="text">${escapeXml(entry.content)}</content>
  </entry>`).join('\n');

  return `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom" lang="ja">
  <title>${escapeXml(title)}</title>
  <subtitle>JMAXML publishing feed (mock)</subtitle>
  <updated>${now}</updated>
  <id>${escapeXml(selfUrl)}#mock_${idHash}</id>
  <link rel="related" href="https://www.jma.go.jp/"/>
  <link rel="self" href="${escapeXml(selfUrl)}"/>
  <rights type="html"><![CDATA[
<a href="https://www.jma.go.jp/jma/kishou/info/coment.html">利用規約</a>
]]></rights>
${entryXml}
</feed>`;
}

function toJSTString(date) {
  // Format: 2026-03-17T22:05:52+09:00
  const jst = new Date(date.getTime() + 9 * 60 * 60 * 1000);
  return jst.toISOString().replace('Z', '+09:00').replace(/\.\d+\+/, '+');
}

function escapeXml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

module.exports = { buildFeed, toJSTString, escapeXml };
