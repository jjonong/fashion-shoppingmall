// 상품 영역 발표 자료 (A4 가로): 표지 + 세부 영역마다 테이블 목록 1장
// 사용: npm run slides            (기본: ../../docs/erd.dbml → ../../docs/상품_발표자료.pdf)
//       node slides.js <in.dbml> <out.pdf>
// 내용은 모두 DBML에서 자동 생성 (테이블 논리명 · 물리명 · 설명 · 키)
const fs = require('fs');
const path = require('path');
const { ROOT, esc, noteOf, logicalOf, load, initViz, head, mermaidInit, renderPdf, groupDesc, AUDIT } = require('./lib');

const src = process.argv[2] || path.join(ROOT, 'docs', 'erd.dbml');
const outPdf = process.argv[3] || path.join(ROOT, 'docs', '상품_발표자료.pdf');
const ctx = load(src);
const { tableMap, groups, refs, compositePk } = ctx;

const areaGroups = groups.filter((g) => g.name.startsWith('product_'));
const total = areaGroups.reduce((n, g) => n + g.tables.length, 0);
const gTitle = (g) => noteOf(g.note).replace(/^[^-]+- /, '');

// 키 요약: PK, FK(컬럼 → 참조 테이블). 등록·수정 관리자 같은 감사 컬럼 FK는 생략 (ERD와 같은 기준)
function keys(t) {
  const cpk = compositePk(t);
  const pk = cpk.length ? cpk : t.fields.filter((f) => f.pk).map((f) => f.name);
  const fk = refs.filter((r) => r.child === t.name && !AUDIT.has(r.ccol)).map((r) => `${r.ccol} → ${r.parent}`);
  return `<div><span class="k">PK</span><span>${esc(pk.join(', '))}</span></div>` +
    (fk.length ? `<div><span class="k">FK</span><span>${fk.map(esc).join('<br>')}</span></div>` : '');
}

let page = 1;
const groupSlide = (g, i) => {
  page += 1;
  const rows = g.tables.map((x) => {
    const t = tableMap[x.name];
    return `<tr><td class="name">${esc(logicalOf(t.note) || t.name)}<span class="phys">${t.name}</span></td>
      <td class="desc">${esc(noteOf(t.note))}</td><td class="keys">${keys(t)}</td></tr>`;
  }).join('');
  return `<section class="slide">
  <header><span class="idx">${i + 1} / ${areaGroups.length}</span><h2>${esc(gTitle(g))}</h2><span class="cnt">${g.tables.length}개</span></header>
  <p class="gdesc">${esc(groupDesc[g.name] || '')}</p>
  <table><colgroup><col style="width:24%"><col><col style="width:30%"></colgroup>
    <tr><th>테이블</th><th>설명</th><th>키</th></tr>${rows}</table>
  <div class="pg">${page}</div>
</section>`;
};

const makeHtml = () => `${head('상품 영역 발표 자료')}
<style>${fs.readFileSync(path.join(__dirname, 'slides.css'), 'utf8')}</style>
<section class="slide cover">
  <h1>상품 영역 설계</h1>
  <p>테이블 ${total}개 · 세부 영역 ${areaGroups.length}개</p>
  <ol>${areaGroups.map((g) => `<li>${esc(gTitle(g))} <span>${g.tables.length}</span></li>`).join('')}</ol>
</section>
${areaGroups.map(groupSlide).join('\n')}
${mermaidInit}
</body></html>`;

(async () => {
  await initViz();
  await renderPdf({ html: makeHtml(), name: 'slides_product', outPdf });
})();
