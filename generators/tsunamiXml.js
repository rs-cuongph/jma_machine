/**
 * Tsunami XML Generator (VTSE41)
 * 津波警報・注意報・予報
 *
 * SPEC (jma_worker_handler.md):
 * - Parser reads from Body/Tsunami/Forecast/Item
 *   → area_code: Item/Area/Code  (3-digit coastal zone string like "210")
 *   → warning_code: Item/Category/Kind/Code  (prefer current, fallback LastKind)
 *     Valid codes: 53=大津波警報, 51=津波警報, 62=津波注意報, 71=津波予報
 *   → warning_name: Item/Category/Kind/Name
 * - Atom entry title must contain "津波警報・注意報・予報"
 * - Head/Title must contain "津波警報・注意報・予報" for worker routing
 */
const { toJST, formatEventId, esc } = require('./earthquakeXml');

// Tsunami warning kind definitions
const TSUNAMI_KIND_MAP = {
  '53': { name: '大津波警報', lastName: '津波なし', lastCode: '00' },
  '51': { name: '津波警報', lastName: '津波なし', lastCode: '00' },
  '62': { name: '津波注意報', lastName: '津波なし', lastCode: '00' },
  '71': { name: '津波予報（若干の海面変動）', lastName: '津波なし', lastCode: '00' },
  '00': { name: '津波なし', lastName: '津波なし', lastCode: '00' },
};

function generateTsunamiXml(data) {
  const now = data.dateTime || new Date().toISOString().replace(/\.\d+Z$/, 'Z');
  const jst = data.reportDateTime || toJST(now);
  const eventId = data.eventId || formatEventId(new Date());

  const warningAreas = data.warningAreas || [];

  // Build Headline Information — grouped by kind code
  const kindGroups = {};
  for (const a of warningAreas) {
    if (!kindGroups[a.kindCode]) {
      const kdef = TSUNAMI_KIND_MAP[a.kindCode] || { name: a.kindName || a.kindCode };
      kindGroups[a.kindCode] = { name: kdef.name, code: a.kindCode, areas: [] };
    }
    kindGroups[a.kindCode].areas.push({ name: a.areaName, code: a.areaCode });
  }

  const headlineInfoXml = Object.values(kindGroups).map(kg => `      <Item>
        <Kind><Name>${esc(kg.name)}</Name><Code>${kg.code}</Code></Kind>
        <Areas codeType="津波予報区">
          ${kg.areas.map(a => `<Area><Name>${esc(a.name)}</Name><Code>${a.code}</Code></Area>`).join('\n          ')}
        </Areas>
      </Item>`).join('\n');

  // Build Body/Tsunami/Forecast/Item — CRITICAL structure for parser
  const forecastItemsXml = warningAreas.map(a => {
    const kdef = TSUNAMI_KIND_MAP[a.kindCode] || { name: a.kindCode, lastName: '津波なし', lastCode: '00' };
    const kindName = kdef.name;
    const lastKindName = kdef.lastName;
    const lastKindCode = kdef.lastCode;

    const heightVal = a.heightValue || 'NaN';
    const heightDesc = a.heightDescription || '';
    const heightCond = a.heightCondition || '不明';

    // FirstHeight: either arrival time or condition
    let firstHeightXml = '';
    if (a.arrivalTime) {
      firstHeightXml = `<FirstHeight>\n\t\t\t<ArrivalTime>${a.arrivalTime}</ArrivalTime>\n\t\t</FirstHeight>`;
    } else if (a.firstHeightCondition) {
      firstHeightXml = `<FirstHeight>\n\t\t\t<Condition>${esc(a.firstHeightCondition)}</Condition>\n\t\t</FirstHeight>`;
    }

    return `\t\t<Item>
\t\t\t<Area><Name>${esc(a.areaName)}</Name><Code>${a.areaCode}</Code></Area>
\t\t\t<Category>
\t\t\t\t<Kind><Name>${esc(kindName)}</Name><Code>${a.kindCode}</Code></Kind>
\t\t\t\t<LastKind><Name>${esc(lastKindName)}</Name><Code>${lastKindCode}</Code></LastKind>
\t\t\t</Category>
\t\t\t${firstHeightXml}
\t\t\t<MaxHeight>
\t\t\t\t<jmx_eb:TsunamiHeight type="津波の高さ" unit="m" condition="${heightCond}" description="${esc(heightDesc)}">${heightVal}</jmx_eb:TsunamiHeight>
\t\t\t</MaxHeight>
\t\t</Item>`;
  }).join('\n');

  // Associated earthquake block
  const eqXml = data.earthquakeAreaName ? `\t<Earthquake>
\t\t<OriginTime>${data.earthquakeOriginTime || jst}</OriginTime>
\t\t<ArrivalTime>${data.earthquakeOriginTime || jst}</ArrivalTime>
\t\t<Hypocenter>
\t\t\t<Area>
\t\t\t\t<Name>${esc(data.earthquakeAreaName)}</Name>
\t\t\t\t<Code type="震央地名">${data.earthquakeAreaCode || ''}</Code>
\t\t\t\t<jmx_eb:Coordinate description="${esc(data.earthquakeCoordDesc || '')}">${data.earthquakeCoord || ''}</jmx_eb:Coordinate>
\t\t\t</Area>
\t\t</Hypocenter>
\t\t<jmx_eb:Magnitude type="Mj" condition="${data.earthquakeMagnitude ? '' : '不明'}" description="${esc(data.earthquakeMagDesc || '')}">${data.earthquakeMagnitude || 'NaN'}</jmx_eb:Magnitude>
\t</Earthquake>` : '';

  return `<?xml version="1.0" encoding="UTF-8"?>
<Report xmlns="http://xml.kishou.go.jp/jmaxml1/" xmlns:jmx="http://xml.kishou.go.jp/jmaxml1/">
<Control>
\t<Title>津波警報・注意報・予報a</Title>
\t<DateTime>${now}</DateTime>
\t<Status>通常</Status>
\t<EditorialOffice>${esc(data.editorialOffice || '気象庁本庁')}</EditorialOffice>
\t<PublishingOffice>${esc(data.publishingOffice || '気象庁')}</PublishingOffice>
</Control>
<Head xmlns="http://xml.kishou.go.jp/jmaxml1/informationBasis1/">
\t<Title>大津波警報・津波警報・津波注意報・津波予報（${esc(data.headTitle || '全国')}）</Title>
\t<ReportDateTime>${jst}</ReportDateTime>
\t<TargetDateTime>${jst}</TargetDateTime>
\t<EventID>${eventId}</EventID>
\t<InfoType>${data.infoType || '発表'}</InfoType>
\t<Serial></Serial>
\t<InfoKind>津波警報・注意報・予報</InfoKind>
\t<InfoKindVersion>1.0_1</InfoKindVersion>
\t<Headline>
\t\t<Text>${esc(data.headlineText || '')}</Text>
\t\t<Information type="津波予報領域表現">
${headlineInfoXml}
\t\t</Information>
\t</Headline>
</Head>
<Body xmlns="http://xml.kishou.go.jp/jmaxml1/body/seismology1/" xmlns:jmx_eb="http://xml.kishou.go.jp/jmaxml1/elementBasis1/">
\t<Tsunami>
\t<Forecast>
\t\t<CodeDefine>
\t\t\t<Type xpath="Item/Area/Code">津波予報区</Type>
\t\t\t<Type xpath="Item/Category/Kind/Code">警報等情報要素／津波警報・注意報・予報</Type>
\t\t\t<Type xpath="Item/Category/LastKind/Code">警報等情報要素／津波警報・注意報・予報</Type>
\t\t</CodeDefine>
${forecastItemsXml}
\t</Forecast>
\t</Tsunami>
${eqXml}
\t<Comments>
\t\t<WarningComment codeType="固定付加文">
\t\t\t<Text>${esc(data.warningComment || '')}</Text>
\t\t\t<Code>${data.warningCode || ''}</Code>
\t\t</WarningComment>
\t</Comments>
</Body>
</Report>`;
}

module.exports = { generateTsunamiXml, TSUNAMI_KIND_MAP };
