/**
 * Landslide XML Generator (VXWW50)
 * 土砂災害警戒情報
 *
 * SPEC (jma_worker_handler.md):
 * - Parser reads areas[] from Head/Headline/Information[@type="土砂災害警戒情報"]
 *   → warning_code: Kind/Code  (must be "3" for 警戒)
 *   → status: Kind/Status  (NOT Kind/Condition!) — must be "発表" or "継続"
 *   → area code: Areas/Area/Code (city code)
 * - target_area_code: Body/TargetArea/Code (6-digit)
 */
const { toJST, esc } = require('./earthquakeXml');

function generateLandslideXml(data) {
  const now = data.dateTime || new Date().toISOString().replace(/\.\d+Z$/, 'Z');
  const jst = data.reportDateTime || toJST(now);
  const eventId = data.eventId || (data.prefectureName + '土砂災害警戒情報');

  const municipalities = data.municipalities || [];

  // Warned municipalities for headline Information
  // CRITICAL: Kind/Status = "発表" (not Condition), warning_code = "3"
  const warnedAreas = municipalities.filter(m => m.status === '警戒');

  const headlineInfoXml = warnedAreas.length ? `      <Information type="土砂災害警戒情報">
        <Item>
          <Kind>
            <Name>警戒</Name>
            <Code>3</Code>
            <Status>発表</Status>
          </Kind>
          <Areas codeType="気象・地震・火山情報／市町村等">
            ${warnedAreas.map(a => `<Area><Name>${esc(a.name)}</Name><Code>${a.code}</Code></Area>`).join('\n            ')}
          </Areas>
        </Item>
      </Information>` : '';

  // All municipalities in body Warning — use Status element (not Condition)
  const bodyItemsXml = municipalities.map(m => {
    const isWarned = m.status === '警戒';
    return `      <Item>
        <Kind>
          <Name>${isWarned ? '警戒' : 'なし'}</Name>
          <Code>${isWarned ? '3' : '0'}</Code>
          <Status>${isWarned ? '発表' : 'なし'}</Status>
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
