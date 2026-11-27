// docs/erd.dbml → ERD 웹페이지 (GitHub Pages: docs/erd/index.html)
// - 영역(TableGroup)별 Graphviz ERD는 PDF와 같은 lib.erSvg 사용
// - 외부 라이브러리 없이 한 파일: SVG·테이블 명세(JSON)·web/erd.css·web/erd.js를 모두 내장
// 사용: npm run erd                 (기본: ../../docs/erd.dbml → ../../docs/erd/index.html)
//       node erd-page.js <in.dbml> <out.html> [--edit]   (--edit: 로컬 편집 모드용, edit-server.js가 사용)
const fs = require('fs');
const path = require('path');
const { ROOT, esc, noteOf, logicalOf, areaSvg, load, initViz, erSvg, dotSvg, AUDIT, isAdminAudit, groupDesc, AREAS, areaOf } = require('./lib');

const EDIT = process.argv.includes('--edit'); // 편집 버튼은 로컬 편집 모드에서만 (공개 페이지에는 넣지 않음)
const args = process.argv.slice(2).filter((a) => a !== '--edit');
const src = args[0] || path.join(ROOT, 'docs', 'erd.dbml');
const out = args[1] || path.join(ROOT, 'docs', 'erd', 'index.html');
const ctx = load(src);
const { S, tableMap, groups, groupOf, refs, fk, compositePk } = ctx;

// 영역(고객·브랜드·상품)은 lib.AREAS 기준
const STAGES = AREAS.map(({ prefix, name }) => ({ prefix, name }));
const gTitle = (g) => noteOf(g.note).replace(/^[^-]+- /, '');
const fmtDefault = (d) => (!d ? '' : d.type === 'expression' ? d.value : d.type === 'string' ? `'${d.value}'` : String(d.value));

// ---------- 테이블 명세 데이터 ----------
function tableData(t) {
  const cpk = compositePk(t);
  return {
    name: t.name,
    group: groupOf[t.name],
    logical: logicalOf(t.note),
    note: noteOf(t.note),
    fields: t.fields.map((f) => {
      const keys = [];
      if (f.pk || cpk.includes(f.name)) keys.push('PK');
      if (fk[`${t.name}.${f.name}`]) keys.push('FK');
      if (f.unique) keys.push('UK');
      return {
        name: f.name,
        type: f.type.type_name.toUpperCase(),
        keys,
        nn: !!(f.not_null || f.pk || cpk.includes(f.name)),
        def: fmtDefault(f.dbdefault),
        inc: !!f.increment,
        ref: fk[`${t.name}.${f.name}`] || '',
        logical: logicalOf(f.note),
        note: noteOf(f.note),
      };
    }),
    indexes: (t.indexes || []).map((i) => ({
      name: i.name || '',
      pk: !!i.pk,
      unique: !!i.unique,
      cols: i.columns.map((c) => c.value).join(', '),
      note: noteOf(i.note),
    })),
    out: refs.filter((r) => r.child === t.name).map((r) => ({ col: r.ccol, table: r.parent, pcol: r.pcol, one: r.oneToOne })),
    in: refs.filter((r) => r.parent === t.name).map((r) => ({ table: r.child, col: r.ccol, one: r.oneToOne })),
  };
}

// ---------- 영역별 ERD SVG ----------
// 화면 비율(가로로 넓음)에 맞는 배치 방향을 고르고, 크기는 브라우저에서 viewBox 기준으로 확대/축소
function groupSvg(g, i) {
  const member = g.name.startsWith('member');
  const { svg, ext } = erSvg(ctx, g.tables.map((x) => x.name), { hideAudit: !member, W: 1100, H: 680 });
  const clean = svg
    .replace(/^<div class="gv">|<\/div>$/g, '')
    .replace(/ width="[\d.]+pt" height="[\d.]+pt"/, '')
    .replace(/ id="/g, ` id="g${i}_`)
    .replace(/<title>G<\/title>/, '');
  return { svg: clean, ext, hideAudit: !member };
}

// ---------- 전체 구조도 (개요 화면) ----------
// 테이블 이름만 있는 작은 상자를 영역(TableGroup)별 묶음으로 배치. 관리자 감사 컬럼(created_by 등) 선은 생략
function overallSvg() {
  const F = 'Malgun Gothic';
  let dot = `digraph ALL {
  graph [overlap=false, sep="+18", K=0.9, pad=0.2, bgcolor="transparent", fontname="${F}"];
  node [shape=box, style="filled", fillcolor="white", fontname="Consolas", fontsize=15, height=0.34, margin="0.1,0.04", penwidth=1.1];
  edge [color="#9a9a9a", penwidth=1, arrowsize=0.7, arrowhead=crow];
`;
  groups.forEach((g) => {
    const stage = areaOf(g.name);
    if (!stage) throw new Error(`영역 접두사가 없는 TableGroup: ${g.name}`);
    const { color: line, fill } = stage;
    dot += `  subgraph cluster_${g.name} {
    label="${stage.name} · ${gTitle(g)}"; fontname="${F}"; fontsize=17; fontcolor="${line}";
    style="filled"; fillcolor="${fill}"; color="${line}"; penwidth=1; margin=10;
    node [color="${line}"];
    ${g.tables.map((t) => `${t.name} [label="${logicalOf(tableMap[t.name].note) || t.name}\\n${t.name}"]`).join('; ')};
  }
`;
  });
  const seen = new Set();
  refs.forEach((r) => {
    if (AUDIT.has(r.ccol) && r.parent === 'member_account') return;
    if (isAdminAudit(r) && !groupOf[r.child].startsWith('admin')) return;
    // member_account는 거의 모든 테이블이 참조해서 선이 엉키므로, 고객 영역 밖에서 오는 선은 생략 (설계서 전체 구조와 같은 기준)
    if (r.parent === 'member_account' && !groupOf[r.child].startsWith('member')) return;
    if (r.parent === r.child) return;
    const k = `${r.parent}->${r.child}`;
    if (seen.has(k)) return;
    seen.add(k);
    dot += `  ${r.parent} -> ${r.child}${r.oneToOne ? ' [arrowhead=tee]' : ''};
`;
  });
  dot += '}\n';
  return dotSvg(dot, 'fdp')
    .replace(/ width="[\d.]+pt" height="[\d.]+pt"/, '')
    .replace(/ id="/g, ' id="all_')
    .replace(/<title>ALL<\/title>/, '');
}

async function main() {
  await initViz();
  const data = {
    stages: STAGES.filter((s) => groups.some((g) => areaOf(g.name).prefix === s.prefix)).map((s) => ({ ...s, all: `${s.prefix}__all`, groups: groups.filter((g) => areaOf(g.name).prefix === s.prefix).map((g) => g.name) })),
    groups: {},
    tables: {},
    counts: { tables: S.tables.length, refs: refs.length, groups: groups.length },
    // 공유 배치: 웹페이지 "배치 내보내기"로 받은 docs/erd-layout.json (없으면 자동 배치)
    layout: (() => {
      const f = path.join(ROOT, 'docs', 'erd-layout.json');
      if (!fs.existsSync(f)) return {};
      try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { console.warn('erd-layout.json 읽기 실패:', e.message); return {}; }
    })(),
  };
  const svgs = [];
  groups.forEach((g, i) => {
    const { svg, ext, hideAudit } = groupSvg(g, i);
    data.groups[g.name] = {
      title: gTitle(g),
      full: noteOf(g.note),
      desc: groupDesc[g.name] || '',
      tables: g.tables.map((t) => t.name),
      ext,
      hideAudit,
    };
    svgs.push(`<template id="svg-${g.name}">${svg}</template>`);
  });
  // 영역 전체 ERD: 영역의 모든 테이블을 세부 영역(TableGroup) 상자로 묶어 한 장에
  AREAS.forEach((a) => {
    const gs = groups.filter((g) => areaOf(g.name).prefix === a.prefix);
    if (!gs.length) return; // 아직 테이블이 없는 영역은 건너뜀
    const key = `${a.prefix}__all`;
    const tables = gs.flatMap((g) => g.tables.map((t) => t.name));
    const hideAudit = a.prefix !== 'member';
    const { svg, ext } = areaSvg(ctx, gs.map((g) => ({ name: g.name, label: gTitle(g), tables: g.tables.map((t) => t.name) })), { hideAudit, W: 1800, H: 680 }); // 가로로 넓게: 세부 영역 상자를 옆으로 늘어놓음 (사용자 요청)
    const clean = svg
      .replace(/^<div class="gv">|<\/div>$/g, '')
      .replace(/ width="[\d.]+pt" height="[\d.]+pt"/, '')
      .replace(/ id="/g, ` id="${key}_`)
      .replace(/<title>G<\/title>/, '');
    data.groups[key] = {
      title: `${a.name} 전체`,
      full: `${a.name} - 전체`,
      desc: `${a.name} 영역의 테이블 ${tables.length}개를 한 장에 모았습니다. 묶음 상자는 세부 영역이고, 상자 제목을 누르면 그 세부 영역으로 이동합니다.`,
      tables,
      ext,
      hideAudit,
      area: true,
    };
    svgs.push(`<template id="svg-${key}">${clean}</template>`);
  });
  S.tables.forEach((t) => (data.tables[t.name] = tableData(t)));
  svgs.push(`<template id="svg-__all">${overallSvg()}</template>`);

  // 영역 포인트 색(--s1…)은 화면에 나오는 영역 순서대로 lib.AREAS 색을 넣는다 (erd.css의 고정값을 덮어씀)
  const lighten = (hex, r = 0.4) => '#' + [1, 3, 5].map((i) => { const v = parseInt(hex.slice(i, i + 2), 16); return Math.round(v + (255 - v) * r).toString(16).padStart(2, '0'); }).join('');
  const sVars = (f) => data.stages.map((st, i) => `--s${i + 1}: ${f(AREAS.find((a) => a.prefix === st.prefix).color)};`).join(' ');
  const darkVars = sVars((c) => lighten(c));
  const stageCss = `
:root { ${sVars((c) => c)} }
@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) { ${darkVars} } }
:root[data-theme="dark"] { ${darkVars} }
.canvas { ${sVars((c) => c)} }`;
  const css = fs.readFileSync(path.join(__dirname, 'web', 'erd.css'), 'utf8') + stageCss;
  const js = fs.readFileSync(path.join(__dirname, 'web', 'erd.js'), 'utf8');
  const json = JSON.stringify(data).replace(/</g, '\\u003c');

  const html = `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${EDIT ? '[편집] ' : ''}패션 쇼핑몰 ERD</title>
<meta name="description" content="패션 브랜드 입점형 쇼핑몰 DB 설계 ERD (MySQL 8.0, ${data.counts.tables}개 테이블). docs/erd.dbml에서 자동 생성">
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect x='3' y='5' width='26' height='22' rx='3' fill='%232f6496'/%3E%3Cpath d='M3 12h26M12 12v15' stroke='white' stroke-width='2'/%3E%3C/svg%3E">
<script>try { var t = localStorage.getItem('erd-theme'); if (t === 'dark' || t === 'light') document.documentElement.dataset.theme = t; } catch (e) {}</script>
<link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css">
<style>${css}</style>
</head>
<body>
<header class="top">
  <button class="icon-btn menu-btn" id="menuBtn" aria-label="영역 메뉴 열기" aria-controls="gnb" aria-expanded="false">☰</button>
  <a class="brand" href="#" aria-label="개요로 이동"><span>Fashion Mall</span><small>ERD</small></a>
  ${EDIT ? '<span class="ed-mode" title="저장하면 docs/erd.dbml이 바로 바뀝니다. 커밋·푸시는 따로">편집 모드</span>' : ''}
  <span class="meta">MySQL 8.0 · 테이블 ${data.counts.tables} · 관계 ${data.counts.refs}</span>
  <div class="search">
    <input id="q" type="search" placeholder="테이블·컬럼 검색 (예: 옵션, 재고, 소재)" autocomplete="off" aria-label="테이블·컬럼 검색">
    <div id="results" class="results" hidden></div>
  </div>
  <button class="icon-btn theme-btn" id="themeBtn" type="button">DARK</button>
</header>
<nav class="gnb" id="gnb" aria-label="영역 메뉴"></nav>
<div class="layout">
  <main class="main" id="main"></main>
</div>
<aside class="remote" id="remote" aria-label="테이블 바로가기" hidden></aside>
<div class="scrim" id="scrim" hidden></div>
${svgs.join('\n')}
<script>window.ERD = ${json};${EDIT ? ' window.ERD_EDIT = true;' : ''}</script>
<script>${js}</script>
</body>
</html>
`;
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, html, 'utf8');
  console.log('ERD page', out, `(${(html.length / 1024).toFixed(0)} KB, groups=${groups.length}, tables=${S.tables.length})`);
}

main().catch((e) => { console.error(e); process.exit(1); });
