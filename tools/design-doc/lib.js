// 설계서 생성 공통 모듈: DBML 로드, Graphviz ERD, Mermaid/PDF 출력
// build.js(전체 설계서)와 summary.js(영역 요약본)가 함께 쓴다.
const fs = require('fs');
const path = require('path');
const { Parser } = require('@dbml/core');
const puppeteer = require('puppeteer-core');

const ROOT = path.resolve(__dirname, '..', '..');
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
// note 앞의 [논리명]: 테이블·컬럼의 한글 이름. noteOf는 논리명을 뺀 설명, logicalOf는 논리명
const rawNote = (n) => (n && typeof n === 'object' ? n.value : n) || '';
const LOGICAL = /^\[([^\]]+)\]\s*/;
const noteOf = (n) => rawNote(n).replace(LOGICAL, '');
const logicalOf = (n) => (rawNote(n).match(LOGICAL) || [])[1] || '';
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
  const xesc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  // Graphviz(viz.js)는 한글 폭을 실제보다 좁게 계산해 옆 칸과 겹치므로, 한글 글자 수만큼 공백을 덧붙여 칸 폭을 맞춘다
  const wide = (s) => '&nbsp;'.repeat(Math.ceil(((s || '').match(/[^\x00-\x7f]/g) || []).length * 1.4));
  // 구조 설계 단계라 논리명(한글)을 앞에 크게, 물리명은 뒤에 작은 회색 고정폭으로
  const row = (port, name, type, key, opts = {}) =>
    `<TR><TD PORT="${port}_i" ALIGN="LEFT" BGCOLOR="${opts.bg || 'white'}"><FONT POINT-SIZE="9.5" COLOR="#1f2d3a">${opts.b ? '<B>' + xesc(opts.lg || name) + '</B>' : xesc(opts.lg || name)}${wide(opts.lg)}</FONT></TD>` +
    `<TD ALIGN="LEFT" BGCOLOR="${opts.bg || 'white'}"><FONT FACE="Consolas" POINT-SIZE="8" COLOR="#7d8a96">${name}</FONT></TD>` +
    `<TD ALIGN="LEFT" BGCOLOR="${opts.bg || 'white'}"><FONT FACE="Consolas" POINT-SIZE="8" COLOR="#5d6d7e">${type}</FONT></TD>` +
    `<TD PORT="${port}_o" BGCOLOR="${opts.bg || 'white'}"><FONT POINT-SIZE="8" COLOR="${key.includes('PK') ? '#B8860B' : '#2f6496'}"><B>${key}</B></FONT></TD></TR>`;
  const nodeDot = {};
  for (const name of inner) {
    const t = tableMap[name];
    const kf = keyFields(t);
    const others = t.fields.length - kf.length;
    let rows = kf.map((f) => row(f.name, f.name, baseType(f), keyMark(t, f).replace(/, /g, ' '), { b: keyMark(t, f).includes('PK'), bg: keyMark(t, f).includes('PK') ? '#FBF6E9' : 'white', lg: logicalOf(f.note) })).join('');
    if (others > 0) rows += `<TR><TD COLSPAN="4" ALIGN="LEFT" BGCOLOR="#F5F8FB"><FONT POINT-SIZE="8" COLOR="#8795A1">+ ${others} columns</FONT></TD></TR>`;
    nodeDot[name] = `  ${name} [label=<<TABLE BORDER="1" CELLBORDER="0" CELLSPACING="0" CELLPADDING="3" COLOR="#2f6496">
      <TR><TD COLSPAN="4" BGCOLOR="#2f6496"><FONT COLOR="white" POINT-SIZE="11"><B>&nbsp;${xesc(logicalOf(t.note) || name)}${wide(logicalOf(t.note))}</B></FONT><FONT FACE="Consolas" COLOR="#c9d9ea" POINT-SIZE="8.5">&nbsp;${name}&nbsp;</FONT></TD></TR>${rows}</TABLE>>];\n`;
  }
  dot += Object.values(nodeDot).join('');
  for (const name of ext) {
    const t = tableMap[name];
    const pk = t.fields.filter((f) => f.pk || compositePk(t).includes(f.name));
    dot += `  ${name} [label=<<TABLE BORDER="1" CELLBORDER="0" CELLSPACING="0" CELLPADDING="3" COLOR="#a3afba">
      <TR><TD COLSPAN="4" BGCOLOR="#a3afba"><FONT COLOR="white" POINT-SIZE="10.5"><B>&nbsp;${xesc(logicalOf(t.note) || name)}${wide(logicalOf(t.note))}</B></FONT><FONT FACE="Consolas" COLOR="#eef2f6" POINT-SIZE="8.5">&nbsp;${name}&nbsp;</FONT></TD></TR>${pk.map((f) => row(f.name, f.name, baseType(f), 'PK', { bg: '#F5F7F9', lg: logicalOf(f.note) })).join('')}</TABLE>>];\n`;
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

// 영역 전체 ERD: 세부 영역(TableGroup)마다 따로 그린 ERD를 상자에 담아 격자로 배치한다.
// 한 장의 Graphviz 그래프로 그리면 member_account 같은 허브의 자식이 한 줄에 몰려 세로로 아주 길어지므로,
// 세부 영역 사이의 관계는 각 상자 안의 회색 참조 테이블(PK만)로 보여 준다 (세부 영역 ERD와 같은 방식).
// 상자 여러 개(parts: [{w, h}])를 순서대로 격자에 놓는다. 열 수 1~5개 중 W x H 비율에 가장 크게 들어가는 쪽
// 반환: 각 상자의 왼쪽 위 좌표 pos[i] = {x, y}, 전체 크기 tw x th (영역 전체 ERD와 draw.io 파일 공용)
function gridPlace(parts, { W = 1100, H = 680, GAP = 18 } = {}) {
  let best = null;
  for (let n = 1; n <= Math.min(5, parts.length); n++) {
    const colW = Array(n).fill(0);
    parts.forEach((p, i) => (colW[i % n] = Math.max(colW[i % n], p.w)));
    const rows = [];
    parts.forEach((p, i) => { const r = Math.floor(i / n); rows[r] = Math.max(rows[r] || 0, p.h); });
    const tw = colW.reduce((a, b) => a + b, 0) + GAP * (n - 1);
    const th = rows.reduce((a, b) => a + b, 0) + GAP * (rows.length - 1);
    const k = Math.min(W / tw, H / th);
    if (!best || k > best.k) best = { n, colW, rows, tw, th, k };
  }
  const { n, colW, rows, tw, th } = best;
  const pos = parts.map((p, i) => {
    const col = i % n, row = Math.floor(i / n);
    return {
      x: colW.slice(0, col).reduce((a, b) => a + b, 0) + GAP * col,
      y: rows.slice(0, row).reduce((a, b) => a + b, 0) + GAP * row,
    };
  });
  return { pos, tw, th };
}

// clusters: [{ name, label, tables }], W x H(pt) 화면 비율에 가장 크게 들어가는 열 수를 고른다
function areaSvg(ctx, clusters, { hideAudit = false, W = 1100, H = 680 } = {}) {
  const PAD = 12, LABEL = 22, GAP = 18;
  const ext = new Set();
  const all = new Set(clusters.flatMap((c) => c.tables));
  const parts = clusters.map((c, i) => {
    const { dot, ext: e } = erDot(ctx, c.tables, { hideAudit });
    e.filter((t) => !all.has(t)).forEach((t) => ext.add(t));
    // 각 묶음은 좌→우 / 위→아래 중 덜 길쭉한 쪽
    let best = null;
    for (const dir of ['LR', 'TB']) {
      const s = VIZ.renderString(dot.replace('rankdir=LR', `rankdir=${dir}`), { format: 'svg', engine: 'dot' }).replace(/^[\s\S]*?(<svg)/, '$1');
      const w = parseFloat(s.match(/width="([\d.]+)pt"/)[1]);
      const h = parseFloat(s.match(/height="([\d.]+)pt"/)[1]);
      const score = Math.max(w / h, h / w);
      if (!best || score < best.score) best = { s, w, h, score };
    }
    // 묶음마다 id 접두사를 달아 겹치지 않게 하고, 바깥 svg 안에 넣을 수 있도록 크기 속성을 뺀다
    const inner = best.s
      .replace(/ id="/g, ` id="c${i}_`)
      // data-cluster: 웹페이지 드래그 배치의 노드 키(묶음/테이블), overflow: 상자 밖으로 끌어도 잘리지 않게
      .replace(/<svg[^>]*?(viewBox="[^"]+")[^>]*>/, (m, vb) => `<svg ${vb} data-cluster="${c.name}" overflow="visible" @XYWH@>`);
    return { c, inner, w: best.w + PAD * 2, h: best.h + PAD * 2 + LABEL };
  });
  const { pos, tw, th } = gridPlace(parts, { W, H, GAP });
  let body = '';
  parts.forEach((p, i) => {
    const { x, y } = pos[i];
    const iw = p.w - PAD * 2, ih = p.h - PAD * 2 - LABEL;
    body += `<g class="cluster"><title>cluster_${p.c.name}</title>
<rect x="${x}" y="${y}" width="${p.w}" height="${p.h}" rx="8" fill="none" stroke="#b9c7d6" stroke-width="1.2"/>
<text x="${x + PAD}" y="${y + 17}" font-family="Malgun Gothic" font-size="13" fill="#2f6496">${p.c.label}</text></g>
${p.inner.replace('@XYWH@', `x="${x + PAD}" y="${y + PAD + LABEL}" width="${iw}" height="${ih}"`)}\n`;
  });
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${tw.toFixed(1)}pt" height="${th.toFixed(1)}pt" viewBox="0 0 ${tw.toFixed(1)} ${th.toFixed(1)}">\n${body}</svg>`;
  return { svg, ext: [...ext] };
}

// 영역 7개: TableGroup 이름 접두사로 구분 (쇼핑 흐름 순서). 전체 설계서와 ERD 웹페이지 공용
// color/fill은 ERD 웹페이지 전체 구조도 색 (화면 CSS --s1~--s7과 같은 순서)
const AREAS = [
  { prefix: 'member', name: '고객', color: '#2f8f6b', fill: '#EEF7F2', desc: '회원 · 프로필 · 주거정보 · 약관 · 보안 · 상태' },
  { prefix: 'product', name: '상품', color: '#2f6496', fill: '#EDF3F9', desc: '옵션 · SKU · 포장 · 재고 · 필터 · 조립식' },
  { prefix: 'community', name: '커뮤니티', color: '#b5562f', fill: '#FBF1EC', desc: '고객 집사진 · 집들이 · 브랜드 매거진' },
  { prefix: 'cart', name: '장바구니', color: '#a67c00', fill: '#FBF6E6', desc: '회원·비회원 장바구니 · 인테리어 플랜' },
  { prefix: 'order', name: '주문', color: '#7a5bb5', fill: '#F3EFFA', desc: '주문 · 주문 상품 상태 · 부품 요청' },
  { prefix: 'payment', name: '결제', color: '#b5407a', fill: '#FBEFF5', desc: 'PG 결제 · 부분 환불 · 현금영수증' },
  { prefix: 'delivery', name: '배송', color: '#2b8a94', fill: '#EAF6F7', desc: '배송 정책 · 권역 · 반입 · 배송 묶음 · 설치 일정' },
  { prefix: 'benefit', name: '혜택', color: '#c0392b', fill: '#FCEEEC', desc: '쿠폰(상품 · 주문 · 배송비) · 커뮤니티 활동 보상' },
];
const areaOf = (groupName) => AREAS.find((a) => groupName.startsWith(a.prefix + '_'));

// 영역(TableGroup)별 설명: 전체 설계서와 ERD 웹페이지 공용
const groupDesc = {
  member_basic: '회원 계정, 커뮤니티 프로필, 주거 정보, 배송지(가구 반입 경로 치수 포함). 거의 모든 영역이 member_account를 작성자·관리자로 참조한다.',
  member_terms_noti_style: '약관 버전과 동의 이력(마케팅 동의의 유일한 기준, 2년 재확인), 알림 수신 스위치, 인테리어 스타일 취향.',
  member_security: '로그인 이력, 1회용 토큰, 기기별 세션, 비밀번호 이력, 관리자 개인정보 접근 기록. 로그·세션은 보관 기간이 지나면 배치로 삭제.',
  member_lifecycle: '회원 상태(휴면·정지·탈퇴) 전환 이력, 닉네임 변경 이력, 닉네임·글 공용 금칙어, 탈퇴 후 30일 재가입 제한.',
  product_classification: '4단계 카테고리(URL 코드, 상품 등록 시 미리 채우는 기본 고시 유형·기본 배송 정책). 자사 브랜드만 판매하므로 브랜드 구분 없음.',
  product_core: '상품 → 옵션 그룹 → 옵션 값 → SKU 구조, SKU 포장 박스(화물 운임·반입 판단 근거), 이미지, 상품 문의.',
  product_notice_info: '상품정보제공고시 품목 유형(가구·침구·주방·가전)별 항목 마스터와 상품별 값.',
  product_link_history: '스타일·주거 조건 연결(맞춤 추천), 재고 원장, 가격 이력, 재입고 알림 신청.',
  product_search_filter: '컬러 계열, 소재, 카테고리별 속성 필터와 검색 동의어.',
  product_composition_operation: '연관·세트 상품, 상품 상태 이력.',
  product_assembly: '조립식 상품의 부품 목록(설명서 표기·단품 구매 가능 여부)과 단계별 조립 설명서(단계마다 쓰는 부품).',
  community_post: '공통 post와 유형별 상세(집들이·매거진), 사진, 블록 본문, 사진 속 상품 태그.',
  community_reaction: '스타일 분류, 댓글, 좋아요, 스크랩(글 저장 + 상품 찜).',
  community_operation: '신고와 앱 내 알림함.',
  cart_core: '회원·비회원 장바구니(로그인 시 합치기, 담은 가격·가격 인하 알림, 방별 묶음, 집들이·플랜 유입).',
  cart_plan: '인테리어 플랜(방·스타일·예산 보드)과 후보 상품(CANDIDATE 비교 → CHOSEN 확정 → 장바구니로).',
  order_core: '주문(요약 상태·금액 스냅샷·이사일 함께 받기), 배송지 스냅샷(반입 경로 포함), 주문 상품(상품별 상태·할인 안분·설치 위치·유입 글), 상태 이력.',
  order_part: '구매한 조립식 상품의 누락·파손 부품 무료 요청과 부품 추가 구매.',
  payment_core: 'PG 결제(카드·간편결제·실시간 계좌이체·가상계좌, 에스크로), 결제 취소·부분 환불(가상계좌는 환불 계좌), 현금영수증 발급·취소 이력.',
  delivery_policy: '가구 배송 정책(택배·화물·설치배송, 사다리차·계단 현장 추가 비용 안내), 우편번호 → 권역 매핑, 권역별 배송 가능 여부·추가비, 주거형태별 반입 기본값.',
  delivery_shipment: '배송 묶음(배송비 내역·송장·반입 확인·설치 일정)과 권역별 설치 가능 슬롯.',
  benefit_coupon: '쿠폰 정의(상품·주문·배송비 쿠폰, 정액·정률, 발급 방식·기간·한도), 상품 쿠폰 적용 대상(상품·카테고리, 제외 지정), 코드 입력용 공용·1회용 코드.',
  benefit_member_coupon: '회원 쿠폰함(발급 경로·사용 기간·상태, 커뮤니티 보상 근거 글)과 주문별 쿠폰 사용 내역(주문 상품·배송 묶음 적용, 전체 취소 시 복원).',
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
// name: 중간 HTML 파일 이름 (.build/<name>.html), footer: 페이지 하단 왼쪽 문구 (생략 시 바닥글 없음)
// 용지 크기·방향은 각 문서 CSS의 @page를 따른다 (preferCSSPageSize)
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
    // footer가 없으면(발표 자료) 머리글·바닥글 없이 페이지 여백 0으로 출력
    displayHeaderFooter: !!footer, headerTemplate: '<div></div>',
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

module.exports = { ROOT, esc, noteOf, logicalOf, areaSvg, gridPlace, mm, fig, load, AUDIT, initViz, erSvg, dotSvg, head, mermaidInit, renderPdf, groupDesc, AREAS, areaOf };
