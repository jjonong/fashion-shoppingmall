// 상품 영역 발표 자료 (A4 가로, 약 12장)
// 사용: npm run slides            (기본: ../../docs/erd.dbml → ../../docs/상품_발표자료.pdf)
//       node slides.js <in.dbml> <out.pdf>
// 테이블 수·세부 영역·ERD는 DBML에서 자동 생성, 발표 문장은 이 파일에 직접 쓴 문장이다 (설계가 바뀌면 함께 고친다).
const fs = require('fs');
const path = require('path');
const { ROOT, esc, noteOf, logicalOf, mm, load, initViz, erSvg, head, mermaidInit, renderPdf, groupDesc } = require('./lib');
const D = require('./diagrams');

const src = process.argv[2] || path.join(ROOT, 'docs', 'erd.dbml');
const outPdf = process.argv[3] || path.join(ROOT, 'docs', '상품_발표자료.pdf');
const ctx = load(src);
const { tableMap, groups } = ctx;

const areaGroups = groups.filter((g) => g.name.startsWith('product_'));
const tables = areaGroups.flatMap((g) => g.tables.map((t) => t.name));
const gTitle = (g) => noteOf(g.note).replace(/^[^-]+- /, '');
const L = (t) => logicalOf(tableMap[t].note) || t;
// 표시: 논리명 + 물리명(작게)
const T = (t) => `<b>${esc(L(t))}</b> <span class="phys">${t}</span>`;

let page = 0;
// stack: 본문을 위(설명) · 아래(넓은 도식)로 쌓는다. 가로로 긴 도식을 크게 보여 줄 때
const slide = (title, body, { kicker = '', cls = '', stack = false } = {}) => {
  page += 1;
  return `<section class="slide ${cls}">
  <header><span class="no">${String(page).padStart(2, '0')}</span><h2>${title}</h2>${kicker ? `<span class="kicker">${kicker}</span>` : ''}</header>
  <div class="body${stack ? ' stack' : ''}">${body}</div>
  <div class="pg">${page}</div>
</section>`;
};

const makeHtml = () => {
  const out = [];

  // 1. 표지
  page += 1;
  out.push(`<section class="slide cover"><div class="inner">
  <div class="eyebrow">INTERIOR FURNITURE MALL · DB DESIGN</div>
  <h1>상품 영역 설계</h1>
  <p class="sub">옵션 조합(SKU)을 기준 단위로, 가구만의 정보(치수 · 포장 박스 · 조립 · 설치)를 얹은 구조</p>
  <div class="stats">
    <div><b>${tables.length}개</b><span>테이블</span></div>
    <div><b>${areaGroups.length}개</b><span>세부 영역</span></div>
    <div><b>MySQL 8.0</b><span>InnoDB · utf8mb4</span></div>
  </div></div>
  <div class="meta">인테리어 가구몰 + 커뮤니티 포트폴리오 · 자사 브랜드(PB) 직접 판매</div>
</section>`);

  // 2. 한눈에 보기
  out.push(slide('상품 영역 한눈에 보기', `<div class="col">
  <p class="lead">상품 영역은 <b>${tables.length}개 테이블</b>을 <b>${areaGroups.length}개 세부 영역</b>으로 나눴습니다.</p>
  <div class="cards">${areaGroups.map((g) => `<div class="card ${g.name === 'product_core' ? 'core' : ''}">
    <span class="n">${g.tables.length}</span><b>${esc(gTitle(g))}</b>
    <p>${esc(groupDesc[g.name] || '')}</p>
    <div class="tbl">${g.tables.map((t) => t.name).join(' · ')}</div></div>`).join('')}</div>
</div>`, { kicker: '세부 영역 = TableGroup' }));

  // 3. 핵심 ERD
  const core = ['category', ...areaGroups.find((g) => g.name === 'product_core').tables.map((t) => t.name)];
  out.push(slide('핵심 구조 ERD', `<div class="chips">
  <span>카테고리 1 : 상품 N</span><span>상품 1 : 옵션 그룹 N</span><span>옵션 그룹 1 : 옵션 값 N</span>
  <span>상품 1 : SKU N</span><span>옵션 값 N : SKU M → <code>product_sku_option</code></span><span>SKU 1 : 포장 박스 N</span>
</div>
<div class="dg grow">${erSvg(ctx, core, { hideAudit: true, W: 760, H: 400 }).svg}</div>
<div class="note">1:N은 FK를 N 쪽에 · N:M은 매핑 테이블 · FK 컬럼에는 인덱스 · 회색 상자는 다른 영역 테이블(PK만)</div>`, { kicker: '분류 + 상품/옵션/SKU/포장/문의', stack: true }));

  // 4. 옵션 → SKU
  out.push(slide('옵션 그룹 · 옵션 값 · SKU', `<div class="col w2">
  <p class="lead">가구는 상품마다 옵션 축이 다릅니다. 그래서 <b>옵션을 컬럼이 아니라 행</b>으로 저장합니다.</p>
  <table>
    <tr><th>상품</th><th>옵션 그룹 (질문)</th><th>옵션 값 (선택지)</th></tr>
    <tr><td>수납침대</td><td>사이즈 · 색상</td><td>SS / Q / K · 화이트 오크 / 월넛</td></tr>
    <tr><td>소파</td><td>인원 · 원단</td><td>2인 / 3인 · 패브릭 / 가죽</td></tr>
    <tr><td>식탁</td><td>상판 소재 · 의자 포함</td><td>원목 / 세라믹 · 포함 / 미포함</td></tr>
  </table>
  <div class="box soft"><h3>SKU = 옵션 값의 조합</h3><ul>
    <li>그룹마다 값을 1개씩 고른 조합이 <b>SKU</b> → 재고 · 장바구니 · 주문의 기준 단위</li>
    <li>옵션 없는 상품도 SKU 1개(<code>DEFAULT</code>) → 처리 방식이 하나로 통일</li>
    <li>같은 조합 중복 방지: <code>option_key</code>(값 ID 오름차순, 예: 11-22) + <code>UNIQUE(product_id, option_key)</code></li>
    <li>SKU별로 옵션 추가금 <code>extra_price</code> · 실제 치수 · 재고</li></ul></div>
</div>
<div class="col dg">${mm(D.option)}</div>`, { kicker: 'product_option_group → product_option_value → product_sku' }));

  // 5. 재고
  out.push(slide('SKU 재고와 이력', `<p class="lead">재고는 <b>SKU의 <code>stock</code> 하나</b>로 관리하고, 모든 변경은 원장에 남깁니다.</p>
<div class="row"><div class="col">
  <div class="box"><h3>초과 판매 방지</h3>
<pre style="margin:0;font-size:10.5pt;font-family:Consolas,monospace">UPDATE product_sku
   SET stock = stock - :qty, version = version + 1
 WHERE sku_id = :sku AND stock >= :qty;
-- 0건이면 품절 → 주문 실패</pre></div></div>
  <div class="col"><ul>
    <li><b>조건부 UPDATE</b>: 재고 확인과 차감을 한 문장으로 → 동시 주문에도 음수 재고 없음 (CHECK <code>stock &gt;= 0</code>)</li>
    <li><b>낙관적 락</b> <code>version</code>: 관리자 재고 수정과 주문이 겹칠 때 충돌 감지</li>
    <li>${T('stock_history')}: 같은 트랜잭션에서 기록 (입고 · 주문 · 취소, 근거 ID)</li>
    <li>${T('price_history')}: 가격 변경 이력 → 장바구니 가격 인하 알림 근거</li>
    <li>${T('restock_request')}: 재고 0 → 양수가 되면 신청자에게 알림</li>
    <li>주문제작(MADE_TO_ORDER)은 재고를 차감하지 않음</li>
  </ul></div></div>
<div class="dg grow">${mm(D.stock)}</div>`, { kicker: '자사몰 규모: 창고별 재고 대신 SKU 재고 + 원장', stack: true }));

  // 6. 상품 상태
  out.push(slide('상품 상태 흐름', `<div class="col w2 dg">${mm(D.pstatus)}</div>
<div class="col">
  <div class="box soft"><h3>상태값</h3><ul>
    <li><code>DRAFT</code> 등록 중</li>
    <li><code>ON_SALE</code> 판매 중</li>
    <li><code>SOLD_OUT</code> 품절</li>
    <li><code>STOPPED</code> 판매 중지</li></ul></div>
  <div class="box"><h3>규칙</h3><ul>
    <li>품절은 <b>SKU 재고 기준</b>: 판매 중인 SKU가 모두 0이면 시스템이 SOLD_OUT, 재입고되면 ON_SALE</li>
    <li>판매 시작 조건: 상품정보제공고시 <b>필수 항목이 모두</b> 채워져야 ON_SALE</li>
    <li>${T('product_status_history')}: 이전 · 다음 상태, 사유, 처리자 (시스템 변경은 NULL)</li></ul></div>
</div>`, { kicker: 'varchar + CHECK 제약' }));

  // 7. 가구 특화 ①
  out.push(slide('가구 특화 ① 치수 · 포장 박스 · 판매 방식', `<div class="col">
  <div class="box"><h3>치수는 두 군데</h3><ul>
    <li><b>상품</b> 대표 치수: 목록 화면에 바로 표시 (조인 없이)</li>
    <li><b>SKU</b> 실제 치수: 침대 SS / Q / K처럼 옵션별로 다름 → 방 치수와 비교</li>
    <li>단위는 mm 정수</li></ul></div>
  <div class="box hl"><h3>${esc(L('sku_package'))} <span class="phys">sku_package</span></h3><ul>
    <li>SKU 1개가 여러 박스로 출고 (침대 = 헤드보드 + 프레임 + 갈빗살)</li>
    <li>박스별 크기 · 무게 → <b>화물 운임</b>, <b>현관문 · 엘리베이터 통과 여부</b> 판단</li></ul></div>
</div>
<div class="col">
  <div class="box"><h3>판매 방식 <span class="phys">sale_type</span></h3>
  <table>
    <tr><th>값</th><th>재고</th><th>출고일</th></tr>
    <tr><td>NORMAL 일반</td><td>차감</td><td>결제 후 출고 소요일</td></tr>
    <tr><td>PRE_ORDER 예약</td><td>stock = 예약 한도</td><td><code>ship_expected_date</code> 필수</td></tr>
    <tr><td>MADE_TO_ORDER 주문제작</td><td>차감 안 함</td><td><code>make_days</code> 필수</td></tr>
  </table></div>
  <div class="formula">출고 예정일 = 결제일 + 제작 기간(make_days) + 출고 소요일(lead_days) + 권역 추가일
    <small>제작 기간은 상품마다 다르므로 상품에, 출고 소요일은 배송 방식이므로 배송 정책에</small></div>
  <ul><li>조건 컬럼은 CHECK로: 해당 판매 방식일 때만 값, 아니면 NULL</li></ul>
</div>`, { kicker: '가구몰이라서 생긴 것들' }));

  // 8. 가구 특화 ② 조립식 + 부가 서비스
  out.push(slide('가구 특화 ② 조립식 · 부가 서비스', `<div class="row">
  <div class="box"><h3>조립 정보 <span class="phys">product.assembly_*</span></h3><ul>
    <li>조립 방식: 완제품 / 자가조립 / 기사 설치</li>
    <li>난이도 · 예상 시간 · 필요 인원 · 필요 공구</li>
    <li>HARD이거나 2인 이상이면 조립 서비스 우선 제안</li></ul></div>
  <div class="box"><h3>부품과 설명서</h3><ul>
    <li>${T('product_part')}: 설명서 표기 기준 부품 목록, 단품 구매 가능 여부</li>
    <li>${T('assembly_step')}: 단계별 조립 설명서</li>
    <li>${T('assembly_step_part')}: 단계마다 쓰는 부품 → "3단계의 B 볼트"로 요청</li></ul></div>
  <div class="box hl"><h3>부가 서비스</h3><ul>
    <li>${T('addon_service')}: 폐가구 수거 · 조립 대행</li>
    <li>${T('product_addon_service')}: 상품별 제공 여부 · 금액</li>
    <li>금액은 할인 · 무료배송 기준에서 제외</li></ul></div>
</div>
<div class="dg grow">${mm(D.partreq)}</div>`, { kicker: '완제품 · 조립식 모두 취급', stack: true }));

  // 9. 세트 · 연관
  out.push(slide('세트 상품 · 연관 상품', `<div class="col">
  <p class="lead">세트는 <b>자체 SKU 없이</b> 구성품 SKU를 각각 고릅니다.</p>
  <div class="box soft"><h3>예: 식탁 세트</h3>
  <table>
    <tr><th>구성품</th><th>수량</th><th>고객이 고르는 것</th></tr>
    <tr><td>원목 식탁</td><td>1</td><td>사이즈 · 색상 SKU</td></tr>
    <tr><td>식탁 의자</td><td>4</td><td>색상 SKU</td></tr>
  </table></div>
  <div class="box"><h3>세트 규칙</h3><ul>
    <li>${T('product_set_item')}: 세트 상품 ID + 구성품 상품 ID (복합 PK) + 수량</li>
    <li>세트 가격 = <b>구성품 SKU 가격 합계</b> (표시용, 세트 할인 없음)</li>
    <li>재고 · 주문은 구성품 SKU 단위 → 재고를 두 번 관리하지 않음</li>
    <li>장바구니에서는 <code>bundle_key</code>로 구성품을 한 세트로 묶음</li></ul></div>
</div>
<div class="col">
  <div class="box"><h3>${esc(L('product_relation'))} <span class="phys">product_relation</span></h3><ul>
    <li>함께 사면 좋은 상품, 비슷한 상품</li>
    <li>판매 중지된 상품이 장바구니에 있으면 비슷한 상품 제안</li></ul></div>
  <div class="box hl"><h3>왜 세트에 SKU를 따로 만들지 않았나</h3>
    <p style="margin:0">세트 SKU를 따로 두면 의자 재고가 "단품 의자"와 "세트 속 의자" 두 곳에 생깁니다. 구성품 SKU를 그대로 쓰면 재고가 한 곳에만 있습니다.</p></div>
</div>`, { kicker: 'product_type = SINGLE / SET' }));

  // 10. 상품정보제공고시
  const notice = areaGroups.find((g) => g.name === 'product_notice_info').tables.map((t) => t.name);
  out.push(slide('상품정보제공고시', `<div class="col">
  <p class="lead">품목마다 법으로 표시해야 하는 항목이 다릅니다. <b>컬럼이 아니라 행</b>으로 만들었습니다.</p>
  <table>
    <tr><th>품목 유형</th><th>법정 항목 예</th></tr>
    <tr><td>가구</td><td>품명 · 모델명, 구성품, 주요 소재, 크기, 배송 · 설치비용</td></tr>
    <tr><td>침구 · 커튼</td><td>제품 소재, 색상, 치수, 세탁방법</td></tr>
    <tr><td>주방용품 · 가전</td><td>재질, 정격전압 · 소비전력, 안전인증</td></tr>
  </table>
  <ul>
    <li>${T('notice_type')} → ${T('notice_item')}: 유형별 항목 마스터</li>
    <li>${T('product_notice')}: 상품별 유형 (상품과 1:1, 부모 PK를 그대로 PK로)</li>
    <li>${T('product_notice_value')}: 항목마다 값 1행</li>
    <li>고시가 개정되면 <b>행만 추가 · 비활성</b> → 테이블 변경 없음</li>
    <li>카테고리에 기본 유형을 두어 상품 등록 시 미리 선택</li>
  </ul>
</div>
<div class="col dg">${erSvg(ctx, notice, { hideAudit: true, W: 360, H: 380 }).svg}</div>`, { kicker: '법정 표시 항목' }));

  // 11. 검색 · 추천 · 다른 영역
  out.push(slide('검색 · 추천 · 다른 영역과의 연결', `<div class="col">
  <div class="box"><h3>필터 · 검색</h3><ul>
    <li>${T('color_family')}: 옵션 값 단위 (화이트 오크 → 우드)</li>
    <li>${T('product_material')}: 부위별 (상판 원목, 다리 스틸)</li>
    <li>${T('attribute')}: 카테고리별 (침대 사이즈, 소파 인원) → <b>데이터로 추가</b></li>
    <li>${T('search_synonym')}: 스토어 · 커뮤니티 공용</li></ul></div>
  <div class="box soft"><h3>주거 맞춤 추천 (조회 시 계산)</h3><ul>
    <li>${T('product_home_fit')}: MD가 지정한 주거 조건 ↔ 회원 주거 정보</li>
    <li>${T('product_style')}: 스타일 ↔ 회원 취향</li>
    <li>SKU 치수 · 포장 박스 ↔ 방 치수 · 현관문 · 엘리베이터</li></ul></div>
</div>
<div class="col">
  <table>
    <tr><th>연결 영역</th><th>어떻게</th></tr>
    <tr><td>커뮤니티</td><td>사진 속 상품 태그 → 상품 상세 "이 상품이 쓰인 사진"</td></tr>
    <tr><td>장바구니 · 주문</td><td>모두 <code>sku_id</code>로 연결, 주문 시 상품명 · 옵션 · 가격 스냅샷</td></tr>
    <tr><td>배송</td><td><code>shipping_policy_id</code>: 택배 · 화물 · 설치배송</td></tr>
  </table>
  <div class="box hl"><h3>캐시 컬럼 원칙</h3><ul>
    <li>원본은 각 영역에, <b>숫자는 그 숫자를 보여 주는 테이블</b>에</li>
    <li>태그된 글 수: 원본 커뮤니티 <code>post_product_tag</code> → 상품 <code>tagged_post_count</code> (공개 글, 같은 글은 1회)</li>
    <li>스크랩 · 장바구니 · 판매 수도 같은 방식, 원본과 같은 트랜잭션에서 갱신</li>
    <li>조회 수는 모아서 배치 반영 (인기 상품 쓰기 집중 방지)</li></ul></div>
</div>`, { kicker: '상품은 거의 모든 영역이 참조' }));

  // 12. 요약 + 예상 질문
  out.push(slide('설계 포인트와 예상 질문', `<div class="col">
  <div class="box soft"><h3>설계 포인트</h3><ul>
    <li><span class="tag">구조</span>옵션을 행으로, 조합은 SKU · 재고 · 주문의 단일 기준</li>
    <li><span class="tag">가구</span>SKU 치수 · 포장 박스 · 조립 설명서 · 부가 서비스 · 주문제작 기간</li>
    <li><span class="tag">법규</span>품목별 고시 항목을 행 구조로, 필수 항목이 있어야 판매</li>
    <li><span class="tag">정합성</span>조건부 UPDATE + 낙관적 락 + 재고 원장, 상태 이력</li>
    <li><span class="tag">규모</span>자사몰에 맞게 창고 재고 · 검수 승인 · 검색 로그는 제외</li></ul></div>
</div>
<div class="col w2"><div class="qa">
  <div class="box"><h3>옵션을 왜 컬럼으로 안 만들었나요?</h3><p>가구는 상품마다 옵션 축이 달라서, 컬럼으로 만들면 대부분 비거나 옵션이 생길 때마다 테이블을 바꿔야 합니다.</p></div>
  <div class="box"><h3>창고별 재고는요?</h3><p>자사몰 규모라 SKU 재고 하나로 관리합니다. 대신 재고 원장으로 모든 변경을 추적합니다.</p></div>
  <div class="box"><h3>리뷰 수 · 평점은 원본이 없는데요?</h3><p>다음 단계인 구매 리뷰를 위해 미리 둔 캐시 자리입니다.</p></div>
  <div class="box"><h3>카테고리 목록 조회가 느리지 않나요?</h3><p><code>(category_id, status, sale_price)</code> 복합 인덱스로 전체 스캔 없이 정렬까지 인덱스에서 끝납니다.</p></div>
</div></div>`, { kicker: '마무리' }));

  return `${head('상품 영역 발표 자료')}
<style>${fs.readFileSync(path.join(__dirname, 'slides.css'), 'utf8')}</style>
${out.join('\n')}
${mermaidInit}
</body></html>`;
};

(async () => {
  await initViz();
  await renderPdf({ html: makeHtml(), name: 'slides_product', outPdf });
})();
