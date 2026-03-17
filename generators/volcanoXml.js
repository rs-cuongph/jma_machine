/**
 * Volcano XML Generator (VFVO50)
 * 噴火警報・予報
 *
 * SPEC (jma_worker_handler.md):
 * Parser reads from Head/Headline/Information[@type="噴火警報・予報（対象市町村等）"]:
 *   → warning_name: Kind/Name  (must be "噴火警報" for Lv3-5, "噴火警報（居住地域）" for Lv4-5)
 *   → warning_code: Kind/Code  (must be "01" or "02" for matcher to fire)
 *   → warning_condition: Kind/Condition  (must be "発表" or "切替" to trigger)
 *   → affected_cities[]: Areas/Area/Code  (city codes)
 *
 * Volcano alert level → warning_name/code mapping:
 *   Lv1 → 噴火予報, code=05
 *   Lv2 → 火口周辺警報, code=02
 *   Lv3 → 火口周辺警報, code=02
 *   Lv4 → 噴火警報（居住地域）, code=01
 *   Lv5 → 噴火警報（居住地域）, code=01
 *
 * Matcher fires ONLY when code=01 or 02 AND condition=発表 OR 切替
 */
const { toJST, formatEventId, esc } = require('./earthquakeXml');

const ALERT_LEVELS = {
  '11': { level: 1, name: 'レベル１（活火山であることに留意）', warningName: '噴火予報', warningCode: '05' },
  '12': { level: 2, name: 'レベル２（火口周辺規制）', warningName: '火口周辺警報', warningCode: '02' },
  '13': { level: 3, name: 'レベル３（入山規制）', warningName: '火口周辺警報', warningCode: '02' },
  '14': { level: 4, name: 'レベル４（高齢者等避難）', warningName: '噴火警報（居住地域）', warningCode: '01' },
  '15': { level: 5, name: 'レベル５（避難）', warningName: '噴火警報（居住地域）', warningCode: '01' },
};

function generateVolcanoXml(data) {
  const now = data.dateTime || new Date().toISOString().replace(/\.\d+Z$/, 'Z');
  const jst = data.reportDateTime || toJST(now);
  const eventId = data.eventId || data.volcanoCode || formatEventId(new Date());

  const levelCode = data.alertLevelCode || '13';
  const prevLevelCode = data.prevAlertLevelCode || '11';
  const levelInfo = ALERT_LEVELS[levelCode] || ALERT_LEVELS['13'];
  const prevLevelInfo = ALERT_LEVELS[prevLevelCode] || ALERT_LEVELS['11'];

  // condition: 引上げ→発表, 引下げ→切替, 継続→継続
  // For matcher to fire: warningCode must be 01/02, condition must be 発表 or 切替
  const rawCondition = data.condition || '引上げ';
  const kindCondition = rawCondition === '引上げ' ? '発表' : (rawCondition === '引下げ' ? '切替' : rawCondition);

  const municipalities = data.municipalities || [];
  const munAreasXml = municipalities.map(m =>
    `<Area><Name>${esc(m.name)}</Name><Code>${m.code}</Code></Area>`
  ).join('\n');

  return `<?xml version="1.0" encoding="UTF-8" ?>
<Report xmlns="http://xml.kishou.go.jp/jmaxml1/" xmlns:jmx="http://xml.kishou.go.jp/jmaxml1/">
<Control>
<Title>噴火警報・予報</Title>
<DateTime>${now}</DateTime>
<Status>通常</Status>
<EditorialOffice>${esc(data.editorialOffice || '気象庁本庁')}</EditorialOffice>
<PublishingOffice>${esc(data.publishingOffice || '気象庁')}</PublishingOffice>
</Control>
<Head xmlns="http://xml.kishou.go.jp/jmaxml1/informationBasis1/">
<Title>火山名 ${esc(data.volcanoName)} 噴火警報・予報（${esc(levelInfo.warningName)}）</Title>
<ReportDateTime>${jst}</ReportDateTime>
<TargetDateTime>${jst}</TargetDateTime>
<EventID>${eventId}</EventID>
<InfoType>${data.infoType || '発表'}</InfoType>
<Serial />
<InfoKind>噴火警報・予報</InfoKind>
<InfoKindVersion>1.0_0</InfoKindVersion>
<Headline>
<Text>${esc(data.headlineText || '')}</Text>
<Information type="噴火警報・予報（対象火山）">
<Item>
<Kind>
<Name>${esc(levelInfo.name)}</Name>
<Code>${levelCode}</Code>
<Condition>${esc(rawCondition)}</Condition>
</Kind>
<LastKind>
<Name>${esc(prevLevelInfo.name)}</Name>
<Code>${prevLevelCode}</Code>
<Condition />
</LastKind>
<Areas codeType="火山名">
<Area>
<Name>${esc(data.volcanoName)}</Name>
<Code>${data.volcanoCode || ''}</Code>
</Area>
</Areas>
</Item>
</Information>
<Information type="噴火警報・予報（対象市町村等）">
<Item>
<Kind>
<Name>${esc(levelInfo.warningName)}</Name>
<Code>${levelInfo.warningCode}</Code>
<Condition>${kindCondition}</Condition>
</Kind>
<LastKind>
<Name>${esc(prevLevelInfo.warningName)}</Name>
<Code>${prevLevelInfo.warningCode}</Code>
<Condition />
</LastKind>
<Areas codeType="気象・地震・火山情報／市町村等">
${munAreasXml}
</Areas>
</Item>
</Information>
</Headline>
</Head>
<Body xmlns="http://xml.kishou.go.jp/jmaxml1/body/volcanology1/" xmlns:jmx_eb="http://xml.kishou.go.jp/jmaxml1/elementBasis1/">
<VolcanoInfo type="噴火警報・予報（対象火山）">
<Item>
<Kind>
<Name>${esc(levelInfo.name)}</Name>
<Code>${levelCode}</Code>
<Condition>${esc(rawCondition)}</Condition>
</Kind>
<LastKind>
<Name>${esc(prevLevelInfo.name)}</Name>
<Code>${prevLevelCode}</Code>
<Condition />
</LastKind>
<Areas codeType="火山名">
<Area>
<Name>${esc(data.volcanoName)}</Name>
<Code>${data.volcanoCode || ''}</Code>
<Coordinate description="${esc(data.coordinateDescription || '')}">${data.coordinate || ''}</Coordinate>
</Area>
</Areas>
</Item>
</VolcanoInfo>
<VolcanoInfo type="噴火警報・予報（対象市町村等）">
<Item>
<Kind>
<Name>${esc(levelInfo.warningName)}</Name>
<Code>${levelInfo.warningCode}</Code>
<Condition>${kindCondition}</Condition>
</Kind>
<LastKind>
<Name>${esc(prevLevelInfo.warningName)}</Name>
<Code>${prevLevelInfo.warningCode}</Code>
<Condition />
</LastKind>
<Areas codeType="気象・地震・火山情報／市町村等">
${munAreasXml}
</Areas>
</Item>
</VolcanoInfo>
<VolcanoInfoContent>
<VolcanoHeadline>${esc(data.volcanoHeadline || data.headlineText || '')}</VolcanoHeadline>
<VolcanoActivity>${esc(data.volcanoActivity || '')}</VolcanoActivity>
<VolcanoPrevention>${esc(data.volcanoPrevention || '')}</VolcanoPrevention>
${data.appendix ? `<Appendix>${esc(data.appendix)}</Appendix>` : ''}
</VolcanoInfoContent>
</Body>
</Report>`;
}

module.exports = { generateVolcanoXml, ALERT_LEVELS };
