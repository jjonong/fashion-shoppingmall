// 영역별 요약 설계서 (A4 세로, 몇 쪽 분량). 현재: 고객
// 사용: npm run summary            (기본: ../../docs/erd.dbml → ../../docs/고객_설계_요약.pdf)
//       node summary.js <in.dbml> <out.pdf> [미리보기 PNG 폴더]
// 테이블 수·키·관계·ERD는 DBML에서 자동 생성, 설계 판단·정책 설명은 이 파일에 직접 쓴 문장이다.
const path = require('path');
const { ROOT, esc, noteOf, mm, fig, load, initViz, erSvg, head, mermaidInit, renderPdf } = require('./lib');
const D = require('./diagrams');

const src = process.argv[2] || path.join(ROOT, 'docs', 'erd.dbml');
const outPdf = process.argv[3] || path.join(ROOT, 'docs', '고객_설계_요약.pdf');
const previewDir = process.argv[4];
const ctx = load(src);
const { tableMap, groups, refs, compositePk } = ctx;

const PREFIX = 'member_';
const areaGroups = groups.filter((g) => g.name.startsWith(PREFIX));
const tables = areaGroups.flatMap((g) => g.tables.map((t) => t.name));
const inArea = new Set(tables);
const innerRefs = refs.filter((r) => inArea.has(r.child) && inArea.has(r.parent));
const inboundRefs = refs.filter((r) => !inArea.has(r.child) && inArea.has(r.parent));
const gTitle = (g) => noteOf(g.note).replace(/^[^-]+- /, '');

const groupDesc = {
  member_basic: '계정·프로필, 주거 정보·방 치수, 소셜 연동, 배송지',
  member_terms_noti_style: '약관 버전과 동의 이력, 알림 수신 설정, 스타일 취향',
  member_security: '로그인 이력, 1회용 토큰, 기기 세션, 비밀번호 이력, 관리자 조회 기록',
  member_lifecycle: '상태 전환 이력, 닉네임 이력, 금칙어',
};

// ---------- 테이블 요약표 (DBML 자동) ----------
function keySummary(t) {
  const out = [];
  const cpk = compositePk(t);
  const pk = cpk.length ? cpk : t.fields.filter((f) => f.pk).map((f) => f.name);
  out.push(`<span class="k pk">PK</span> ${pk.join(', ')}`);
  const uk = [
    ...t.fields.filter((f) => f.unique).map((f) => f.name),
    ...(t.indexes || []).filter((i) => i.unique && !i.pk).map((i) =>
      i.columns.some((c) => c.type === 'expression') ? `${i.name} (함수 기반)` : i.columns.map((c) => c.value).join(', ')),
  ];
  if (uk.length) out.push(`<span class="k uk">UK</span> ${uk.map(esc).join(' · ')}`);
  const fks = refs.filter((r) => r.child === t.name).map((r) => `${r.ccol} → ${r.parent}`);
  if (fks.length) out.push(`<span class="k fk">FK</span> ${fks.join(' · ')}`);
  return out.join('<br>');
}
let no = 0;
const tableRows = areaGroups.map((g) => `<tr class="grp"><td colspan="4">${esc(gTitle(g))} <small>${g.tables.length}개</small></td></tr>` +
  g.tables.map((x) => {
    const t = tableMap[x.name];
    return `<tr><td class="num">${++no}</td><td class="mono b">${t.name}</td><td>${esc(noteOf(t.note))}</td><td class="mono sm">${keySummary(t)}</td></tr>`;
  }).join('')).join('');

const makeHtml = () => {
  // 허브형 배치: member_account 가운데, 보안·상태 테이블은 왼쪽, 프로필·약관·취향은 오른쪽
  const left = groups.filter((g) => ['member_security', 'member_lifecycle'].includes(g.name)).flatMap((g) => g.tables.map((t) => t.name));
  const { svg, ext } = erSvg(ctx, tables, { W: 515, H: 640, leftOf: { hub: 'member_account', tables: left } });
  return `${head('고객 영역 설계 요약')}

<section class="sum-sheet">
  <div class="sum-head">
    <div class="eyebrow">DESIGN SUMMARY · 고객</div>
    <h1>고객 영역 설계 요약</h1>
    <p>인테리어 가구몰 DB · MySQL 8.0 · 원본 docs/erd.dbml · 전체 명세는 DB_설계서.pdf</p>
  </div>
  <div class="cover-stats">
    <div><b>${tables.length}</b><span>테이블</span></div>
    <div><b>${areaGroups.length}</b><span>영역</span></div>
    <div><b>${innerRefs.length}</b><span>고객 영역 내부 FK</span></div>
    <div><b>${inboundRefs.length}</b><span>다른 영역 → 고객 참조</span></div>
  </div>
  <div class="ov sum-groups">
    ${areaGroups.map((g) => `<div class="ov-col s1"><div class="ov-head">${esc(gTitle(g))}<span>${g.tables.length}개</span></div>
      <p class="small">${groupDesc[g.name] || ''}</p>
      <div class="chips">${g.tables.map((t) => `<span>${t.name}</span>`).join('')}</div></div>`).join('')}
  </div>

  <h3>핵심 설계 결정</h3>
  <table class="rules decisions">
    <tr><th>결정</th><th>이유</th></tr>
    <tr><td>회원 본체는 <code>member_account</code> 하나</td><td>로그인·주문·글쓰기가 모두 같은 회원을 가리킨다. <code>member</code>는 MySQL 8.0.17+ 예약어라 이름을 바꿨다</td></tr>
    <tr><td>여러 개·선택 정보는 별도 테이블</td><td>소셜 계정(1:N), 배송지(1:N), 주거 정보(1:1 선택)를 분리해 컬럼 추가 없이 확장하고, 탈퇴 시 행 단위로 지운다</td></tr>
    <tr><td>개인정보는 암호화·해시로만 저장</td><td>휴대폰·공동현관 비밀번호는 AES-256, CI/DI·토큰은 해시만. 원문이 유출되지 않게 한다</td></tr>
    <tr><td>상태는 4개, 잠금은 상태가 아님</td><td>ACTIVE / DORMANT / SUSPENDED / WITHDRAWN. 30분 로그인 잠금은 일시적이라 <code>locked_until</code>로만 판단</td></tr>
    <tr><td>바뀌는 값은 이력 테이블로</td><td>상태 · 닉네임 · 비밀번호 · 약관 동의 · 로그인 시도를 모두 행으로 남겨 CS · 감사 · 제재 판단 근거로 쓴다</td></tr>
    <tr><td>탈퇴 = 삭제가 아니라 마스킹</td><td>주문 · 글 등 다른 테이블의 FK를 지키면서 개인정보만 지운다. 같은 이메일로 재가입 가능, 같은 사람(CI)은 30일 후(<code>withdrawn_identity</code>)</td></tr>
    <tr><td>가구가 집에 들어가는지 DB로 판단</td><td>배송지에 현관문 · 엘리베이터 치수와 사다리차 진입 여부를 저장해 박스 치수(<code>sku_package</code>)와 비교. 방 치수(<code>member_room</code>)까지 이어서 확인</td></tr>
  </table>
</section>

<section class="page">
  <h2>1. 고객 영역 ERD</h2>
  ${fig('ERD', svg, `키 컬럼(PK·FK·UK)만 표시${ext.length ? ` · 회색은 다른 영역 테이블: ${ext.join(', ')}` : ''} · 끝 모양: 까마귀발 = N, 세로줄 = 1, 원 = 0 허용`)}
</section>

<section class="page">
  <h2>2. 테이블 한눈에 보기 <small>${tables.length}개</small></h2>
  <table class="sum-tables">
    <thead><tr><th>#</th><th>테이블</th><th>역할</th><th>키 · 제약</th></tr></thead>
    <tbody>${tableRows}</tbody>
  </table>
</section>

<section class="page">
  <h2>3. 설계 과정</h2>
  <table class="rules process">
    <tr><th>단계</th><th>한 일</th><th>고객 테이블 적용 예</th></tr>
    <tr><td>① 요구사항</td><td>기능 · 보안 · 법 세 방향으로 저장할 것 정리</td><td>이메일+소셜 로그인, 배송지 여러 개, 등급, 로그인 잠금, 탈퇴 마스킹, 약관 동의 이력</td></tr>
    <tr><td>② 엔티티 도출</td><td>요구사항 문장의 명사 → 테이블. "한 회원에 여러 개?"면 분리</td><td>소셜 계정을 kakao_id · naver_id 컬럼으로 두지 않고 <code>member_social</code> 행으로</td></tr>
    <tr><td>③ 관계 · 카디널리티</td><td>1:1 · 1:N · N:M 결정, N:M은 매핑 테이블</td><td>주거 정보 1:1 분리, 배송지 1:N, 스타일 N:M(<code>member_style</code>), 추천인 자기 참조</td></tr>
    <tr><td>④ 정규화 · 반정규화</td><td>중복 제거(3NF), 조회가 잦은 집계만 캐시 컬럼</td><td>등급 혜택은 <code>member_grade</code>에 한 번만. <code>post_count</code> · <code>point_balance</code>는 캐시</td></tr>
    <tr><td>⑤ 키</td><td>바뀌는 값은 PK로 쓰지 않음 → 대리키</td><td>이메일은 바뀌고 마스킹되므로 PK는 <code>member_id</code>, 이메일은 UNIQUE</td></tr>
    <tr><td>⑥ 무결성</td><td>규칙을 앱이 아니라 DB 제약으로</td><td>status CHECK, <code>ci_hash</code> UNIQUE(1인 1계정), 기본 배송지 1개 함수 기반 UNIQUE, 이메일 변경 토큰은 <code>new_email</code> 필수 CHECK</td></tr>
    <tr><td>⑦ 생명주기 · 보안</td><td>가입 → 활성 → 휴면/정지 → 탈퇴 단계별 데이터 처리</td><td>상태 이력, 휴면 안내, 탈퇴 마스킹, 암호화 · 해시 저장</td></tr>
    <tr><td>⑧ 인덱스</td><td>화면의 조회 조건 기준</td><td>최근 로그인 <code>(member_id, created_at)</code>, IP별 실패 <code>(ip_address, created_at)</code>, 휴면 대상 <code>(status, last_login_at)</code></td></tr>
    <tr><td>⑨ 검증</td><td>샘플 데이터 + 시나리오 쿼리 (DDL 작성 시)</td><td>대소문자만 다른 이메일 중복 → 실패, 탈퇴 후 같은 이메일 재가입 → 성공, 같은 CI로 30일 안에 재가입 → 실패</td></tr>
  </table>

  <h2>4. 보안 · 개인정보</h2>
  <table class="rules">
    <tr><th>대상</th><th>저장 방식</th></tr>
    <tr><td>비밀번호</td><td>bcrypt 해시. 소셜 전용 가입은 NULL. 최근 3개 재사용 금지 (<code>password_history</code>)</td></tr>
    <tr><td>휴대폰 · 공동현관 비밀번호</td><td>AES-256 암호문(<code>_enc</code>). 휴대폰은 검색·중복확인용 SHA-256(<code>phone_hash</code>)을 함께 저장</td></tr>
    <tr><td>본인인증 CI/DI</td><td>해시만 저장. <code>ci_hash</code> UNIQUE로 1인 1계정. 탈퇴 시 CI 해시만 <code>withdrawn_identity</code>로 옮겨 30일 재가입 제한 (member_id 없이 보관, 기한 후 파기). 신규 가입 혜택은 본인인증 회원에게만</td></tr>
    <tr><td>토큰</td><td>이메일 인증 · 비밀번호 재설정 · 이메일 변경(<code>new_email</code>) · 휴면 해제 · 리프레시 토큰은 SHA-256 해시만, 만료 · 사용 · 폐기 시각 기록</td></tr>
    <tr><td>로그인 보호</td><td>5회 실패 시 30분 잠금(<code>locked_until</code>), 모든 시도는 <code>login_history</code>에 IP · 기기와 함께 기록</td></tr>
    <tr><td>관리자 조회</td><td><code>privacy_access_log</code>에 조회 · 수정 · 다운로드 · 마스킹 해제와 사유 기록</td></tr>
    <tr><td>보관 기간</td><td><code>login_history</code> 1년, <code>privacy_access_log</code> 2년, 세션 만료 30일 · 토큰 만료 7일 후 삭제, <code>password_history</code> 최근 3개. 정리 배치용 <code>created_at</code> · <code>expires_at</code> 인덱스</td></tr>
  </table>
</section>

<section class="page">
  ${fig('로그인 처리 흐름', mm(D.login), '실패·잠금·성공 모두 login_history에 기록')}
  <h2>5. 회원 생명주기</h2>
  ${fig('회원 상태 흐름', mm(D.mstatus), '전환할 때마다 member_status_history에 이전·다음 상태, 사유, 처리자, 근거 신고 기록')}
  <table class="rules">
    <tr><th>상태</th><th>들어가는 조건</th><th>빠져나오는 조건</th><th>남는 기록</th></tr>
    <tr><td>ACTIVE</td><td>가입, 휴면 해제, 정지 만료</td><td>—</td><td>SIGN_UP · DORMANT_RELEASE · SANCTION_END</td></tr>
    <tr><td>DORMANT</td><td>1년 미접속 (11개월에 <code>dormant_notice_sent_at</code> 안내)</td><td>로그인 + 본인 확인</td><td>DORMANT_BATCH. 상태값만 변경, 분리보관 없음</td></tr>
    <tr><td>SUSPENDED</td><td>신고 승인 · 관리자 제재</td><td><code>suspended_until</code> 경과 (배치)</td><td>SANCTION + <code>report_id</code> · <code>effective_until</code></td></tr>
    <tr><td>WITHDRAWN</td><td>본인 탈퇴</td><td>없음 (같은 이메일로 신규 가입 가능, 같은 CI는 30일 후)</td><td>WITHDRAW + 사유, CI 해시 → <code>withdrawn_identity</code></td></tr>
  </table>
</section>

<section class="page">
  ${fig('탈퇴 처리', mm(D.withdraw), '행을 지우지 않고 개인정보만 마스킹 → 주문·글 FK 유지')}

  <h2>6. 정책 정리</h2>
  <table class="rules">
    <tr><th>항목</th><th>정책</th><th>담당 컬럼 · 테이블</th></tr>
    <tr><td>닉네임</td><td>2~12자 한글/영문/숫자/_ · 금칙어 불가 · 변경 후 30일 재변경 불가 · 이전 닉네임은 30일간 다른 회원 사용 불가(사칭 방지) · 대소문자 무시 중복 판단 · 탈퇴 시 deleted_{ID}</td><td><code>nickname_changed_at</code>, <code>nickname_history</code>, <code>forbidden_word</code></td></tr>
    <tr><td>금칙어</td><td>완전 일치 / 포함 두 방식, 닉네임 · 글 · 댓글 공용, 관리자가 등록</td><td><code>forbidden_word</code></td></tr>
    <tr><td>배송지</td><td>회원당 여러 개, 기본 1개 · 주거형태(반입 기본값) · 층수 · 엘리베이터 · 반입 치수(선택 입력) · 배송 요청사항 · 공동현관 비밀번호(암호화). 우리 집 = <code>member_home.address_id</code></td><td><code>address</code>, <code>ux_address_default</code></td></tr>
    <tr><td>약관 · 마케팅 동의</td><td>버전별 관리, 필수/선택 구분. 행 = 동의 1건, 철회는 <code>withdrawn_at</code>. 광고성 수신 동의는 채널별(SMS · EMAIL · PUSH · KAKAO) + 야간(21~08시) 별도, 2년마다 동의 사실 안내</td><td><code>terms</code>, <code>member_terms_agreement</code>, <code>reconfirm_notified_at</code></td></tr>
    <tr><td>알림</td><td>유형 × 채널별 스위치. 광고성(EVENT · PRICE_DROP)은 스위치 + 채널 마케팅 동의(+ 야간 동의) 모두 필요</td><td><code>member_notification_setting</code></td></tr>
    <tr><td>등급 · 추천인</td><td>등급 혜택은 등급 테이블에서 관리, 추천인은 회원 자기 참조 + 추천 코드 UNIQUE</td><td><code>member_grade</code>, <code>referred_by</code>, <code>referral_code</code></td></tr>
  </table>

  <h3>MySQL 제약 활용</h3>
  <ul class="small">
    <li><b>이메일 · 닉네임 중복</b>: 대소문자 무시 콜레이션(utf8mb4_0900_ai_ci)이라 일반 UNIQUE로 "Wood"와 "wood"를 같은 값으로 막는다.</li>
    <li><b>기본 배송지 1개</b>: <code>UNIQUE ((CASE WHEN is_default='Y' THEN member_id END))</code> 함수 기반 인덱스(8.0.13+). 기본이 아닌 행은 NULL이라 개수 제한 없음.</li>
    <li><b>상태값 · Y/N</b>: CHECK 제약(8.0.16+에서 실제 검사).</li>
  </ul>

  <h3>다음에 검토할 항목</h3>
  <table class="rules">
    <tr><th>항목</th><th>내용</th></tr>
    <tr><td>관리자 계정 분리</td><td>지금은 <code>role</code>로 구분. 권한 세분화 · 2단계 인증 · IP 제한이 필요하면 <code>admin_user</code> 계열로 분리 (상품 쪽 관리자 FK도 변경)</td></tr>
    <tr><td>앱 푸시 기기 토큰</td><td>PUSH 알림 채널은 있지만 FCM/APNs 토큰 저장 테이블 없음 → <code>member_device</code></td></tr>
    <tr><td>휴대폰 인증번호 · 애플 로그인</td><td>SMS 인증번호 시도 횟수 제한 테이블, 애플 탈퇴 시 토큰 revoke용 refresh token 암호화 저장</td></tr>
    <tr><td>등급 산정 기준</td><td>지금은 누적 구매액이라 등급이 내려가지 않음 → 최근 N개월 실적 + 등급 변경 이력 (주문 영역에서 함께 설계)</td></tr>
  </table>
</section>

${mermaidInit}
</body></html>`;
};

(async () => {
  await initViz();
  await renderPdf({ html: makeHtml(), name: 'summary_member', outPdf, footer: '고객 영역 설계 요약', previewDir });
})();
