// docs/erd.dbml → 도식 포함 설계서 PDF (A4 세로 전용)
// - ERD: Graphviz(@viz-js/viz), 흐름도/상태도: Mermaid, PDF 출력: puppeteer-core + 로컬 Chrome
// 사용: npm run pdf                      (기본: ../../docs/erd.dbml → ../../docs/DB_설계서.pdf)
//       node build.js <in.dbml> <out.pdf> [미리보기 PNG 폴더]
// Chrome 경로가 다르면 환경변수 CHROME_PATH로 지정
const fs = require('fs');
const path = require('path');
const { Parser } = require('@dbml/core');
const puppeteer = require('puppeteer-core');

const ROOT = path.resolve(__dirname, '..', '..');
const src = process.argv[2] || path.join(ROOT, 'docs', 'erd.dbml');
const outPdf = process.argv[3] || path.join(ROOT, 'docs', 'DB_설계서.pdf');
const previewDir = process.argv[4];
const CHROME = process.env.CHROME_PATH || [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
].find((p) => fs.existsSync(p));
if (!CHROME) { console.error('Chrome/Edge를 찾지 못했습니다. CHROME_PATH 환경변수로 경로를 지정하세요.'); process.exit(1); }
const db = new Parser().parse(fs.readFileSync(src, 'utf8'), 'dbmlv2');
const S = db.schemas[0];

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const noteOf = (n) => (n && typeof n === 'object' ? n.value : n) || '';
const tableMap = Object.fromEntries(S.tables.map((t) => [t.name, t]));
const groups = S.tableGroups;
const groupOf = {};
groups.forEach((g) => g.tables.forEach((t) => (groupOf[t.name] = g.name)));

// ---------- 관계 정규화 ----------
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

// ---------- ERD 공통 ----------
const baseType = (f) => f.type.type_name.replace(/\(.*\)/, '').toUpperCase();
function keyFields(t) {
  const cpk = compositePk(t);
  return t.fields.filter((f) => f.pk || cpk.includes(f.name) || f.unique || fk[`${t.name}.${f.name}`]);
}
function keyMark(t, f) {
  const cpk = compositePk(t);
  const k = [];
  if (f.pk || cpk.includes(f.name)) k.push('PK');
  if (fk[`${t.name}.${f.name}`]) k.push('FK');
  if (f.unique) k.push('UK');
  return k.join(', ');
}
// 관리자·처리자 감사 컬럼 → member_account 관계선은 ERD에서 생략 (명세 표에는 FK로 표시)
const AUDIT = new Set(['created_by', 'updated_by', 'changed_by', 'answered_by', 'handled_by', 'reviewer_id', 'requested_by']);
// ---------- 전체 구조도 (HTML 카드 + 영역 간 연결 표) ----------
const gTitle = (g) => noteOf(g.note).replace(/^[^-]+- /, '');
function overview() {
  const stages = [['member', '1단계 고객', 's1'], ['product', '2단계 상품', 's2'], ['community', '3단계 커뮤니티', 's3']];
  const cols = stages.map(([p, name, cls]) => {
    const gs = groups.filter((g) => g.name.startsWith(p));
    const n = gs.reduce((a, g) => a + g.tables.length, 0);
    return `<div class="ov-col ${cls}"><div class="ov-head">${name}<span>${n}개</span></div>
      ${gs.map((g) => `<div class="ov-card"><b>${esc(gTitle(g))}</b><div class="chips">${g.tables.map((t) => `<span>${t.name}</span>`).join('')}</div></div>`).join('')}
    </div>`;
  }).join('<div class="ov-arrow">⇄</div>');
  const agg = {};
  refs.forEach((r) => {
    const a = groupOf[r.child], b = groupOf[r.parent];
    if (a === b || b === 'member_basic') return; // member_account 참조는 거의 전 영역이라 생략
    const k = `${a}|${b}`;
    (agg[k] ||= new Set()).add(`${r.child}.${r.ccol} → ${r.parent}`);
  });
  const gByName = Object.fromEntries(groups.map((g) => [g.name, g]));
  const rows = Object.entries(agg).map(([k, set]) => {
    const [a, b] = k.split('|');
    return `<tr><td>${esc(noteOf(gByName[a].note))}</td><td class="arr">→</td><td>${esc(noteOf(gByName[b].note))}</td><td class="mono">${[...set].join('<br>')}</td></tr>`;
  }).join('');
  return `<div class="ov">${cols}</div>
    <h3>영역 간 연결</h3>
    <table class="ov-links"><tr><th>참조하는 영역</th><th></th><th>참조되는 영역</th><th>FK</th></tr>${rows}</table>`;
}

// ---------- 테이블 명세 ----------
function fmtDefault(d) {
  if (!d) return '';
  return d.type === 'expression' ? d.value : d.type === 'string' ? `'${d.value}'` : String(d.value);
}
function tableHtml(t, no) {
  const cpk = compositePk(t);
  const rows = t.fields.map((f) => {
    const keys = [];
    if (f.pk || cpk.includes(f.name)) keys.push('<span class="k pk">PK</span>');
    if (fk[`${t.name}.${f.name}`]) keys.push('<span class="k fk">FK</span>');
    if (f.unique) keys.push('<span class="k uk">UK</span>');
    const ref = fk[`${t.name}.${f.name}`];
    let note = esc(noteOf(f.note));
    if (ref) note = `<span class="ref">→ ${esc(ref)}</span>${note ? '<br>' + note : ''}`;
    if (f.increment) note = `<span class="ref">AUTO_INCREMENT</span>${note ? '<br>' + note : ''}`;
    return `<tr><td class="c">${f.name}</td><td class="t">${esc(f.type.type_name).toUpperCase()}</td>
      <td class="kc">${keys.join(' ')}</td><td class="nn">${f.not_null || f.pk || cpk.includes(f.name) ? 'Y' : ''}</td>
      <td class="d">${esc(fmtDefault(f.dbdefault))}</td><td>${note}</td></tr>`;
  }).join('');
  const idx = (t.indexes || []).filter((i) => !i.pk).map((i) =>
    `<li><code>${esc(i.name || '')}</code> ${i.unique ? '<b>UNIQUE</b> ' : ''}(${esc(i.columns.map((c) => c.value).join(', '))})${i.note ? ' — ' + esc(noteOf(i.note)) : ''}</li>`).join('');
  const pkLine = cpk.length > 1 ? `<li><b>복합 PK</b> (${cpk.join(', ')})</li>` : '';
  return `<section class="tbl"><h4><span class="no">${no}</span>${t.name}</h4>
    <p class="tnote">${esc(noteOf(t.note))}</p>
    <table class="cols"><thead><tr><th>컬럼</th><th>타입</th><th>키</th><th>NN</th><th>기본값</th><th>설명</th></tr></thead><tbody>${rows}</tbody></table>
    ${pkLine || idx ? `<ul class="idx">${pkLine}${idx}</ul>` : ''}</section>`;
}

// ---------- 조립 ----------
const mm = (code, cls = '') => `<pre class="mermaid ${cls}">${esc(code)}</pre>`;
const fig = (title, body, caption = '') =>
  `<figure class="fig"><figcaption><b>${title}</b>${caption ? ' — ' + caption : ''}</figcaption>${body}</figure>`;

const groupDesc = {
  member_basic: '회원 계정, 커뮤니티 프로필, 주거 정보, 배송지. 거의 모든 영역이 member_account를 작성자·관리자로 참조한다.',
  member_terms_noti_style: '약관 버전과 동의 이력, 알림 수신 설정, 인테리어 스타일 취향.',
  member_security: '로그인 이력, 1회용 토큰, 기기별 세션, 비밀번호 이력, 관리자 개인정보 접근 기록.',
  product_classification: '브랜드, 4단계 카테고리, 가구 배송 정책.',
  product_core: '상품 → 옵션 그룹 → 옵션 값 → SKU 구조와 이미지, 고시정보, 상품 문의.',
  product_link_history: '스타일·선호 브랜드 연결, 재고 원장, 가격 이력.',
  product_search_filter: '컬러 계열, 소재, 카테고리별 속성 필터와 검색 동의어·키워드·로그.',
  product_composition_operation: '연관·세트 상품, 상품 검수와 상태 이력, 창고별 실물 재고.',
  community_post: '공통 post와 유형별 상세, 사진, 블록 본문, 사진 속 상품 태그.',
  community_reaction: '스타일·해시태그 분류, 댓글, 좋아요, 스크랩북.',
  community_operation: '팔로우, 차단, 신고, 앱 내 알림함.',
};

// ---------- Graphviz ERD (컬럼 단위 연결, 까마귀발 표기) ----------
let VIZ = null;
function erDot(g) {
  const inner = new Set(g.tables.map((x) => x.name));
  const rels = refs.filter((r) => inner.has(r.child) && !(r.parent === 'member_account' && AUDIT.has(r.ccol) && !g.name.startsWith('member')));
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
    dot += `  ${r.parent}:${r.pcol}_o:e -> ${r.child}:${r.ccol}_i:w [arrowtail=${tail}, arrowhead=${head}];\n`;
  }
  return { dot: dot + '}\n', ext };
}

function erSection(g) {
  const { dot, ext } = erDot(g);
  // 세로 A4 본문(약 510pt x 600pt)에 맞춰, 좌→우 / 위→아래 배치 중 더 크게 들어가는 쪽을 선택
  const W = 510, H = 600;
  let best = null;
  for (const dir of ['LR', 'TB']) {
    const s = VIZ.renderString(dot.replace('rankdir=LR', `rankdir=${dir}`), { format: 'svg', engine: 'dot' }).replace(/^[\s\S]*?(<svg)/, '$1');
    const w0 = parseFloat(s.match(/width="([\d.]+)pt"/)[1]);
    const h0 = parseFloat(s.match(/height="([\d.]+)pt"/)[1]);
    const k0 = Math.min(1.15, W / w0, H / h0);
    if (!best || k0 > best.k) best = { svg: s, w: w0, h: h0, k: k0 };
  }
  let { svg, w, h, k } = best;
  svg = svg.replace(/width="[\d.]+pt"/, `width="${(w * k).toFixed(1)}pt"`).replace(/height="[\d.]+pt"/, `height="${(h * k).toFixed(1)}pt"`);
  return `<section class="erd-page">
    <h3>ERD · ${esc(noteOf(g.note))} <small>${g.tables.length}개</small></h3>
    <p class="gdesc">${groupDesc[g.name] || ''}</p>
    ${fig('ERD', `<div class="gv">${svg}</div>`, `키 컬럼(PK·FK·UK)만 표시, 전체 컬럼은 7장 명세 참고${ext.length ? ` · 다른 영역 테이블(PK만 표시): ${ext.join(', ')}` : ''}${g.name.startsWith('member') ? '' : ' · 관리자 감사 컬럼(created_by 등) → member_account 선은 생략'}`)}
  </section>`;
}
const erOf = (prefix) => groups.filter((g) => g.name.startsWith(prefix)).map(erSection).join('');

const D = {
  login: `flowchart TD
  A["로그인 시도"] --> B{"계정 존재?"}
  B -- 없음 --> F1["FAIL_NOT_FOUND"]
  B -- 있음 --> C{"locked_until<br/>지났나?"}
  C -- 잠김 --> F2["FAIL_LOCKED"]
  C -- 지남 --> D{"비밀번호<br/>bcrypt 일치?"}
  D -- 불일치 --> E["login_fail_count + 1<br/>5회면 30분 잠금"] --> F3["FAIL_PASSWORD"]
  D -- 일치 --> G["실패 횟수 초기화<br/>member_session 발급"] --> OK["SUCCESS"]
  F1 & F2 & F3 & OK -.-> H[("login_history")]
  classDef bad fill:#FDECEC,stroke:#C0392B,color:#7b1d14
  classDef good fill:#EAF7EF,stroke:#3C9A63,color:#1d5a37
  class F1,F2,F3 bad
  class OK good`,
  withdraw: `flowchart TB
  W(["탈퇴 요청"]) --> M["member_account 마스킹<br/>email → withdrawn_ID 마스킹 주소<br/>(도메인 deleted.local)<br/>name → 탈퇴회원<br/>PHONE · BIRTH · CI · DI → NULL"]
  W --> X["행 삭제<br/>member_home · address<br/>member_social · member_session"]
  W --> C["커뮤니티<br/>글 → HIDDEN<br/>댓글 작성자 → 탈퇴한 회원"]
  W --> K["기록 유지<br/>status = WITHDRAWN<br/>withdrawn_at · 사유"]`,
  option: `flowchart LR
  P["<b>product</b><br/>원목 수납 침대 프레임"]
  P --> G1["<b>OPTION_GROUP</b><br/>색상"]
  P --> G2["<b>OPTION_GROUP</b><br/>사이즈"]
  G1 --> V1(["화이트오크 · 11"])
  G1 --> V2(["월넛 · 12"])
  G2 --> V3(["SS · 21"])
  G2 --> V4(["Q · 22 · +50,000원"])
  V1 & V3 -.-> S1["<b>SKU</b> 11-21<br/>재고 8"]
  V1 & V4 -.-> S2["<b>SKU</b> 11-22<br/>재고 3"]
  V2 & V3 -.-> S3["<b>SKU</b> 12-21<br/>재고 0 · 품절"]
  V2 & V4 -.-> S4["<b>SKU</b> 12-22<br/>재고 5"]
  classDef sku fill:#FFF3E3,stroke:#D98A2B,color:#1d2733
  classDef val fill:#F4F6F8,stroke:#8795A1,color:#1d2733
  class S1,S2,S3,S4 sku
  class V1,V2,V3,V4 val`,
  stock: `flowchart LR
  IN(["입고"]) --> INV["<b>sku_inventory</b><br/>창고별 실물 재고<br/>적재 위치 A-03-2"]
  INV -->|"검수 통과분 반영"| STK["<b>product_sku.stock</b><br/>판매 가능 재고"]
  ORD(["주문"]) -->|"WHERE stock >= :qty<br/>0건이면 품절"| STK
  CAN(["취소 · 반품"]) --> STK
  STK -.->|"같은 트랜잭션"| HIS[("<b>stock_history</b><br/>재고 원장")]
  INV -.-> HIS
  classDef main fill:#FFF3E3,stroke:#D98A2B,color:#1d2733
  class INV,STK main`,
  pstatus: `stateDiagram-v2
  direction LR
  [*] --> DRAFT
  DRAFT --> PENDING_REVIEW: 검수 요청
  PENDING_REVIEW --> REJECTED: 반려
  REJECTED --> PENDING_REVIEW: 수정 후 재요청
  PENDING_REVIEW --> APPROVED: 승인 (검수자 ≠ 등록자)
  APPROVED --> ON_SALE: 판매 시작
  ON_SALE --> SOLD_OUT: 전 SKU 품절
  SOLD_OUT --> ON_SALE: 재입고
  ON_SALE --> STOPPED: 판매 중지
  STOPPED --> ON_SALE: 재개`,
  post: `flowchart LR
  post(("<b>post</b><br/>공통"))
  subgraph TYPES["유형별 상세 (1:1)"]
    direction TB
    PH["PHOTO 집사진<br/>(상세 없음)"]
    HW["housewarming_detail<br/>평수 · 주거형태 · 시공 · 예산"]
    KH["knowhow_detail<br/>주제 · 난이도 · 소요 시간"]
    QD["question_detail<br/>채택된 답변 댓글"]
  end
  subgraph BODY["본문"]
    direction TB
    IMG["post_image<br/>사진 · 공간 유형"]
    BLK["post_block<br/>블록 에디터"]
    TAG["post_product_tag<br/>사진 속 상품 위치"]
  end
  subgraph REACT["반응 · 분류 (모든 유형 공통)"]
    direction TB
    RX["<b>반응</b><br/>post_comment · post_like<br/>scrap"]
    CL["<b>분류 · 운영</b><br/>post_hashtag · post_style<br/>report"]
  end
  post --- PH & HW & KH & QD
  post --- IMG & BLK
  IMG --- TAG
  post --- RX & CL
  TAG ==>|"구매 연결"| PROD["<b>product</b><br/>스토어 상품"]
  BLK ==>|"상품 카드"| PROD
  classDef store fill:#FFF3E3,stroke:#D98A2B,color:#1d2733
  classDef core fill:#3C9A63,stroke:#2b7049,color:#ffffff
  class PROD store
  class post core
  style TYPES fill:#F6FBF8,stroke:#3C9A63
  style BODY fill:#F6FBF8,stroke:#3C9A63
  style REACT fill:#F6FBF8,stroke:#3C9A63`,
  poststatus: `stateDiagram-v2
  direction LR
  [*] --> DRAFT: 작성 시작
  DRAFT --> DRAFT: 자동 임시저장
  DRAFT --> PUBLISHED: 발행 (published_at 기록)
  PUBLISHED --> HIDDEN: 작성자 숨김
  HIDDEN --> PUBLISHED: 다시 공개
  PUBLISHED --> BLINDED: 신고 누적 · 관리자
  BLINDED --> PUBLISHED: 신고 기각
  PUBLISHED --> DELETED: 삭제
  HIDDEN --> DELETED: 삭제`,
};

const blockMock = `
<div class="mock-wrap">
  <div class="editor">
    <div class="blk"><span class="bt">1 · HEADING</span><div class="h">우리 집 거실을 소개합니다</div></div>
    <div class="blk"><span class="bt">2 · TEXT</span><div class="p">이사 오면서 가장 신경 쓴 공간은 거실이에요. 낮은 가구로 넓어 보이게…</div></div>
    <div class="blk"><span class="bt">3 · IMAGE</span><div class="img">post_image #501 · 거실 · 상품 태그 2개</div></div>
    <div class="blk"><span class="bt">4 · QUOTE</span><div class="q">작은 집일수록 가구 높이를 맞추면 넓어 보여요</div></div>
    <div class="blk"><span class="bt">5 · PRODUCT</span><div class="card"><span class="thumb"></span><span>패브릭 3인 소파<br><small>product #1024 · 459,000원</small></span></div></div>
    <div class="blk"><span class="bt">6 · DIVIDER</span><hr></div>
    <div class="blk"><span class="bt">7 · TEXT</span><div class="p">다음은 침실이에요…</div></div>
  </div>
  <div class="mock-side">
    <table class="mini"><tr><th>sort_order</th><th>block_type</th><th>채우는 컬럼</th></tr>
      <tr><td>1</td><td>HEADING</td><td>text_content</td></tr>
      <tr><td>2</td><td>TEXT</td><td>text_content</td></tr>
      <tr><td>3</td><td>IMAGE</td><td>image_id = 501</td></tr>
      <tr><td>4</td><td>QUOTE</td><td>text_content</td></tr>
      <tr><td>5</td><td>PRODUCT</td><td>product_id = 1024</td></tr>
      <tr><td>6</td><td>DIVIDER</td><td>(없음)</td></tr>
      <tr><td>7</td><td>TEXT</td><td>text_content</td></tr>
    </table>
    <ul class="small">
      <li>글 = 블록을 sort_order 순서로 이어 붙인 것</li>
      <li>UK(post_id, sort_order)로 순서 중복 방지</li>
      <li>유형별 필수 컬럼은 CHECK로 강제</li>
      <li>블록 순서 변경 = sort_order만 UPDATE</li>
    </ul>
  </div>
</div>`;

const tagMock = `
<div class="mock-wrap">
  <div class="photo">
    <div class="wall"></div><div class="floor"></div>
    <div class="lamp"></div><div class="sofa"></div><div class="rug"></div>
    <span class="pin" style="left:36%;top:58%">1</span>
    <span class="pin ext" style="left:80%;top:28%">2</span>
    <span class="pin" style="left:52%;top:86%">3</span>
    <span class="axis">pos_x 0 → 100 %</span>
  </div>
  <div class="mock-side">
    <table class="mini"><tr><th>#</th><th>product_id</th><th>external_name</th><th>pos_x</th><th>pos_y</th></tr>
      <tr><td>1</td><td>1024 (패브릭 소파)</td><td></td><td>36.00</td><td>58.00</td></tr>
      <tr><td>2</td><td></td><td>빈티지 플로어 스탠드</td><td>80.00</td><td>28.00</td></tr>
      <tr><td>3</td><td>2210 (원형 러그)</td><td></td><td>52.00</td><td>86.00</td></tr>
    </table>
    <ul class="small">
      <li>좌표는 % → 해상도·화면 크기와 무관하게 같은 위치</li>
      <li>스토어 상품(파란 핀) 또는 외부 제품명(회색 핀) 중 하나 필수</li>
      <li>product_id 인덱스 → 상품 상세 "이 상품이 쓰인 사진"</li>
    </ul>
  </div>
</div>`;

let no = 0;
const specHtml = groups.map((g, gi) => `
  <div class="spec-group">
    <h3>7.${gi + 1} ${esc(noteOf(g.note))} <small>${g.tables.length}개</small></h3>
    ${g.tables.map((x) => tableHtml(tableMap[x.name], ++no)).join('')}
  </div>`).join('');

const relRows = refs.map((r) => `<tr><td>${r.child}.${r.ccol}</td><td class="c">${r.oneToOne ? '1 : 1' : 'N : 1'}</td><td>${r.parent}.${r.pcol}</td></tr>`).join('');
const stageCount = (p) => groups.filter((g) => g.name.startsWith(p)).reduce((a, g) => a + g.tables.length, 0);

const makeHtml = () => `<!doctype html><html lang="ko"><head><meta charset="utf-8">
<title>인테리어 가구몰 DB 설계서</title>
<style>${fs.readFileSync(path.join(__dirname, 'style.css'), 'utf8')}</style>
<script src="../node_modules/mermaid/dist/mermaid.min.js"></script>
</head><body>

<section class="cover">
  <div class="band">
    <div class="eyebrow">DATABASE DESIGN DOCUMENT</div>
    <h1>인테리어 가구몰<br>DB 설계서</h1>
    <p class="lead">스토어 + 커뮤니티(글쓰기) · 오늘의집 벤치마킹</p>
  </div>
  <div class="cover-stats">
    <div><b>${S.tables.length}</b><span>테이블</span></div>
    <div><b>${refs.length}</b><span>관계 (FK)</span></div>
    <div><b>${groups.length}</b><span>영역</span></div>
  </div>
  <div class="stage-cards">
    <div class="sc s1"><b>1단계 고객</b><span>${stageCount('member')}개</span><p>회원 · 프로필 · 주거정보 · 약관 · 보안</p></div>
    <div class="sc s2"><b>2단계 상품</b><span>${stageCount('product')}개</span><p>옵션 · SKU · 배송 · 재고 · 검색 · 운영</p></div>
    <div class="sc s3"><b>3단계 커뮤니티</b><span>${stageCount('community')}개</span><p>집사진 · 집들이 · 노하우 · 질문 · 반응</p></div>
  </div>
  <div class="points">
    <div><b>사진 속 상품 태그</b><p>커뮤니티 사진의 % 좌표에 스토어 상품을 연결해 바로 구매로 이어지게 한다.</p></div>
    <div><b>블록 에디터</b><p>집들이 · 노하우 본문을 제목 · 문단 · 사진 · 상품카드 블록의 순서로 저장한다.</p></div>
    <div><b>옵션 그룹 → SKU</b><p>색상 · 사이즈 · 구성처럼 상품마다 다른 가구 옵션을 조합해 재고 단위를 만든다.</p></div>
    <div><b>개인정보 보호</b><p>암호화 · 해시 저장, 로그인 잠금, 탈퇴 마스킹, 관리자 조회 기록.</p></div>
  </div>
  <table class="meta">
    <tr><th>DBMS</th><td>MySQL 8.0.16 이상 · InnoDB · utf8mb4</td></tr>
    <tr><th>판매 방식</th><td>자사 직접 판매 (입점 판매자 · 정산 없음)</td></tr>
    <tr><th>원본</th><td>docs/erd.dbml (dbdiagram.io)</td></tr>
    <tr><th>다음 단계</th><td>장바구니 · 주문 · 결제 · 구매 리뷰 · 쿠폰 · 포인트 (대기)</td></tr>
    <tr><th>작성일</th><td>2026-11-17</td></tr>
  </table>
</section>

<section class="toc page">
  <h2>목차</h2>
  <ol>
    <li>개요와 전체 구조</li>
    <li>공통 설계 원칙</li>
    <li>1단계 고객 — 보안 · 로그인 · 탈퇴 · ERD</li>
    <li>2단계 상품 — 옵션/SKU · 재고 · 상태 흐름 · ERD</li>
    <li>3단계 커뮤니티 — 글 구조 · 블록 에디터 · 상품 태그 · ERD</li>
    <li>표 읽는 법</li>
    <li>테이블 명세 (${S.tables.length}개)</li>
    <li>관계(FK) 전체 목록</li>
  </ol>

  <h2>1. 개요와 전체 구조</h2>
  <ul>
    <li>포트폴리오용 인테리어 가구몰 DB이며, 실서비스 수준을 목표로 설계했다.</li>
    <li>오늘의집처럼 <b>스토어</b>와 <b>커뮤니티(글쓰기)</b>를 함께 운영한다. 커뮤니티 사진 속 상품을 태그해서 스토어 구매로 연결하는 것이 핵심이다.</li>
    <li>판매 방식은 <b>자사 직접 판매</b>다. 주문·리뷰 등 다음 단계 테이블은 이번 범위에 없다.</li>
  </ul>
  <h3>전체 구조</h3>${overview()}<p class="small">member_account(회원 기본)는 작성자·관리자로 거의 모든 영역이 참조하므로 연결 표에서 생략했다.</p>
</section>

<section class="page">
  <h2>2. 공통 설계 원칙</h2>
  <table class="rules">
    <tr><th>항목</th><th>규칙</th></tr>
    <tr><td>PK</td><td><code>BIGINT AUTO_INCREMENT</code>. 1:1 확장 테이블은 부모 PK를 그대로 PK로, 연결 테이블은 복합 PK</td></tr>
    <tr><td>이름</td><td>소문자 snake_case (OS마다 테이블명 대소문자 처리가 달라 소문자로 통일). 예약어 회피: member(8.0.17+ 예약어) → member_account, comment → post_comment. 제약·인덱스 이름 fk_ · uk_ · ck_ · ix_ · ux_</td></tr>
    <tr><td>타입</td><td>ID·금액 <code>BIGINT</code>, 카운트 <code>INT</code>, 작은 수 <code>SMALLINT</code>/<code>TINYINT</code>, 비율 <code>DECIMAL(5,2)</code>, 문자열 <code>VARCHAR(n)</code>(글자 수 기준), 본문 <code>TEXT</code>/<code>MEDIUMTEXT</code>, 시각 <code>DATETIME</code>(2038년 제한 없음)</td></tr>
    <tr><td>Y/N · 상태값</td><td>Y/N은 <code>CHAR(1)</code> + CHECK, 상태값은 <code>VARCHAR(20)</code> + CHECK (8.0.16부터 CHECK가 실제로 검사됨)</td></tr>
    <tr><td>공통 컬럼</td><td><code>created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP</code>, <code>updated_at DATETIME ON UPDATE CURRENT_TIMESTAMP</code>. 관리자 변경 데이터는 <code>created_by</code> / <code>updated_by</code></td></tr>
    <tr><td>인덱스</td><td>모든 FK 컬럼에 인덱스. 목록 화면 정렬 조건까지 포함한 복합 인덱스 (예: post_type, status, published_at)</td></tr>
    <tr><td>삭제</td><td>상태값으로 처리(soft delete). 글은 DELETED · HIDDEN · BLINDED, 회원은 WITHDRAWN</td></tr>
    <tr><td>캐시 컬럼</td><td>좋아요 · 스크랩 · 댓글 · 팔로워 수 등은 원본 행 변경과 같은 트랜잭션에서 갱신</td></tr>
    <tr><td>다형 참조</td><td>대상이 여러 종류(scrap, report, notification)면 TARGET_TYPE + ID 대신 대상별 nullable FK를 둬서 FK 무결성 유지</td></tr>
    <tr><td>UNIQUE</td><td>MySQL 특성 활용
      <br><code>uk (email)</code> 대소문자 무시 콜레이션(utf8mb4_0900_ai_ci)이라 일반 UNIQUE로 대소문자 중복 방지
      <br><code>ux_address_default ((CASE WHEN is_default='Y' THEN member_id END))</code> 함수 기반 인덱스(8.0.13+)로 기본 배송지 1개
      <br><code>uk_scrap_post (member_id, post_id)</code> UNIQUE는 NULL 행을 중복으로 보지 않아 nullable 대상도 일반 복합 UNIQUE로 처리</td></tr>
  </table>
</section>

<section class="page">
  <h2>3. 1단계 고객</h2>
  <h3>보안 저장 방식</h3>
  <table class="rules">
    <tr><th>대상</th><th>저장 방식</th></tr>
    <tr><td>비밀번호</td><td>bcrypt 해시. 소셜 전용 가입은 NULL. 최근 3개 재사용 금지 (password_history)</td></tr>
    <tr><td>휴대폰 번호</td><td>AES-256 암호문 <code>phone_enc</code> + 검색·중복확인용 SHA-256 <code>phone_hash</code></td></tr>
    <tr><td>본인인증 CI/DI</td><td>해시만 저장. <code>ci_hash</code> UNIQUE로 1인 1계정</td></tr>
    <tr><td>토큰</td><td>인증 · 재설정 · 리프레시 토큰은 SHA-256 해시만 저장, 만료 · 사용 · 폐기 시각 기록</td></tr>
    <tr><td>관리자 조회</td><td>privacy_access_log에 조회 · 수정 · 다운로드 · 마스킹 해제 기록</td></tr>
  </table>
  ${fig('로그인 처리 흐름', mm(D.login), '5회 실패 시 30분 잠금, 모든 시도를 기록')}
  ${fig('탈퇴 처리', mm(D.withdraw), 'soft delete + 마스킹. 같은 이메일로 재가입 가능')}
  <div class="callout"><b>인테리어몰 특화</b> — member_home(주거형태 · 평수 · 가족형태 · 반려동물 · 이사 예정일)은 맞춤 추천과 집들이 작성 기본값에 쓴다. 배송지에는 층수 · 엘리베이터 여부를 둬서 대형 가구 사다리차 필요 여부를 판단한다. style은 회원 · 상품 · 커뮤니티 글이 함께 쓰는 공유 마스터다.</div>
</section>
${erOf('member')}

<section class="page">
  <h2>4. 2단계 상품</h2>
  ${fig('옵션 → SKU 구조 (예시)', mm(D.option), '옵션 축이 상품마다 다른 가구에 맞춘 구조. 조합 중복은 option_key(값 ID 오름차순) UNIQUE로 방지')}
  ${fig('재고 이중 구조', mm(D.stock), '판매 가능 재고와 창고 실물 재고를 분리하고 모든 변경을 원장에 기록')}
  ${fig('상품 상태 흐름', mm(D.pstatus), 'product_status_history에 사유와 함께 기록')}
  <div class="callout"><b>배송 정책</b> — shipping_policy: 일반택배 / 화물택배 / 업체 직접 설치배송, 기본 · 무료조건 · 제주 · 도서산간 · 반품 · 교환 비용, 출고 소요일, 오늘출발 마감 시각. 상품에는 조립 방식(완제품 / 자가조립 / 기사 설치)과 판매 방식(일반 / 예약 / 주문제작)을 둔다.</div>
</section>
${erOf('product')}

<section class="page">
  <h2>5. 3단계 커뮤니티 (글쓰기)</h2>
  ${fig('글 구조 — 공통 post + 유형별 상세', mm(D.post), '반응 테이블은 post 하나에만 연결되므로 글 유형이 늘어도 바뀌지 않는다')}
  ${fig('글 상태 흐름', mm(D.poststatus), '신고 누적은 report_count 캐시로 자동 BLINDED')}
</section>
<section class="page">
  ${fig('블록 에디터 — post_block', blockMock, '집들이 · 노하우 같은 긴 글')}
  ${fig('사진 속 상품 태그 — post_product_tag', tagMock, '오늘의집 핵심 기능')}
  <div class="callout"><b>반응 · 운영</b> — 댓글은 1단계 대댓글과 @멘션, 대댓글이 있으면 "삭제된 댓글입니다"로 남긴다. 스크랩 = 글 저장 + 상품 찜(폴더별 공개 설정). 팔로우 · 차단은 자기 자신 금지(CHECK), 신고는 대상 하나만 지정하고 같은 대상 중복 신고를 막는다. notification은 앱 내 알림함이며 실제 발송은 member_notification_setting을 따른다.</div>
</section>
${erOf('community')}

<section class="page">
  <h2>6. 표 읽는 법</h2>
  <ul>
    <li><span class="k pk">PK</span> 기본키 · <span class="k fk">FK</span> 외래키 (→ 참조 대상) · <span class="k uk">UK</span> 단일 컬럼 UNIQUE · NN = NOT NULL</li>
    <li>ERD 관계선: 부모의 PK 칸에서 자식의 FK 칸으로 이어진다. 끝 모양은 까마귀발 = N(여럿), 세로줄 = 1, 원 = 0 허용(선택). 부모 쪽 원은 FK가 NULL 가능하다는 뜻</li>
    <li>ERD의 회색 테이블은 다른 영역 테이블(PK만 표시), "+ N columns"는 생략된 일반 컬럼 수</li>
    <li>복합 UNIQUE, 함수 기반 인덱스, 일반 인덱스는 각 표 아래에 적었다.</li>
  </ul>
  <h2>7. 테이블 명세</h2>
  ${specHtml}
</section>

<section class="page">
  <h2>8. 관계(FK) 전체 목록 <small>${refs.length}개</small></h2>
  <table class="rel"><thead><tr><th>FK 컬럼 (자식)</th><th>관계</th><th>참조 (부모)</th></tr></thead><tbody>${relRows}</tbody></table>
</section>

<script>
  mermaid.initialize({
    startOnLoad: false, securityLevel: 'loose', theme: 'base',
    themeVariables: {
      fontFamily: 'Malgun Gothic, sans-serif', fontSize: '13px',
      primaryColor: '#EEF4FA', primaryBorderColor: '#4A7FB5', primaryTextColor: '#1d2733',
      lineColor: '#6B7B8C', secondaryColor: '#F4F6F8', tertiaryColor: '#FFFFFF',
      attributeBackgroundColorOdd: '#FFFFFF', attributeBackgroundColorEven: '#F5F8FB'
    },
    flowchart: { useMaxWidth: true, curve: 'basis', htmlLabels: true },
    state: { useMaxWidth: true }
  });
  mermaid.run({ querySelector: '.mermaid' }).then(() => { window.__done = true; })
    .catch((e) => { window.__err = String(e); window.__done = true; });
</script>
</body></html>`;

(async () => {
  VIZ = await require('@viz-js/viz').instance();
  const html = makeHtml();
  // 중간 산출물 HTML은 .build/ (git 제외). mermaid는 ../node_modules 에서 읽음
  fs.mkdirSync(path.join(__dirname, '.build'), { recursive: true });
  const htmlPath = path.join(__dirname, '.build', 'design.html');
  fs.writeFileSync(htmlPath, html, 'utf8');
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: true });
  const page = await browser.newPage();
  page.on('console', (m) => { if (m.type() === 'error') console.log('console:', m.text()); });
  await page.goto('file:///' + htmlPath.replace(/\\/g, '/'), { waitUntil: 'load' });
  await page.waitForFunction('window.__done === true', { timeout: 120000 });
  const err = await page.evaluate('window.__err');
  if (err) console.log('MERMAID ERROR:', err);
  const failed = await page.evaluate(() => [...document.querySelectorAll('.mermaid')].filter((e) => !e.querySelector('svg')).length);
  console.log('diagrams=', await page.evaluate(() => document.querySelectorAll('.mermaid svg').length), 'failed=', failed);
  await page.pdf({
    path: outPdf, format: 'A4', printBackground: true,
    preferCSSPageSize: true,
    displayHeaderFooter: true, headerTemplate: '<div></div>',
    footerTemplate: '<div style="width:100%;font-size:7.5px;color:#8795A1;font-family:Malgun Gothic;padding:0 12mm;display:flex;justify-content:space-between"><span>인테리어 가구몰 DB 설계서</span><span><span class="pageNumber"></span> / <span class="totalPages"></span></span></div>',
  });
  if (previewDir) {
    // 미리보기: A4 본문 폭(약 703px)으로 표지·목차와 도식만 PNG로 캡처
    fs.mkdirSync(previewDir, { recursive: true });
    await page.emulateMediaType('print');
    await page.setViewport({ width: 703, height: 1000, deviceScaleFactor: 1 });
    await new Promise((r) => setTimeout(r, 500));
    let n = 0;
    for (const el of await page.$$('.cover, .toc, .fig')) await el.screenshot({ path: path.join(previewDir, `fig${String(n++).padStart(2, '0')}.png`) });
    console.log('previews', n);
  }
  await browser.close();
  console.log('PDF', outPdf);
})();
