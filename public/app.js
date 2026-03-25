/* ================================================================
   JMA XML Machine v2  —  Frontend SPA
   ================================================================ */

// ── State ──────────────────────────────────────────────────────
let currentPage = 'list';
let currentType = 'earthquake';
let currentFilter = 'all';
let allEvents = {};

// ── Init ───────────────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', () => {
  navigate('list');
  renderForm('earthquake');
  document.getElementById('btnPreviewXml')?.addEventListener('click', previewXml);
  document.getElementById('btnGenerateEvent')?.addEventListener('click', generateEvent);
  document.getElementById('eventList')?.addEventListener('click', onEventListActionClick);
});

/** Event list buttons: avoid inline onclick + JSON in HTML attrs (breaks on " in value). */
function onEventListActionClick(e) {
  const btn = e.target.closest('button[data-action]');
  if (!btn) return;
  const { action, cat, filename, url } = btn.dataset;
  if (action === 'viewXml') viewXml(cat, filename);
  else if (action === 'copyUrl') copyUrl(url);
  else if (action === 'duplicate') duplicateEvent(cat, filename);
  else if (action === 'delete') deleteEvent(cat, filename);
}

// ── Navigation ─────────────────────────────────────────────────
function navigate(page) {
  currentPage = page;
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.getElementById('page' + page)?.classList.add('active');
  document.querySelectorAll('.nav-link').forEach(l => {
    l.classList.toggle('active', l.id === 'nav' + (page === 'list' ? 'List' : 'Create'));
  });
  if (page === 'list') loadEvents();
}
window.navigate = navigate;

// ── Filter ─────────────────────────────────────────────────────
function setFilter(f) {
  currentFilter = f;
  document.querySelectorAll('.filter-btn').forEach(b => b.classList.toggle('active', b.dataset.filter === f));
  renderEventList();
}
window.setFilter = setFilter;

// ── Load Events ────────────────────────────────────────────────
async function loadEvents() {
  try {
    const res = await fetch('/api/events');
    allEvents = await res.json();
    renderEventList();
  } catch (e) { showToast('Failed to load events', 'error'); }
}

function renderEventList() {
  const CAT_FA = { earthquake:'fa-globe', tsunami:'fa-droplet', weather:'fa-cloud-bolt', landslide:'fa-mountain', volcano:'fa-fire' };
  const grid = document.getElementById('eventList');
  const cats = ['earthquake','tsunami','weather','landslide','volcano'];
  let items = [];
  for (const cat of cats) {
    if (currentFilter !== 'all' && currentFilter !== cat) continue;
    for (const ev of (allEvents[cat] || [])) items.push({ ...ev, category: cat });
  }
  items.sort((a,b) => (b.createdAt||'').localeCompare(a.createdAt||''));
  if (!items.length) {
    grid.innerHTML = `<div class="empty-state"><div class="empty-icon" aria-hidden="true"><i class="fa-solid fa-inbox"></i></div><div class="empty-text">No events found. <a href="#" onclick="navigate('create')">Create your first event</a></div></div>`;
    return;
  }
  grid.innerHTML = items.map(ev => {
    const dt = ev.reportDateTime ? ev.reportDateTime.replace('T',' ').slice(0,19) : (ev.createdAt||'').slice(0,19);
    const title = ev.title || ev.controlTitle || ev.filename;
    const cat = ev.category;
    const dataUrl = `/data/${cat}/${ev.filename}`;
    return `<div class="event-card" data-cat="${cat}">
      <div class="event-card-top">
        <div class="event-icon"><i class="fa-solid ${CAT_FA[cat]||'fa-file'}"></i></div>
        <div class="event-card-main">
          <div class="event-title-row">
            <div class="event-title">${escHtml(title)}</div>
            <span class="type-badge badge-${cat}">${cat}</span>
          </div>
          <div class="event-subtitle">${escHtml(ev.infoType||'')} ${ev.controlTitle ? '| '+escHtml(ev.controlTitle) : ''}</div>
        </div>
      </div>
      <div class="event-meta"><span class="event-meta-time has-icon"><i class="fa-regular fa-clock"></i> ${escHtml(dt)}</span></div>
      <div class="event-filename">${escHtml(ev.filename)}</div>
      <div class="event-actions">
        <button type="button" class="btn-xs info icon-btn" title="View XML" aria-label="View XML" data-action="viewXml" data-cat="${escAttr(cat)}" data-filename="${escAttr(ev.filename)}"><i class="fa-solid fa-eye"></i></button>
        <button type="button" class="btn-xs info icon-btn" title="Copy URL" aria-label="Copy URL" data-action="copyUrl" data-url="${escAttr(dataUrl)}"><i class="fa-solid fa-link"></i></button>
        <button type="button" class="btn-xs info icon-btn" title="Duplicate" aria-label="Duplicate" data-action="duplicate" data-cat="${escAttr(cat)}" data-filename="${escAttr(ev.filename)}"><i class="fa-solid fa-clone"></i></button>
        <button type="button" class="btn-xs danger icon-btn" title="Delete" aria-label="Delete" data-action="delete" data-cat="${escAttr(cat)}" data-filename="${escAttr(ev.filename)}"><i class="fa-solid fa-trash-can"></i></button>
      </div>
    </div>`;
  }).join('');
}

// ── View XML ───────────────────────────────────────────────────
async function viewXml(cat, filename) {
  try {
    const res = await fetch(`/data/${cat}/${filename}`);
    const text = await res.text();
    document.getElementById('modalTitle').textContent = filename;
    document.getElementById('modalXml').innerHTML = syntaxHL(text);
    document.getElementById('modalOverlay').classList.add('open');
  } catch(e) { showToast('Failed to load XML','error'); }
}
window.viewXml = viewXml;

function closeModal() { document.getElementById('modalOverlay').classList.remove('open'); }
window.closeModal = closeModal;

async function deleteEvent(cat, filename) {
  if (!confirm(`Delete ${filename}?`)) return;
  const res = await fetch(`/api/events/${cat}/${filename}`, { method: 'DELETE' });
  const data = await res.json();
  if (data.success) { showToast('Event deleted','success'); loadEvents(); }
  else showToast(data.error||'Delete failed','error');
}
window.deleteEvent = deleteEvent;

async function deleteAllEvents() {
  if (!confirm('Delete ALL generated events? This cannot be undone.')) return;
  try {
    const res = await fetch('/api/events', { method: 'DELETE' });
    const data = await res.json();
    if (data.success) { showToast(`Deleted ${data.deleted} events`, 'success'); loadEvents(); }
    else showToast(data.error || 'Delete failed', 'error');
  } catch (e) { showToast('Failed to delete events', 'error'); }
}
window.deleteAllEvents = deleteAllEvents;

function copyUrl(url) {
  navigator.clipboard.writeText(window.location.origin + url).then(() => showToast('URL copied!','success'));
}
window.copyUrl = copyUrl;

// ── Type Switch ────────────────────────────────────────────────
function switchType(type) {
  currentType = type;
  document.querySelectorAll('.type-tab').forEach(t => t.classList.toggle('active', t.dataset.type === type));
  renderForm(type);
  document.getElementById('xmlPreview').innerHTML = '<span class="preview-hint">Click "Preview XML" to see the generated output</span>';
  document.getElementById('previewBadge').textContent = '-';
}
window.switchType = switchType;

// ── Form Renderers ─────────────────────────────────────────────
function renderForm(type) {
  const c = document.getElementById('formContainer');
  switch(type) {
    case 'earthquake': c.innerHTML = formEarthquake(); setTimeout(initEqPrefRows, 10); break;
    case 'tsunami': c.innerHTML = formTsunami(); initTsunamiRows(); break;
    case 'weather': c.innerHTML = formWeather(); initWeatherRows(); break;
    case 'landslide': c.innerHTML = formLandslide(); initLandslideRows(); break;
    case 'volcano': c.innerHTML = formVolcano(); break;
  }
}

function formEarthquake() {
  const now = nowJST();
  return `
<div class="form-section">
  <div class="form-section-title">General</div>
  <div class="form-row">
    <div class="form-field"><label class="form-label">InfoType 情報種別</label>
      <select class="form-select" id="f-infoType"><option>発表</option><option>訂正</option><option>取消</option></select></div>
    <div class="form-field"><label class="form-label">Serial 情報番号</label>
      <input class="form-input" id="f-serial" type="number" value="1" min="1"></div>
  </div>
  <div class="form-row">
    <div class="form-field"><label class="form-label">Editorial Office 編集官署</label>
      <input class="form-input" id="f-editorialOffice" value="気象庁本庁"></div>
    <div class="form-field"><label class="form-label">Publishing Office 発表官署</label>
      <input class="form-input" id="f-publishingOffice" value="気象庁"></div>
  </div>
  <div class="form-row wide">
    <div class="form-field"><label class="form-label">DateTime (UTC)</label>
      <input class="form-input" id="f-dateTime" value="${now.utc}" placeholder="2024-01-01T06:00:00Z">
      <span class="form-hint">Used in Control/DateTime</span></div>
  </div>
</div>
<div class="form-section">
  <div class="form-section-title">Earthquake Info 震源情報</div>
  <div class="form-row">
    <div class="form-field"><label class="form-label">Epicenter Name 震央地名</label>
      <input class="form-input" id="f-areaName" value="三陸沖"></div>
    <div class="form-field"><label class="form-label">Area Code 震央コード</label>
      <input class="form-input" id="f-areaCode" value="288"></div>
  </div>
  <div class="form-row">
    <div class="form-field"><label class="form-label">Origin Time 発生時刻</label>
      <input class="form-input" id="f-originTime" value="${now.jst}"></div>
    <div class="form-field"><label class="form-label">Detailed Name 詳細震央</label>
      <input class="form-input" id="f-detailedName" placeholder="牡鹿半島の東南東130km付近"></div>
  </div>
  <div class="form-row wide">
    <div class="form-field"><label class="form-label">Coordinate 座標 (ISO 6709)</label>
      <input class="form-input" id="f-coordinate" value="+38.0+142.9-10000/" placeholder="+38.0+142.9-10000/">
      <span class="form-hint">Format: lat+lon+depth/ e.g. +38.0+142.9-10000/</span></div>
  </div>
  <div class="form-row wide">
    <div class="form-field"><label class="form-label">Coordinate Description 座標説明</label>
      <input class="form-input" id="f-coordinateDescription" value="北緯38.0度 東経142.9度 深さ10km"></div>
  </div>
</div>
<div class="form-section">
  <div class="form-section-title">Magnitude マグニチュード</div>
  <div class="form-row three">
    <div class="form-field"><label class="form-label">Type</label>
      <select class="form-select" id="f-magnitudeType" oninput="autoMagDesc()"><option>Mj</option><option>M</option><option>Mw</option></select></div>
    <div class="form-field"><label class="form-label">Value</label>
      <input class="form-input" id="f-magnitude" type="number" step="0.1" value="7.0" oninput="autoMagDesc()"></div>
    <div class="form-field"><label class="form-label">Description <span style="font-size:10px;opacity:.6;">(auto)</span></label>
      <input class="form-input" id="f-magnitudeDescription" value="Ｍ７．０" placeholder="auto-generated">
    </div>
  </div>
</div>
<div class="form-section">
  <div class="form-section-title">Intensity 震度 — Affected Prefectures <button class="btn-add-row" onclick="addEqPrefRow()" type="button"><i class="fa-solid fa-plus"></i> Add Prefecture</button></div>
  <div style="display:grid;grid-template-columns:2fr 1fr 1fr 2fr 1fr 28px;gap:4px;margin-bottom:4px;font-size:10px;color:var(--text3);padding:0 4px;">
    <span>Pref Name</span><span>Pref Code(2桁)</span><span>MaxInt</span><span>City Name</span><span>City Code(7桁)</span><span></span>
  </div>
  <div id="eqPrefRows"></div>
  <div class="form-hint" style="margin-top:4px;">Pref Code: 2-digit JMA code (e.g. 04=宮城, 07=福島). City Code: 7-digit (e.g. 0421300). MaxInt: 1-7, 5-, 5+, 6-, 6+</div>
</div>
<div class="form-section">
  <div class="form-section-title">Comments コメント</div>
  <div class="form-row wide">
    <div class="form-field"><label class="form-label">Head Headline Text 見出し文</label>
      <textarea class="form-textarea" id="f-headlineText">${now.jst.slice(0,10).replace(/-/g,'/')}に地震がありました。</textarea></div>
  </div>
  <div class="form-row wide">
    <div class="form-field"><label class="form-label">Forecast Comment 付加文</label>
      <textarea class="form-textarea" id="f-forecastComment">この地震の震源の近くでは、今後しばらく強い余震のおそれがあります。</textarea></div>
  </div>
  <div class="form-row wide">
    <div class="form-field"><label class="form-label">Forecast Comment Code 付加文コード</label>
      <input class="form-input" id="f-forecastCode" value="" placeholder="0221 0228"></div>
  </div>
</div>`;
}

let eqPrefRowId = 0;

// Must be assigned globally BEFORE form template renders (onclick="addEqPrefRow()")
window.addEqPrefRow = function(prefName='', prefCode='', maxInt='5-', cityName='', cityCode='') {
  const id = ++eqPrefRowId;
  const container = document.getElementById('eqPrefRows');
  if (!container) return;
  const div = document.createElement('div');
  div.id = `ep-${id}`;
  div.className = 'dyn-row';
  div.style.gridTemplateColumns = '2fr 1fr 1fr 2fr 1fr 28px';
  const intOpts = ['7','6+','6-','5+','5-','4','3','2','1'].map(v =>
    `<option ${v===maxInt?'selected':''}>${v}</option>`).join('');
  div.innerHTML = `
    <input class="form-input" placeholder="宮城県" value="${prefName}" data-field="prefName">
    <input class="form-input" placeholder="04" value="${prefCode}" data-field="prefCode">
    <select class="form-select" data-field="maxInt">${intOpts}</select>
    <input class="form-input" placeholder="栗原市" value="${cityName}" data-field="cityName">
    <input class="form-input" placeholder="0421300" value="${cityCode}" data-field="cityCode">
    <button type="button" class="dyn-row-del" onclick="removeRow('ep-${id}')" aria-label="Remove row"><i class="fa-solid fa-xmark"></i></button>`;
  container.appendChild(div);
};

// Also keep local alias for internal calls
function addEqPrefRow(...args) { window.addEqPrefRow(...args); }

function initEqPrefRows() {
  if (document.getElementById('eqPrefRows')?.children.length === 0) {
    window.addEqPrefRow('宮城県', '04', '7', '栗原市', '0421300');
    window.addEqPrefRow('福島県', '07', '6+', '白河市', '0720500');
  }
}

// Auto-generate magnitude description from Type + Value
function autoMagDesc() {
  const type = document.getElementById('f-magnitudeType')?.value || 'Mj';
  const val = parseFloat(document.getElementById('f-magnitude')?.value);
  const el = document.getElementById('f-magnitudeDescription');
  if (!el || isNaN(val)) return;
  // Convert number to full-width Japanese format: 7.0 -> Ｍ７．０
  const fw = (s) => s.split('').map(c => {
    const code = c.charCodeAt(0);
    if (code >= 48 && code <= 57) return String.fromCharCode(code + 0xFF10 - 48); // 0-9 full-width
    if (c === '.') return '\uff0e';
    return c;
  }).join('');
  const fwType = type === 'Mj' ? '\uff2d\uff4a' : type === 'Mw' ? '\uff2d\uff57' : '\uff2d';
  el.value = fwType + fw(val.toFixed(1));
}
window.autoMagDesc = autoMagDesc;

function formTsunami() {
  const now = nowJST();
  return `
<div class="form-section">
  <div class="form-section-title">General</div>
  <div class="form-row">
    <div class="form-field"><label class="form-label">InfoType</label>
      <select class="form-select" id="f-infoType"><option>発表</option><option>訂正</option><option>取消</option></select></div>
    <div class="form-field"><label class="form-label">Publishing Office</label>
      <input class="form-input" id="f-publishingOffice" value="気象庁"></div>
  </div>
  <div class="form-row wide">
    <div class="form-field"><label class="form-label">Headline Text 見出し文</label>
      <textarea class="form-textarea" id="f-headlineText">大津波警報・津波警報を発表しました。ただちに避難してください。</textarea></div>
  </div>
  <div class="form-row wide">
    <div class="form-field"><label class="form-label">Warning Comment 警戒文</label>
      <textarea class="form-textarea" id="f-warningComment">ただちに高台へ避難してください。</textarea></div>
  </div>
</div>
<div class="form-section">
  <div class="form-section-title">Warning Areas 津波予報区 <button class="btn-add-row" onclick="addTsunamiRow()" type="button"><i class="fa-solid fa-plus"></i> Add Area</button></div>
  <div style="display:grid;grid-template-columns:2fr 1fr 2fr 1fr 1fr 1fr 28px;gap:4px;margin-bottom:4px;font-size:10px;color:var(--text3);padding:0 4px;">
    <span>Area Name</span><span>Code</span><span>Warning Level</span><span>Arrival Time</span><span>Height m</span><span>Height Desc</span><span></span>
  </div>
  <div id="tsunamiRows"></div>
</div>
<div class="form-section">
  <div class="form-section-title">Associated Earthquake 関連地震</div>
  <div class="form-row">
    <div class="form-field"><label class="form-label">Epicenter Name</label>
      <input class="form-input" id="f-earthquakeAreaName" value="三陸沖"></div>
    <div class="form-field"><label class="form-label">Area Code</label>
      <input class="form-input" id="f-earthquakeAreaCode" value="288"></div>
  </div>
  <div class="form-row">
    <div class="form-field"><label class="form-label">Coordinate</label>
      <input class="form-input" id="f-earthquakeCoord" value="+38.0+142.9-10000/"></div>
    <div class="form-field"><label class="form-label">Coord Description</label>
      <input class="form-input" id="f-earthquakeCoordDesc" value="北緯38.0度 東経142.9度 深さ10km"></div>
  </div>
  <div class="form-row">
    <div class="form-field"><label class="form-label">Magnitude</label>
      <input class="form-input" id="f-earthquakeMagnitude" type="number" step="0.1" value="9.0"></div>
    <div class="form-field"><label class="form-label">Magnitude Description</label>
      <input class="form-input" id="f-earthquakeMagDesc" value="Ｍ９．０"></div>
  </div>
</div>`;
}

function initTsunamiRows() {
  // Add 2 default rows
  addTsunamiRow('岩手県', '210', '53', '53', '大津波警報：発表', '', 'NaN', '巨大');
  addTsunamiRow('宮城県', '220', '53', '53', '大津波警報：発表', '2011-03-11T15:00:00+09:00', 'NaN', '巨大');
}

const TSUNAMI_KINDS = [
  {code:'53',name:'大津波警報：発表',issuedCode:'53'},
  {code:'51',name:'津波警報',issuedCode:'51'},
  {code:'62',name:'津波注意報',issuedCode:'62'},
  {code:'71',name:'津波予報（若干の海面変動）',issuedCode:'71'},
  {code:'00',name:'津波なし（解除）',issuedCode:'50'},
];

let tsunamiRowId = 0;
window.addTsunamiRow = function(areaName='', areaCode='', kindCode='51', issuedCode='51', kindName='津波警報', arrivalTime='', heightValue='NaN', heightDesc='') {
  const id = ++tsunamiRowId;
  const container = document.getElementById('tsunamiRows');
  const div = document.createElement('div');
  div.id = `tr-${id}`;
  div.className = 'dyn-row';
  div.style.gridTemplateColumns = '2fr 1fr 2fr 1fr 1fr 1fr 28px';
  div.innerHTML = `
    <input class="form-input" placeholder="宮城県" value="${areaName}" data-field="areaName">
    <input class="form-input" placeholder="220" value="${areaCode}" data-field="areaCode">
    <select class="form-select" data-field="kindCode">
      ${TSUNAMI_KINDS.map(k=>`<option value="${k.code}" ${k.code===kindCode?'selected':''}>${k.name}</option>`).join('')}
    </select>
    <input class="form-input" placeholder="2011-03-11T15:00:00+09:00" value="${arrivalTime}" data-field="arrivalTime">
    <input class="form-input" placeholder="NaN or 3.0" value="${heightValue}" data-field="heightValue">
    <select class="form-select" data-field="heightDesc">
      <option value="">-</option><option value="巨大" ${heightDesc==='巨大'?'selected':''}>巨大</option>
      <option value="高い" ${heightDesc==='高い'?'selected':''}>高い</option>
      <option value="1m" ${heightDesc==='1m'?'selected':''}>1m</option>
    </select>
    <button type="button" class="dyn-row-del" onclick="removeRow('tr-${id}')" aria-label="Remove row"><i class="fa-solid fa-xmark"></i></button>`;
  container.appendChild(div);
};
// local alias so internal init calls still work
function addTsunamiRow(...args) { window.addTsunamiRow(...args); }

function formWeather() {
  return `
<div class="form-section">
  <div class="form-section-title">General</div>
  <div class="form-row">
    <div class="form-field"><label class="form-label">Format 形式</label>
      <select class="form-select" id="f-format"><option value="VPWW53">VPWW53 (気象特別警報・警報・注意報)</option><option value="VPWW54">VPWW54 (H27形式)</option></select></div>
    <div class="form-field"><label class="form-label">InfoType</label>
      <select class="form-select" id="f-infoType"><option>発表</option><option>訂正</option><option>取消</option></select></div>
  </div>
  <div class="form-row">
    <div class="form-field"><label class="form-label">Prefecture 府県予報区</label>
      <input class="form-input" id="f-prefectureName" value="奈良県"></div>
    <div class="form-field"><label class="form-label">Prefecture Code</label>
      <input class="form-input" id="f-prefectureCode" value="290000"></div>
  </div>
  <div class="form-row">
    <div class="form-field"><label class="form-label">Editorial Office</label>
      <input class="form-input" id="f-editorialOffice" value="奈良地方気象台"></div>
    <div class="form-field"><label class="form-label">Publishing Office</label>
      <input class="form-input" id="f-publishingOffice" value="奈良地方気象台"></div>
  </div>
  <div class="form-row wide">
    <div class="form-field"><label class="form-label">Headline Text 見出し</label>
      <textarea class="form-textarea" id="f-headlineText">【奈良県気象警報・注意報】特別警報を発表しています。</textarea></div>
  </div>
</div>
<div class="form-section">
  <div class="form-section-title">Warning Kinds 警報・注意報種別 (Prefecture-level)</div>
  <div class="check-grid" id="warningKindGrid">
    ${[
      {code:'33',name:'大雨特別警報'},
      {code:'31',name:'暴風特別警報'},
      {code:'03',name:'大雨警報'},
      {code:'04',name:'洪水警報'},
      {code:'02',name:'強風警報'},
      {code:'21',name:'大雪警報'},
      {code:'10',name:'大雨注意報'},
      {code:'14',name:'雷注意報'},
      {code:'15',name:'強風注意報'},
      {code:'16',name:'波浪注意報'},
      {code:'17',name:'高潮警報'},
      {code:'18',name:'洪水注意報'},
    ].map(k => `<label class="check-item" onclick="this.classList.toggle('checked')">
      <input type="checkbox" value="${k.code}" name="warnKind"> ${k.name}（${k.code}）
    </label>`).join('')}
  </div>
  <div class="form-row" style="margin-top:10px">
    <div class="form-field"><label class="form-label">Condition 現象</label>
      <select class="form-select" id="f-warningCondition">
        <option value="">（なし）</option>
        <option value="土砂災害">土砂災害</option>
        <option value="浸水害">浸水害</option>
        <option value="土砂災害、浸水害">土砂災害、浸水害</option>
      </select></div>
  </div>
</div>
<div class="form-section">
  <div class="form-section-title">Municipality Warnings 市町村等 <button class="btn-add-row" onclick="addWeatherRow()" type="button"><i class="fa-solid fa-plus"></i> Add Area</button></div>
  <div id="weatherRows"></div>
</div>`;
}

function initWeatherRows() {
  addWeatherRow('奈良市', '2920100', ['33','14','15']);
  addWeatherRow('大和高田市', '2920200', ['03','04','14','15']);
}

let weatherRowId = 0;
const ALL_WARN_KINDS = [
  {code:'33',name:'大雨特別警報'},{code:'03',name:'大雨警報'},{code:'04',name:'洪水警報'},
  {code:'10',name:'大雨注意報'},{code:'14',name:'雷注意報'},{code:'15',name:'強風注意報'},
  {code:'16',name:'波浪注意報'},{code:'18',name:'洪水注意報'},
];

window.addWeatherRow = function(areaName='', areaCode='', kindCodes=[]) {
  const id = ++weatherRowId;
  const container = document.getElementById('weatherRows');
  const div = document.createElement('div');
  div.id = `wr-${id}`;
  div.className = 'dyn-row';
  div.style.gridTemplateColumns = '1.5fr 1fr 3fr 28px';
  div.innerHTML = `
    <input class="form-input" placeholder="奈良市" value="${areaName}" data-field="areaName">
    <input class="form-input" placeholder="2920100" value="${areaCode}" data-field="areaCode">
    <div style="display:flex;flex-wrap:wrap;gap:4px;">
      ${ALL_WARN_KINDS.map(k=>`<label style="display:flex;align-items:center;gap:3px;font-size:11px;white-space:nowrap;">
        <input type="checkbox" value="${k.code}" data-field="kind" ${kindCodes.includes(k.code)?'checked':''}> ${k.name}
      </label>`).join('')}
    </div>
    <button type="button" class="dyn-row-del" onclick="removeRow('wr-${id}')" aria-label="Remove row"><i class="fa-solid fa-xmark"></i></button>`;
  container.appendChild(div);
};
function addWeatherRow(...args) { window.addWeatherRow(...args); }

function formLandslide() {
  return `
<div class="form-section">
  <div class="form-section-title">General</div>
  <div class="form-row">
    <div class="form-field"><label class="form-label">InfoType</label>
      <select class="form-select" id="f-infoType"><option>発表</option><option>訂正</option><option>取消</option></select></div>
    <div class="form-field"><label class="form-label">Serial</label>
      <input class="form-input" id="f-serial" type="number" value="1"></div>
  </div>
  <div class="form-row">
    <div class="form-field"><label class="form-label">Prefecture 都道府県</label>
      <input class="form-input" id="f-prefectureName" value="岡山県"></div>
    <div class="form-field"><label class="form-label">Prefecture Code</label>
      <input class="form-input" id="f-prefectureCode" value="330000"></div>
  </div>
  <div class="form-row">
    <div class="form-field"><label class="form-label">Editorial Office</label>
      <input class="form-input" id="f-editorialOffice" value="岡山地方気象台"></div>
    <div class="form-field"><label class="form-label">Publishing Office</label>
      <input class="form-input" id="f-publishingOffice" value="岡山県 岡山地方気象台"></div>
  </div>
  <div class="form-row wide">
    <div class="form-field"><label class="form-label">Headline Text 見出し</label>
      <textarea class="form-textarea" id="f-headlineText">＜概況＞
降り続く大雨のため、土砂災害警戒区域等では命に危険が及ぶ土砂災害がいつ発生してもおかしくない非常に危険な状況です。
＜とるべき措置＞
避難が必要となる危険な状況となっています【警戒レベル４相当情報［土砂災害］】。</textarea></div>
  </div>
</div>
<div class="form-section">
  <div class="form-section-title">Municipalities 市町村 <button class="btn-add-row" onclick="addLandslideRow()" type="button"><i class="fa-solid fa-plus"></i> Add Area</button></div>
  <div style="display:grid;grid-template-columns:2fr 1fr 1fr 1fr 28px;gap:4px;margin-bottom:4px;font-size:10px;color:var(--text3);padding:0 4px;">
    <span>Area Name</span><span>Code</span><span>Warning Kind</span><span>Status</span><span></span>
  </div>
  <div id="landslideRows"></div>
</div>`;
}

function initLandslideRows() {
  addLandslideRow('岡山市', '3310000', 'なし', 'なし');
  addLandslideRow('高梁市', '3320900', '警戒', '発表');
  addLandslideRow('新見市', '3321000', 'なし', 'なし');
}

let landslideRowId = 0;
window.addLandslideRow = function(areaName='', areaCode='', warningKind='なし', status='なし') {
  const id = ++landslideRowId;
  const container = document.getElementById('landslideRows');
  const div = document.createElement('div');
  div.id = `lr-${id}`;
  div.className = 'dyn-row';
  div.style.gridTemplateColumns = '2fr 1fr 1fr 1fr 28px';
  div.innerHTML = `
    <input class="form-input" placeholder="高梁市" value="${areaName}" data-field="name">
    <input class="form-input" placeholder="3320900" value="${areaCode}" data-field="code">
    <select class="form-select" data-field="warningKind">
      <option ${warningKind==='警戒'?'selected':''}>警戒</option>
      <option ${warningKind==='解除'?'selected':''}>解除</option>
      <option ${warningKind==='なし'?'selected':''}>なし</option>
    </select>
    <select class="form-select" data-field="status">
      <option ${status==='発表'?'selected':''}>発表</option>
      <option ${status==='継続'?'selected':''}>継続</option>
      <option ${status==='解除'?'selected':''}>解除</option>
      <option ${status==='なし'?'selected':''}>なし</option>
    </select>
    <button type="button" class="dyn-row-del" onclick="removeRow('lr-${id}')" aria-label="Remove row"><i class="fa-solid fa-xmark"></i></button>`;
  container.appendChild(div);
};
function addLandslideRow(...args) { window.addLandslideRow(...args); }

function formVolcano() {
  const now = nowJST();
  return `
<div class="form-section">
  <div class="form-section-title">General</div>
  <div class="form-row">
    <div class="form-field"><label class="form-label">InfoType</label>
      <select class="form-select" id="f-infoType"><option>発表</option><option>訂正</option><option>取消</option></select></div>
    <div class="form-field"><label class="form-label">Publishing Office</label>
      <input class="form-input" id="f-publishingOffice" value="気象庁"></div>
  </div>
  <div class="form-row wide">
    <div class="form-field"><label class="form-label">DateTime (UTC)</label>
      <input class="form-input" id="f-dateTime" value="${now.utc}"></div>
  </div>
</div>
<div class="form-section">
  <div class="form-section-title">Volcano 火山</div>
  <div class="form-row">
    <div class="form-field"><label class="form-label">Volcano Name 火山名</label>
      <input class="form-input" id="f-volcanoName" value="浅間山"></div>
    <div class="form-field"><label class="form-label">Volcano Code 火山コード</label>
      <input class="form-input" id="f-volcanoCode" value="306"></div>
  </div>
  <div class="form-row wide">
    <div class="form-field"><label class="form-label">Coordinate</label>
      <input class="form-input" id="f-coordinate" value="+3624.38+13831.38+2568/">
      <span class="form-hint">Format: +lat+lon+elevation/</span></div>
  </div>
  <div class="form-row wide">
    <div class="form-field"><label class="form-label">Coordinate Description</label>
      <input class="form-input" id="f-coordinateDescription" value="北緯36度24.38分 東経138度31.38分 標高2568m"></div>
  </div>
</div>
<div class="form-section">
  <div class="form-section-title">Alert Level 警戒レベル</div>
  <div class="form-row">
    <div class="form-field"><label class="form-label">Current Level 現在レベル</label>
      <select class="form-select" id="f-alertLevelCode" onchange="updateVolcanoWarningInfo()">
        <option value="11">Lv1 活火山であることに留意</option>
        <option value="12">Lv2 火口周辺規制</option>
        <option value="13" selected>Lv3 入山規制</option>
        <option value="14">Lv4 高齢者等避難</option>
        <option value="15">Lv5 避難</option>
      </select></div>
    <div class="form-field"><label class="form-label">Previous Level 前回レベル</label>
      <select class="form-select" id="f-prevAlertLevelCode" onchange="updateVolcanoWarningInfo()">
        <option value="11" selected>Lv1 活火山であることに留意</option>
        <option value="12">Lv2 火口周辺規制</option>
        <option value="13">Lv3 入山規制</option>
        <option value="14">Lv4 高齢者等避難</option>
        <option value="15">Lv5 避難</option>
      </select></div>
  </div>
  <div class="form-row wide">
    <div class="form-field"><label class="form-label">Condition 状況</label>
      <select class="form-select" id="f-condition"><option>引上げ</option><option>引下げ</option><option>継続</option></select></div>
  </div>
  <div id="volcanoWarningInfo" style="margin-top:8px;padding:10px 14px;background:rgba(99,102,241,0.08);border:1px solid rgba(99,102,241,0.18);border-radius:8px;font-size:12px;line-height:1.7;color:var(--text2);">
  </div>
</div>
<div class="form-section">
  <div class="form-section-title">Affected Municipalities 対象市町村 <button class="btn-add-row" onclick="addVolcanoMunRow()" type="button"><i class="fa-solid fa-plus"></i> Add</button></div>
  <div id="volcanoMunRows"></div>
</div>
<div class="form-section">
  <div class="form-section-title">Content 本文</div>
  <div class="form-row wide">
    <div class="form-field"><label class="form-label">Headline Text 見出し</label>
      <textarea class="form-textarea" id="f-headlineText">＜浅間山に火口周辺警報（噴火警戒レベル３、入山規制）を発表＞
　山頂火口から概ね４ｋｍの範囲で大きな噴石や火砕流に警戒してください。</textarea></div>
  </div>
  <div class="form-row wide">
    <div class="form-field"><label class="form-label">Volcano Activity 火山活動</label>
      <textarea class="form-textarea" id="f-volcanoActivity">浅間山では、火山性地震がやや多い状態で経過しています。</textarea></div>
  </div>
  <div class="form-row wide">
    <div class="form-field"><label class="form-label">Prevention 防災上の警戒事項</label>
      <textarea class="form-textarea" id="f-volcanoPrevention">山頂火口から概ね４ｋｍの範囲では、弾道を描いて飛散する大きな噴石や火砕流に警戒してください。</textarea></div>
  </div>
</div>`;
}

let volcanoMunId = 0;
window.addVolcanoMunRow = function(name='', code='') {
  const id = ++volcanoMunId;
  const container = document.getElementById('volcanoMunRows');
  if (!container) return;
  const div = document.createElement('div');
  div.id = `vm-${id}`;
  div.className = 'dyn-row';
  div.style.gridTemplateColumns = '2fr 1fr 28px';
  div.innerHTML = `
    <input class="form-input" placeholder="長野県小諸市" value="${name}" data-field="name">
    <input class="form-input" placeholder="2020800" value="${code}" data-field="code">
    <button type="button" class="dyn-row-del" onclick="removeRow('vm-${id}')" aria-label="Remove row"><i class="fa-solid fa-xmark"></i></button>`;
  container.appendChild(div);
  return div;
};
function addVolcanoMunRow(...args) { return window.addVolcanoMunRow(...args); }

// Warning info lookup (mirrors ALERT_LEVELS in volcanoXml.js)
const VOLCANO_ALERT_INFO = {
  '11': { warningName: '噴火予報', warningCode: '05', defenseName: '活火山であることに留意', defenseCode: '45' },
  '12': { warningName: '火口周辺警報', warningCode: '02', defenseName: '火口周辺警報：火口周辺規制', defenseCode: '44' },
  '13': { warningName: '火口周辺警報', warningCode: '02', defenseName: '火口周辺警報：入山規制等', defenseCode: '43' },
  '14': { warningName: '噴火警報（居住地域）', warningCode: '01', defenseName: '噴火警報：高齢者等避難等', defenseCode: '42' },
  '15': { warningName: '噴火警報（居住地域）', warningCode: '01', defenseName: '噴火警報：避難等', defenseCode: '41' },
};

window.updateVolcanoWarningInfo = function() {
  const el = document.getElementById('volcanoWarningInfo');
  if (!el) return;
  const cur = document.getElementById('f-alertLevelCode')?.value || '13';
  const prev = document.getElementById('f-prevAlertLevelCode')?.value || '11';
  const ci = VOLCANO_ALERT_INFO[cur] || VOLCANO_ALERT_INFO['13'];
  const pi = VOLCANO_ALERT_INFO[prev] || VOLCANO_ALERT_INFO['11'];
  el.innerHTML = `<div style="font-weight:600;margin-bottom:4px;"><i class="fa-solid fa-bolt" style="margin-right:6px;opacity:.85"></i>Generated Warning Info (自動算出)</div>
    <div><i class="fa-solid fa-caret-right" style="margin-right:6px;opacity:.7"></i><b>対象市町村等:</b> ${ci.warningName}（code: ${ci.warningCode}）← 前回: ${pi.warningName}（${pi.warningCode}）</div>
    <div><i class="fa-solid fa-caret-right" style="margin-right:6px;opacity:.7"></i><b>防災対応等:</b> ${ci.defenseName}（code: ${ci.defenseCode}）← 前回: ${pi.defenseName}（${pi.defenseCode}）</div>`;
};
function updateVolcanoWarningInfo() { window.updateVolcanoWarningInfo(); }

// Pre-fill volcano rows on form render
function ensureVolcanoRows() {
  if (!document.getElementById('volcanoMunRows')) return;
  if (document.getElementById('volcanoMunRows').children.length === 0) {
    addVolcanoMunRow('群馬県嬬恋村', '1042500');
    addVolcanoMunRow('長野県小諸市', '2020800');
  }
  updateVolcanoWarningInfo();
}

// Override switchType to add init for volcano
const _origSwitchType = switchType;
function switchTypeFixed(type) {
  _origSwitchType(type);
  if (type === 'volcano') setTimeout(ensureVolcanoRows, 50);
  if (type === 'tsunami') setTimeout(initTsunamiRows, 50); // already called in renderForm
}
window.switchType = (type) => {
  currentType = type;
  document.querySelectorAll('.type-tab').forEach(t => t.classList.toggle('active', t.dataset.type === type));
  renderForm(type);
  if (type === 'volcano') setTimeout(ensureVolcanoRows, 50);
  document.getElementById('xmlPreview').innerHTML = '<span class="preview-hint">Click "Preview XML" to see the generated output</span>';
  document.getElementById('previewBadge').textContent = '-';
};

function removeRow(id) { document.getElementById(id)?.remove(); }
window.removeRow = removeRow;

// ── Duplicate: save a new XML from stored .meta.json (same as Generate) ──
async function duplicateEvent(cat, filename) {
  try {
    const res = await fetch(`/api/events/${encodeURIComponent(cat)}/${encodeURIComponent(filename)}/meta`);
    const json = await readResponseJson(res);
    if (!res.ok) {
      showToast(json.error || 'Không có dữ liệu gốc (.meta.json). Tạo lại bản tin bằng Generate trước.', 'error');
      return;
    }
    const { type, data } = json;
    const createRes = await fetch('/api/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type, data }),
    });
    const createJson = await readResponseJson(createRes);
    if (!createRes.ok || !createJson.success) {
      showToast(createJson.error || 'Tạo bản sao thất bại', 'error');
      return;
    }
    showToast(`Đã nhân bản: ${createJson.filename}`, 'success');
    navigate('list');
  } catch (e) {
    console.error(e);
    showToast('Nhân bản thất bại', 'error');
  }
}
window.duplicateEvent = duplicateEvent;

// ── Collect Form Data ──────────────────────────────────────────
function collectFormData() {
  const g = id => document.getElementById(id);
  const v = id => g(id)?.value?.trim() || '';
  switch(currentType) {
    case 'earthquake': {
      const prefectures = [...document.querySelectorAll('#eqPrefRows .dyn-row')].map(row => {
        const prefName = row.querySelector('[data-field="prefName"]')?.value||'';
        const prefCode = row.querySelector('[data-field="prefCode"]')?.value||'';
        const maxInt = row.querySelector('[data-field="maxInt"]')?.value||'5-';
        const cityName = row.querySelector('[data-field="cityName"]')?.value||'';
        const cityCode = row.querySelector('[data-field="cityCode"]')?.value||'';
        return { name: prefName, prefCode, maxInt, areaName: prefName, areaCode: prefCode,
          cities: cityName ? [{ name: cityName, code: cityCode, maxInt }] : [] };
      });
      return {
        infoType: v('f-infoType'), serial: parseInt(v('f-serial'))||1,
        editorialOffice: v('f-editorialOffice'), publishingOffice: v('f-publishingOffice'),
        dateTime: v('f-dateTime'), areaName: v('f-areaName'), areaCode: v('f-areaCode'),
        originTime: v('f-originTime'), detailedName: v('f-detailedName'),
        coordinate: v('f-coordinate'), coordinateDescription: v('f-coordinateDescription'),
        magnitudeType: v('f-magnitudeType'), magnitude: parseFloat(v('f-magnitude'))||0,
        magnitudeDescription: v('f-magnitudeDescription'),
        headlineText: v('f-headlineText'), forecastComment: v('f-forecastComment'),
        forecastCode: v('f-forecastCode'), prefectures,
      };
    }
    case 'tsunami': {
      const areas = collectRows('tsunamiRows', ['areaName','areaCode','kindCode','arrivalTime','heightValue','heightDesc']);
      return {
        infoType: v('f-infoType'), publishingOffice: v('f-publishingOffice'),
        headlineText: v('f-headlineText'), warningComment: v('f-warningComment'),
        earthquakeAreaName: v('f-earthquakeAreaName'), earthquakeAreaCode: v('f-earthquakeAreaCode'),
        earthquakeCoord: v('f-earthquakeCoord'), earthquakeCoordDesc: v('f-earthquakeCoordDesc'),
        earthquakeMagnitude: parseFloat(v('f-earthquakeMagnitude'))||null,
        earthquakeMagDesc: v('f-earthquakeMagDesc'),
        warningAreas: areas.map(a => {
          const kind = TSUNAMI_KINDS.find(k=>k.code===a.kindCode) || TSUNAMI_KINDS[0];
          return { areaName: a.areaName, areaCode: a.areaCode,
            kindCode: kind.code, kindName: kind.name, kindIssuedCode: kind.issuedCode,
            kindStatus: '発表', lastKindName: '津波なし', lastKindCode: '00',
            arrivalTime: a.arrivalTime, heightValue: a.heightValue||'NaN', heightDescription: a.heightDesc, heightCondition: '不明' };
        }),
      };
    }
    case 'weather': {
      const checkedKinds = [...document.querySelectorAll('#warningKindGrid input:checked')].map(el => el.value);
      const cond = v('f-warningCondition');
      const munRows = [...document.querySelectorAll('#weatherRows .dyn-row')].map(row => {
        const areaName = row.querySelector('[data-field="areaName"]')?.value||'';
        const areaCode = row.querySelector('[data-field="areaCode"]')?.value||'';
        const kinds = [...row.querySelectorAll('[data-field="kind"]:checked')].map(el => {
          const nm = el.parentElement?.textContent?.trim().replace(/\s+/g,' ')||el.value;
          return { code: el.value, name: nm };
        });
        return { areaName, areaCode, kinds };
      });
      const warningItems = checkedKinds.length ? [{ kinds: checkedKinds.map(c=>{
        const labels = {'33':'大雨特別警報','03':'大雨警報','04':'洪水警報','10':'大雨注意報','14':'雷注意報','15':'強風注意報','16':'波浪注意報','18':'洪水注意報','02':'強風警報','21':'大雪警報','31':'暴風警報','17':'高潮警報'};
        return {name: labels[c]||c, code:c, condition: cond||undefined};
      }), areaName: v('f-prefectureName'), areaCode: v('f-prefectureCode'), kindCodes: checkedKinds }] : [];
      return { format: v('f-format'), infoType: v('f-infoType'), prefectureName: v('f-prefectureName'),
        prefectureCode: v('f-prefectureCode'), editorialOffice: v('f-editorialOffice'),
        publishingOffice: v('f-publishingOffice'), headlineText: v('f-headlineText'),
        warningItems, municipalityItems: munRows };
    }
    case 'landslide': {
      const municipalities = [...document.querySelectorAll('#landslideRows .dyn-row')].map(row => ({
        name: row.querySelector('[data-field="name"]')?.value||'',
        code: row.querySelector('[data-field="code"]')?.value||'',
        warningKind: row.querySelector('[data-field="warningKind"]')?.value||'なし',
        status: row.querySelector('[data-field="status"]')?.value||'なし',
      }));
      return { infoType: v('f-infoType'), serial: parseInt(v('f-serial'))||1,
        prefectureName: v('f-prefectureName'), prefectureCode: v('f-prefectureCode'),
        editorialOffice: v('f-editorialOffice'), publishingOffice: v('f-publishingOffice'),
        headlineText: v('f-headlineText'), municipalities };
    }
    case 'volcano': {
      const municipalities = [...document.querySelectorAll('#volcanoMunRows .dyn-row')].map(row => ({
        name: row.querySelector('[data-field="name"]')?.value||'',
        code: row.querySelector('[data-field="code"]')?.value||'',
      }));
      return { infoType: v('f-infoType'), dateTime: v('f-dateTime'),
        publishingOffice: v('f-publishingOffice'), volcanoName: v('f-volcanoName'),
        volcanoCode: v('f-volcanoCode'), coordinate: v('f-coordinate'),
        coordinateDescription: v('f-coordinateDescription'),
        alertLevelCode: v('f-alertLevelCode'), prevAlertLevelCode: v('f-prevAlertLevelCode'),
        condition: v('f-condition'), municipalities,
        headlineText: v('f-headlineText'), volcanoHeadline: v('f-headlineText'),
        volcanoActivity: v('f-volcanoActivity'), volcanoPrevention: v('f-volcanoPrevention') };
    }
    default:
      return {};
  }
}

function collectRows(containerId, fields) {
  return [...document.querySelectorAll(`#${containerId} .dyn-row`)].map(row => {
    const obj = {};
    for (const f of fields) {
      const el = row.querySelector(`[data-field="${f}"]`);
      obj[f] = el?.value || '';
    }
    return obj;
  });
}

/** Parse JSON from fetch; avoids SyntaxError on empty/non-JSON bodies (proxy errors, 502 HTML). */
async function readResponseJson(res) {
  const text = await res.text();
  if (!text || !text.trim()) return {};
  try {
    return JSON.parse(text);
  } catch {
    return { error: 'Invalid response (not JSON). Check server / network.' };
  }
}

// ── Preview ────────────────────────────────────────────────────
async function previewXml() {
  let res;
  try {
    const data = collectFormData() ?? {};
    res = await fetch('/api/events/preview', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: currentType, data }),
    });
  } catch (e) {
    showToast('Preview request failed', 'error');
    return;
  }
  const json = await readResponseJson(res);
  if (!res.ok) {
    showToast(json.error || 'Preview failed', 'error');
    return;
  }
  if (json.xml != null && json.xml !== '') {
    try {
      document.getElementById('xmlPreview').innerHTML = syntaxHL(json.xml);
      document.getElementById('previewBadge').textContent = currentType.toUpperCase();
    } catch (e) {
      console.error(e);
      showToast('Preview display error', 'error');
    }
  } else {
    showToast(json.error || 'Preview failed (no XML)', 'error');
  }
}
window.previewXml = previewXml;

// ── Generate ───────────────────────────────────────────────────
async function generateEvent() {
  let res;
  try {
    const data = collectFormData() ?? {};
    res = await fetch('/api/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: currentType, data }),
    });
  } catch (e) {
    showToast('Save request failed', 'error');
    return;
  }
  const json = await readResponseJson(res);
  if (json.success) {
    showToast(`Created: ${json.filename}`, 'success');
    setTimeout(() => navigate('list'), 800);
  } else {
    showToast(json.error || 'Failed to create event', 'error');
  }
}
window.generateEvent = generateEvent;

// ── Utilities ──────────────────────────────────────────────────
function nowJST() {
  const now = new Date();
  const utc = now.toISOString().replace(/\.\d+Z$/, 'Z');
  const jstMs = now.getTime() + 9*3600000;
  const jstDate = new Date(jstMs);
  const jst = jstDate.toISOString().replace(/\.\d+Z$/, '+09:00');
  return { utc, jst };
}

function syntaxHL(xml) {
  const s = xml == null ? '' : String(xml);
  return s
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/(&lt;\?[^?]*\?&gt;)/g,'<span class="xp">$1</span>')
    .replace(/(&lt;!--[\s\S]*?--&gt;)/g,'<span class="xp">$1</span>')
    .replace(/(&lt;\/?)([\w:]+)/g,'<span class="xt">$1$2</span>')
    .replace(/([\w:]+)=(&quot;[^&]*&quot;)/g,'<span class="xa">$1</span>=<span class="xv">$2</span>')
    .replace(/&gt;([^&<\n]+)&lt;/g,'&gt;<span class="xc">$1</span>&lt;');
}

function escHtml(s) {
  return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

/** Escape attribute values in double-quoted HTML (data-* on event cards). */
function escAttr(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/"/g, '&quot;');
}

let toastTimer;
function showToast(msg, type='') {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = 'toast ' + type;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2800);
}
