// docs/erd.dbml → ERD 웹페이지 (GitHub Pages: docs/erd/index.html)
// - 영역(TableGroup)별 Graphviz ERD는 PDF와 같은 lib.erSvg 사용
// - 외부 라이브러리 없이 한 파일: SVG·테이블 명세(JSON)·web/erd.css·web/erd.js를 모두 내장
// 사용: npm run erd                 (기본: ../../docs/erd.dbml → ../../docs/erd/index.html)
//       node erd-page.js <in.dbml> <out.html>
const fs = require('fs');
const path = require('path');
const { ROOT, esc, noteOf, load, initViz, erSvg, groupDesc } = require('./lib');

const src = process.argv[2] || path.join(ROOT, 'docs', 'erd.dbml');
const out = process.argv[3] || path.join(ROOT, 'docs', 'erd', 'index.html');
const ctx = load(src);
const { S, tableMap, groups, groupOf, refs, fk, compositePk } = ctx;

const STAGES = [
  { prefix: 'member', name: '1단계 고객' },
  { prefix: 'product', name: '2단계 상품' },
  { prefix: 'community', name: '3단계 커뮤니티' },
];
const gTitle = (g) => noteOf(g.note).replace(/^[^-]+- /, '');
const fmtDefault = (d) => (!d ? '' : d.type === 'expression' ? d.value : d.type === 'string' ? `'${d.value}'` : String(d.value));

// ---------- 테이블 명세 데이터 ----------
function tableData(t) {
  const cpk = compositePk(t);
  return {
    name: t.name,
    group: groupOf[t.name],
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

async function main() {
  await initViz();
  const data = {
    stages: STAGES.map((s) => ({ ...s, groups: groups.filter((g) => g.name.startsWith(s.prefix)).map((g) => g.name) })),
    groups: {},
    tables: {},
    counts: { tables: S.tables.length, refs: refs.length, groups: groups.length },
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
  S.tables.forEach((t) => (data.tables[t.name] = tableData(t)));

  const css = fs.readFileSync(path.join(__dirname, 'web', 'erd.css'), 'utf8');
  const js = fs.readFileSync(path.join(__dirname, 'web', 'erd.js'), 'utf8');
  const json = JSON.stringify(data).replace(/</g, '\\u003c');

  const html = `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>인테리어몰 ERD</title>
<meta name="description" content="인테리어 가구몰 + 커뮤니티 DB 설계 ERD (MySQL 8.0, ${data.counts.tables}개 테이블). docs/erd.dbml에서 자동 생성">
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect x='3' y='5' width='26' height='22' rx='3' fill='%232f6496'/%3E%3Cpath d='M3 12h26M12 12v15' stroke='white' stroke-width='2'/%3E%3C/svg%3E">
<style>${css}</style>
</head>
<body>
<header class="top">
  <button class="icon-btn menu-btn" id="menuBtn" aria-label="영역 목록 열기">☰</button>
  <a class="brand" href="#" aria-label="개요로 이동"><span class="logo"></span><span>인테리어몰 ERD</span></a>
  <span class="meta">MySQL 8.0 · 테이블 ${data.counts.tables} · 관계 ${data.counts.refs}</span>
  <div class="search">
    <input id="q" type="search" placeholder="테이블·컬럼 검색 (예: sku, stock)" autocomplete="off" aria-label="테이블·컬럼 검색">
    <div id="results" class="results" hidden></div>
  </div>
</header>
<div class="layout">
  <nav class="side" id="side" aria-label="영역 목록"></nav>
  <main class="main" id="main"></main>
  <aside class="detail" id="detail" hidden aria-label="테이블 상세"></aside>
</div>
<div class="scrim" id="scrim" hidden></div>
${svgs.join('\n')}
<script>window.ERD = ${json};</script>
<script>${js}</script>
</body>
</html>
`;
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, html, 'utf8');
  console.log('ERD page', out, `(${(html.length / 1024).toFixed(0)} KB, groups=${groups.length}, tables=${S.tables.length})`);
}

main().catch((e) => { console.error(e); process.exit(1); });
