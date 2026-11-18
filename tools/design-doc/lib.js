// 설계서 생성 공통 모듈: DBML 로드, Graphviz ERD, Mermaid/PDF 출력
// build.js(전체 설계서)와 summary.js(영역 요약본)가 함께 쓴다.
const fs = require('fs');
const path = require('path');
const { Parser } = require('@dbml/core');
const puppeteer = require('puppeteer-core');

const ROOT = path.resolve(__dirname, '..', '..');
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const noteOf = (n) => (n && typeof n === 'object' ? n.value : n) || '';
const mm = (code, cls = '') => `<pre class="mermaid ${cls}">${esc(code)}</pre>`;
const fig = (title, body, caption = '') =>
  `<figure class="fig"><figcaption><b>${title}</b>${caption ? ' — ' + caption : ''}</figcaption>${body}</figure>`;

function findChrome() {
  const p = process.env.CHROME_PATH || [
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/usr/bin/google-chrome',
  ].find((x) => fs.existsSync(x));
  if (!p) { console.error('Chrome/Edge를 찾지 못했습니다. CHROME_PATH 환경변수로 경로를 지정하세요.'); process.exit(1); }
  return p;
}

// ---------- DBML 로드 + 관계 정규화 ----------
function load(src) {
  const S = new Parser().parse(fs.readFileSync(src, 'utf8'), 'dbmlv2').schemas[0];
  const tableMap = Object.fromEntries(S.tables.map((t) => [t.name, t]));
  const groups = S.tableGroups;
  const groupOf = {};
  groups.forEach((g) => g.tables.forEach((t) => (groupOf[t.name] = g.name)));
  const refs = S.refs.map((r) => {
    const [a, b] = r.endpoints;
    let child = a, parent = b;
    if (a.relation === '1' && b.relation === '*') { child = b; parent = a; }
    return {
      child: child.tableName, ccol: child.fieldNames[0],
      parent: parent.tableName, pcol: parent.fieldNames[0],
      oneToOne: a.relation === '1' && b.relation === '1',
    };
  });
  const fk = {};
  refs.forEach((r) => (fk[`${r.child}.${r.ccol}`] = `${r.parent}.${r.pcol}`));
  const fieldOf = (t, c) => tableMap[t].fields.find((f) => f.name === c);
  const compositePk = (t) => ((t.indexes || []).find((i) => i.pk)?.columns || []).map((c) => c.value);
  const baseType = (f) => f.type.type_name.replace(/\(.*\)/, '').toUpperCase();
  const keyFields = (t) => {
    const cpk = compositePk(t);
    return t.fields.filter((f) => f.pk || cpk.includes(f.name) || f.unique || fk[`${t.name}.${f.name}`]);
  };
  const keyMark = (t, f) => {
    const k = [];
    if (f.pk || compositePk(t).includes(f.name)) k.push('PK');
    if (fk[`${t.name}.${f.name}`]) k.push('FK');
    if (f.unique) k.push('UK');
    return k.join(', ');
  };
  return { S, tableMap, groups, groupOf, refs, fk, fieldOf, compositePk, baseType, keyFields, keyMark };
}

// 관리자·처리자 감사 컬럼 → member_account 관계선은 상품/커뮤니티 ERD에서 생략 (명세 표에는 FK로 표시)
const AUDIT = new Set(['created_by', 'updated_by', 'changed_by', 'answered_by', 'handled_by', 'reviewer_id', 'requested_by']);

// ---------- Graphviz ERD (컬럼 단위 연결, 까마귀발 표기) ----------
// tables: 그릴 테이블 이름 배열. 이 테이블들이 참조하는 다른 테이블은 회색(PK만)으로 함께 그린다.
// leftOf: { hub, tables } — hub 테이블을 참조하는 자식 중 tables에 든 것은 hub 왼쪽에 배치 (허브형 배치)
function erDot(ctx, tables, { hideAudit = false, leftOf = null } = {}) {
  const { tableMap, refs, fieldOf, compositePk, baseType, keyFields, keyMark } = ctx;
  const inner = new Set(tables);
  const rels = refs.filter((r) => inner.has(r.child) && !(hideAudit && r.parent === 'member_account' && AUDIT.has(r.ccol)));
  const ext = [...new Set(rels.filter((r) => !inner.has(r.parent)).map((r) => r.parent))];
  const F = 'Malgun Gothic';
  let dot = `digraph G {
  graph [rankdir=LR, nodesep=0.28, ranksep=0.75, splines=spline, bgcolor="transparent", fontname="${F}", pad=0.1];
  node [shape=plain, fontname="${F}", fontsize=10];
  edge [color="#7d8a96", penwidth=1.1, arrowsize=0.75, dir=both];\n`;
  const row = (port, name, type, key, opts = {}) =>
    `<TR><TD PORT="${port}_i" ALIGN="LEFT" BGCOLOR="${opts.bg || 'white'}"><FONT FACE="Consolas" POINT-SIZE="9.5">${opts.b ? '<B>' + name + '</B>' : name}</FONT></TD>` +
    `<TD ALIGN="LEFT" BGCOLOR="${opts.bg || 'white'}"><FONT FACE="Consolas" POINT-SIZE="8" COLOR="#5d6d7e">${type}</FONT></TD>` +
    `<TD PORT="${port}_o" BGCOLOR="${opts.bg || 'white'}"><FONT POINT-SIZE="8" COLOR="${key.includes('PK') ? '#B8860B' : '#2f6496'}"><B>${key}</B></FONT></TD></TR>`;
  for (const name of inner) {
    const t = tableMap[name];
    const kf = keyFields(t);
    const others = t.fields.length - kf.length;
    let rows = kf.map((f) => row(f.name, f.name, baseType(f), keyMark(t, f).replace(/, /g, ' '), { b: keyMark(t, f).includes('PK'), bg: keyMark(t, f).includes('PK') ? '#FBF6E9' : 'white' })).join('');
    if (others > 0) rows += `<TR><TD COLSPAN="3" ALIGN="LEFT" BGCOLOR="#F5F8FB"><FONT POINT-SIZE="8" COLOR="#8795A1">+ ${others} columns</FONT></TD></TR>`;
    dot += `  ${name} [label=<<TABLE BORDER="1" CELLBORDER="0" CELLSPACING="0" CELLPADDING="3" COLOR="#2f6496">
      <TR><TD COLSPAN="3" BGCOLOR="#2f6496"><FONT COLOR="white" POINT-SIZE="10.5"><B>&nbsp;${name}&nbsp;&nbsp;&nbsp;</B></FONT></TD></TR>${rows}</TABLE>>];\n`;
  }
  for (const name of ext) {
    const t = tableMap[name];
    const pk = t.fields.filter((f) => f.pk || compositePk(t).includes(f.name));
    dot += `  ${name} [label=<<TABLE BORDER="1" CELLBORDER="0" CELLSPACING="0" CELLPADDING="3" COLOR="#a3afba">
      <TR><TD COLSPAN="3" BGCOLOR="#a3afba"><FONT COLOR="white" POINT-SIZE="10"><B>&nbsp;${name}&nbsp;&nbsp;&nbsp;</B></FONT></TD></TR>${pk.map((f) => row(f.name, f.name, baseType(f), 'PK', { bg: '#F5F7F9' })).join('')}</TABLE>>];\n`;
  }
  for (const r of rels) {
    const f = fieldOf(r.child, r.ccol);
    const nullable = !f.not_null && !f.pk && !compositePk(tableMap[r.child]).includes(r.ccol);
    const tail = nullable ? 'teeodot' : 'teetee';
    const head = r.oneToOne ? 'teeodot' : 'crowodot';
    if (leftOf && r.parent === leftOf.hub && leftOf.tables.includes(r.child)) {
      // 방향을 뒤집어 자식을 hub 왼쪽 열에 둔다 (끝 모양은 그대로: 자식 쪽 까마귀발, 부모 쪽 세로줄)
      dot += `  ${r.child}:${r.ccol}_o:e -> ${r.parent}:${r.pcol}_i:w [arrowtail=${head}, arrowhead=${tail}];\n`;
    } else {
      dot += `  ${r.parent}:${r.pcol}_o:e -> ${r.child}:${r.ccol}_i:w [arrowtail=${tail}, arrowhead=${head}];\n`;
    }
  }
  return { dot: dot + '}\n', ext };
}

// ERD SVG: 좌→우 / 위→아래 배치 중 W x H(pt) 영역에 더 크게 들어가는 쪽을 골라 크기를 맞춘다 (최대 1.15배 확대)
let VIZ = null;
async function initViz() { VIZ = await require('@viz-js/viz').instance(); }
// DOT 문자열 → SVG (전체 구조도 등 erDot을 쓰지 않는 도식용)
function dotSvg(dot, engine = 'dot') { return VIZ.renderString(dot, { format: 'svg', engine }).replace(/^[\s\S]*?(<svg)/, '$1'); }
function erSvg(ctx, tables, { hideAudit = false, W = 510, H = 600, leftOf = null } = {}) {
  const { dot, ext } = erDot(ctx, tables, { hideAudit, leftOf });
  let best = null;
  for (const dir of leftOf ? ['LR'] : ['LR', 'TB']) {
    const s = VIZ.renderString(dot.replace('rankdir=LR', `rankdir=${dir}`), { format: 'svg', engine: 'dot' }).replace(/^[\s\S]*?(<svg)/, '$1');
    const w0 = parseFloat(s.match(/width="([\d.]+)pt"/)[1]);
    const h0 = parseFloat(s.match(/height="([\d.]+)pt"/)[1]);
    const k0 = Math.min(1.15, W / w0, H / h0);
    if (!best || k0 > best.k) best = { svg: s, w: w0, h: h0, k: k0 };
  }
  const { w, h, k } = best;
  const svg = best.svg.replace(/width="[\d.]+pt"/, `width="${(w * k).toFixed(1)}pt"`).replace(/height="[\d.]+pt"/, `height="${(h * k).toFixed(1)}pt"`);
  return { svg: `<div class="gv">${svg}</div>`, ext };
}

// 영역(TableGroup)별 설명: 전체 설계서와 ERD 웹페이지 공용
const groupDesc = {
  member_basic: '회원 계정, 커뮤니티 프로필, 주거 정보, 배송지(가구 반입 경로 치수 포함). 거의 모든 영역이 member_account를 작성자·관리자로 참조한다.',
  member_terms_noti_style: '약관 버전과 동의 이력(마케팅 동의의 유일한 기준, 2년 재확인), 알림 수신 스위치, 인테리어 스타일 취향.',
  member_security: '로그인 이력, 1회용 토큰, 기기별 세션, 비밀번호 이력, 관리자 개인정보 접근 기록. 로그·세션은 보관 기간이 지나면 배치로 삭제.',
  member_lifecycle: '회원 상태(휴면·정지·탈퇴) 전환 이력, 닉네임 변경 이력, 닉네임·글 공용 금칙어, 탈퇴 후 30일 재가입 제한.',
  product_classification: '브랜드와 4단계 카테고리.',
  product_core: '상품 → 옵션 그룹 → 옵션 값 → SKU 구조와 이미지, 고시정보, 상품 문의.',
  product_notice_info: '상품정보제공고시 품목 유형(가구·침구·주방·가전)별 항목 마스터와 상품별 값.',
  product_delivery:'가구 배송 정책, 우편번호 → 권역 매핑, 권역별 배송 가능 여부·추가비, SKU 포장 박스.',
  product_link_history: '스타일·주거 조건 연결(맞춤 추천), 선호 브랜드, 재고 원장, 가격 이력, 재입고 알림 신청.',
  product_search_filter: '컬러 계열, 소재, 카테고리별 속성 필터와 검색 동의어.',
  product_composition_operation: '연관·세트 상품, 상품 상태 이력.',
  community_post: '공통 post와 유형별 상세(집들이·매거진), 사진, 블록 본문, 사진 속 상품 태그.',
  community_reaction: '스타일 분류, 댓글, 좋아요, 스크랩(글 저장 + 상품 찜).',
  community_operation: '신고와 앱 내 알림함.',
  order_cart: '회원·비회원 장바구니(로그인 시 합치기, 담은 가격·가격 인하 알림, 방별 묶음, 집들이·플랜 유입)와 인테리어 플랜(방·스타일·예산 + 후보 비교 → 장바구니로).',
  order_core: '주문(요약 상태·금액 스냅샷·이사일 함께 받기), 배송지 스냅샷(반입 경로 포함), 주문 상품(상품별 상태·할인 안분·설치 위치·유입 글), 상태 이력.',
  order_addon: '폐가구 수거·조립 같은 부가 서비스 마스터, 상품별 제공 서비스, 장바구니·주문 상품에서 고른 서비스(주문은 금액 스냅샷).',
  order_payment: 'PG 결제(카드·간편결제·실시간 계좌이체·가상계좌, 에스크로), 결제 취소·부분 환불(가상계좌는 환불 계좌), 현금영수증 발급·취소 이력.',
  order_delivery: '배송 묶음(배송비 내역·송장·설치 일정)과 권역별 설치 가능 슬롯.',
};

// ---------- HTML 머리말 / Mermaid 초기화 ----------
const head = (title) => `<!doctype html><html lang="ko"><head><meta charset="utf-8">
<title>${esc(title)}</title>
<style>${fs.readFileSync(path.join(__dirname, 'style.css'), 'utf8')}</style>
<script src="../node_modules/mermaid/dist/mermaid.min.js"></script>
</head><body>`;

const mermaidInit = `<script>
  mermaid.initialize({
    startOnLoad: false, securityLevel: 'loose', theme: 'base',
    themeVariables: {
      fontFamily: 'Malgun Gothic, sans-serif', fontSize: '13px',
      primaryColor: '#EEF4FA', primaryBorderColor: '#4A7FB5', primaryTextColor: '#1d2733',
      lineColor: '#6B7B8C', secondaryColor: '#F4F6F8', tertiaryColor: '#FFFFFF'
    },
    flowchart: { useMaxWidth: true, curve: 'basis', htmlLabels: true },
    state: { useMaxWidth: true }
  });
  mermaid.run({ querySelector: '.mermaid' }).then(() => { window.__done = true; })
    .catch((e) => { window.__err = String(e); window.__done = true; });
</script>`;

// ---------- HTML → PDF ----------
// name: 중간 HTML 파일 이름 (.build/<name>.html), footer: 페이지 하단 왼쪽 문구
async function renderPdf({ html, name, outPdf, footer, previewDir }) {
  fs.mkdirSync(path.join(__dirname, '.build'), { recursive: true });
  const htmlPath = path.join(__dirname, '.build', `${name}.html`);
  fs.writeFileSync(htmlPath, html, 'utf8');
  const browser = await puppeteer.launch({ executablePath: findChrome(), headless: true });
  const page = await browser.newPage();
  page.on('console', (m) => { if (m.type() === 'error') console.log('console:', m.text()); });
  await page.goto('file:///' + htmlPath.replace(/\\/g, '/'), { waitUntil: 'load' });
  await page.waitForFunction('window.__done === true', { timeout: 120000 });
  const err = await page.evaluate('window.__err');
  if (err) console.log('MERMAID ERROR:', err);
  const failed = await page.evaluate(() => [...document.querySelectorAll('.mermaid')].filter((e) => !e.querySelector('svg')).length);
  console.log('diagrams=', await page.evaluate(() => document.querySelectorAll('.mermaid svg').length), 'failed=', failed);
  await page.pdf({
    path: outPdf, format: 'A4', printBackground: true, preferCSSPageSize: true,
    displayHeaderFooter: true, headerTemplate: '<div></div>',
    footerTemplate: `<div style="width:100%;font-size:7.5px;color:#8795A1;font-family:Malgun Gothic;padding:0 12mm;display:flex;justify-content:space-between"><span>${esc(footer)}</span><span><span class="pageNumber"></span> / <span class="totalPages"></span></span></div>`,
  });
  if (previewDir) {
    // 미리보기: A4 본문 폭(약 703px)으로 표지·목차와 도식만 PNG로 캡처
    fs.mkdirSync(previewDir, { recursive: true });
    await page.emulateMediaType('print');
    await page.setViewport({ width: 703, height: 1000, deviceScaleFactor: 1 });
    await new Promise((r) => setTimeout(r, 500));
    let n = 0;
    for (const el of await page.$$('.cover, .toc, .fig, .sum-sheet, table.sum-tables, table.process')) await el.screenshot({ path: path.join(previewDir, `fig${String(n++).padStart(2, '0')}.png`) });
    console.log('previews', n);
  }
  await browser.close();
  if (failed) process.exitCode = 1;
  console.log('PDF', outPdf);
}

module.exports = { ROOT, esc, noteOf, mm, fig, load, AUDIT, initViz, erSvg, dotSvg, head, mermaidInit, renderPdf, groupDesc };
