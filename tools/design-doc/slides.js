// 영역별 발표 자료 (A4 가로): 표지 + 세부 영역별 테이블의 전체 컬럼
// 사용: npm run slides                 (DECKS 모두: docs/<영역 이름들>_발표자료.pdf)
//       node slides.js cart,order       (한 자료만, 접두사는 lib.AREAS의 prefix를 쉼표로)
// 테이블·컬럼은 모두 docs/erd.dbml에서 자동 생성. 세부 영역마다 새 페이지에서 시작하고, 테이블은 이어서 배치
// (작은 테이블은 페이지에서 끊기지 않게, 긴 테이블은 다음 페이지로 이어지며 표 머리글 반복)
// 영역을 묶은 자료는 영역 사이에 "넘어가는 값" 한 장(LINKS, 직접 쓴 표)을 넣는다. 컬럼이 바뀌면 함께 고친다
const fs = require('fs');
const path = require('path');
const { ROOT, esc, noteOf, logicalOf, load, initViz, head, mermaidInit, renderPdf, AREAS } = require('./lib');

const DECKS = [['product'], ['cart', 'order']]; // 발표 자료 (사용자 요청: 상품, 장바구니 + 주문)

// 영역 사이 연결: [보내는 쪽, 받는 쪽, 설명]
const LINKS = {
  'cart>order': {
    title: '장바구니 → 주문: 넘어가는 값',
    desc: '주문하기를 누르면 is_selected = Y인 장바구니 행이 주문 상품 한 줄씩이 되고, 주문이 끝나면 장바구니에서 지운다. 장바구니는 담은 사실만, 주문은 결제 시점의 값을 영수증처럼 기록해 둔다 (나중에 상품이 바뀌어도 그대로).',
    rows: [
      ['cart_item.sku_id', 'order_item.sku_id, product_id', '그대로 복사'],
      ['cart_item.quantity', 'order_item.quantity', '그대로 복사'],
      ['cart_item.set_product_id, bundle_key', 'order_item.set_product_id, bundle_key', '세트 구성품 묶음 유지'],
      ['cart_item.source_post_id', 'order_item.source_post_id', '유입 글 유지 → 구매 확정 시 post.purchase_count 증가'],
      ['cart_item.room_id', 'order_item.room_name', '방 ID가 아니라 방 이름을 복사 (방을 지워도 설치 위치가 남도록)'],
      ['(상품 · SKU 현재 값)', 'order_item.product_name, option_text, sku_code, sale_type, unit_list_price, unit_price', '주문 시점 기록'],
      ['cart_item.added_price', '—', '복사 안 함: 담은 뒤 가격 변동 표시용. 주문은 현재 가격'],
      ['cart_item.plan_id', '—', '복사 안 함: 플랜 유입은 장바구니까지만 기록'],
      ['cart_item.member_id', 'orders.member_id', '주문은 회원만 (비회원은 로그인 후 장바구니를 합쳐서 주문)'],
      ['(배송지 address)', 'order_address', '받는 분 · 주소 · 반입 경로 치수를 주문 시점 그대로 기록'],
    ],
  },
};
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

const linkPage = (l) => `<section class="group link">
  <header><h2>${esc(l.title)}</h2></header>
  <p class="tdesc">${esc(l.desc)}</p>
  <div class="tbl"><table><colgroup><col style="width:28%"><col style="width:36%"><col></colgroup>
    <thead><tr><th>장바구니</th><th>주문</th><th>설명</th></tr></thead>
    <tbody>${l.rows.map(([a, b, c]) => `<tr><td class="ph">${esc(a)}</td><td class="ph">${esc(b)}</td><td class="ds">${esc(c)}</td></tr>`).join('')}</tbody>
  </table></div>
</section>`;

const makeHtml = (areas) => {
  const name = areas.map((a) => a.name).join(' · ');
  const parts = areas.map((a) => ({ area: a, groups: groups.filter((g) => g.name.startsWith(a.prefix + '_')) }));
  const all = parts.flatMap((p) => p.groups);
  const total = all.reduce((n, g) => n + g.tables.length, 0);
  let no = 0;
  const body = parts.map((p, pi) => {
    const link = pi > 0 && LINKS[`${parts[pi - 1].area.prefix}>${p.area.prefix}`];
    return (link ? linkPage(link) : '') + p.groups.map((g) => `<section class="group">
  <header><span class="idx">${++no} / ${all.length}</span><h2>${areas.length > 1 ? `<small>${esc(p.area.name)}</small> ` : ''}${esc(gTitle(g))}</h2><span class="cnt">테이블 ${g.tables.length}개</span></header>
  ${g.tables.map((x) => tableBlock(x.name)).join('\n')}
</section>`).join('\n');
  }).join('\n');
  return `${head(`${name} 영역 발표 자료`)}
<style>${fs.readFileSync(path.join(__dirname, 'slides.css'), 'utf8')}</style>
<section class="cover">
  <h1>${esc(name)} 영역 설계</h1>
  <p>테이블 ${total}개 · 세부 영역 ${all.length}개</p>
  <ol>${parts.flatMap((p) => p.groups.map((g) => `<li>${areas.length > 1 ? `${esc(p.area.name)} · ` : ''}${esc(gTitle(g))} <span>${g.tables.length}</span></li>`)).join('')}</ol>
</section>
${body}
${mermaidInit}
</body></html>`;
};

(async () => {
  await initViz();
  for (const prefixes of process.argv[2] ? [process.argv[2].split(',')] : DECKS) {
    const areas = prefixes.map((p) => AREAS.find((a) => a.prefix === p) || (() => { throw new Error(`알 수 없는 영역: ${p} (lib.AREAS의 prefix)`); })());
    const name = areas.map((a) => a.name).join('_');
    await renderPdf({ html: makeHtml(areas), name: `slides_${prefixes.join('_')}`, outPdf: path.join(ROOT, 'docs', `${name}_발표자료.pdf`), footer: `${areas.map((a) => a.name).join(' · ')} 영역 설계` });
  }
})();
