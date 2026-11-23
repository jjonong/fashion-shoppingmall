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
// 테이블 제목줄 색 (렌더 후 pill()이 이 색의 사각형과 행 상자 테두리(#ddd)를 같은 둥글기의 rect로 바꾼다)
const PILL = '#2B2B2B', PILL_EXT = '#BDBDBD';
const RADIUS = 5; // 제목줄·행 상자 공통 모서리 둥글기 (사용자 요청: 살짝, 둘이 같게)
function pill(svg) {
  const box = (pts) => {
    const p = pts.trim().split(/\s+/).map((q) => q.split(',').map(Number));
    const xs = p.map((q) => q[0]), ys = p.map((q) => q[1]);
    const x = Math.min(...xs), y = Math.min(...ys);
    return `x="${x}" y="${y}" width="${Math.max(...xs) - x}" height="${Math.max(...ys) - y}" rx="${RADIUS}" ry="${RADIUS}"`;
  };
  return svg
    .replace(/<polygon fill="(#2b2b2b|#bdbdbd)" stroke="[^"]*" points="([^"]+)"\s*\/>/gi, (m, c, pts) => `<rect class="hd" fill="${c}" ${box(pts)}/>`)
    // 한글 제목이 Graphviz 계산상 위로 치우쳐 보여서, 제목줄 안 글자를 아래로 조금 내린다
    .replace(/(<rect class="hd"[^>]*height="([\d.]+)"[^>]*\/>)([\s\S]*?)(?=<polygon|<rect|<\/g>)/g, (m, r, h, rest) =>
      r + rest.replace(/<text([^>]*) y="([\d.-]+)"/g, (t, at, y) => `<text${at} y="${(+y + h * 0.08).toFixed(2)}"`))
    // 행 상자 테두리: 줄무늬 행 위에 그려지도록 맨 뒤(</g> 앞)로 옮긴다
    .replace(/<g id="([^"]*node[^"]*)" class="node">([\s\S]*?)<\/g>/g, (m, id, body) => {
      let border = '';
      body = body.replace(/<polygon fill="none" stroke="#dddddd" points="([^"]+)"\s*\/>/i, (mm, pts) => ((border = `<rect class="box" fill="none" stroke="#dddddd" ${box(pts)}/>`), ''));
      return `<g id="${id}" class="node">${body}${border}</g>`;
    });
}
function erDot(ctx, tables, { hideAudit = false, leftOf = null } = {}) {
  const { tableMap, refs, fieldOf, compositePk, baseType, keyFields, keyMark } = ctx;
  const inner = new Set(tables);
  const rels = refs.filter((r) => inner.has(r.child) && !(hideAudit && r.parent === 'member_account' && AUDIT.has(r.ccol)));
  const ext = [...new Set(rels.filter((r) => !inner.has(r.parent)).map((r) => r.parent))];
  const F = 'Malgun Gothic';
  let dot = `digraph G {
  graph [rankdir=LR, nodesep=0.28, ranksep=0.75, splines=spline, bgcolor="transparent", fontname="${F}", pad=0.1];
  node [shape=plain, fontname="${F}", fontsize=10];
  edge [color="#555555", penwidth=0.9, arrowsize=0.7, dir=both];\n`;
  // 제목줄 논리명 뒤 보정 (wide보다 작게: 물리명과 겹치지 않을 만큼만, 남는 폭은 물리명 뒤에)
  const gap = (s) => '&nbsp;'.repeat(Math.round(((s || '').match(/[^\x00-\x7f]/g) || []).length * 0.75));
  const xesc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  // Graphviz(viz.js)는 한글 폭을 실제보다 좁게 계산해 옆 칸과 겹치므로, 한글 글자 수만큼 공백을 덧붙여 칸 폭을 맞춘다
  const wide = (s) => '&nbsp;'.repeat(Math.ceil(((s || '').match(/[^\x00-\x7f]/g) || []).length * 1.4));
  // 구조 설계 단계라 논리명(한글)을 앞에 크게, 물리명은 뒤에 작은 회색 고정폭으로
  // 테이블 모양 (사용자 참고 이미지 docs/화면 캡처_erd.png): 검정 알약 모양 제목줄(논리명 굵게 + 물리명 작게),
  // 회색/흰색 줄무늬 행을 연회색(#ddd) 테두리 상자로 감싸고, 상자는 제목줄과 같은 가로 길이 (사용자 요청). 알약 모양은 렌더 후 pill()이 rect rx로 바꾼다
  const zebra = (i) => (i % 2 === 0 ? '#FFFFFF' : '#F5F5F5'); // 첫 행은 흰색 (사용자 요청)
  const row = (port, name, type, key, opts = {}) =>
    `<TR><TD PORT="${port}_i" ALIGN="LEFT" BGCOLOR="${opts.bg}"><FONT POINT-SIZE="9.5" COLOR="#111111">${opts.b ? '<B>' + xesc(opts.lg || name) + '</B>' : xesc(opts.lg || name)}${wide(opts.lg)}</FONT></TD>` +
    `<TD ALIGN="LEFT" BGCOLOR="${opts.bg}"><FONT FACE="Consolas" POINT-SIZE="8" COLOR="#9a9a9a">${name}</FONT></TD>` +
    `<TD ALIGN="LEFT" BGCOLOR="${opts.bg}"><FONT FACE="Consolas" POINT-SIZE="7.5" COLOR="#777777">${type}</FONT></TD>` +
    `<TD PORT="${port}_o" ALIGN="RIGHT" BGCOLOR="${opts.bg}"><FONT POINT-SIZE="8" COLOR="${key.includes('PK') ? '#000000' : '#777777'}"><B>${key}</B></FONT></TD></TR>`;
  const title = (t, name, bg, sub) =>
    `<TR><TD ALIGN="LEFT" BGCOLOR="${bg}" CELLPADDING="4"><FONT COLOR="white" POINT-SIZE="11">&nbsp;&nbsp;&nbsp;<B>${xesc(logicalOf(t.note) || name)}${gap(logicalOf(t.note))}</B></FONT><FONT COLOR="${sub}" POINT-SIZE="8.5">&nbsp;&nbsp;${name}${wide(logicalOf(t.note))}&nbsp;&nbsp;&nbsp;</FONT></TD></TR>`;
  // 제목행과 행 상자 사이 간격은 CELLSPACING으로 (빈 행은 Graphviz 최소 높이 때문에 너무 넓어짐, 사용자 요청으로 좁힘)
  const table = (head, rows) =>
    `<TABLE BORDER="0" CELLBORDER="0" CELLSPACING="2" CELLPADDING="0">${head}` +
    `<TR><TD><TABLE BORDER="1" COLOR="#DDDDDD" CELLBORDER="0" CELLSPACING="0" CELLPADDING="6">${rows}</TABLE></TD></TR></TABLE>`;
  const nodeDot = {};
  for (const name of inner) {
    const t = tableMap[name];
    const kf = keyFields(t);
    const others = t.fields.length - kf.length;
    let rows = kf.map((f, i) => row(f.name, f.name, baseType(f), keyMark(t, f).replace(/, /g, ' '), { b: keyMark(t, f).includes('PK'), bg: zebra(i), lg: logicalOf(f.note) })).join('');
    if (others > 0) rows += `<TR><TD COLSPAN="4" ALIGN="LEFT" BGCOLOR="${zebra(kf.length)}"><FONT POINT-SIZE="8" COLOR="#9a9a9a">+ ${others}개 컬럼 더 있음</FONT></TD></TR>`;
    nodeDot[name] = `  ${name} [label=<${table(title(t, name, PILL, '#bdbdbd'), rows)}>];\n`;
  }
  dot += Object.values(nodeDot).join('');
  for (const name of ext) {
    const t = tableMap[name];
    const pk = t.fields.filter((f) => f.pk || compositePk(t).includes(f.name));
    dot += `  ${name} [label=<${table(title(t, name, PILL_EXT, '#f2f2f2'), pk.map((f, i) => row(f.name, f.name, baseType(f), 'PK', { bg: zebra(i), lg: logicalOf(f.note) })).join(''))}>];\n`;
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
    const s = pill(VIZ.renderString(dot.replace('rankdir=LR', `rankdir=${dir}`), { format: 'svg', engine: 'dot' }).replace(/^[\s\S]*?(<svg)/, '$1'));
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
  const cand = clusters.map((c, i) => {
    const { dot, ext: e } = erDot(ctx, c.tables, { hideAudit });
    e.filter((t) => !all.has(t)).forEach((t) => ext.add(t));
    // 각 묶음은 좌→우 / 위→아래 두 가지로 그려 두고, 아래에서 상자 배치와 함께 고른다
    const cands = ['LR', 'TB'].map((dir) => {
      const s = pill(VIZ.renderString(dot.replace('rankdir=LR', `rankdir=${dir}`), { format: 'svg', engine: 'dot' }).replace(/^[\s\S]*?(<svg)/, '$1'));
      const w = parseFloat(s.match(/width="([\d.]+)pt"/)[1]);
      const h = parseFloat(s.match(/height="([\d.]+)pt"/)[1]);
      // 묶음마다 id 접두사를 달아 겹치지 않게 하고, 바깥 svg 안에 넣을 수 있도록 크기 속성을 뺀다
      const inner = s
        .replace(/ id="/g, ` id="c${i}_`)
        // data-cluster: 웹페이지 드래그 배치의 노드 키(묶음/테이블), overflow: 상자 밖으로 끌어도 잘리지 않게
        .replace(/<svg[^>]*?(viewBox="[^"]+")[^>]*>/, (m, vb) => `<svg ${vb} data-cluster="${c.name}" overflow="visible" @XYWH@>`);
      return { c, inner, w: w + PAD * 2, h: h + PAD * 2 + LABEL };
    });
    return cands;
  });
  // 묶음별 방향(좌→우/위→아래) 조합 × 열 수 중 W x H 화면에 가장 크게 들어가는 배치.
  // 크기가 비슷하면(5% 이내) 상자를 가로로 더 많이 늘어놓는 쪽 (사용자 요청: 세로로 길어지지 않게)
  let best = null;
  for (let m = 0; m < 1 << cand.length; m++) {
    const ps = cand.map((cs, i) => cs[(m >> i) & 1]);
    const g = gridPlace(ps, { W, H, GAP });
    const k = Math.min(W / g.tw, H / g.th);
    if (!best || k > best.k * 1.05 || (k > best.k * 0.95 && g.th < best.g.th)) best = { ps, g, k };
  }
  const parts = best.ps;
  const { pos, tw, th } = best.g;
  let body = '';
  parts.forEach((p, i) => {
    const { x, y } = pos[i];
    const iw = p.w - PAD * 2, ih = p.h - PAD * 2 - LABEL;
    body += `<g class="cluster"><title>cluster_${p.c.name}</title>
<rect x="${x}" y="${y}" width="${p.w}" height="${p.h}" fill="none" stroke="#cccccc" stroke-width="1"/>
<text x="${x + PAD}" y="${y + 17}" font-family="Malgun Gothic" font-size="13" font-weight="700" fill="#111111">${p.c.label}</text></g>
${p.inner.replace('@XYWH@', `x="${x + PAD}" y="${y + PAD + LABEL}" width="${iw}" height="${ih}"`)}\n`;
  });
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${tw.toFixed(1)}pt" height="${th.toFixed(1)}pt" viewBox="0 0 ${tw.toFixed(1)} ${th.toFixed(1)}">\n${body}</svg>`;
  return { svg, ext: [...ext] };
}

// 영역: TableGroup 이름 접두사로 구분 (쇼핑 흐름 순서). 전체 설계서와 ERD 웹페이지 공용
// color/fill은 ERD 웹페이지 전체 구조도 색 (화면 CSS --s1~--s8과 같은 순서)
// 테이블이 아직 없는 영역은 ERD 웹페이지·draw.io에서 건너뛴다
const AREAS = [
  { prefix: 'member', name: '고객', color: '#111111', fill: '#F7F7F7', desc: '회원 · 소셜 연동 · 체형 · 배송지' },
  { prefix: 'brand', name: '브랜드', color: '#555555', fill: '#F7F7F7', desc: '입점 브랜드 · 브랜드 관리자 · 브랜드 좋아요' },
  { prefix: 'product', name: '상품', color: '#999999', fill: '#F7F7F7', desc: '카테고리 · 사이즈 · 컬러 · SKU · 재고' },
];
const areaOf = (groupName) => AREAS.find((a) => groupName.startsWith(a.prefix + '_'));

// 영역(TableGroup)별 설명: 전체 설계서와 ERD 웹페이지 공용
const groupDesc = {
  member_basic: '구매 고객 계정(본인인증 필수·프로필·가입 수단/경로·상태), 로그인 상태(마지막 로그인·로그인 잠금·휴면 안내, 1:1), 소셜 계정 연동(제공자별 1개), 체형(사이즈 추천·비슷한 체형 리뷰), 배송지(기본 배송지 1개), 환불 계좌(1:1), 탈퇴 정보(사유·의견, 1:1).',
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
