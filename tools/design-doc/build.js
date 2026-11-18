// docs/erd.dbml → 도식 포함 설계서 PDF (A4 세로 전용)
// - ERD: Graphviz(@viz-js/viz), 흐름도/상태도: Mermaid, PDF 출력: puppeteer-core + 로컬 Chrome
// 사용: npm run pdf                      (기본: ../../docs/erd.dbml → ../../docs/DB_설계서.pdf)
//       node build.js <in.dbml> <out.pdf> [미리보기 PNG 폴더]
// Chrome 경로가 다르면 환경변수 CHROME_PATH로 지정
const fs = require('fs');
const path = require('path');
const { ROOT, esc, noteOf, mm, fig, load, initViz, erSvg, head, mermaidInit, renderPdf, groupDesc } = require('./lib');

const src = process.argv[2] || path.join(ROOT, 'docs', 'erd.dbml');
const outPdf = process.argv[3] || path.join(ROOT, 'docs', 'DB_설계서.pdf');
const previewDir = process.argv[4];
const ctx = load(src);
const { S, tableMap, groups, groupOf, refs, fk, compositePk } = ctx;

// ---------- 전체 구조도 (HTML 카드 + 영역 간 연결 표) ----------
const gTitle = (g) => noteOf(g.note).replace(/^[^-]+- /, '');
function overview() {
  const stages = [['member', '1단계 고객', 's1'], ['product', '2단계 상품', 's2'], ['community', '3단계 커뮤니티', 's3'], ['order', '4단계 주문', 's4']];
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


// ---------- 영역별 ERD (Graphviz, lib.erSvg) ----------
function erSection(g) {
  const { svg, ext } = erSvg(ctx, g.tables.map((x) => x.name), { hideAudit: !g.name.startsWith('member') });
  return `<section class="erd-page">
    <h3>ERD · ${esc(noteOf(g.note))} <small>${g.tables.length}개</small></h3>
    <p class="gdesc">${groupDesc[g.name] || ''}</p>
    ${fig('ERD', svg, `키 컬럼(PK·FK·UK)만 표시, 전체 컬럼은 8장 명세 참고${ext.length ? ` · 다른 영역 테이블(PK만 표시): ${ext.join(', ')}` : ''}${g.name.startsWith('member') ? '' : ' · 관리자 감사 컬럼(created_by 등) → member_account 선은 생략'}`)}
  </section>`;
}
const erOf = (prefix) => groups.filter((g) => g.name.startsWith(prefix)).map(erSection).join('');

const D = require('./diagrams');

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

const makeHtml = () => `${head('인테리어 가구몰 DB 설계서')}

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
    <div class="sc s1"><b>1단계 고객</b><span>${stageCount('member')}개</span><p>회원 · 프로필 · 주거정보 · 약관 · 보안 · 상태</p></div>
    <div class="sc s2"><b>2단계 상품</b><span>${stageCount('product')}개</span><p>옵션 · SKU · 가구 배송 · 재고 · 필터</p></div>
    <div class="sc s3"><b>3단계 커뮤니티</b><span>${stageCount('community')}개</span><p>고객 집사진 · 집들이 · 브랜드 매거진</p></div>
    <div class="sc s4"><b>4단계 주문</b><span>${stageCount('order')}개</span><p>장바구니 · 주문 · 결제 · 배송 · 설치 일정</p></div>
  </div>
  <div class="points">
    <div><b>사진 속 상품 태그</b><p>커뮤니티 사진의 % 좌표에 스토어 상품을 연결해 바로 구매로 이어지게 한다.</p></div>
    <div><b>블록 에디터</b><p>집들이 · 매거진 본문을 제목 · 문단 · 사진 · 상품카드 블록의 순서로 저장한다.</p></div>
    <div><b>옵션 그룹 → SKU</b><p>색상 · 사이즈 · 구성처럼 상품마다 다른 가구 옵션을 조합해 재고 단위를 만든다.</p></div>
    <div><b>개인정보 보호</b><p>암호화 · 해시 저장, 로그인 잠금, 탈퇴 마스킹, 관리자 조회 기록.</p></div>
  </div>
  <table class="meta">
    <tr><th>DBMS</th><td>MySQL 8.0.16 이상 · InnoDB · utf8mb4</td></tr>
    <tr><th>판매 방식</th><td>자사 직접 판매 (입점 판매자 · 정산 없음)</td></tr>
    <tr><th>원본</th><td>docs/erd.dbml (dbdiagram.io)</td></tr>
    <tr><th>다음 단계</th><td>구매 리뷰 · 쿠폰 · 포인트 · 반품/교환 (대기)</td></tr>
    <tr><th>작성일</th><td>2026-11-18</td></tr>
  </table>
</section>

<section class="toc page">
  <h2>목차</h2>
  <ol>
    <li>개요와 전체 구조</li>
    <li>공통 설계 원칙</li>
    <li>1단계 고객 — 보안 · 로그인 · 회원 상태 · 탈퇴 · 닉네임 정책 · ERD</li>
    <li>2단계 상품 — 옵션/SKU · 재고 · 상태 흐름 · 가구 배송비 · ERD</li>
    <li>3단계 커뮤니티 — 글 구조 · 블록 에디터 · 상품 태그 · 구매 인증 · 주거 맞춤 추천 · ERD</li>
    <li>4단계 주문 — 장바구니 진단 · 주문 흐름 · 주문 상품 상태 · 설치 일정 예약 · 부분 취소 · 가상계좌 · 현금영수증 · 부가 서비스 · ERD</li>
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
    <tr><td>본인인증 CI/DI</td><td>해시만 저장. <code>ci_hash</code> UNIQUE로 1인 1계정. 탈퇴 시 CI 해시만 <code>withdrawn_identity</code>로 옮겨 30일 재가입 제한(member_id 없이 보관, 기한 후 파기)</td></tr>
    <tr><td>토큰</td><td>이메일 인증 · 비밀번호 재설정 · 이메일 변경(<code>new_email</code>) · 휴면 해제 · 리프레시 토큰은 SHA-256 해시만 저장, 만료 · 사용 · 폐기 시각 기록</td></tr>
    <tr><td>관리자 조회</td><td>privacy_access_log에 조회 · 수정 · 다운로드 · 마스킹 해제 기록</td></tr>
    <tr><td>보관 기간</td><td>login_history 1년, privacy_access_log 2년, 세션 만료 30일 · 토큰 만료 7일 후 삭제, password_history 최근 3개. 정리 배치용 <code>created_at</code> · <code>expires_at</code> 인덱스</td></tr>
  </table>
  ${fig('로그인 처리 흐름', mm(D.login), '5회 실패 시 30분 잠금, 모든 시도를 기록. 잠금은 회원 상태가 아니라 locked_until로 판단')}
  ${fig('회원 상태 흐름', mm(D.mstatus), '전환할 때마다 member_status_history에 사유 · 처리자 · 근거 신고를 기록. 휴면은 상태값만 바꾸고 분리보관하지 않음(2023년 법 개정으로 의무 폐지)')}
  ${fig('탈퇴 처리', mm(D.withdraw), 'soft delete + 마스킹. 같은 이메일로 재가입 가능, 같은 사람(CI)은 30일 후 재가입')}
  <div class="callout"><b>인테리어몰 특화</b> — member_home(주거형태 · 평수 · 가족형태 · 반려동물 · 이사 예정일)은 맞춤 추천과 집들이 작성 기본값에 쓰고, address_id로 "우리 집" 배송지와 연결한다. 배송지에는 층수 · 엘리베이터 여부와 <b>반입 경로 치수</b>(현관문 폭, 엘리베이터 문 폭 · 내부 깊이 · 높이, 사다리차 진입 가능 여부)를 둬서 sku_package 박스가 현관문 → 엘리베이터(또는 사다리차 · 계단) → 방문(member_room)을 통과하는지 주문 전에 확인한다. 배송 요청사항과 공동현관 비밀번호(암호화)도 저장한다. style은 회원 · 상품 · 커뮤니티 글이 함께 쓰는 공유 마스터다.</div>
  <div class="callout"><b>마케팅 동의</b> — 광고성 정보 수신 동의는 member_terms_agreement(MARKETING_SMS · EMAIL · PUSH · KAKAO, 야간 21~08시는 MARKETING_NIGHT 별도)가 유일한 기준이다. member_notification_setting은 회원이 켜고 끄는 스위치이고, 광고성 알림(EVENT · PRICE_DROP)은 스위치 ON + 해당 채널 동의(+ 야간 동의)가 모두 있어야 보낸다. 동의 행은 철회 시 withdrawn_at만 채우고, 2년마다 수신 동의 사실을 안내한 시각을 reconfirm_notified_at에 남긴다(정보통신망법 시행령 62조).</div>
  <div class="callout"><b>닉네임 정책</b> — 2~12자 한글/영문/숫자/_ · forbidden_word 금칙어 불가 · 변경 후 30일간 재변경 불가(nickname_changed_at) · 이전 닉네임은 nickname_history에 남겨 30일간 다른 회원이 쓰지 못하게 해 사칭을 막고 신고 추적에 쓴다. 대소문자 · 악센트 무시 콜레이션이라 'Wood'와 'wood'는 같은 닉네임으로 본다.</div>
</section>
${erOf('member')}

<section class="page">
  <h2>4. 2단계 상품</h2>
  ${fig('옵션 → SKU 구조 (예시)', mm(D.option), '옵션 축이 상품마다 다른 가구에 맞춘 구조. 조합 중복은 option_key(값 ID 오름차순) UNIQUE로 방지')}
  ${fig('재고 흐름과 재입고 알림', mm(D.stock), '모든 변경을 원장에 기록하고, 재고가 0에서 양수가 되면 재입고 알림 신청자에게 발송. 주문제작(MADE_TO_ORDER)은 재고를 차감하지 않음')}
  ${fig('상품 상태 흐름', mm(D.pstatus), '품절 기준은 SKU 재고 하나로 통일 — 시스템 변경은 changed_by NULL로 product_status_history에 기록')}
</section>
<section class="page">
  ${fig('가구 배송비 계산 흐름', mm(D.shipfee), '배송지(1단계 address)의 우편번호 · 층수 · 엘리베이터와 상품 배송 정책으로 배송 가능 여부 · 비용 · 출고 예정일을 계산')}
  <div class="callout"><b>가구 배송</b> — shipping_policy: 일반택배 / 화물택배 / 업체 직접 설치배송, 기본 · 무료조건 · 반품 · 교환 비용, 사다리차 · 계단 운반비, 출고 소요일, 오늘출발 마감 시각. 지역 차이는 delivery_zone(권역)과 shipping_policy_zone(권역별 가능 여부 · 추가비 · 추가 소요일)으로 처리한다. sku_package는 SKU 하나가 여러 박스로 나가는 가구의 박스별 크기 · 무게를 저장해 화물 운임과 배송 차량 판단에 쓴다. 상품에는 조립 방식(완제품 / 자가조립 / 기사 설치)과 판매 방식(일반 / 예약 / 주문제작)을 둔다.</div>
  <div class="callout"><b>상품정보제공고시 (품목별 항목)</b> — 가구 · 침구 · 주방용품 · 가전은 법정 표시 항목이 다르다. 항목을 컬럼으로 두면 품목이 늘 때마다 테이블을 바꿔야 하므로 notice_type(품목 유형) → notice_item(항목 마스터) → product_notice_value(상품별 값) 행 구조로 저장한다. 카테고리에 기본 유형을 두어 등록 화면에서 항목이 자동으로 나오고, 필수 항목이 모두 채워져야 판매 시작(ON_SALE)할 수 있다.
    <table class="mini"><tr><th>유형</th><th>항목 예시</th></tr>
      <tr><td>FURNITURE 가구</td><td>KC 인증 · 색상 · 구성품 · 주요 소재 · 제조자 · 제조국 · 크기 · 배송·설치비용 · 품질보증기준 · A/S 책임자</td></tr>
      <tr><td>HOME_APPLIANCE 가전</td><td>KC 인증 · 정격전압·소비전력 · 에너지효율등급 · 출시년월 · 제조자 · 제조국 · 크기 · 품질보증기준 · A/S 책임자</td></tr>
      <tr><td>KITCHENWARE 주방용품</td><td>재질 · 구성품 · 크기 · 제조자 · 제조국 · 수입 식품용 기구 신고 여부 · 품질보증기준 · A/S 책임자</td></tr>
    </table></div>
  <div class="callout"><b>자사몰 규모에 맞춘 축소</b> — 창고별 실물 재고(warehouse · sku_inventory), 등록자 · 검수자 분리 승인(product_approval), 검색 로그 · MD 키워드는 두지 않았다. 재고는 판매 가능 재고 하나로 관리하고, 검색은 동의어 사전과 MySQL FULLTEXT(ngram) 인덱스로 처리한다.</div>
</section>
${erOf('product')}

<section class="page">
  <h2>5. 3단계 커뮤니티 (글쓰기)</h2>
  ${fig('글 구조 — 공통 post + 유형별 상세', mm(D.post), '반응 테이블은 post 하나에만 연결되므로 글 유형이 늘어도 바뀌지 않는다')}
  ${fig('글 상태 흐름', mm(D.poststatus), '신고 누적은 report_count 캐시로 자동 BLINDED')}
</section>
<section class="page">
  ${fig('블록 에디터 — post_block', blockMock, '집들이 · 매거진 같은 긴 글')}
  ${fig('사진 속 상품 태그 — post_product_tag', tagMock, '오늘의집 핵심 기능')}
  ${fig('구매 인증 — post_product_tag.purchase_verified', mm(D.verify), '"직접 사서 쓴 가구" 신뢰도 표시. 근거는 글 작성자의 구매 확정 주문 상품(verified_order_item_id → order_item)')}
</section>
<section class="page">
  ${fig('주거 정보 맞춤 추천', mm(D.recommend), '고객 · 상품 · 커뮤니티 데이터를 함께 쓰는 추천. "비슷한 집의 집들이"는 "나와 비슷한 집(같은 주거형태 · 평수대)의 집들이에 태그된 상품"으로 커뮤니티가 추천 근거가 된다')}
  <div class="callout"><b>맞춤 추천 데이터</b> — member_home(주거형태 · 평수 · 가족 · 반려동물)은 product_home_fit(MD가 지정한 잘 맞는 주거 조건)과, member_room(방 가로 · 세로 · 천장 높이 · 방문 폭)은 SKU 치수와 sku_package 박스 크기와 비교한다. 공간 코드는 post_image.space_type · member_room.space_type · product_home_fit(SPACE)이 같은 값을 쓴다. 추천 결과는 저장하지 않고 조회 시 계산한다(데이터가 늘면 배치로 캐시 테이블 추가 검토).</div>
  <div class="callout"><b>반응 · 운영</b> — 댓글은 1단계 대댓글과 @멘션, 대댓글이 있으면 "삭제된 댓글입니다"로 남긴다. 스크랩 = 글 저장 + 상품 찜. 신고는 대상 하나만 지정하고 같은 대상 중복 신고를 막으며, 승인되면 회원 정지를 member_status_history에 남긴다. 자사몰 규모에 맞춰 팔로우 · 해시태그 · 차단 · 질문과답변(상품 문의와 중복)은 두지 않았다. notification은 앱 내 알림함이며 실제 발송은 member_notification_setting을 따른다.</div>
</section>
${erOf('community')}

<section class="page">
  <h2>6. 4단계 주문 (장바구니 · 주문 · 결제 · 배송)</h2>
  ${fig('장바구니 진단 — 저장하지 않고 기존 데이터로 계산', mm(D.cartcheck), '방 치수 · 반입 경로 · 포장 박스 · 배송 정책 · 연관 상품을 조합해 주문 전에 문제를 알려 준다')}
  ${fig('인테리어 플랜 — interior_plan · interior_plan_item', mm(D.plan), '가구는 바로 사지 않고 후보를 모아 비교하다가 한꺼번에 산다. 방 · 스타일 · 예산을 정한 보드에서 확정한 상품을 장바구니로 옮긴다')}
  <div class="callout"><b>인테리어 플랜</b> — interior_plan은 꾸밀 방(member_room) · 목표 스타일(style) · 예산을 가진 보드다. 같은 자리의 후보(예: 소파 3개)를 CANDIDATE로 담아 비교하고 하나를 CHOSEN으로 확정한다. 합계 · 예산 대비 · 방 치수 확인은 저장하지 않고 계산하며, 공유 링크(share_token_hash, 보기 전용)로 가족과 함께 고른다. "장바구니로 담기"는 확정 항목을 cart_item으로 옮기고 plan_id · room_id · source_post_id를 남겨 플랜과 집들이의 구매 전환을 추적한다.</div>
  <div class="callout"><b>비회원 장바구니 · 가격 인하 알림</b> — 비회원은 쿠키 토큰의 해시(guest_token_hash)로 담고, 로그인하면 회원 장바구니로 합친다(같은 SKU는 수량 합산, 담은 가격은 더 낮은 값). 주문은 회원만 할 수 있다. 담은 시점 단가(added_price)로 "담은 뒤 내렸어요"를 보여 주고, 가격이 바뀌면 그 SKU를 담은 회원에게 PRICE_DROP 알림(광고성: 설정 ON + 채널 마케팅 동의 + 야간 동의)을 보낸 뒤 price_alert_price로 같은 가격 중복 발송을 막는다. 상품별 담긴 수는 product.cart_count 캐시로 둔다.</div>
  <div class="callout"><b>가구몰 장바구니</b> — 담을 때 놓을 방(cart_item.room_id)을 고르면 방별 합계와 바닥 면적 점유율, 방문 통과 여부를 보여 주고, 주문하면 방 이름이 설치 위치(order_item.room_name)로 기사에게 전달된다. 집들이 글의 상품 태그나 "이 집 상품 한 번에 담기"로 담으면 유입 글(source_post_id)이 주문 상품까지 이어져, 구매 확정 시 post.purchase_count(작성자 본인 구매 제외)로 "구매로 이어진 집들이"를 보여 준다. 출고일이 다른 가구는 이사일에 한 번에 받기(orders.receive_together, 희망 수령일 기본값 = 이사 예정일)로 같은 날 도착하게 맞춘다.</div>
  <div class="callout"><b>부가 서비스</b> — 폐가구 수거(DISPOSAL)와 조립 서비스(ASSEMBLY)는 addon_service 마스터와 상품별 제공 여부(product_addon_service, 상품별 금액 가능)로 관리한다. 조립은 자가조립 상품만, 수거는 기사가 방문하는 배송만 고를 수 있다. 주문하면 order_item_addon에 이름 · 금액을 복사하고, 부가 서비스 금액은 할인과 무료배송 기준에서 빼며 상품을 취소하면 함께 환불한다(final_amount에 포함).</div>
</section>
<section class="page">
  ${fig('주문 흐름', mm(D.orderflow), '재고는 주문 생성 시 차감하고, 30분 안에 결제되지 않으면 배치로 재고 · 설치 슬롯을 되돌린다. 주문제작(MADE_TO_ORDER)은 재고를 차감하지 않는다')}
  ${fig('주문 상품 상태 흐름 — order_item.status', mm(D.itemstatus), '상태는 상품별로 관리하고 orders.status는 요약(PENDING · PAID · COMPLETED · CANCELED · EXPIRED). 출고 후 반품 · 교환은 다음 단계(클레임)')}
</section>
<section class="page">
  ${fig('설치배송 일정 예약 — install_slot', mm(D.install), '권역 × 날짜 × 오전/오후 슬롯에 하루 가능 건수(capacity)를 두고, 재고 차감과 같은 조건부 UPDATE로 초과 예약을 막는다')}
  <div class="callout"><b>스냅샷</b> — 주문 시점의 상품명 · 옵션 문구 · 단가는 order_item에, 배송지와 반입 경로(층수 · 엘리베이터 · 현관문 치수 · 사다리차 진입)는 order_address에, 배송비 내역(기본 · 권역 · 사다리차 · 계단)은 shipment에 복사한다. 상품 가격이나 회원 배송지가 바뀌어도 주문 내역과 설치 기사 전달 정보는 그대로다.</div>
  <div class="callout"><b>할인 안분과 부분 취소</b> — 등급 할인(다음 단계의 쿠폰 · 포인트 포함)은 주문 단위 금액을 order_item별로 나눠 저장하고, 각 상품의 실결제 몫(final_amount)을 환불 기준으로 쓴다. 취소는 주문 상품 한 줄 단위이고, payment_cancel 1건이 여러 줄을 함께 환불한다(order_item.payment_cancel_id). 부분 취소로 무료배송 기준이 깨지면 shipping_fee_adjust로 배송비를 차감한다.</div>
  <div class="callout"><b>배송 묶음</b> — 같은 배송 정책이고 묶음배송이 허용되면(is_bundle_allowed = Y) 한 shipment로 묶고, 아니면 상품마다 따로 만든다. 택배 · 화물은 송장으로, 설치배송은 희망일 → 확정일 → 기사 배정으로 진행한다. 배송 완료 7일 후 구매 확정되면 product.sales_count와 회원 누적 구매액을 갱신한다.</div>
</section>
<section class="page">
  ${fig('가상계좌 · 현금영수증 — payment · cash_receipt', mm(D.vbank), '가상계좌는 입금 기한까지 재고를 잡아 두고, 입금이 확인되면 현금영수증을 발급한다')}
  <div class="callout"><b>결제수단</b> — 카드 · 간편결제 · 실시간 계좌이체(TRANSFER)는 결제창에서 바로 승인되고, 가상계좌(VIRTUAL_ACCOUNT)는 주문 전용 1회 계좌를 발급한 뒤 입금 통보(웹훅)로 PAID가 된다. 가상계좌는 PG가 원 결제수단으로 되돌려 줄 수 없어서 취소할 때 환불 계좌(payment_cancel.refund_*, 계좌번호 암호화 · 환불 후 파기)를 받는다.</div>
  <div class="callout"><b>현금영수증</b> — 현금성 결제(계좌이체 · 가상계좌)는 cash_receipt에 발급 · 취소를 행으로 남긴다. 가구 소매업은 현금영수증 의무발행업종이라 요청이 없어도 10만 원 이상이면 자진 발급(SELF_ISSUED)한다. 부분 취소하면 원 발급을 CANCEL하고 남은 금액으로 다시 ISSUE한다(original_receipt_id · payment_cancel_id로 연결). 실패 건은 배치로 재시도한다.</div>
  <div class="callout"><b>에스크로</b> — 현금성 결제는 고객이 에스크로(구매안전서비스)를 고를 수 있다(payment.is_escrow). 에스크로 결제는 출고 시 PG에 송장을 등록해야 정산 · 구매 확정이 진행되므로 shipment.escrow_registered_at에 등록 시각을 남긴다.</div>
</section>
${erOf('order')}

<section class="page">
  <h2>7. 표 읽는 법</h2>
  <ul>
    <li><span class="k pk">PK</span> 기본키 · <span class="k fk">FK</span> 외래키 (→ 참조 대상) · <span class="k uk">UK</span> 단일 컬럼 UNIQUE · NN = NOT NULL</li>
    <li>ERD 관계선: 부모의 PK 칸에서 자식의 FK 칸으로 이어진다. 끝 모양은 까마귀발 = N(여럿), 세로줄 = 1, 원 = 0 허용(선택). 부모 쪽 원은 FK가 NULL 가능하다는 뜻</li>
    <li>ERD의 회색 테이블은 다른 영역 테이블(PK만 표시), "+ N columns"는 생략된 일반 컬럼 수</li>
    <li>복합 UNIQUE, 함수 기반 인덱스, 일반 인덱스는 각 표 아래에 적었다.</li>
  </ul>
  <h2>8. 테이블 명세</h2>
  ${specHtml}
</section>

<section class="page">
  <h2>9. 관계(FK) 전체 목록 <small>${refs.length}개</small></h2>
  <table class="rel"><thead><tr><th>FK 컬럼 (자식)</th><th>관계</th><th>참조 (부모)</th></tr></thead><tbody>${relRows}</tbody></table>
</section>

${mermaidInit}
</body></html>`;

(async () => {
  await initViz();
  await renderPdf({ html: makeHtml(), name: 'design', outPdf, footer: '인테리어 가구몰 DB 설계서', previewDir });
})();
