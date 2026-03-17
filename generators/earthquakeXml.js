/**
 * Earthquake XML Generator (VXSE53)
 * 震源・震度に関する情報
 *
 * SPEC (jma_worker_handler.md):
 * - Worker routing: Head/Title contains "震源・震度に関する情報"
 * - Earthquake matcher needs prefectures[]:
 *   → Pref/Code: 2-digit JMA prefecture code → converted to system prefecture_id
 *   → Pref/MaxInt: max intensity for the prefecture
 *   → Pref/Area/City/Code: city code for city-level matching
 *   → Pref/Area/City/MaxInt: city max intensity
 * - Source: Body/Intensity/Observation/Pref
 */

function generateEarthquakeXml(data) {
  const now = data.dateTime || new Date().toISOString().replace(/\.\d+Z$/, 'Z');
  const jst = data.reportDateTime || toJST(now);
  const eventId = data.eventId || formatEventId(new Date());

  // Build Intensity/Observation body for earthquake matcher
  const prefectures = data.prefectures || [];
  const intensityXml = buildIntensityXml(prefectures);

  return `<?xml version="1.0" encoding="utf-8" ?>
<Report xmlns="http://xml.kishou.go.jp/jmaxml1/" xmlns:jmx="http://xml.kishou.go.jp/jmaxml1/">
  <Control>
    <Title>震源・震度に関する情報</Title>
    <DateTime>${now}</DateTime>
    <Status>${data.status || '通常'}</Status>
    <EditorialOffice>${esc(data.editorialOffice || '気象庁本庁')}</EditorialOffice>
    <PublishingOffice>${esc(data.publishingOffice || '気象庁')}</PublishingOffice>
  </Control>
  <Head xmlns="http://xml.kishou.go.jp/jmaxml1/informationBasis1/">
    <Title>震源・震度に関する情報</Title>
    <ReportDateTime>${jst}</ReportDateTime>
    <TargetDateTime>${jst}</TargetDateTime>
    <EventID>${eventId}</EventID>
    <InfoType>${data.infoType || '発表'}</InfoType>
    <Serial>${data.serial || 1}</Serial>
    <InfoKind>地震情報</InfoKind>
    <InfoKindVersion>1.0_1</InfoKindVersion>
    <Headline>
      <Text>${esc(data.headlineText || '')}</Text>
      ${prefectures.length ? buildHeadlineIntensity(prefectures) : ''}
    </Headline>
  </Head>
  <Body xmlns="http://xml.kishou.go.jp/jmaxml1/body/seismology1/" xmlns:jmx_eb="http://xml.kishou.go.jp/jmaxml1/elementBasis1/">
    <Earthquake>
      <OriginTime>${data.originTime || jst}</OriginTime>
      <ArrivalTime>${data.originTime || jst}</ArrivalTime>
      <Hypocenter>
        <Area>
          <Name>${esc(data.areaName || '')}</Name>
          <Code type="震央地名">${data.areaCode || ''}</Code>
          <jmx_eb:Coordinate description="${esc(data.coordinateDescription || '')}">${data.coordinate || ''}</jmx_eb:Coordinate>
          ${data.nameFromMark ? `<NameFromMark>${esc(data.nameFromMark)}</NameFromMark>` : ''}
        </Area>
      </Hypocenter>
      <jmx_eb:Magnitude type="${data.magnitudeType || 'Mj'}" description="${esc(data.magnitudeDescription || '')}">${isFinite(data.magnitude) ? data.magnitude : 'NaN'}</jmx_eb:Magnitude>
    </Earthquake>
    ${intensityXml}
    <Comments>
      <ForecastComment codeType="固定付加文">
        <Text>${esc(data.forecastComment || '')}</Text>
        <Code>${data.forecastCode || ''}</Code>
      </ForecastComment>
      ${data.freeFormComment ? `<FreeFormComment>${esc(data.freeFormComment)}</FreeFormComment>` : ''}
    </Comments>
  </Body>
</Report>`;
}

/**
 * Build Body/Intensity/Observation block
 * Pref/Code must be 2-digit JMA prefecture code (e.g. "04" for 宮城県)
 * Pref/MaxInt: e.g. "7", "6+", "6-", "5+", "5-", "4", "3", "2", "1"
 */
function buildIntensityXml(prefectures) {
  if (!prefectures.length) return '';
  const maxAll = prefectures.reduce((m, p) => compareInt(p.maxInt, m) > 0 ? p.maxInt : m, '1');
  return `<Intensity>
      <Observation>
        <CodeDefine>
          <Type xpath="Pref/Code">地震情報／都道府県等</Type>
          <Type xpath="Pref/Area/Code">地震情報／細分区域</Type>
          <Type xpath="Pref/Area/City/Code">気象・地震・火山情報／市町村等</Type>
        </CodeDefine>
        <MaxInt>${maxAll}</MaxInt>
        ${prefectures.map(p => buildPrefXml(p)).join('\n        ')}
      </Observation>
    </Intensity>`;
}

function buildPrefXml(pref) {
  const cities = pref.cities || [];
  const citiesXml = cities.map(c => `<City><Name>${esc(c.name)}</Name><Code>${c.code}</Code><MaxInt>${c.maxInt}</MaxInt></City>`).join('');
  return `<Pref><Name>${esc(pref.name)}</Name><Code>${pref.prefCode}</Code><MaxInt>${pref.maxInt}</MaxInt>
          <Area><Name>${esc(pref.areaName || pref.name)}</Name><Code>${pref.areaCode || ''}</Code><MaxInt>${pref.maxInt}</MaxInt>
            ${citiesXml}
          </Area>
        </Pref>`;
}

/** Head/Headline intensity block (grouped by intensity) */
function buildHeadlineIntensity(prefectures) {
  const byInt = {};
  for (const p of prefectures) {
    if (!byInt[p.maxInt]) byInt[p.maxInt] = [];
    byInt[p.maxInt].push(p);
  }
  return Object.keys(byInt).sort((a,b) => compareInt(b,a)).map(intVal =>
    `<Information type="震源・震度に関する情報（市町村等）">
        <Item>
          <Kind><Name>震度${intVal}</Name></Kind>
          <Areas codeType="気象・地震・火山情報／市町村等">
            ${byInt[intVal].flatMap(p => (p.cities||[]).map(c => `<Area><Name>${esc(c.name)}</Name><Code>${c.code}</Code></Area>`)).join('')}
          </Areas>
        </Item>
      </Information>`
  ).join('\n');
}

const INT_ORDER = ['7','6+','6-','5+','5-','4','3','2','1'];
function compareInt(a, b) {
  return INT_ORDER.indexOf(String(a)) - INT_ORDER.indexOf(String(b));
}

function toJST(isoStr) {
  const d = new Date(isoStr);
  const jst = new Date(d.getTime() + 9 * 3600000);
  return jst.toISOString().replace(/\.\d+Z$/, '+09:00');
}

function formatEventId(d) {
  return d.toISOString().replace(/[-:T.Z]/g, '').slice(0, 14);
}

function esc(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

module.exports = { generateEarthquakeXml, toJST, formatEventId, esc };
