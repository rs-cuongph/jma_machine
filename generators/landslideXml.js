/**
 * Landslide XML Generator (VXWW50)
 * 土砂災害警戒情報
 *
 * SPEC (jma_worker_handler.md):
 * - Parser reads areas[] from Head/Headline/Information[@type="土砂災害警戒情報"]
 *   → warning_code: Kind/Code  ("3"=警戒, "1"=解除)
 *   → status: Kind/Condition ("発表" | "継続" | "解除")
 *   → area code: Areas/Area/Code (city code)
 * - target_area_code: Body/TargetArea/Code (6-digit)
 */
const { toJST, esc } = require('./earthquakeXml');

const KIND_MAP = {
  '警戒': { code: '3' },
  '解除': { code: '1' },
  'なし': { code: '0' },
};

const STATUS_VALUES = new Set(['発表', '継続', '解除', 'なし']);

function normalizeMunicipality(m) {
  const kind = (m.warningKind || (m.status === '解除' ? '解除' : (m.status === 'なし' ? 'なし' : '警戒')));
  const status = STATUS_VALUES.has(m.status) ? m.status : 'なし';
  return {
    name: m.name || '',
    code: m.code || '',
    warningKind: KIND_MAP[kind] ? kind : 'なし',
    status,
  };
}

function generateLandslideXml(data) {
  const now = data.dateTime || new Date().toISOString().replace(/\.\d+Z$/, 'Z');
  const jst = data.reportDateTime || toJST(now);
  const eventId = data.eventId || (data.prefectureName + '土砂災害警戒情報');

  const municipalities = (data.municipalities || []).map(normalizeMunicipality);

  // Headline groups by warning kind + condition, excluding "なし"
  const headlineGroups = new Map();
  for (const m of municipalities) {
    if (m.warningKind === 'なし' || m.status === 'なし') continue;
    const key = `${m.warningKind}|${m.status}`;
    if (!headlineGroups.has(key)) headlineGroups.set(key, []);
    headlineGroups.get(key).push(m);
  }

  const headlineItemsXml = [...headlineGroups.entries()].map(([key, areas]) => {
    const [kind, condition] = key.split('|');
    const code = KIND_MAP[kind].code;
    return `        <Item>
          <Kind>
            <Name>${kind}</Name>
            <Code>${code}</Code>
            <Condition>${condition}</Condition>
          </Kind>
          <Areas codeType="気象・地震・火山情報／市町村等">
            ${areas.map(a => `<Area><Name>${esc(a.name)}</Name><Code>${a.code}</Code></Area>`).join('\n            ')}
          </Areas>
        </Item>`;
  }).join('\n');

  const headlineInfoXml = headlineItemsXml ? `      <Information type="土砂災害警戒情報">
${headlineItemsXml}
      </Information>` : '';

  // Body uses Status with all supported values.
  const bodyItemsXml = municipalities.map(m => {
    const kindInfo = KIND_MAP[m.warningKind] || KIND_MAP['なし'];
    return `      <Item>
        <Kind>
          <Name>${m.warningKind}</Name>
          <Code>${kindInfo.code}</Code>
          <Status>${m.status}</Status>
        </Kind>
        <Area>
          <Name>${esc(m.name)}</Name>
          <Code>${m.code}</Code>
        </Area>
      </Item>`;
  }).join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<Report xmlns="http://xml.kishou.go.jp/jmaxml1/" xmlns:jmx="http://xml.kishou.go.jp/jmaxml1/">
  <Control>
    <Title>土砂災害警戒情報</Title>
    <DateTime>${now}</DateTime>
    <Status>通常</Status>
    <EditorialOffice>${esc(data.editorialOffice || '気象庁')}</EditorialOffice>
    <PublishingOffice>${esc(data.publishingOffice || data.editorialOffice || '気象庁')}</PublishingOffice>
  </Control>
  <Head xmlns="http://xml.kishou.go.jp/jmaxml1/informationBasis1/">
    <Title>土砂災害警戒情報</Title>
    <ReportDateTime>${jst}</ReportDateTime>
    <TargetDateTime>${jst}</TargetDateTime>
    <EventID>${esc(eventId)}</EventID>
    <InfoType>${data.infoType || '発表'}</InfoType>
    <Serial>${data.serial || 1}</Serial>
    <InfoKind>土砂災害警戒情報</InfoKind>
    <InfoKindVersion>1.0_0</InfoKindVersion>
    <Headline>
      <Text>${esc(data.headlineText || '')}</Text>
${headlineInfoXml}
    </Headline>
  </Head>
  <Body xmlns="http://xml.kishou.go.jp/jmaxml1/body/meteorology1/">
    <TargetArea>
      <Name>${esc(data.prefectureName || '')}</Name>
      <Code>${data.prefectureCode || ''}</Code>
    </TargetArea>
    <Warning type="土砂災害警戒情報">
${bodyItemsXml}
    </Warning>
    <OfficeInfo>
      <Office type="都道府県">
        <Name>${esc(data.prefectureName || '')}</Name>
        <ContactInfo>${esc(data.prefectureContact || '')}</ContactInfo>
      </Office>
      <Office type="気象庁">
        <Name>${esc(data.editorialOffice || '気象庁')}</Name>
        <ContactInfo>${esc(data.jmaContact || '')}</ContactInfo>
      </Office>
    </OfficeInfo>
  </Body>
</Report>`;
}

module.exports = { generateLandslideXml };
