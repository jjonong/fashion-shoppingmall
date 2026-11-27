# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 프로젝트 상태

**패션 브랜드 입점형 쇼핑몰** 포트폴리오 프로젝트 (**W컨셉 벤치마킹**: 디자이너 브랜드 입점형 편집숍, PC 웹 1920 폭 레퍼런스). 경위: 에이블리(앱 중심, PC 웹 없음) → 무신사(흔하고 PC가 헤더까지 1440px에서 잘림) → 2026-11-23 W컨셉으로 확정(사용자 결정, 1920 화면을 꽉 채우는 레이아웃). 2026-11-20에 인테리어몰 설계를 접고 **처음부터 다시 설계** 중(사용자 결정). 현재는 **DB 설계 단계**로, 애플리케이션 코드·빌드·테스트 명령은 아직 없다. 모든 산출물은 `docs/`에 있다.

- 대상 DB: **MySQL 8.0** (8.0.16 이상: CHECK 제약이 실제로 검사됨, 8.0.13 이상: 함수 기반 인덱스). InnoDB, `utf8mb4` / `utf8mb4_0900_ai_ci`.
- 판매 방식: **브랜드 입점형 (W컨셉식)** (사용자 확정). 상품은 브랜드에 속한다. 지금 단계의 판매자 범위는 **브랜드 기본만**(브랜드 정보·브랜드 관리자 계정·입점 상태·브랜드 좋아요). 브랜드 유형(입점 디자이너 브랜드·자체 브랜드 등)은 브랜드 묶음에서 정한다. 수수료·정산은 주문/결제 단계에서 다룬다.
- 품목: **의류 + 신발 + 가방·잡화** (사용자 확정). 뷰티는 제외(W컨셉에는 있지만 범위 밖, 회원 뷰티 정보도 두지 않음). 품목군마다 사이즈 체계·실측 항목·상품정보제공고시 유형이 다르다.
- **진행 방식** (사용자 요청: "너무 광범위하지 않게, 상세하게"): 고객 → 브랜드 기본 → 상품 순서로, **묶음(TableGroup) 단위로 컬럼까지 확정**하며 하나씩 추가한다. 사용자가 확인하기 전에 다음 묶음 테이블을 미리 넣지 않는다. 주문은 장바구니·주문 기본까지(2026-11-25). 결제·배송·혜택은 나중에 **각각 별도 영역**으로 만들고(주문 영역의 하위 묶음 아님, 사용자 결정), 커뮤니티도 아직 범위 밖.
- 작업 방식: 사용자는 **설계를 먼저 확정한 뒤 파일(DDL SQL 등)을 만들기**를 원한다. 요청 없이 SQL 파일을 만들지 않는다.

### 로드맵 (목록만, 컬럼은 묶음마다 확정)
| 순서 | 묶음 | 후보 테이블 | 상태 |
|---|---|---|---|
| 1 | 고객 · 회원 기본 `member_basic` | `member_account`, `member_login`, `member_social_account`, `member_body`, `member_address`, `member_refund_account`, `member_withdrawal` | 반영 |
| 1-2 | 고객 · 회원 등급 `member_grading` | `member_grade`, `member_grade_benefit`, `member_grade_history` (+ `member_account.grade_code`) | 반영 (시험 반영, 사용자가 롤백할 수 있음) |
| 2 | 고객 · 약관·알림 | `terms`, `member_terms_agreement`, `member_notification_setting` | 대기 |
| 3 | 고객 · 보안·상태 | `member_status_history`, `login_history`, `member_session`, `member_token`, `password_history` (운영자 계정·접속 기록은 운영 영역으로 이동) | 대기 |
| 4 | 고객 · 취향 | `style`, `member_style` | 대기 |
| 5 | 브랜드 기본 `brand_basic` + 배송 정책 `brand_shipping` | `brand`, `brand_shipping_policy`, `shipping_extra_zipcode` / 나중에: 사업자 정보(판매자 정보 고시), 교환/반품 정책, `brand_user`, `brand_status_history`, `brand_like` | `brand`·배송 정책 반영 (상품 FK용, 2026-11-24 사용자 결정: 상품 설계를 위해 브랜드는 포괄적으로만) |
| 6-1 | 상품 · 기준 데이터 `product_master` | `product_category`, `product_std_color`, `product_std_material` | 반영 |
| 6-2 | 상품 · 상품 기본 `product_basic` | `product`, `product_color`, `product_size`, `product_option`, `product_image`, `product_material`, `product_detail` | 반영 |
| 6-3 | 상품 · 실측 `product_measure` | `product_measure_item`, `product_category_measure_item`, `product_size_measure` (`product_size`는 상품 기본으로 옮김, 옵션 사이즈는 `size_no`) | 반영 |
| 6-4 | 상품 · 정보 고시 `product_notice` | `product_notice` (상품 1:1, 공통 항목 컬럼 + 유형별 항목 NULL 가능 컬럼 + CHECK) | 반영 |
| 6-5 | 상품 · 가격·재고 이력 | 가격 이력, 재고 이력 | 대기 |
| 6-6 | 상품 · 고객 연결 `product_customer` | `product_like` / 나중에: 재입고 알림(회원-옵션) | `product_like`만 반영 |
| 7-1 | 주문 · 장바구니 `order_cart` | `cart_item` | 반영 |
| 7-2 | 주문 · 주문 기본 `order_basic` | `orders`, `order_delivery`, `order_brand`, `order_item`, `order_item_history` | 반영 (상태 이력은 2026-11-27 배송 설계 때 추가) |
| - | 결제 · 배송 · 혜택 (각각 별도 영역) | 결제 수단·PG·현금영수증·카드 혜택 / 출고·송장 / 쿠폰·포인트 | 나중 (선물하기도 나중 묶음) |
| 8-1 | 결제 · 결제 기본 `payment_basic` | `payment`, `payment_card`, `payment_vaccount`, `payment_cancel`, `payment_cancel_item`, `payment_cash_receipt` / 나중에: 카드 혜택, 회원 결제 설정 | 반영 (시험 반영 2026-11-26, 결제 수단 1개·부분 취소 회차별 기록) |
| 9-1 | 배송 · 출고 기본 `delivery_basic` | `delivery_shipment`, `delivery_shipment_item`, `delivery_tracking`, `delivery_carrier` | 반영 (2026-11-27) |
| 9-2 | 배송 · 반품·교환 `delivery_claim` | `delivery_claim`, `delivery_claim_pickup`, `delivery_claim_item`, `delivery_claim_history` (+ 결제·결제 취소·출고의 `claim_no`, 결제 취소 배송비 환불, 브랜드 반품·교환 배송비) | 반영 (2026-11-27) |

상품 상세페이지 항목 중 상품 영역 밖: 판매자 정보·배송비·교환/반품 기준은 브랜드, 청약철회·환불지연 배상 등 법정 문구는 플랫폼 공통, 리뷰·Q&A는 커뮤니티, 쿠폰·기획전(더블유위크)은 혜택, 카드 혜택가·무이자·장바구니·바로구매·선물하기는 주문·결제, 함께 본 상품·맞춤 추천·스타일링은 추천(나중). 별점·리뷰 수·찜 수는 상품 캐시 컬럼, 할인율·선택 상품 총액은 계산값.

회원 등급은 W컨셉 등급 체계를 벤치마킹해 먼저 만들었다(2026-11-23). 점수 원천(배송완료 금액·활동포인트)과 등급 쿠폰 지급은 주문·포인트·혜택 단계에서 연결한다.

## 설계 문서와 동기화

| 파일 | 역할 |
|---|---|
| `docs/erd.dbml` | **기준 원본(source of truth)**. 상단 주석에 테이블 개수, 하단에 `Ref`·`TableGroup`. https://dbdiagram.io/d 에 붙여넣어 확인 |
| `docs/erd/index.html` | ERD 웹페이지 (GitHub Pages: https://jjonong.github.io/fashion-shoppingmall/erd/). 상단 영역 메뉴(GNB: 영역에 올리면 묶음별 열 + 테이블 전체가 보이는 메가 메뉴, 좁은 화면은 ☰ 왼쪽 패널) + 묶음 화면 테이블 탭 줄 + 왼쪽 여백 고정 리모컨(테이블 바로가기·스크롤 위치 표시, 1840px 이상 화면). 콘텐츠 폭 1440px. 테이블 명세의 시스템 컬럼(created_by·updated_by·created_at·updated_at) 행은 연한 회색(#666/#999). 영역 전체 ERD + 세부 영역별 ERD + 테이블 클릭 시 전체 컬럼·인덱스·관계, 검색, 테이블 드래그 배치(localStorage `erd-layout-v1`). 직접 수정 불가, `npm run erd`로 생성. Pages 소스는 main 브랜치 `/docs` (`docs/.nojekyll`) |
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
npm run edit           # 로컬 편집 모드 (http://localhost:3000, 저장소 루트 편집.bat 더블클릭과 같음)
```

**로컬 편집 모드** (`edit-server.js`, 사용자 요청 2026-11-24: 페이지에서 직접 설계 수정): 사용자는 프로젝트를 USB에 두고 집·학원 PC(둘 다 Node·git 있음)에서 쓴다. 편집 화면은 ERD 페이지와 같고 `--edit`로 만든 버전에만 버튼이 있다(공개 페이지에는 없음, `window.ERD_EDIT`). **빠른 입력 표**(사용자 요청: 지금은 논리명·키 설정에 집중, 나머지는 선택): 컬럼·테이블·묶음 추가는 한 줄에 컬럼 하나, 논리명·물리명만 필수이고 키(PK/FK/PK+FK/UK)는 고르기만 한다. 타입을 비우면 PK varchar(20), FK는 부모 PK 타입, 그 외 varchar(50). 물리명이 다른 테이블의 단일 PK와 같으면 FK로 자동 선택. Enter 다음 줄, Ctrl+Enter 저장. 저장 응답은 편집 화면만 바로 만들고 공개 페이지·draw.io는 뒤에서 만든다. 할 수 있는 것: 컬럼 추가·수정(이름 바꾸면 같은 테이블 인덱스·인덱스 이름·Ref도 같이)·삭제·**순서 바꾸기**(명세 표에서 손잡이 ⠿를 끌어 다른 컬럼 위/아래에 놓음, `created_by`~`updated_at` 시간·감사 컬럼은 맨 끝 고정), PK 변경(복합 PK 포함, 체크 순서대로), FK 추가(타입 일치·부모는 단일 PK/UNIQUE, N:1/1:1, ON DELETE, FK 인덱스 자동)·삭제, 인덱스 추가(`ix_`/`uk_`, 이름 자동)·삭제, 테이블 추가(단일/복합 PK + `created_at`/`updated_at` 자동)·삭제, 묶음 추가(영역 접두사 필수, 첫 테이블과 함께, 설명은 `lib.js` `groupDesc`에 기록). 서버가 매 요청마다 `erd.dbml`을 새로 읽어 줄 단위로 고치고(주석·서식 보존), snake_case·`[논리명]`·예약어·중복을 검사하고, PK·참조 중인 컬럼/테이블 삭제, FK로 이어진 컬럼 타입 변경, 참조받는 PK 변경은 거부한다. 파서 검증에 실패하면 저장하지 않고, 저장하면 공개 페이지·draw.io·편집 화면을 다시 만든다. 커밋·푸시는 하지 않는다. 사용자가 편집 모드로 고친 뒤 검토를 요청하면 설계 규칙(같은 물리명은 같은 논리명, 상단 주석 영역별 개수, 섹션 주석, CLAUDE.md 확정 설계·로드맵 동기화)에 맞는지 확인하고 정리한다.

- 파일 구성: `lib.js`(DBML 로드, Graphviz ERD, 공통), `erd-page.js`(ERD 웹페이지, 화면은 `web/erd.css`·`web/erd.js` 인라인), `edit-server.js`(로컬 편집 모드), `drawio.js`, 그리고 아직 인테리어 내용인 `build.js`·`summary.js`·`slides.js`·`diagrams.js`. Chrome 경로가 다르면 `CHROME_PATH`.
- 영역 목록·이름·색은 `lib.js`의 `AREAS` 한 곳에서 관리한다: `member_` 고객, `brand_` 브랜드, `product_` 상품, `order_` 주문, `payment_` 결제, `delivery_` 배송, `admin_` 운영. 감사 컬럼(`created_by` 등) → `admin_user` 선은 운영 영역 밖 ERD에서 그리지 않는다(`lib.isAdminAudit`). 영역 구분은 `TableGroup` 이름 접두사 기준. 세부 영역 설명은 `lib.js`의 `groupDesc`(묶음을 추가하면 같이 쓴다). 테이블이 아직 없는 영역은 ERD 웹페이지·draw.io에서 건너뛴다.
- Windows 환경에서 `python`은 스토어 스텁이라 실행되지 않는다. 스크립트는 `node`로.

## 설계 규칙 (DBML 전반에 일관되게 적용)

- **이름**: 테이블·컬럼·인덱스 모두 **소문자 snake_case**. 인덱스 이름 접두사 `uk_`(unique), `ux_`(함수 기반 unique), `ix_`(일반). PK 제약 이름은 MySQL에서 항상 `PRIMARY`.
- **논리명(한글 이름)**: 모든 테이블·컬럼의 note 맨 앞에 `[논리명]`을 둔다 (예: `note: '[회원 상태] ACTIVE/DORMANT/...'`). 생성 도구가 `lib.logicalOf`로 읽어 표시한다. 컬럼 논리명은 **같은 테이블 안에서 다른 컬럼과 헷갈리지 않게** 짓는다. 테이블이 주어(회원·운영자)를 알려 주므로 공통 속성은 `이름`·`이메일`·`상태`처럼 짧게 두고, 주어는 설명(note) 앞에 적는다(사용자 확정, 2026-11-23: 운영자 테이블 추가 때 `회원 이름` 식 규칙과 충돌해서 변경). **단, 이름 컬럼은 예외**로 모든 테이블에서 물리명 `{대상}_name`, 논리명 `{대상} 이름`으로 주어를 붙인다(사용자 확정, 2026-11-24: 카테고리·표준 색상·표준 소재가 모두 `[이름]`이라 구분이 안 됨. 예: `member_name` 회원 이름, `category_name` 카테고리 이름, `brand_name_ko` 브랜드 한글명). 상태·이메일·설명 같은 다른 공통 속성은 짧게 유지. **물리명이 같은 컬럼은 모든 테이블에서 논리명도 같게** 한다(사용자 확정: `member_id`는 어디서나 `회원 아이디`, `grade_code`는 `회원 등급 코드`). 테이블마다 다른 역할(예: 배송지 소유 회원)은 설명(note) 앞부분에 적는다. 이름만 같고 뜻이 다르면 물리명을 다르게 짓는다(예: 환불 계좌의 `holder_verified_at`). 표시는 논리명 우선, 물리명은 뒤에 작게.
- **예약어 회피**: `member`는 MySQL 8.0.17+ 예약어라 회원 테이블은 **`member_account`** (PK `member_id`). `order`도 예약어(주문은 나중에 `orders`). 새 이름을 만들 때 MySQL 예약어인지 확인한다.
- **PK: AUTO_INCREMENT(DBML `increment`)를 쓰지 않는다** (사용자 확정, 예외 없음). 바뀌지 않는 UNIQUE 값이 있으면 그것이 PK다. 회원은 **아이디 `member_id varchar(20)`**가 PK이고, 다른 테이블의 FK `member_id`도 `varchar(20)`. 자식 테이블은 **부모 키 + 번호(앱이 부모별 MAX+1로 부여) 또는 코드**의 복합 PK(예: `member_address` = (member_id, address_no), `member_social_account` = (member_id, provider)). 1:1 확장 테이블(`member_body` 등)은 부모 PK를 그대로 PK로, 매핑 테이블은 복합 PK. 새 테이블을 설계할 때도 이 규칙을 따른다.
- **타입**: 금액 `bigint`, 카운트 `int`, 작은 수 `smallint`/`tinyint`, 비율·평점 `decimal(p,s)`, 문자열 `varchar(n)`(글자 수), 본문 `text`(상세페이지·약관은 `mediumtext`), 시각 `datetime`(TIMESTAMP 2038년 제한·시간대 변환 회피).
- **상태값**: `varchar` + CHECK (허용 값은 컬럼 `note`에 `A/B/C` 형식, 대문자). **Y/N**은 `char(1)` + CHECK.
- **코드성 컬럼 이름 규칙** (사용자 확정, 비슷한 성격은 같은 표기):
  | 성격 | 물리명 | 논리명 | 값 |
  |---|---|---|---|
  | 생애주기 상태 | `status` | 상태 | 대문자 코드, 시작은 `ACTIVE`. 상태마다 시각 컬럼 짝(`SUSPENDED`↔`suspended_until`, `WITHDRAWN`↔`withdrawn_at`, `RETIRED`↔`retired_at`) |
  | 분류(정해진 보기 중 하나, 기준표 없음) | `○○_type` | ○○ 유형 | 대문자 코드 + CHECK (예: `withdraw_reason_type`, `benefit_type`, `change_type`, `action_type`) |
  | 기준표·표준 코드 참조 | `○○_code` | ○○ 코드 | FK 또는 외부 표준 코드 (예: `grade_code`, `role_code`, `bank_code`) |
  | 여부 | `is_○○` / `can_○○` | ○○ 여부 | Y/N |
  | 사용 여부(기준 데이터 켜고 끄기) | `is_active` | 사용 여부 | Y/N |
  성별·소셜 제공자·가입 수단·가입 경로처럼 값 자체가 속성인 컬럼은 자연스러운 이름(`gender`, `provider`, `join_method`, `join_channel`)을 쓴다.
- **시간 (시스템 컬럼)**: **모든 테이블에 `created_at`·`updated_at` 둘 다** 맨 끝에 둔다(사용자 확정, 예외 없음). `created_at datetime NOT NULL DEFAULT CURRENT_TIMESTAMP`, `updated_at`은 DDL에서 `ON UPDATE CURRENT_TIMESTAMP` (DBML로는 표현 불가). 논리명은 모든 테이블에서 `등록일시`/`수정일시`(관리자 컬럼은 `등록 관리자`/`수정 관리자`, `is_active`는 `사용 여부`)로 같게 하고, 테이블별 의미(예: 회원 가입일시, 탈퇴 신청일시)는 설명에 적는다. `created_by`/`updated_by`는 관리자가 수정하는 테이블에만.
- **변경 빈도 분리**: 로그인할 때마다 바뀌는 값처럼 자주 바뀌는 값은 1:1 테이블로 분리해서, 본 테이블의 `updated_at`이 의미 없이 바뀌지 않게 한다(예: `member_login`).
- **FK 컬럼에는 인덱스**를 둔다 (복합 UK의 선두 컬럼이면 겸용).
- **UNIQUE (MySQL 특성)**: 이메일은 대소문자 무시 콜레이션이라 일반 UNIQUE로 충분. 회원당 기본 배송지 1개는 함수 기반 `ux_member_address_default ((CASE WHEN is_default='Y' THEN member_id END))`. MySQL UNIQUE는 NULL 포함 행을 중복으로 보지 않는다.
- **CHECK + FK 주의 (DDL 작성 시)**: MySQL은 참조 동작(`ON DELETE CASCADE`/`SET NULL`)이 있는 FK 컬럼을 CHECK에서 쓸 수 없다. CHECK에 들어가는 FK는 참조 동작 없이 만든다.
- **다형 참조**: `target_type + target_id` 대신 대상별 nullable FK 컬럼 + CHECK.
- **테이블 순서** (사용자 요청 2026-11-25, dbml·ERD 페이지 표시 순서): 묶음 안에서 중심 테이블 → 1:1 확장(상세·로그인 상태 등) 바로 밑 → 1:N 자식은 참조 사슬 순(컬러 → 옵션) → 기준표·매핑은 뒤. 연관도 높은 테이블을 붙여 둔다. **예외: 주문 기본**은 영수증 금액이 쌓이는 줄기를 먼저 → 주문 → 주문 브랜드 → 주문 상세 → 주문 배송지(1:1 부가 정보는 뒤, 사용자 결정 2026-11-25). 영역 안 묶음도 핵심 묶음을 먼저(상품 기본 → 기준 데이터 → 실측).
- **컬럼 순서** (사용자 요청): 식별(PK) → 로그인(비밀번호 등) → 인적사항 → 연락처 → 선택 정보 → 인증·상태 → 시각(`created_at`, `updated_at`).
- **개인정보**: 비밀번호는 bcrypt 단방향 해시(`password_hash`, 솔트 포함, 복원 불가 → 재설정만). 이메일은 **평문**(법적 암호화 대상 아님, UNIQUE·대소문자 무시·아이디 찾기 때문, 관리자 화면 마스킹). 휴대폰 번호는 법적 의무는 아니지만 추가 보호로 `_enc`(AES-256, 실제 번호가 필요할 때 복호화) + 검색용 `_hash`. 검색·비교용 `_hash`는 **HMAC-SHA256(서버 비밀 키)**(번호처럼 경우의 수가 적은 값은 단순 SHA-256이면 전부 대입해 풀림). CI·토큰은 해시만. 물리명은 `_enc`/`_hash`로 저장 방식을 드러내고, **논리명은 용도 중심**으로 쓴다(사용자 요청: `회원 휴대폰 번호 검색값`, `회원 중복 가입 확인값(CI)`). 단 복호화할 수 있는 `_enc` 컬럼은 논리명 끝에 `(암호화)`를 붙여 검색값과 구분하고, 비밀번호 해시(bcrypt, 일방향 암호화)는 `(해시)`를 붙인다(사용자 요청 2026-11-25, 예: `주문자 휴대폰 번호(암호화)`, `비밀번호(해시)`). 비밀번호 해시는 `varchar(255)`(bcrypt 60자지만 argon2 등 교체 대비). 탈퇴는 soft delete + 마스킹(`withdrawn_{아이디}@deleted.local`, 이름(`member_name`) `탈퇴회원`, 닉네임 `deleted_{아이디}`, 휴대폰·`ci_hash`·프로필 NULL). 아이디(PK)는 남겨서 재사용을 막는다.
- **탈퇴 회원 정보 관리** (사용자 확정): 탈퇴하면 개인정보는 바로 파기하고, 법이 보관을 요구하는 기록만 기간 동안 남긴다.
  - 법정 보관: 주문·결제·배송(계약·청약철회·대금결제·재화 공급) 5년, 소비자 불만·분쟁 3년, 표시·광고 6개월(전자상거래법), 로그인 기록 3개월(통신비밀보호법). 그래서 주문 테이블에는 주문 당시 이름·연락처·주소를 스냅샷으로 복사해 두고 5년 후 파기한다.
  - 탈퇴 시점 처리: `member_account` 행 유지 + 마스킹 / `member_login`·`member_body`·`member_address`·`member_refund_account`·`product_like`(찜, 상품 찜 수 캐시도 감소)·`cart_item` 행 삭제 / `member_social_account`는 제공자 연동 해제 API 호출(리프레시 토큰 사용, 애플은 의무) 후 삭제 / `member_withdrawal` 행 생성(사유 통계 유지, 의견 1년 후 NULL, `ci_hash`는 약관상 30일 재가입 제한 확인용으로 옮겨 두고 30일 후 NULL).
  - 리뷰·게시글(나중): 작성자를 탈퇴회원으로 표시하고 내용은 유지(약관에 명시).
  - 관리자가 마스킹을 풀어 개인정보를 보면 조회 기록을 남긴다(`admin_access_log`).
- **캐시 컬럼**: 찜·리뷰 수, 평점 등은 note에 `캐시`로 표시하고 원본과 같은 트랜잭션에서 갱신.
- **이력 테이블 패턴**: 상태·가격·재고 변경은 이력 테이블에 남기고, 처리한 관리자는 `created_by`(시스템 변경이면 NULL). 이력은 수정하지 않으므로 `updated_by`는 두지 않는다. 처리일시는 `created_at`(별도 `changed_at` 없음, 효력 시점이 다르면 `applied_at`처럼 따로).
- **감사 컬럼은 `created_by`/`updated_by`만** 쓴다(사용자 확정: `changed_by` 같은 별도 이름 금지).

## 확정된 설계 (묶음별)

### 1. 고객 · 회원 기본 (`member_basic`)
- `member_account`: 구매 고객 계정만 (운영자 계정은 `admin_user`, 브랜드 관리자 계정은 브랜드 영역 `brand_user` 예정). PK는 **회원 아이디**(가입 시 입력, 소셜 가입도 한 번 정함, 영문 소문자 시작·영문 소문자/숫자 4~20자, 변경·재사용 불가), 이메일은 별도 UNIQUE. **가입 시 휴대폰 본인인증 필수**: 이름·휴대폰·생년월일·성별·CI는 인증 결과로 채움(직접 입력 아님, NOT NULL, 만 14세 미만 가입 불가). 프로필 사진·소개글은 선택. 가입 수단(`join_method` EMAIL/소셜 6종)·가입 경로(`join_channel` PC_WEB/MOBILE_WEB/APP_IOS/APP_ANDROID). 탈퇴 시 프로필 사진·소개글도 NULL. 탈퇴 상태·일시만 회원 테이블에 두고 사유·의견은 `member_withdrawal`로 분리(사용자 결정). 상태 ACTIVE/DORMANT/SUSPENDED/WITHDRAWN. 휴면은 `last_login_at` 11개월에 안내 → 1년 미접속 DORMANT(분리보관 없음). 닉네임 변경 후 30일 재변경 불가.
- `member_login` (1:1, 가입 시 함께 생성): 로그인할 때마다 바뀌는 값을 분리(사용자 결정). 마지막 로그인일시, 연속 실패 횟수, 잠금 해제일시(**5회 실패 잠금은 상태가 아니라 `locked_until`**, 시간이 지나면 자동 해제), 휴면 예정 안내일시(중복 발송 방지·30일 경과 확인, 재로그인 시 NULL). 휴면 배치는 `member_login.last_login_at` 인덱스 + `member_account.status` 조인. 비밀번호·상태·정지 기한은 `member_account`에 남김.
- `member_social_account` (이름 변경: member_social → 무엇인지 드러나게): PK (member_id, provider)로 회원당 제공자별 1개. 연동 해제용 리프레시 토큰(`refresh_token_enc`, 암호화) 보관, 소셜 전용 회원은 마지막 소셜 계정 해제 불가(앱 검증). 제공자 KAKAO/NAVER/FACEBOOK/INSTAGRAM/GOOGLE/APPLE (W컨셉 가입 수단 기준), 같은 소셜 계정은 한 회원에게만(UK provider, provider_user_id).
- `member_body` (1:1): 키·몸무게·평소 상의/하의 사이즈·신발 사이즈(mm) (W컨셉 사이즈 정보 기준, 발볼은 회원 정보로 받지 않고 신발 리뷰의 착용감 항목으로 상품 단계에서). 사이즈 추천과 "나와 비슷한 체형" 리뷰 필터. `is_review_public`은 리뷰 작성 시 체형 공개 체크박스 **기본값**이고, 리뷰 테이블(상품 단계)에 작성 당시 체형과 공개 여부를 복사해 저장한다.
- `member_address`: PK (member_id, address_no), 배송지 번호는 회원별 1부터 앱이 부여. 회원당 여러 개(**최대 20개**, 앱 검증), 기본 배송지 1개(함수 기반 unique), 배송 요청사항은 주문 시 기본값으로 복사.
- `member_refund_account` (1:1): 환불 계좌. 은행 코드(금융결제원 3자리)·계좌번호(`account_no_enc` AES-256, 법정 암호화 대상)·예금주·예금주 확인일시(`holder_verified_at`). 탈퇴 시 행 삭제.
- `member_withdrawal` (1:1): 탈퇴 정보. 탈퇴한 회원만 행이 생김. 탈퇴 사유 유형(`withdraw_reason_type`, 보기 중 선택·필수, LOW_USAGE/NO_PRODUCT/PRICE/DELIVERY/SERVICE/PRIVACY/REJOIN/ETC, 사유별 통계 인덱스)·탈퇴 시 직접 쓴 의견(`withdraw_free_text`, 자유 입력·선택, 개인정보가 섞일 수 있어 탈퇴 1년 후 NULL)·신청일시.
- W컨셉 고객 정보 중 나중 묶음으로 미룬 것: 사이즈 정보 추천 동의(약관), 새 기기 로그인 인증·알림·신뢰기기(보안), 등급·쿠폰·포인트·상품권(주문·혜택), 찜·장바구니·비회원 주문조회(상품·주문).

### 1-2. 고객 · 회원 등급 (`member_grading`)
- W컨셉 등급 체계 벤치마킹(W FRIEND/BEST/VIP/SIGNATURE), 이름은 자체 **GREEN/BLUE/GOLD/BLACK** (사용자 결정). 기준: 최근 6개월 누적 회원등급점수 0 / 20만 / 60만 / 150만 점 이상, 구매 적립 0.5 / 1 / 1.5 / 2%. 회원등급점수 = 배송완료 금액 + 활동포인트, 매월 1일 재산정. 예외 승급(제휴 카드 결제 시 자동 승급 등) 있음.
- `member_grade`: 기준표. 코드와 화면 이름 분리(리브랜딩 대비). 관리자 수정 데이터라 `created_by`/`updated_by`.
- `member_grade_benefit`: 등급별 혜택 목록(쿠폰/포인트/무료 교환/제휴/전담 고객센터/이벤트). 혜택이 자주 바뀌어 Y/N 컬럼 대신 행으로. 실제 쿠폰 지급은 혜택 단계에서 연결.
- `member_grade_history`: PK (member_id, history_no). 가입·월 산정·예외 승급·관리자 조정마다 1행(**변경 유형** `change_type` 코드 + **변경 사유** `reason` 자유 입력, 운영자 권한 이력의 `action_type` + `reason`과 같은 구조로 나란히 배치), 산정 당시 구매 금액 점수·활동포인트·합계와 산정 기간.
- `member_account.grade_code`: 현재 등급(신규 GREEN), 월 1회 갱신.
- 나중: 활동 미션(출석·하트·앱 푸시·리뷰 포인트, 하루 한도·적립 시점)은 포인트 단계, 결제 프로모션은 주문·결제 단계, 마케팅 수신동의 이벤트는 약관 묶음.

### 5. 브랜드 · 브랜드 기본 (`brand_basic`, 일부)
- 구조: W컨셉(플랫폼) → 입점 브랜드 → 브랜드별 상품. 상품은 한 브랜드에 속한다.
- `brand`: PK **브랜드 아이디** `brand_id varchar(30)`(영문 소문자·숫자·하이픈, 변경·재사용 불가, 브랜드관 URL). 브랜드 한글명 `brand_name_ko`·브랜드 영문명 `brand_name_en`(UK, 대표 표기)·브랜드 유형(DESIGNER/OWN/IMPORT)·로고·소개·상태(ACTIVE/PAUSED/CLOSED ↔ `closed_at`)·좋아요 수 캐시. `created_by`/`updated_by`는 FK 없이(운영자 테이블 생기면 연결).

### 5-2. 브랜드 · 배송 정책 (`brand_shipping`)
- 사용자 결정 2026-11-25: **브랜드당 정책 1개**(brand 1:1), 제주·도서산간 판단은 **플랫폼 공통 우편번호 표**. 반품·교환 배송비는 2026-11-27 반품·교환 묶음과 함께 추가.
- `brand_shipping_policy` [브랜드 배송 정책]: PK `brand_id`. 기본 배송비 `base_shipping_fee`(0이면 항상 무료), 무료 배송 기준 금액 `free_shipping_min_amount`(NULL이면 기준 없음), 제주 추가 배송비 `jeju_extra_fee`, 도서산간 추가 배송비 `remote_extra_fee`, 반품 배송비 `return_shipping_fee`(편도, 고객 귀책), 교환 배송비 `exchange_shipping_fee`(왕복, 고객 귀책), 반품 주소 `return_zipcode`·`return_address1`·`return_address2`(브랜드 물류센터). 계산: 기본(브랜드 상품 합계가 기준 이상이면 0) + 지역 추가(**무료 배송이어도 부과**, 업계 관행).
- `shipping_extra_zipcode` [추가 배송비 지역 우편번호]: PK `zipcode`(배송지 우편번호와 같은 물리명·논리명), 지역 유형 JEJU/REMOTE, 지역 이름. 운영자 관리 기준표, 목록에 없으면 추가비 없음.
- **규칙은 브랜드, 결과는 주문**: 주문 때 계산한 배송비는 `order_brand.shipping_fee`(지역 추가 포함, 고정)와 그중 지역분 `extra_shipping_fee`, `orders.shipping_fee`는 그 합계 캐시. 정책이 바뀌어도 과거 주문은 그대로(상품 판매가 ↔ 주문 상세 판매가 스냅샷과 같은 원리).

### 6-1. 상품 · 기준 데이터 (`product_master`)
- 표시 순서: 만든 순서는 기준 데이터가 먼저지만 dbml·ERD 페이지에서는 **상품 기본 → 기준 데이터 → 실측** 순(사용자 결정 2026-11-25: 핵심인 상품을 먼저 보이게).
- **여성/남성 구분은 A안** (사용자 결정, 2026-11-24): 카테고리 트리는 하나, 성별은 상품 컬럼(`product.gender`, 6-2에서 추가). 남녀공용 상품이 양쪽 메뉴에 나옴.
- `product_category`: PK 카테고리 코드 `category_code varchar(30)`(앱이 정함, 변경 불가), 상위 코드 자기 참조, 단계 1~3(상위에서 계산되는 값을 조회용으로 저장, 카테고리 이동 시 하위까지 갱신), 정렬 순서. **품목 유형** `item_type`(CLOTHING/SHOES/BAG/ACC, 실측 결정)과 **고시 유형 기본값** `default_notice_type`(CLOTHING/SHOES/BAG/FASHION_ACC/JEWELRY_WATCH)을 따로 둠. 고시 유형은 카테고리에 기본값만 두고(상품 등록 시 고시 폼 자동 선택) 실제 유형은 상품 고시(6-4)에 저장(사용자 결정 A안, 2026-11-24: 액세서리 중 귀금속처럼 카테고리로 안 갈리는 상품 대응). UK (parent_code, name).
- `product_std_color`: 필터용 표준 색상(코드·이름·`hex_code`). 브랜드 색 이름은 6-2 `product_color`가 이 표를 참조(브랜드가 붙인 컬러명은 표준 `color_name`과 다른 물리명, 예: `brand_color_name` 브랜드 색상 이름).
- `product_std_material`: 표준 소재(코드·이름 UK·정렬·사용 여부). **소재 B안** (사용자 결정, 2026-11-24): 소재를 데이터로 구조화해 필터·혼용률 표에 쓰고, 상품별 부위·비율은 6-2 `product_material`. 법정 고시 소재 문구는 6-4에 브랜드 문구 그대로 저장(`product_material`로 초안 생성).

### 6-2. 상품 · 상품 기본 (`product_basic`)
- 구조: 상품 1행 + 컬러 N + 옵션(컬러 × 사이즈) N. 예: 울 코트(상품 1000123) → 컬러 2(블랙·크림 베이지) × 사이즈 3 = 옵션 6행, 재고는 옵션마다.
- `product`: PK **상품 코드** `product_code varchar(20)`(숫자만, 앱 발급 채번, 브랜드 접두사 없음, 변경 불가, 상품 URL). 브랜드 1개 + **말단(3단계) 카테고리 1개**(앱 검증, 여러 카테고리 노출은 범위 밖). 품목 유형은 카테고리에서 따라오고(복사 안 함), 고시 유형은 6-4 상품 고시. 성별 `gender` WOMEN/MEN/UNISEX(A안), 브랜드 품번 `style_no`(선택, 브랜드 안 UK), 정가·판매가(CHECK 판매가 ≤ 정가, 할인율은 계산값), 단독 여부, **목록 이미지** `list_image_url`(선택, 사용자 결정 2026-11-24: 목록과 상세 갤러리 이미지를 다르게 쓰는 브랜드용, NULL이면 갤러리 대표 MAIN. 목록 조회를 조인 없이), 상태 ACTIVE/PAUSED/ENDED ↔ `ended_at`(품절은 상태가 아니라 옵션 재고), **판매 시작일시** `sale_started_at`(NOT NULL, 등록일시와 별개: 검수 후 공개·예약 오픈 대응, 노출 조건 `status = 'ACTIVE' AND sale_started_at <= NOW()`, 신상품 정렬 기준, 사용자 결정 2026-11-24: 출시일시에서 변경), 캐시(찜 수·리뷰 수·평균 별점). `created_by`/`updated_by`는 FK 없이(브랜드 관리자·운영자 테이블 생기면 연결).
- `product_detail` (1:1): 상세 본문 `detail_html mediumtext`(NOT NULL)에 브랜드가 만든 **긴 상세 이미지(`<img>`)와 글**을 함께 담는다(사용자 결정 2026-11-24: 상세 이미지를 행으로 나누지 않음, 이미지는 썸네일·갤러리 `product_image`와 상세 HTML 두 곳뿐). 목록 조회에서 큰 본문을 분리.
- `product_color`: PK (product_code, color_no). 브랜드 색상 이름 `brand_color_name`(예: 크림 베이지) + 표준 색상 코드(필터). 정렬 맨 앞이 대표 컬러.
- `product_option`: PK (product_code, option_no). **SKU라는 용어 대신 옵션**(사용자 요청). 컬러 번호(복합 FK → product_color) + 사이즈 번호(복합 FK → 6-3 `product_size`, 사용자 결정 2026-11-25: 실측이 사이즈마다 있어 사이즈를 분리), 추가 금액, 재고 수량(0이면 품절, 이력은 6-5), 상태 ACTIVE/PAUSED. UK (product_code, color_no, size_no).
- `product_image` [상품 갤러리 이미지]: PK (product_code, image_no). 상세페이지 최상단 갤러리(썸네일 포함). 컬러 번호 선택(NULL이면 공통, 복합 FK), 유형 MAIN/SUB, URL, 정렬.
- `product_material`: PK (product_code, part_type, material_code). 소재는 **상품 단위**(컬러별 아님). 부위 OUTER/LINING/FILLING/UPPER/SOLE, 혼용률 `ratio decimal(5,2)`(신발·가방은 NULL 가능, 부위별 합계 100%는 앱 검증). 법정 고시 소재 문구는 6-4에 브랜드 문구 그대로.
- 복합 FK(옵션·이미지 → 컬러)는 ERD에서 `color_no` 선으로 그린다(`lib.load`가 마지막 컬럼을 대표로). 편집 모드에서 복합 FK 삭제는 채팅으로.

### 6-3. 상품 · 실측 (`product_measure`)
- `product_size`는 처음에 이 묶음(당시 이름 사이즈·실측 `product_sizing`)에서 만들었지만 **상품 기본 묶음 소속** (사용자 결정 2026-11-25: 옵션 = 컬러 × 사이즈라 상품의 뼈대). 묶음 이름도 **실측** `product_measure`로 변경(사용자 결정 2026-11-25). 실측 묶음은 실측 항목 기준표·카테고리 실측 항목·상품 실측 3개.
- 상세페이지 사이즈 정보 표 = 상품 사이즈(행) × 실측 항목(열). 단위는 모두 cm(신발 사이즈 mm는 사이즈 이름).
- `product_measure_item` [실측 항목]: 기준표(PK 코드 TOTAL_LENGTH/SHOULDER/CHEST/…/BAG_WIDTH 등, 이름 UK, 품목 유형, 측정 방법 안내, 정렬·사용 여부, 관리자 감사 컬럼).
- `product_category_measure_item` [카테고리 실측 항목]: PK (category_code, measure_item_code) + 정렬(표 열 순서). 어느 단계 카테고리에든 지정, 상품의 말단 카테고리에서 위로 올라가 가장 가까운 매핑을 씀(앱).
- `product_size` [상품 사이즈]: PK (product_code, size_no). `size_label`(S/M/230/FREE, 상품 안 UK)·정렬(S→M→L). **모델 정보(키·착용 사이즈)는 두지 않음** (사용자 결정 2026-11-25: 모델이 여러 명일 수 있고, 보통 상세 이미지 맨 아래에 함께 표기 → 상세 본문 HTML).
- `product_size_measure` [상품 실측]: PK (product_code, size_no, measure_item_code), `measure_value decimal(5,1)` cm. 카테고리 항목만(앱 검증). 컬러와 상관없이 사이즈마다.
- 범위 밖: 국가별 사이즈 환산표(상세 HTML), "정사이즈/작게 나옴"(리뷰 집계, 커뮤니티 단계).

### 6-4. 상품 · 정보 고시 (`product_notice`)
- 전자상거래법 상품정보제공 고시. **A안: 한 테이블** (사용자 결정 2026-11-25). 고시 유형 5개(의류/구두·신발/가방/패션잡화/귀금속·시계)의 항목 절반 이상이 공통이라 공통 항목은 NOT NULL 컬럼, 유형별 항목(종류·색상·중량·제조연월·주요 사양·보증서)은 NULL 가능 컬럼 + 유형별 CHECK로 필수 강제(B안 항목 기준표 + 값 행은 DB가 누락을 못 잡아 제외). 화면 라벨 차이(신발 "제품 주소재" 등)는 앱.
- `product_notice`: PK `product_code`. `notice_type`(카테고리 `default_notice_type`에서 시작, 예외 상품은 변경), 종류 `item_kind`(가방·잡화 필수), 소재 `material_text`(브랜드 문구 그대로, 초안은 `product_material`), 색상 `color_text`(의류·신발·가방 필수), 치수 `size_text`, 중량 `weight_text`, 제조자 이름·수입자 이름(수입품만), 제조국 `made_in`, 취급 시 주의사항 `care_text`(의류는 세탁 방법), 제조연월 `manufactured_ym`(의류 필수, 문구), 주요 사양 `spec_text`·보증서 제공 여부 `is_warranty_card`(귀금속·시계 필수), 품질보증기준, A/S 책임자 이름·전화번호(사업장 번호라 평문). 감사 컬럼은 상품처럼 FK 없이.
- 항목 목록은 고시 원문 별표와 대조하지 않은 상태(검색으로 별표를 찾지 못함) → 원문 확인 후 보정. 나중: A/S·품질보증기준 브랜드 기본값(브랜드 정책 묶음에서 복사), 고시 변경 이력(표시·광고 기록 6개월 보관, 이력 묶음에서 검토).

### 6-6. 상품 · 고객 연결 (`product_customer`, 일부)
- 찜은 장바구니(옵션·수량, 주문으로 이어짐)와 달리 상품에 대한 고객 반응이라 **상품 영역** (사용자 확인 2026-11-25). 브랜드 좋아요는 브랜드 영역 `brand_like`(나중).
- `product_like` [상품 찜]: PK (member_id, product_code), 상품 단위(컬러·사이즈 선택 전), 회원만. **찜 당시 판매가** `liked_price`(찜한 뒤 가격 인하 표시·알림). 찜 해제는 행 삭제, 같은 트랜잭션에서 `product.like_count` ±1. 인덱스: 회원별 최근 찜 순 `(member_id, created_at)`, 상품별(FK·알림 대상). 판매 종료 상품도 행 유지(목록에 판매 종료 표시). 폴더·비회원 찜은 두지 않음.
- 나중: 재입고 알림(회원-옵션, 품절 옵션에만 신청).

### 7. 주문 (`order_cart`, `order_basic`)
- 근거: `docs/화면 캡처_주문.png`(장바구니·주문/결제 화면 항목 메모). 주문 + 파생 엔티티 장바구니만, 결제·배송·혜택은 별도 영역에서 FK 연결.
- **비회원 주문 받음** (사용자 결정 2026-11-25): `orders.member_id` NULL이면 비회원. `guest_password_hash`(bcrypt, 주문 번호 + 비밀번호로 조회), CHECK (member_id 또는 비밀번호 중 하나 필수)라 member_id FK는 참조 동작 없이. 비회원은 휴대폰 인증(`orderer_verified_at`). 비회원 개인정보 수집 동의는 약관 묶음.
- `cart_item` [장바구니 상품]: PK (member_id, product_code, option_no), 수량. 회원만 DB, 비회원은 브라우저 저장 후 로그인 시 합침. 가격·할인·배송비·브랜드별 합계·총계는 저장하지 않고 화면에서 현재가로 계산.
- `orders` [주문]: PK 주문 번호 `order_no varchar(20)`(앱 채번). 주문 1건 = 결제 1번. 주문 유형 NORMAL/GIFT(선물하기는 자리만, 흐름은 나중 묶음), 주문 경로, 주문자 스냅샷(이름·휴대폰 `_enc`/`_hash`·이메일), 상품 금액·할인 금액·배송비·결제 금액(CHECK 결제 = 상품 − 할인 + 배송비), 상태 PAYMENT_WAITING/PAID/CANCELLED(결제 단계만, 무통장 입금 대기 때문) ↔ `paid_at`/`cancelled_at`. 주문일시는 `created_at`.
- `order_delivery` [주문 배송지] 1:1: 받는 분·연락처·주소·요청사항 스냅샷(`member_address`와 같은 물리명·논리명). "주문자와 동일"은 화면 기능.
- `order_brand` [주문 브랜드]: PK (order_no, brand_id). 브랜드 정보가 아니라 **이 주문 안의 브랜드별 묶음**(주문 상세 ↔ 상품과 같은 관계). 브랜드별 상품 금액·배송비(브랜드 배송 정책으로 계산한 결과를 고정, 지역 추가분 `extra_shipping_fee` 따로), 주문의 배송비는 그 합계 캐시. 배송 영역의 출고·송장이 이 단위에 붙을 예정.
- `order_item` [주문 상세]: PK (order_no, item_no). (논리명은 주문 상품 → **주문 상세**로 변경, 사용자 결정 2026-11-25: 영수증의 상품 한 줄이라는 익숙한 이름. 물리명 `order_item` 유지) 주문 브랜드 복합 FK, 옵션 복합 FK + 스냅샷(상품 이름·브랜드 색상 이름·사이즈·정가·판매가·추가 금액), 수량, 할인 금액(쿠폰 배분, 부분 취소 환불 근거), 상태 ORDERED/PREPARING/SHIPPING/DELIVERED/CONFIRMED/CANCELLED/RETURNED(세부는 배송 영역에서 확정), 구매확정일시.
- **포인트는 쿠폰 할인과 따로** `point_amount`(주문·주문 상세, 사용자 확인 2026-11-25): 금액 내역(상품 − 쿠폰 − 포인트 + 배송비 = 결제 금액)은 주문 데이터. 주문 내역에 따로 표시, 부분 취소 시 쿠폰은 소멸·재발급 규칙·포인트는 포인트로 환원. 비회원은 0(CHECK). 결제 영역은 실제 낸 돈(`pay_amount`의 수단·PG·현금영수증)만, 포인트 잔액·내역은 혜택 영역.
- 회원 주문서 차이(사용자 정리): 주문자 정보 입력 없음(회원 정보에서 자동 복사, 스냅샷은 유지), 배송지는 `member_address` 목록 선택(결과는 똑같이 `order_delivery` 스냅샷), 포인트 사용, "결제 수단 다음에도 적용"은 결제 영역에서 회원 결제 설정(`member_payment_setting`, 나중)으로.
- 같은 물리명 `product_amount`/`discount_amount`/`point_amount`/`shipping_fee`는 주문·주문 브랜드·주문 상세에서 논리명이 같고, 범위(전체/브랜드/상품)는 설명에.
- 화면 항목 중 주문 밖: 함께 구매하면 좋을 상품(추천), 오늘 출발 예정 안내(브랜드 출고 기준), 본인인증(가입 시 완료).

### 결제 · 결제 기본 (`payment_basic`, 시험 반영 2026-11-26)
- **주문 1건 = 결제 수단 1개** (사용자 결정 2026-11-26): 카드 여러 장·카드 + 휴대폰 같은 복합 결제는 받지 않는다. 포인트는 주문의 `point_amount`로 처리. **예외: 교환 배송비** (사용자 결정 2026-11-27): 결제 유형 `payment_type` ORDER/CLAIM_FEE + `claim_no`(반품·교환 신청 FK, CHECK라 참조 동작 없음)로 같은 결제 표에 따로 결제하고, `ux_payment_success`는 주문 결제(ORDER)에만 적용.
- **배송비 환불** (2026-11-27): 결제 취소 상세·결제 취소 내역에 `shipping_refund_amount` [배송비 환불 금액](브랜드 전체 취소, 판매자 귀책 반품). 취소 금액 = (판매가 + 추가 금액) × 수량 − 할인 − 포인트 + 배송비 환불 − 배송비 차감. 반품 환불이면 결제 취소 내역의 `claim_no`(CHECK 취소 사유 유형 RETURN ↔ 신청 번호).
- **부분 취소 받음 → 결제 취소 내역 테이블 둠** (사용자 요청 2026-11-26 "만들어줘"): 부분 취소(A·B·C 중 A만, 수량 일부, 한 브랜드만)는 여러 번 생길 수 있고 회차마다 PG 취소 거래 번호·환불액(배송비 차감·포인트 환원 반영)이 달라 결제 상태만으로 못 담는다. 반품 환불도 같은 표.
- `payment` [결제]: PK (order_no, payment_no), 결제 시도마다 1행(실패 후 재시도, 결제창을 띄울 때 주문별 MAX+1. 주문 1:1로 덮어쓰는 안은 사용자가 거절 2026-11-26: 실무 수준으로 실패 시도도 DB에 남김), 성공한 결제는 주문당 1개(`ux_payment_success` 함수 기반 unique). 결제 수단 `pay_method`, 간편결제 종류, PG사, PG 거래 번호(UK with PG사), 결제 금액(승인 전 주문 결제 금액과 서버 검증), 누적 취소 금액 캐시, 상태 WAITING/PAID/FAILED/PARTIAL_CANCELLED/CANCELLED(주문 PAYMENT_WAITING과 단어 톤을 맞춤, 사용자 결정 2026-11-26) ↔ `paid_at`/`failed_at`, 실패 사유. **취소일시는 결제에 두지 않음** (사용자 결정 2026-11-26: 결제 취소 내역의 회차별 취소일시와 중복, 상태 ↔ 시각 짝 규칙의 예외). 실패는 결제 시도의 결과라 결제에 둔다. 수단별 정보는 **1:1 테이블로 분리** (사용자 요청 2026-11-26: 결제 테이블이 NULL 컬럼으로 지저분해서): `payment_card` [결제 카드 정보](카드사 코드·카드 번호(마스킹)·할부 개월 수·카드 승인번호, 카드로 낸 간편결제 포함), `payment_vaccount` [결제 가상계좌 정보](은행 코드·가상계좌 번호·입금 기한, 입금 기한 배치 인덱스). PK는 결제와 같은 (order_no, payment_no), 모두 PG 응답으로 받는 값(카드 정보는 고객이 PG 결제창에서만 입력). 카드 결제면 카드 정보 행 필수는 앱 검증. **카드 승인번호 인덱스** `ix_payment_card_approval` (사용자 요청 2026-11-26): 고객이 주문 번호 없이 카드 명세서의 승인번호만으로 문의하는 경우와 카드사 분쟁(차지백) 대조용. 5년 보관이라 행이 많아 전체 검색을 피함. 승인번호는 카드사·날짜가 다르면 겹칠 수 있어 UNIQUE가 아닌 일반 인덱스(겹치면 카드사 코드·결제일시로 구분). 실시간 계좌이체는 은행 코드 하나뿐이라 결제의 `bank_code`에 남김(사용자 결정, 나중에 분리 요청 가능). 가상계좌는 입금 웹훅이 와야 결제 완료, 기한 초과는 배치로 실패 + 주문 취소.
- `payment_cancel` [결제 취소 내역]: 취소 사유 유형 6개(단순 변심/품절/배송 지연/반품/관리자 처리/기타)로 확정, 필요하면 나중에 추가(사용자 결정 2026-11-26). PK (order_no, cancel_no) (사용자 결정 2026-11-26: 성공한 결제가 주문당 1개라 결제 번호 없이 주문 기준 번호로 충분). `payment_no`는 PK가 아니라 결제 복합 FK 컬럼. 취소 사유 유형·사유(고객이 왜 취소했나), 취소 금액(PG 환불액), 포인트 환원 금액, 배송비 차감 금액, 상태 REQUESTED/COMPLETED/FAILED ↔ `cancelled_at`, 취소 실패 사유 `cancel_fail_reason`(PG 취소가 왜 실패했나, 결제의 `fail_reason` 실패 사유와 물리명 구분), PG 취소 거래 번호, `created_by`(관리자 처리 시).
- `payment_cancel_item` [결제 취소 상세]: 결제 취소 내역의 상세 줄(논리명은 주문 상세와 같은 이유로 결제 취소 상품 → 결제 취소 상세, 사용자 확인 2026-11-26). PK (order_no, cancel_no, item_no) (주문 상세 (order_no, item_no)와 나란한 모양) → 주문 상세 복합 FK. 취소 수량·상품 몫 취소 금액·포인트 환원 금액·**배송비 차감 금액**(사용자 결정 2026-11-26: 배송비는 브랜드별이라 상품 줄에 배분해 두고 주문 상세의 브랜드로 모아 브랜드별 차감액을 구함, 결제 취소 내역의 배송비 차감 금액은 그 합계 캐시). 주문 상세는 수량을 모두 취소하면 CANCELLED(앱).
- `payment_cash_receipt` [현금영수증] (사용자 요청 2026-11-26): 현금성 결제(실시간 계좌이체·가상계좌·간편결제 페이 머니) 공통이라 계좌이체 컬럼이 아니라 별도 테이블. PK (order_no, receipt_no), 결제 복합 FK + 취소 발급이면 결제 취소 내역 복합 FK(`cancel_no`, CHECK에 쓰여 참조 동작 없음). 발급 유형 ISSUE/CANCEL(부분 취소마다 취소 발급 행), 용도 유형 INCOME_DEDUCTION/EXPENSE_PROOF, 발급 번호 유형 PHONE/BIZ_NO/CARD/SELF + 발급 번호 `id_no_enc`(AES-256, 자진발급이면 NULL). **번호를 입력하지 않으면 자진발급, 발급 번호는 탈퇴해도 5년 보관 후 파기** (사용자 결정 2026-11-26), 발급 금액 = 공급가액 + 부가세(CHECK), 상태 REQUESTED/ISSUED/FAILED ↔ `issued_at`, 발급 실패 사유 `receipt_fail_reason`, PG 현금영수증 키(UK), 국세청 승인번호, 조회 주소. 실시간 계좌이체 환불은 PG가 원래 계좌로(환불 계좌 불필요), 가상계좌만 환불 계좌 필요.
- 결제 FK는 모두 참조 동작 없음(5년 보관). PG사 기준표는 만들지 않고 코드만(사용자 결정 2026-11-26: 브랜드 정산 단계에서 수수료와 함께 검토). 나중: 카드 혜택(즉시 할인·무이자), 회원 결제 설정, 비회원 가상계좌 환불 계좌.

### 배송 · 출고 기본 (`delivery_basic`, 2026-11-27)
- 근거: 카페24·가비아 클릭엔 관리자 화면 캡처(저장소 `image/`). 범위는 **출고 + 반품·교환**(사용자 결정 2026-11-27): 출고 전 취소는 결제 취소 내역으로 처리해 배송 영역 밖, 반품·교환은 다음 묶음 `delivery_claim`.
- **분할 출고 허용, 합포장 없음** (사용자 결정): 출고 PK (order_no, shipment_no), 출고 번호는 주문별 1부터이고 브랜드는 PK가 아닌 주문 브랜드 복합 FK 컬럼 (사용자 요청 2026-11-27: 출고 상세 PK가 길어서 브랜드를 PK에서 뺌), 다른 주문을 한 상자로 묶지 않는다(주문마다 배송비를 따로 받아 합포장하면 환불·정산을 다시 맞춰야 함). **배송 보류 상태 없음** (사용자 결정: 멈출 때는 송장을 입력하지 않고 출고 준비로 둠, 사유는 주문 상세 상태 이력).
- `delivery_shipment` [출고]: 송장 1개 = 출고 1행. 상태 READY/INVOICED/SHIPPING/DELIVERED(출고 준비/송장 입력(배송 대기)/배송중/배송 완료) ↔ `invoiced_at`/`shipped_at`/`delivered_at`. 송장 입력은 브랜드 관리자, 배송중·완료는 추적 이벤트(집하·배송 완료). CHECK 출고 준비가 아니면 택배사·송장 번호 필수(그래서 택배사 FK 참조 동작 없음). 송장 번호는 UNIQUE가 아닌 조회 인덱스 (택배사, 송장 번호, 등록일시) (사용자 결정 2026-11-27: 택배사가 송장 번호를 재사용해 5년 보관 중 겹칠 수 있음, 진행 중 출고끼리 중복은 앱 검증, 웹훅은 가장 최근 출고에 연결). 출고 번호와 송장 번호를 분리한 이유: 송장은 출고 준비 뒤에 붙고 수정·재발행될 수 있음. 발송 예정일(예약 상품 안내). 감사 컬럼은 FK 없이.
- `delivery_shipment_item` [출고 상세]: PK (order_no, item_no, shipment_no) (사용자 요청: 주문 번호 → 주문 상세 번호 순서가 먼저 보이게, 주문 상세 FK 인덱스 겸용, 출고 FK는 별도 인덱스), 수량. **브랜드 아이디는 PK가 아닌 컬럼**으로 두고 출고 FK (주문 번호, 출고 번호, 브랜드)·주문 상세 FK (주문 번호, 주문 상세 번호, 브랜드)에 모두 넣어 출고 브랜드 = 주문 상세 브랜드를 DB가 보장 (사용자 결정 2026-11-27, FK 대상으로 `uk_delivery_shipment_brand`·`uk_order_item_brand` 추가). 주문 상세 1줄이 여러 출고에 나뉨, 출고 수량 합계 ≤ 주문 수량 - 취소 수량(앱).
- `delivery_tracking` [배송 추적 이력]: 배송 추적 이력 테이블 둠(사용자 결정). PK (order_no, shipment_no, tracking_no). 택배사 웹훅 이벤트 1행(집하/이동중/배송 출발/배송 완료/배송 실패), 처리 위치·택배사 메시지·이벤트 일시(수신 시각은 `created_at`). 중복 수신 방지 UK.
- `delivery_carrier` [택배사]: 기준표(코드·이름·송장 조회 주소 형식·정렬·사용 여부).
- 주문 상세 상태는 출고 결과의 요약(배송 대기는 출고에서만 구분). **자동 구매 확정: 배송 완료 7일 후** (사용자 결정).
- `order_item_history` [주문 상세 상태 이력] (사용자 요청: 되돌리기 대응, 주문 기본 묶음): PK (order_no, item_no, history_no), 이전 상태·상태·**처리 주체 유형** `actor_type` CUSTOMER/BRAND/ADMIN/SYSTEM·변경 사유(되돌리기·운영자 처리면 필수)·`created_by`.

### 배송 · 반품·교환 (`delivery_claim`, 2026-11-27)
- 근거: 클릭엔 관리자 반품관리·교환관리 화면(교환 신청/수거완료/재배송중/완료). 사용자 결정: **교환 배송비는 결제 유형을 추가해 따로 결제**, **교환은 같은 상품의 다른 옵션만**(다른 상품은 반품 후 재주문).
- 기본안(이번에 정함): 신청 1건 = 주문 브랜드 1개(회수지가 브랜드 물류센터), 교환 재배송은 출고 재사용(`delivery_shipment.claim_no`, NULL이면 일반 출고), 주문 상세 상태에 반품·교환 진행 상태를 추가하지 않음(진행은 신청 상태, 반품 승인 수량이 다 차면 RETURNED, 진행 중 신청이 있으면 자동 구매 확정 건너뜀, 교환은 재배송 배송 완료 7일 후).
- `delivery_claim` [반품·교환 신청]: PK (order_no, claim_no), 주문 브랜드 복합 FK + `uk_delivery_claim_brand`. 신청 유형 RETURN/EXCHANGE, 신청 사유 유형 8개, 귀책 유형 CUSTOMER/SELLER(사유에서 기본값, 브랜드가 검수 후 변경), 반품·교환 배송비 스냅샷, 배송비 결제 방식 REFUND_DEDUCT/PAYMENT/NONE, 상태 REQUESTED/COLLECTING/COLLECTED/RESHIPPING/COMPLETED/REJECTED/WITHDRAWN ↔ `approved_at`/`collected_at`/`completed_at`/`rejected_at`/`withdrawn_at`(신청 = `created_at`, 재배송중은 출고 시각), 거부 사유.
- `delivery_claim_pickup` [반품·교환 회수 정보] 1:1: 회수 방법 PICKUP/SELF_SEND, 회수지 스냅샷(연락처 `_enc`), 회수 택배사·송장(UNIQUE 아닌 조회 인덱스).
- `delivery_claim_item` [반품·교환 신청 상세]: PK (order_no, claim_no, item_no), 브랜드 아이디를 신청 FK·주문 상세 FK 양쪽에(출고 상세와 같은 방식), 수량·**승인 수량**(검수 후, 일부 승인 가능, 환불·재배송 기준), 교환 옵션(`product_code` + `exchange_option_no` → 옵션 복합 FK, 같은 상품은 앱 검증).
- `delivery_claim_history` [반품·교환 처리 이력]: 주문 상세 상태 이력과 같은 구조(이전 상태·상태·처리 주체 유형·변경 사유·`created_by`).
- 나중: 반품 증빙 사진, 비회원 가상계좌 환불 계좌, 쿠폰 재발급(혜택 영역).

### 나중에 재검토
- **운영 영역 (운영자 기본 `admin_basic`)**: 2026-11-24 사용자 요청으로 ERD에서 뺐다("아직 거기까지 다루고 싶지 않다"). 사용자가 다시 꺼내기 전에는 제안하지 않는다. 빼기 전 설계(`admin_user`·`admin_login`·`admin_role`·`admin_role_history`·`admin_access_log`, 개인정보 안전성 확보조치 기준 반영)는 커밋 `8692840`~`ad4d30d`에 있다. 지금 `created_by`/`updated_by` 컬럼(등급 기준표·혜택·등급 이력)은 FK 없이 운영자 아이디 `varchar(20)`만 두고, 운영자 테이블을 만들 때 `admin_user.admin_id` FK로 연결한다.
- **Involved Party 패턴** (사람·회사를 상위 `party`로 묶고 고객·운영자·브랜드 관리자를 역할로): 사용자가 나중에 다시 검토하기로 함. 고객·운영자 계정은 보안상 분리 유지가 기본안이고, 적용한다면 브랜드(사업자·정산 주체) 쪽이 유력. 도입 시 자연키가 없어 ULID 같은 앱 생성 키가 필요(AUTO_INCREMENT 금지 규칙과 함께 검토).

## 저장소 메모

- 루트의 `2026-*.txt`, `conversation-*.txt`는 Claude Code 대화 기록 export다. 커밋하지 않는다.
- 커밋 메시지와 문서는 한국어로 작성한다.
- 수정된 내용은 자동으로 커밋하고 푸시한다.
