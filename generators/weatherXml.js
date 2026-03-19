/**
 * Weather XML Generator (VPWW53 / VPWW54)
 * 気象特別警報・警報・注意報
 *
 * SPEC (jma_worker_handler.md):
 * - Atom entry title must contain "気象特別警報・警報・注意報"
 * - Parser reads from Head/Headline/Information[@type]:
 *   → info_type: attribute type (e.g. "気象警報・注意報（府県予報区等）")
 *   → warning_code: Kind/Code
 *   → warning_name: Kind/Name
 *   → status: Kind/Status  ← CRITICAL (NOT Condition!)
 *   → area_code: Areas/Area/Code
 * - Matcher: status in ['発表', '継続', '特別警報から警報'] to be considered active
 *
 * Control/Title must be "気象特別警報・警報・注意報" (legacy) or "気象警報・注意報（Ｈ２７）" (H27 format)
 * Head/Title must contain "気象特別警報・警報・注意報" for Atom title routing
 */
const { toJST, formatEventId, esc } = require('./earthquakeXml');

// Warning kind code → name + isSpecial
const WARNING_KIND_DEFS = {
  '33': { name: '大雨特別警報', isSpecial: true },
  '31': { name: '暴風特別警報', isSpecial: true },
  '03': { name: '大雨警報', isSpecial: false },
  '04': { name: '洪水警報', isSpecial: false },
  '02': { name: '強風警報', isSpecial: false },
  '21': { name: '大雪警報', isSpecial: false },
  '10': { name: '大雨注意報', isSpecial: false },
  '14': { name: '雷注意報', isSpecial: false },
  '15': { name: '強風注意報', isSpecial: false },
  '16': { name: '波浪注意報', isSpecial: false },
  '17': { name: '高潮警報', isSpecial: false },
  '18': { name: '洪水注意報', isSpecial: false },
};

function generateWeatherXml(data) {
  const now = data.dateTime || new Date().toISOString().replace(/\.\d+Z$/, 'Z');
  const jst = data.reportDateTime || toJST(now);
  const isH27 = (data.format || 'VPWW53') === 'VPWW54';
  const controlTitle = isH27 ? '気象警報・注意報（Ｈ２７）' : '気象特別警報・警報・注意報';
  const infoKindVersion = isH27 ? '1.2_2' : '1.1_0';

  const warningItems = data.warningItems || [];
  const municipalityItems = data.municipalityItems || [];

  // HEAD TITLE — must contain "気象特別警報・警報・注意報" for poller + worker routing
  const headTitle = `${esc(data.prefectureName || '')}気象特別警報・警報・注意報`;

  // Prefecture-level Headline/Information block
  // CRITICAL: each Kind needs Status="発表" for matcher to detect
  const prefHeadlineXml = buildPrefectureHeadlineInfo(warningItems, data);

  // City-level Headline/Information block (市町村等)
  const cityHeadlineXml = buildCityHeadlineInfo(municipalityItems);

  // Body Warning — prefecture level (府県予報区等)
  const bodyPrefXml = buildBodyPrefectureWarning(warningItems, data);

  // Body Warning — municipality level (市町村等)
  const bodyItemsXml = municipalityItems.map(m => buildBodyItem(m)).join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<Report xmlns="http://xml.kishou.go.jp/jmaxml1/" xmlns:jmx="http://xml.kishou.go.jp/jmaxml1/" xmlns:jmx_add="http://xml.kishou.go.jp/jmaxml1/addition1/">
<Control>
<Title>${controlTitle}</Title>
<DateTime>${now}</DateTime>
<Status>通常</Status>
<EditorialOffice>${esc(data.editorialOffice || '気象庁')}</EditorialOffice>
<PublishingOffice>${esc(data.publishingOffice || '気象庁')}</PublishingOffice>
</Control>
<Head xmlns="http://xml.kishou.go.jp/jmaxml1/informationBasis1/">
<Title>${headTitle}</Title>
<ReportDateTime>${jst}</ReportDateTime>
<TargetDateTime>${jst}</TargetDateTime>
<EventID/>
<InfoType>${data.infoType || '発表'}</InfoType>
<Serial/>
<InfoKind>気象警報・注意報</InfoKind>
<InfoKindVersion>${infoKindVersion}</InfoKindVersion>
<Headline>
<Text>${esc(data.headlineText || '')}</Text>
${prefHeadlineXml}
${cityHeadlineXml}
</Headline>
</Head>
<Body xmlns="http://xml.kishou.go.jp/jmaxml1/body/meteorology1/">
${bodyPrefXml}
<Warning type="気象警報・注意報（市町村等）">
${bodyItemsXml}
</Warning>
</Body>
</Report>`;
}

/**
 * Build Head/Headline/Information for prefecture-level warnings
 * Type: "気象警報・注意報（府県予報区等）"
 * CRITICAL: each Kind MUST have Status="発表" (or "継続") for matcher
 */
function buildPrefectureHeadlineInfo(warningItems, data) {
  if (!warningItems.length) return '';

  // Flatten all kinds across items for the prefecture info block
  const allKinds = [];
  for (const item of warningItems) {
    for (const k of (item.kinds || [])) {
      allKinds.push({
        name: k.name || (WARNING_KIND_DEFS[k.code]?.name) || k.code,
        code: k.code,
        condition: k.condition || '',
        status: data.infoType === '取消' ? '解除' : '発表',
      });
    }
  }

  if (!allKinds.length) return '';

  return `<Information type="気象警報・注意報（府県予報区等）">
<Item>
${allKinds.map(k => `<Kind>
<Name>${esc(k.name)}</Name>
<Code>${k.code}</Code>
${k.condition ? `<Condition>${esc(k.condition)}</Condition>` : ''}
<Status>${k.status}</Status>
</Kind>`).join('\n')}
<Areas codeType="気象情報／府県予報区・細分区域等">
<Area>
<Name>${esc(warningItems[0]?.areaName || '')}</Name>
<Code>${warningItems[0]?.areaCode || ''}</Code>
</Area>
</Areas>
</Item>
</Information>`;
}

/**
 * Build Head/Headline/Information for city-level warnings
 * Type: "気象警報・注意報（市町村等）"
 * CRITICAL: each Kind MUST have Status="発表" for matcher
 */
function buildCityHeadlineInfo(municipalityItems) {
  if (!municipalityItems.length) return '';

  // Group areas by kind code combination
  const kindMap = {};
  for (const m of municipalityItems) {
    const kinds = m.kinds || [];
    const key = kinds.map(k => k.code).sort().join(',');
    if (!kindMap[key]) kindMap[key] = { kinds, areas: [] };
    kindMap[key].areas.push({ name: m.areaName, code: m.areaCode });
  }

  return `<Information type="気象警報・注意報（市町村等）">
${Object.values(kindMap).map(g => `<Item>
${g.kinds.map(k => `<Kind>
<Name>${esc(k.name || WARNING_KIND_DEFS[k.code]?.name || k.code)}</Name>
<Code>${k.code}</Code>
<Status>発表</Status>
</Kind>`).join('\n')}
<Areas codeType="気象・地震・火山情報／市町村等">
${g.areas.map(a => `<Area><Name>${esc(a.name)}</Name><Code>${a.code}</Code></Area>`).join('\n')}
</Areas>
</Item>`).join('\n')}
</Information>`;
}

/**
 * Build Body Warning block for prefecture level
 * Type: "気象警報・注意報（府県予報区等）"
 * Structure: Kind(s) with Status → Area directly (no Areas wrapper)
 */
function buildBodyPrefectureWarning(warningItems, data) {
  if (!warningItems.length) return '';

  // Flatten all kinds from warningItems
  const allKinds = [];
  for (const item of warningItems) {
    for (const k of (item.kinds || [])) {
      allKinds.push({
        name: k.name || (WARNING_KIND_DEFS[k.code]?.name) || k.code,
        code: k.code,
        condition: k.condition || '',
        status: k.status || '発表',
      });
    }
  }

  if (!allKinds.length) return '';

  return `<Warning type="気象警報・注意報（府県予報区等）">
<Item>
${allKinds.map(k => `<Kind>
<Name>${esc(k.name)}</Name>
<Code>${k.code}</Code>
<Status>${k.status}</Status>
${k.condition ? `<Condition>${esc(k.condition)}</Condition>` : ''}
</Kind>`).join('\n')}
<Area>
<Name>${esc(data.prefectureName || '')}</Name>
<Code>${data.prefectureCode || ''}</Code>
</Area>
</Item>
</Warning>`;
}
function buildBodyItem(m) {
  const kinds = m.kinds || [];
  return `<Item>
${kinds.map(k => `<Kind>
<Name>${esc(k.name || WARNING_KIND_DEFS[k.code]?.name || k.code)}</Name>
<Code>${k.code}</Code>
<Status>${k.status || '発表'}</Status>
</Kind>`).join('\n')}
<Area>
<Name>${esc(m.areaName)}</Name>
<Code>${m.areaCode}</Code>
</Area>
</Item>`;
}

module.exports = { generateWeatherXml, WARNING_KIND_DEFS };
