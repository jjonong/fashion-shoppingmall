// docs/erd.dbml → docs/erd.drawio (draw.io / diagrams.net 파일)
// - 영역(고객·상품·…·혜택)마다 한 페이지. 테이블은 draw.io ER 표(논리명 · 물리명 · 타입 · 키, 전체 컬럼)
// - 세부 영역(TableGroup)은 상자로 묶고, Graphviz로 상자 안 배치를 잡은 뒤 상자들은 격자 배치(lib.gridPlace, 영역 전체 ERD와 같은 규칙)
// - 다른 영역 테이블은 페이지마다 "다른 영역 참조" 상자에 한 번씩(PK 줄만, 회색)
// - 한 방향: draw.io에서 고친 내용은 erd.dbml에 반영되지 않음 (원본은 erd.dbml)
// 사용: npm run drawio   또는   node drawio.js <in.dbml> <out.drawio>
const fs = require('fs');
const path = require('path');
const { ROOT, noteOf, logicalOf, load, initViz, AREAS, areaOf, AUDIT, gridPlace } = require('./lib');

const src = process.argv[2] || path.join(ROOT, 'docs', 'erd.dbml');
const out = process.argv[3] || path.join(ROOT, 'docs', 'erd.drawio');
const ctx = load(src);
const { tableMap, groups, refs, fieldOf, compositePk, baseType, keyMark } = ctx;

const x = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/\n/g, '&#10;');
const gTitle = (g) => noteOf(g.note).replace(/^[^-]+- /, '');
// 글자 폭 추정 (draw.io 기본 글꼴 기준): 한글 12px, 그 외 7px
const textW = (s, wide = 12, narrow = 7) => [...String(s)].reduce((a, ch) => a + (/[^\x00-\x7f]/.test(ch) ? wide : narrow), 0);

const ROW = 22, HEAD = 30, KEYW = 44, PAD = 16, LABEL = 28;

// 표 하나의 크기와 줄 목록. keysOnly면 PK 줄만 (다른 영역 참조)
function tableSpec(name, keysOnly) {
  const t = tableMap[name];
  const cpk = compositePk(t);
  const fields = keysOnly ? t.fields.filter((f) => f.pk || cpk.includes(f.name)) : t.fields;
  const rows = fields.map((f) => ({
    col: f.name,
    key: keyMark(t, f).replace(/, /g, ' '),
    lg: logicalOf(f.note) || f.name,
    type: baseType(f),
  }));
  const lgW = Math.max(60, ...rows.map((r) => textW(r.lg))) + 12;
  const phW = Math.max(60, ...rows.map((r) => textW(r.col, 7, 6.5))) + 12;
  const tyW = Math.max(50, ...rows.map((r) => textW(r.type, 7, 6.5))) + 10;
  const title = `${logicalOf(t.note) || name} (${name})`;
  const w = Math.max(KEYW + lgW + phW + tyW, textW(title) + 30);
  return { name, rows, w, h: HEAD + rows.length * ROW, cols: [KEYW, lgW, phW, w - KEYW - lgW - phW], title };
}

// 세부 영역 하나 안의 표 배치 (Graphviz dot, 좌→우). 반환: 표별 왼쪽 위 좌표와 상자 크기
async function layoutCluster(viz, specs, edges) {
  if (specs.length === 1) return { pos: { [specs[0].name]: [0, 0] }, w: specs[0].w, h: specs[0].h };
  let dot = 'digraph G { graph [rankdir=LR, nodesep=0.5, ranksep=1.0]; node [shape=box, fixedsize=true];\n';
  specs.forEach((s) => { dot += `  "${s.name}" [width=${(s.w / 72).toFixed(3)}, height=${(s.h / 72).toFixed(3)}];\n`; });
  edges.forEach(([a, b]) => { dot += `  "${a}" -> "${b}";\n`; });
  dot += '}';
  const j = JSON.parse(viz.renderString(dot, { format: 'json', engine: 'dot' }));
  const [, , bw, bh] = j.bb.split(',').map(Number);
  const pos = {};
  (j.objects || []).forEach((o) => {
    if (!o.pos) return;
    const [cx, cy] = o.pos.split(',').map(Number);
    const s = specs.find((q) => q.name === o.name);
    pos[o.name] = [Math.round(cx - s.w / 2), Math.round(bh - cy - s.h / 2)];
  });
  return { pos, w: Math.ceil(bw), h: Math.ceil(bh) };
}

// 표 XML (draw.io ER "Table" 모양: 표 → 줄 → 칸)
function tableXml(spec, px, py, parent, color, gray) {
  const head = gray ? '#a3afba' : color;
  let s = `<mxCell id="${x(spec.name)}" value="${x(spec.title)}" style="shape=table;startSize=${HEAD};container=1;collapsible=1;childLayout=tableLayout;fixedRows=1;rowLines=0;fontStyle=1;align=center;resizeLast=1;html=1;fillColor=${head};fontColor=#ffffff;strokeColor=${head};swimlaneFillColor=#ffffff;" vertex="1" parent="${x(parent)}"><mxGeometry x="${px}" y="${py}" width="${spec.w}" height="${spec.h}" as="geometry"/></mxCell>\n`;
  spec.rows.forEach((r, i) => {
    const rid = `${spec.name}.${r.col}`;
    const pk = r.key.includes('PK');
    s += `<mxCell id="${x(rid)}" value="" style="shape=tableRow;horizontal=0;startSize=0;swimlaneHead=0;swimlaneBody=0;fillColor=${pk ? '#FBF6E9' : 'none'};collapsible=0;dropTarget=0;points=[[0,0.5],[1,0.5]];portConstraint=eastwest;top=0;left=0;right=0;bottom=${i === spec.rows.length - 1 ? 0 : 1};strokeColor=#eef2f6;" vertex="1" parent="${x(spec.name)}"><mxGeometry y="${HEAD + i * ROW}" width="${spec.w}" height="${ROW}" as="geometry"/></mxCell>\n`;
    const cells = [
      [r.key, `fontStyle=1;fontColor=${pk ? '#B8860B' : '#2f6496'};fontSize=10;align=center;`],
      [r.lg, `fontStyle=${pk ? 1 : 0};fontColor=#1f2d3a;align=left;spacingLeft=6;`],
      [r.col, 'fontFamily=Consolas;fontColor=#7d8a96;fontSize=11;align=left;spacingLeft=4;'],
      [r.type, 'fontFamily=Consolas;fontColor=#5d6d7e;fontSize=10;align=left;spacingLeft=4;'],
    ];
    let cx = 0;
    cells.forEach(([v, st], k) => {
      const w = spec.cols[k];
      s += `<mxCell id="${x(rid)}#${k}" value="${x(v)}" style="shape=partialRectangle;connectable=0;fillColor=none;top=0;left=0;bottom=0;right=0;overflow=hidden;html=1;${st}" vertex="1" parent="${x(rid)}"><mxGeometry x="${cx}" width="${w}" height="${ROW}" as="geometry"><mxRectangle width="${w}" height="${ROW}" as="alternateBounds"/></mxGeometry></mxCell>\n`;
      cx += w;
    });
  });
  return s;
}

// 관리자 감사 컬럼(created_by 등) → member_account 선은 고객 영역 밖에서 생략 (웹 ERD와 같은 기준)
const showRef = (r) => !(r.parent === 'member_account' && AUDIT.has(r.ccol) && areaOf(groupOfTable(r.child)).prefix !== 'member');
const groupOfTable = (t) => groups.find((g) => g.tables.some((x) => x.name === t)).name;

// 페이지 하나: boxDefs = [{ id, label, names, keysOnly, color }] (상자 = 세부 영역), rels = 그릴 관계
async function buildPage(viz, id, name, boxDefs, rels) {
  const boxes = [];
  for (const d of boxDefs) {
    const specs = d.names.map((n) => tableSpec(n, d.keysOnly));
    const edges = rels.filter((r) => d.names.includes(r.child) && d.names.includes(r.parent) && r.child !== r.parent).map((r) => [r.parent, r.child]);
    const lay = await layoutCluster(viz, specs, edges);
    boxes.push({ ...d, specs, lay, w: lay.w + PAD * 2, h: lay.h + PAD * 2 + LABEL });
  }
  const { pos } = gridPlace(boxes, { W: 1600, H: 1000, GAP: 40 });
  let cells = '';
  let count = 0;
  boxes.forEach((b, i) => {
    const [bx, by] = [Math.round(pos[i].x), Math.round(pos[i].y)];
    cells += `<mxCell id="${x(b.id)}" value="${x(b.label)}" style="swimlane;startSize=${LABEL};container=1;collapsible=0;rounded=1;arcSize=4;fillColor=none;swimlaneFillColor=none;strokeColor=${b.keysOnly ? '#c3ccd5' : '#b9c7d6'};fontColor=${b.keysOnly ? '#7d8a96' : b.color};fontStyle=1;align=left;spacingLeft=10;html=1;" vertex="1" parent="1"><mxGeometry x="${bx}" y="${by}" width="${b.w}" height="${b.h}" as="geometry"/></mxCell>\n`;
    b.specs.forEach((s) => {
      const [tx, ty] = b.lay.pos[s.name] || [0, 0];
      cells += tableXml(s, tx + PAD, ty + PAD + LABEL, b.id, b.color, b.keysOnly);
      if (!b.keysOnly) count++;
    });
  });
  // 관계선: 자식의 FK 줄 → 부모의 PK 줄 (까마귀발 = 여러 개, 세로줄 = 1, 동그라미 = 없을 수 있음)
  rels.forEach((r, i) => {
    const f = fieldOf(r.child, r.ccol);
    const nullable = !f.not_null && !f.pk && !compositePk(tableMap[r.child]).includes(r.ccol);
    const childEnd = r.oneToOne ? 'ERzeroToOne' : 'ERmany';
    const parentEnd = nullable ? 'ERzeroToOne' : 'ERmandOne';
    cells += `<mxCell id="e${i}_${x(r.child)}_${x(r.ccol)}" value="" style="edgeStyle=entityRelationEdgeStyle;html=1;rounded=0;startArrow=${childEnd};startFill=0;endArrow=${parentEnd};endFill=0;strokeColor=#7d8a96;" edge="1" parent="1" source="${x(r.child)}.${x(r.ccol)}" target="${x(r.parent)}.${x(r.pcol)}"><mxGeometry relative="1" as="geometry"/></mxCell>\n`;
  });
  const page = `<diagram id="${id}" name="${x(name)}"><mxGraphModel dx="1600" dy="1000" grid="1" gridSize="10" guides="1" tooltips="1" connect="1" arrows="1" fold="1" page="0" pageScale="1" math="0" shadow="0"><root><mxCell id="0"/><mxCell id="1" parent="0"/>\n${cells}</root></mxGraphModel></diagram>\n`;
  return { page, count };
}

async function main() {
  await initViz();
  const viz = await require('@viz-js/viz').instance();
  const pages = [];

  // 첫 페이지 "전체": 87개 테이블을 한 장에 (세부 영역 상자, 영역 색, 제목 "영역 · 세부 영역")
  const allDefs = groups.map((g) => {
    const a = areaOf(g.name);
    return { id: `grp_${g.name}`, label: `${a.name} · ${gTitle(g)}`, names: g.tables.map((t) => t.name), keysOnly: false, color: a.color };
  });
  const all = await buildPage(viz, 'all', '전체', allDefs, refs.filter(showRef));
  pages.push(all.page);

  // 영역별 페이지 (다른 영역 테이블은 "다른 영역 참조" 상자에 PK만)
  let areaCount = 0;
  for (const area of AREAS) {
    const gs = groups.filter((g) => areaOf(g.name).prefix === area.prefix);
    const inArea = new Set(gs.flatMap((g) => g.tables.map((t) => t.name)));
    const rels = refs.filter((r) => inArea.has(r.child) && showRef(r));
    const ext = [...new Set(rels.filter((r) => !inArea.has(r.parent)).map((r) => r.parent))];
    const defs = gs.map((g) => ({ id: `grp_${g.name}`, label: gTitle(g), names: g.tables.map((t) => t.name), keysOnly: false, color: area.color }));
    if (ext.length) defs.push({ id: `grp_ext_${area.prefix}`, label: '다른 영역 참조 (PK만)', names: ext, keysOnly: true, color: area.color });
    const p = await buildPage(viz, area.prefix, area.name, defs, rels);
    pages.push(p.page);
    areaCount += p.count;
  }
  const xml = `<mxfile host="erd.dbml" agent="tools/design-doc/drawio.js" version="24.0.0">\n${pages.join('')}</mxfile>\n`;
  fs.writeFileSync(out, xml, 'utf8');
  console.log('draw.io', out, `(${(xml.length / 1024).toFixed(0)} KB, pages=${pages.length}: 전체 ${all.count}개 + 영역별 ${areaCount}개)`);
}

main().catch((e) => { console.error(e); process.exit(1); });
