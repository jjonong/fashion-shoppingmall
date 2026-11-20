// 영역별 발표 자료 (A4 가로): 표지 + 세부 영역별 테이블의 전체 컬럼
// 사용: npm run slides            (DECKS의 영역 모두: docs/<영역 이름>_발표자료.pdf)
//       node slides.js cart       (한 영역만, 접두사는 lib.AREAS의 prefix)
// 내용은 모두 docs/erd.dbml에서 자동 생성. 세부 영역마다 새 페이지에서 시작하고, 테이블은 이어서 배치
// (작은 테이블은 페이지에서 끊기지 않게, 긴 테이블은 다음 페이지로 이어지며 표 머리글 반복)
const fs = require('fs');
const path = require('path');
const { ROOT, esc, noteOf, logicalOf, load, initViz, head, mermaidInit, renderPdf, AREAS } = require('./lib');

const DECKS = ['product', 'cart']; // 발표 자료를 만드는 영역 (사용자 요청)
const ctx = load(path.join(ROOT, 'docs', 'erd.dbml'));
const { tableMap, groups, keyMark } = ctx;
const gTitle = (g) => noteOf(g.note).replace(/^[^-]+- /, '');

const typeOf = (f) => f.type.type_name; // varchar(50)처럼 길이까지 들어 있음
const defOf = (f) => (f.dbdefault ? String(f.dbdefault.value) : '');

function tableBlock(name) {
  const t = tableMap[name];
  const rows = t.fields.map((f) => {
    const key = keyMark(t, f);
    return `<tr><td class="lg">${esc(logicalOf(f.note) || '')}</td><td class="ph">${f.name}</td>
      <td class="ty">${esc(typeOf(f))}</td><td class="ky">${key}</td>
      <td class="nn">${f.pk || f.not_null ? 'Y' : ''}</td><td class="df">${esc(defOf(f))}${f.increment ? 'AUTO_INCREMENT' : ''}</td>
      <td class="ds">${esc(noteOf(f.note))}</td></tr>`;
  }).join('');
  const big = t.fields.length > 14 ? ' big' : '';
  return `<div class="tbl${big}">
  <h3>${esc(logicalOf(t.note) || name)} <span class="phys">${name}</span><span class="cnt">컬럼 ${t.fields.length}개</span></h3>
  <p class="tdesc">${esc(noteOf(t.note))}</p>
  <table><colgroup><col style="width:14%"><col style="width:17%"><col style="width:10%"><col style="width:5%"><col style="width:4%"><col style="width:11%"><col></colgroup>
    <thead><tr><th>컬럼</th><th>물리명</th><th>타입</th><th>키</th><th>필수</th><th>기본값</th><th>설명</th></tr></thead>
    <tbody>${rows}</tbody></table>
</div>`;
}

const makeHtml = (area, areaGroups) => {
  const total = areaGroups.reduce((n, g) => n + g.tables.length, 0);
  return `${head(`${area.name} 영역 발표 자료`)}
<style>${fs.readFileSync(path.join(__dirname, 'slides.css'), 'utf8')}</style>
<section class="cover">
  <h1>${esc(area.name)} 영역 설계</h1>
  <p>테이블 ${total}개 · 세부 영역 ${areaGroups.length}개</p>
  <ol>${areaGroups.map((g) => `<li>${esc(gTitle(g))} <span>${g.tables.length}</span></li>`).join('')}</ol>
</section>
${areaGroups.map((g, i) => `<section class="group">
  <header><span class="idx">${i + 1} / ${areaGroups.length}</span><h2>${esc(gTitle(g))}</h2><span class="cnt">테이블 ${g.tables.length}개</span></header>
  ${g.tables.map((x) => tableBlock(x.name)).join('\n')}
</section>`).join('\n')}
${mermaidInit}
</body></html>`;
};

(async () => {
  await initViz();
  for (const prefix of process.argv[2] ? [process.argv[2]] : DECKS) {
    const area = AREAS.find((a) => a.prefix === prefix);
    if (!area) throw new Error(`알 수 없는 영역: ${prefix} (lib.AREAS의 prefix)`);
    const areaGroups = groups.filter((g) => g.name.startsWith(prefix + '_'));
    const outPdf = path.join(ROOT, 'docs', `${area.name}_발표자료.pdf`);
    await renderPdf({ html: makeHtml(area, areaGroups), name: `slides_${prefix}`, outPdf, footer: `${area.name} 영역 설계` });
  }
})();
