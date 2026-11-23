# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 프로젝트 상태

**패션 브랜드 입점형 쇼핑몰** 포트폴리오 프로젝트 (**W컨셉 벤치마킹**: 디자이너 브랜드 입점형 편집숍, PC 웹 1920 폭 레퍼런스). 경위: 에이블리(앱 중심, PC 웹 없음) → 무신사(흔하고 PC가 헤더까지 1440px에서 잘림) → 2026-11-23 W컨셉으로 확정(사용자 결정, 1920 화면을 꽉 채우는 레이아웃). 2026-11-20에 인테리어몰 설계를 접고 **처음부터 다시 설계** 중(사용자 결정). 현재는 **DB 설계 단계**로, 애플리케이션 코드·빌드·테스트 명령은 아직 없다. 모든 산출물은 `docs/`에 있다.

- 대상 DB: **MySQL 8.0** (8.0.16 이상: CHECK 제약이 실제로 검사됨, 8.0.13 이상: 함수 기반 인덱스). InnoDB, `utf8mb4` / `utf8mb4_0900_ai_ci`.
- 판매 방식: **브랜드 입점형 (W컨셉식)** (사용자 확정). 상품은 브랜드에 속한다. 지금 단계의 판매자 범위는 **브랜드 기본만**(브랜드 정보·브랜드 관리자 계정·입점 상태·브랜드 좋아요). 브랜드 유형(입점 디자이너 브랜드·자체 브랜드 등)은 브랜드 묶음에서 정한다. 수수료·정산은 주문/결제 단계에서 다룬다.
- 품목: **의류 + 신발 + 가방·잡화** (사용자 확정). 뷰티는 제외(W컨셉에는 있지만 범위 밖, 회원 뷰티 정보도 두지 않음). 품목군마다 사이즈 체계·실측 항목·상품정보제공고시 유형이 다르다.
- **진행 방식** (사용자 요청: "너무 광범위하지 않게, 상세하게"): 고객 → 브랜드 기본 → 상품 순서로, **묶음(TableGroup) 단위로 컬럼까지 확정**하며 하나씩 추가한다. 사용자가 확인하기 전에 다음 묶음 테이블을 미리 넣지 않는다. 주문·결제·배송·혜택·커뮤니티는 아직 범위 밖.
- 작업 방식: 사용자는 **설계를 먼저 확정한 뒤 파일(DDL SQL 등)을 만들기**를 원한다. 요청 없이 SQL 파일을 만들지 않는다.

### 로드맵 (목록만, 컬럼은 묶음마다 확정)
| 순서 | 묶음 | 후보 테이블 | 상태 |
|---|---|---|---|
| 1 | 고객 · 회원 기본 `member_basic` | `member_account`, `member_login`, `member_social_account`, `member_body`, `member_address`, `member_refund_account`, `member_withdrawal` | 반영 |
| 1-2 | 고객 · 회원 등급 `member_grading` | `member_grade`, `member_grade_benefit`, `member_grade_history` (+ `member_account.grade_code`) | 반영 (시험 반영, 사용자가 롤백할 수 있음) |
| 2 | 고객 · 약관·알림 | `terms`, `member_terms_agreement`, `member_notification_setting` | 대기 |
| 3 | 고객 · 보안·상태 | `member_status_history`, `login_history`, `member_session`, `member_token`, `password_history`, `admin_user`, `privacy_access_log` | 대기 |
| 4 | 고객 · 취향 | `style`, `member_style` | 대기 |
| 5 | 브랜드 기본 | `brand`, `brand_user`, `brand_status_history`, `brand_like` | 대기 |
| 6~ | 상품 | 카테고리(품목군), 사이즈 체계·실측, 상품·컬러·SKU, 이미지, 고시, 재고·가격 이력 | 대기 |

회원 등급은 W컨셉 등급 체계를 벤치마킹해 먼저 만들었다(2026-11-23). 점수 원천(배송완료 금액·활동포인트)과 등급 쿠폰 지급은 주문·포인트·혜택 단계에서 연결한다.

## 설계 문서와 동기화

| 파일 | 역할 |
|---|---|
| `docs/erd.dbml` | **기준 원본(source of truth)**. 상단 주석에 테이블 개수, 하단에 `Ref`·`TableGroup`. https://dbdiagram.io/d 에 붙여넣어 확인 |
| `docs/erd/index.html` | ERD 웹페이지 (GitHub Pages: https://jjonong.github.io/fashion-shoppingmall/erd/). 영역 전체 ERD + 세부 영역별 ERD + 테이블 클릭 시 전체 컬럼·인덱스·관계, 검색, 테이블 드래그 배치(localStorage `erd-layout-v1`). 직접 수정 불가, `npm run erd`로 생성. Pages 소스는 main 브랜치 `/docs` (`docs/.nojekyll`) |
| `docs/erd-layout.json` | (선택) 웹페이지 "배치 내보내기"로 받은 공유 배치. 두고 `npm run erd`하면 모든 사람에게 같은 배치 |
| `docs/erd.drawio` | draw.io 파일 (전체 + 영역별 페이지). 직접 수정 불가, `npm run drawio`로 생성. 한 방향(원본은 dbml) |
| `docs/archive_interior/` | 직전 인테리어 가구몰 설계 (MySQL, 92개 테이블, PDF·ERD 웹페이지·draw.io 포함). 참고용, 갱신하지 않음 |
| `docs/archive_fashion/` | 예전 패션몰 설계 (Oracle, 멀티 브랜드 편집숍). 참고용 |
| `docs/archive_oracle/` | 인테리어몰 Oracle 버전. 참고용 |

테이블/컬럼을 바꿀 때는 `erd.dbml`을 고치고, 상단 주석의 테이블 개수와 하단 `Ref`/`TableGroup`도 함께 맞춘 뒤 `npm run erd`, `npm run drawio`로 다시 만든다.

**PDF(설계서·요약본·발표자료)는 지금 만들지 않는다.** `build.js`/`summary.js`/`slides.js`에 인테리어몰 문장(표지·설계 원칙·흐름도 `diagrams.js`·`DECKS`)이 직접 들어 있으므로, 고객 영역이 끝난 뒤 패션몰 내용으로 고쳐서 다시 쓴다. 그 전에는 `npm run pdf`/`summary`/`slides`/`all`을 실행하지 않는다.

## 설계서 생성 도구 (`tools/design-doc/`)

```
cd tools/design-doc
npm install            # 최초 1회 (PUPPETEER_SKIP_DOWNLOAD=true 권장: 브라우저는 로컬 Chrome 사용)
npm run check          # docs/erd.dbml 문법 검증 (dbdiagram.io와 같은 파서) → OK tables= refs= groups=
npm run erd            # 검증 후 docs/erd/index.html (ERD 웹페이지) 재생성
npm run drawio         # 검증 후 docs/erd.drawio (draw.io 파일) 재생성
```

- 파일 구성: `lib.js`(DBML 로드, Graphviz ERD, 공통), `erd-page.js`(ERD 웹페이지, 화면은 `web/erd.css`·`web/erd.js` 인라인), `drawio.js`, 그리고 아직 인테리어 내용인 `build.js`·`summary.js`·`slides.js`·`diagrams.js`. Chrome 경로가 다르면 `CHROME_PATH`.
- 영역 목록·이름·색은 `lib.js`의 `AREAS` 한 곳에서 관리한다: `member_` 고객, `brand_` 브랜드, `product_` 상품. 영역 구분은 `TableGroup` 이름 접두사 기준. 세부 영역 설명은 `lib.js`의 `groupDesc`(묶음을 추가하면 같이 쓴다). 테이블이 아직 없는 영역은 ERD 웹페이지·draw.io에서 건너뛴다.
- Windows 환경에서 `python`은 스토어 스텁이라 실행되지 않는다. 스크립트는 `node`로.

## 설계 규칙 (DBML 전반에 일관되게 적용)

- **이름**: 테이블·컬럼·인덱스 모두 **소문자 snake_case**. 인덱스 이름 접두사 `uk_`(unique), `ux_`(함수 기반 unique), `ix_`(일반). PK 제약 이름은 MySQL에서 항상 `PRIMARY`.
- **논리명(한글 이름)**: 모든 테이블·컬럼의 note 맨 앞에 `[논리명]`을 둔다 (예: `note: '[회원 상태] ACTIVE/DORMANT/...'`). 생성 도구가 `lib.logicalOf`로 읽어 표시한다. 컬럼 논리명은 **그 자체로 뜻이 통하게 구체적으로**(`이름`이 아니라 `회원 이름`). **물리명이 같은 컬럼은 모든 테이블에서 논리명도 같게** 한다(사용자 확정: `member_id`는 어디서나 `회원 아이디`, `grade_code`는 `회원 등급 코드`). 테이블마다 다른 역할(예: 배송지 소유 회원)은 설명(note) 앞부분에 적는다. 이름만 같고 뜻이 다르면 물리명을 다르게 짓는다(예: 환불 계좌의 `holder_verified_at`). 표시는 논리명 우선, 물리명은 뒤에 작게.
- **예약어 회피**: `member`는 MySQL 8.0.17+ 예약어라 회원 테이블은 **`member_account`** (PK `member_id`). `order`도 예약어(주문은 나중에 `orders`). 새 이름을 만들 때 MySQL 예약어인지 확인한다.
- **PK: AUTO_INCREMENT(DBML `increment`)를 쓰지 않는다** (사용자 확정, 예외 없음). 바뀌지 않는 UNIQUE 값이 있으면 그것이 PK다. 회원은 **아이디 `member_id varchar(20)`**가 PK이고, 다른 테이블의 FK `member_id`도 `varchar(20)`. 자식 테이블은 **부모 키 + 번호(앱이 부모별 MAX+1로 부여) 또는 코드**의 복합 PK(예: `member_address` = (member_id, address_no), `member_social_account` = (member_id, provider)). 1:1 확장 테이블(`member_body` 등)은 부모 PK를 그대로 PK로, 매핑 테이블은 복합 PK. 새 테이블을 설계할 때도 이 규칙을 따른다.
- **타입**: 금액 `bigint`, 카운트 `int`, 작은 수 `smallint`/`tinyint`, 비율·평점 `decimal(p,s)`, 문자열 `varchar(n)`(글자 수), 본문 `text`(상세페이지·약관은 `mediumtext`), 시각 `datetime`(TIMESTAMP 2038년 제한·시간대 변환 회피).
- **상태값**: `varchar` + CHECK (허용 값은 컬럼 `note`에 `A/B/C` 형식, 대문자). **Y/N**은 `char(1)` + CHECK.
- **시간 (시스템 컬럼)**: **모든 테이블에 `created_at`·`updated_at` 둘 다** 맨 끝에 둔다(사용자 확정, 예외 없음). `created_at datetime NOT NULL DEFAULT CURRENT_TIMESTAMP`, `updated_at`은 DDL에서 `ON UPDATE CURRENT_TIMESTAMP` (DBML로는 표현 불가). 논리명은 모든 테이블에서 `등록일시`/`수정일시`(관리자 컬럼은 `등록 관리자`/`수정 관리자`, `is_active`는 `사용 여부`)로 같게 하고, 테이블별 의미(예: 회원 가입일시, 탈퇴 신청일시)는 설명에 적는다. `created_by`/`updated_by`는 관리자가 수정하는 테이블에만.
- **변경 빈도 분리**: 로그인할 때마다 바뀌는 값처럼 자주 바뀌는 값은 1:1 테이블로 분리해서, 본 테이블의 `updated_at`이 의미 없이 바뀌지 않게 한다(예: `member_login`).
- **FK 컬럼에는 인덱스**를 둔다 (복합 UK의 선두 컬럼이면 겸용).
- **UNIQUE (MySQL 특성)**: 이메일은 대소문자 무시 콜레이션이라 일반 UNIQUE로 충분. 회원당 기본 배송지 1개는 함수 기반 `ux_member_address_default ((CASE WHEN is_default='Y' THEN member_id END))`. MySQL UNIQUE는 NULL 포함 행을 중복으로 보지 않는다.
- **CHECK + FK 주의 (DDL 작성 시)**: MySQL은 참조 동작(`ON DELETE CASCADE`/`SET NULL`)이 있는 FK 컬럼을 CHECK에서 쓸 수 없다. CHECK에 들어가는 FK는 참조 동작 없이 만든다.
- **다형 참조**: `target_type + target_id` 대신 대상별 nullable FK 컬럼 + CHECK.
- **컬럼 순서** (사용자 요청): 식별(PK) → 로그인(비밀번호 등) → 인적사항 → 연락처 → 선택 정보 → 인증·상태 → 시각(`created_at`, `updated_at`).
- **개인정보**: 비밀번호는 bcrypt 단방향 해시(`password_hash`, 솔트 포함, 복원 불가 → 재설정만). 이메일은 **평문**(법적 암호화 대상 아님, UNIQUE·대소문자 무시·아이디 찾기 때문, 관리자 화면 마스킹). 휴대폰 번호는 법적 의무는 아니지만 추가 보호로 `_enc`(AES-256, 실제 번호가 필요할 때 복호화) + 검색용 `_hash`. 검색·비교용 `_hash`는 **HMAC-SHA256(서버 비밀 키)**(번호처럼 경우의 수가 적은 값은 단순 SHA-256이면 전부 대입해 풀림). CI·토큰은 해시만. 물리명은 `_enc`/`_hash`로 저장 방식을 드러내고, **논리명은 용도 중심**으로 쓴다(사용자 요청: `회원 휴대폰 번호 검색값`, `회원 중복 가입 확인값(CI)`). 탈퇴는 soft delete + 마스킹(`withdrawn_{아이디}@deleted.local`, 이름 `탈퇴회원`, 닉네임 `deleted_{아이디}`, 휴대폰·`ci_hash`·프로필 NULL). 아이디(PK)는 남겨서 재사용을 막는다.
- **탈퇴 회원 정보 관리** (사용자 확정): 탈퇴하면 개인정보는 바로 파기하고, 법이 보관을 요구하는 기록만 기간 동안 남긴다.
  - 법정 보관: 주문·결제·배송(계약·청약철회·대금결제·재화 공급) 5년, 소비자 불만·분쟁 3년, 표시·광고 6개월(전자상거래법), 로그인 기록 3개월(통신비밀보호법). 그래서 주문 테이블에는 주문 당시 이름·연락처·주소를 스냅샷으로 복사해 두고 5년 후 파기한다.
  - 탈퇴 시점 처리: `member_account` 행 유지 + 마스킹 / `member_login`·`member_body`·`member_address`·`member_refund_account` 행 삭제 / `member_social_account`는 제공자 연동 해제 API 호출(리프레시 토큰 사용, 애플은 의무) 후 삭제 / `member_withdrawal` 행 생성(사유 통계 유지, 의견 1년 후 NULL, `ci_hash`는 약관상 30일 재가입 제한 확인용으로 옮겨 두고 30일 후 NULL).
  - 리뷰·게시글(나중): 작성자를 탈퇴회원으로 표시하고 내용은 유지(약관에 명시).
  - 관리자가 마스킹을 풀어 개인정보를 보면 조회 기록을 남긴다(`privacy_access_log`, 3번 묶음).
- **캐시 컬럼**: 찜·리뷰 수, 평점 등은 note에 `캐시`로 표시하고 원본과 같은 트랜잭션에서 갱신.
- **이력 테이블 패턴**: 상태·가격·재고 변경은 이력 테이블에 남기고, 시스템 변경이면 `changed_by`는 NULL.

## 확정된 설계 (묶음별)

### 1. 고객 · 회원 기본 (`member_basic`)
- `member_account`: 구매 고객 계정만 (브랜드 관리자·운영자 계정은 별도 테이블 예정). PK는 **회원 아이디**(가입 시 입력, 소셜 가입도 한 번 정함, 영문 소문자 시작·영문 소문자/숫자 4~20자, 변경·재사용 불가), 이메일은 별도 UNIQUE. **가입 시 휴대폰 본인인증 필수**: 이름·휴대폰·생년월일·성별·CI는 인증 결과로 채움(직접 입력 아님, NOT NULL, 만 14세 미만 가입 불가). 프로필 사진·소개글은 선택. 가입 수단(`join_method` EMAIL/소셜 6종)·가입 경로(`join_channel` PC_WEB/MOBILE_WEB/APP_IOS/APP_ANDROID). 탈퇴 시 프로필 사진·소개글도 NULL. 탈퇴 상태·일시만 회원 테이블에 두고 사유·의견은 `member_withdrawal`로 분리(사용자 결정). 상태 ACTIVE/DORMANT/SUSPENDED/WITHDRAWN. 휴면은 `last_login_at` 11개월에 안내 → 1년 미접속 DORMANT(분리보관 없음). 닉네임 변경 후 30일 재변경 불가.
- `member_login` (1:1, 가입 시 함께 생성): 로그인할 때마다 바뀌는 값을 분리(사용자 결정). 마지막 로그인일시, 연속 실패 횟수, 잠금 해제일시(**5회 실패 잠금은 상태가 아니라 `locked_until`**, 시간이 지나면 자동 해제), 휴면 예정 안내일시(중복 발송 방지·30일 경과 확인, 재로그인 시 NULL). 휴면 배치는 `member_login.last_login_at` 인덱스 + `member_account.status` 조인. 비밀번호·상태·정지 기한은 `member_account`에 남김.
- `member_social_account` (이름 변경: member_social → 무엇인지 드러나게): PK (member_id, provider)로 회원당 제공자별 1개. 연동 해제용 리프레시 토큰(`refresh_token_enc`, 암호화) 보관, 소셜 전용 회원은 마지막 소셜 계정 해제 불가(앱 검증). 제공자 KAKAO/NAVER/FACEBOOK/INSTAGRAM/GOOGLE/APPLE (W컨셉 가입 수단 기준), 같은 소셜 계정은 한 회원에게만(UK provider, provider_user_id).
- `member_body` (1:1): 키·몸무게·평소 상의/하의 사이즈·신발 사이즈(mm) (W컨셉 사이즈 정보 기준, 발볼은 회원 정보로 받지 않고 신발 리뷰의 착용감 항목으로 상품 단계에서). 사이즈 추천과 "나와 비슷한 체형" 리뷰 필터. `is_review_public`은 리뷰 작성 시 체형 공개 체크박스 **기본값**이고, 리뷰 테이블(상품 단계)에 작성 당시 체형과 공개 여부를 복사해 저장한다.
- `member_address`: PK (member_id, address_no), 배송지 번호는 회원별 1부터 앱이 부여. 회원당 여러 개, 기본 배송지 1개(함수 기반 unique), 배송 요청사항은 주문 시 기본값으로 복사.
- `member_refund_account` (1:1): 환불 계좌. 은행 코드(금융결제원 3자리)·계좌번호(`account_no_enc` AES-256, 법정 암호화 대상)·예금주·예금주 확인일시(`holder_verified_at`). 탈퇴 시 행 삭제.
- `member_withdrawal` (1:1): 탈퇴 정보. 탈퇴한 회원만 행이 생김. 탈퇴 사유 선택 항목(`withdraw_reason_code`, 보기 중 선택·필수, LOW_USAGE/NO_PRODUCT/PRICE/DELIVERY/SERVICE/PRIVACY/REJOIN/ETC, 사유별 통계 인덱스)·탈퇴 시 직접 쓴 의견(`withdraw_free_text`, 자유 입력·선택, 개인정보가 섞일 수 있어 탈퇴 1년 후 NULL)·신청일시.
- W컨셉 고객 정보 중 나중 묶음으로 미룬 것: 사이즈 정보 추천 동의(약관), 새 기기 로그인 인증·알림·신뢰기기(보안), 등급·쿠폰·포인트·상품권(주문·혜택), 찜·장바구니·비회원 주문조회(상품·주문).

### 1-2. 고객 · 회원 등급 (`member_grading`)
- W컨셉 등급 체계 벤치마킹(W FRIEND/BEST/VIP/SIGNATURE), 이름은 자체 **GREEN/BLUE/GOLD/BLACK** (사용자 결정). 기준: 최근 6개월 누적 회원등급점수 0 / 20만 / 60만 / 150만 점 이상, 구매 적립 0.5 / 1 / 1.5 / 2%. 회원등급점수 = 배송완료 금액 + 활동포인트, 매월 1일 재산정. 예외 승급(제휴 카드 결제 시 자동 승급 등) 있음.
- `member_grade`: 기준표. 코드와 화면 이름 분리(리브랜딩 대비). 관리자 수정 데이터라 `created_by`/`updated_by`.
- `member_grade_benefit`: 등급별 혜택 목록(쿠폰/포인트/무료 교환/제휴/전담 고객센터/이벤트). 혜택이 자주 바뀌어 Y/N 컬럼 대신 행으로. 실제 쿠폰 지급은 혜택 단계에서 연결.
- `member_grade_history`: PK (member_id, history_no). 가입·월 산정·예외 승급·관리자 조정마다 1행, 산정 당시 구매 금액 점수·활동포인트·합계와 산정 기간.
- `member_account.grade_code`: 현재 등급(신규 GREEN), 월 1회 갱신.
- 나중: 활동 미션(출석·하트·앱 푸시·리뷰 포인트, 하루 한도·적립 시점)은 포인트 단계, 결제 프로모션은 주문·결제 단계, 마케팅 수신동의 이벤트는 약관 묶음.

## 저장소 메모

- 루트의 `2026-*.txt`, `conversation-*.txt`는 Claude Code 대화 기록 export다. 커밋하지 않는다.
- 커밋 메시지와 문서는 한국어로 작성한다.
- 수정된 내용은 자동으로 커밋하고 푸시한다.
