# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 프로젝트 상태

**패션 마켓 입점형 쇼핑몰** 포트폴리오 프로젝트 (에이블리 벤치마킹: 소호 쇼핑몰 "마켓"이 입점해 판매). 2026-11-20에 인테리어몰 설계를 접고 **처음부터 다시 설계** 중(사용자 결정). 현재는 **DB 설계 단계**로, 애플리케이션 코드·빌드·테스트 명령은 아직 없다. 모든 산출물은 `docs/`에 있다.

- 대상 DB: **MySQL 8.0** (8.0.16 이상: CHECK 제약이 실제로 검사됨, 8.0.13 이상: 함수 기반 인덱스). InnoDB, `utf8mb4` / `utf8mb4_0900_ai_ci`.
- 판매 방식: **마켓 입점형 (에이블리식)** (사용자 확정). 상품은 마켓에 속한다. 지금 단계의 판매자 범위는 **마켓 기본만**(마켓 정보·마켓 관리자 계정·입점 상태·마켓 찜). 수수료·정산은 주문/결제 단계에서 다룬다.
- 품목: **의류 + 신발 + 가방·잡화** (사용자 확정). 품목군마다 사이즈 체계·실측 항목·상품정보제공고시 유형이 다르다.
- **진행 방식** (사용자 요청: "너무 광범위하지 않게, 상세하게"): 고객 → 마켓 기본 → 상품 순서로, **묶음(TableGroup) 단위로 컬럼까지 확정**하며 하나씩 추가한다. 사용자가 확인하기 전에 다음 묶음 테이블을 미리 넣지 않는다. 주문·결제·배송·혜택·커뮤니티는 아직 범위 밖.
- 작업 방식: 사용자는 **설계를 먼저 확정한 뒤 파일(DDL SQL 등)을 만들기**를 원한다. 요청 없이 SQL 파일을 만들지 않는다.

### 로드맵 (목록만, 컬럼은 묶음마다 확정)
| 순서 | 묶음 | 후보 테이블 | 상태 |
|---|---|---|---|
| 1 | 고객 · 회원 기본 `member_basic` | `member_account`, `member_social`, `member_body`, `address` | 반영 |
| 2 | 고객 · 약관·알림 | `terms`, `member_terms_agreement`, `member_notification_setting` | 대기 |
| 3 | 고객 · 보안·상태 | `member_status_history`, `login_history`, `member_session`, `member_token`, `password_history`, `admin_user`, `privacy_access_log` | 대기 |
| 4 | 고객 · 취향 | `style`, `member_style` | 대기 |
| 5 | 마켓 기본 | `market`, `market_user`, `market_status_history`, `market_like` | 대기 |
| 6~ | 상품 | 카테고리(품목군), 사이즈 체계·실측, 상품·컬러·SKU, 이미지, 고시, 재고·가격 이력 | 대기 |

회원 등급(`member_grade`)은 구매 실적과 연결되므로 주문 단계에서 함께 설계한다.

## 설계 문서와 동기화

| 파일 | 역할 |
|---|---|
| `docs/erd.dbml` | **기준 원본(source of truth)**. 상단 주석에 테이블 개수, 하단에 `Ref`·`TableGroup`. https://dbdiagram.io/d 에 붙여넣어 확인 |
| `docs/erd/index.html` | ERD 웹페이지 (GitHub Pages: https://jjonong.github.io/interior-shoppingmall/erd/). 영역 전체 ERD + 세부 영역별 ERD + 테이블 클릭 시 전체 컬럼·인덱스·관계, 검색, 테이블 드래그 배치(localStorage `erd-layout-v1`). 직접 수정 불가, `npm run erd`로 생성. Pages 소스는 main 브랜치 `/docs` (`docs/.nojekyll`) |
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
- 영역 목록·이름·색은 `lib.js`의 `AREAS` 한 곳에서 관리한다: `member_` 고객, `market_` 마켓, `product_` 상품. 영역 구분은 `TableGroup` 이름 접두사 기준. 세부 영역 설명은 `lib.js`의 `groupDesc`(묶음을 추가하면 같이 쓴다). 테이블이 아직 없는 영역은 ERD 웹페이지·draw.io에서 건너뛴다.
- Windows 환경에서 `python`은 스토어 스텁이라 실행되지 않는다. 스크립트는 `node`로.

## 설계 규칙 (DBML 전반에 일관되게 적용)

- **이름**: 테이블·컬럼·인덱스 모두 **소문자 snake_case**. 인덱스 이름 접두사 `uk_`(unique), `ux_`(함수 기반 unique), `ix_`(일반). PK 제약 이름은 MySQL에서 항상 `PRIMARY`.
- **논리명(한글 이름)**: 모든 테이블·컬럼의 note 맨 앞에 `[논리명]`을 둔다 (예: `note: '[회원 상태] ACTIVE/DORMANT/...'`). 생성 도구가 `lib.logicalOf`로 읽어 표시한다. 컬럼 논리명은 **그 자체로 뜻이 통하게 구체적으로**(`이름`이 아니라 `회원 이름`, 참조는 역할까지: `소셜 연동 회원 ID`). 표시는 논리명 우선, 물리명은 뒤에 작게.
- **예약어 회피**: `member`는 MySQL 8.0.17+ 예약어라 회원 테이블은 **`member_account`** (PK `member_id`). `order`도 예약어(주문은 나중에 `orders`). 새 이름을 만들 때 MySQL 예약어인지 확인한다.
- **PK**: `bigint` AUTO_INCREMENT(`increment`). 1:1 확장 테이블(`member_body` 등)은 부모 PK를 그대로 PK로. 매핑 테이블은 복합 PK.
- **타입**: ID·금액 `bigint`, 카운트 `int`, 작은 수 `smallint`/`tinyint`, 비율·평점 `decimal(p,s)`, 문자열 `varchar(n)`(글자 수), 본문 `text`(상세페이지·약관은 `mediumtext`), 시각 `datetime`(TIMESTAMP 2038년 제한·시간대 변환 회피).
- **상태값**: `varchar` + CHECK (허용 값은 컬럼 `note`에 `A/B/C` 형식, 대문자). **Y/N**은 `char(1)` + CHECK.
- **시간**: `created_at datetime NOT NULL DEFAULT CURRENT_TIMESTAMP`, `updated_at`은 DDL에서 `ON UPDATE CURRENT_TIMESTAMP` (DBML로는 표현 불가).
- **FK 컬럼에는 인덱스**를 둔다 (복합 UK의 선두 컬럼이면 겸용).
- **UNIQUE (MySQL 특성)**: 이메일은 대소문자 무시 콜레이션이라 일반 UNIQUE로 충분. 회원당 기본 배송지 1개는 함수 기반 `ux_address_default ((CASE WHEN is_default='Y' THEN member_id END))`. MySQL UNIQUE는 NULL 포함 행을 중복으로 보지 않는다.
- **CHECK + FK 주의 (DDL 작성 시)**: MySQL은 참조 동작(`ON DELETE CASCADE`/`SET NULL`)이 있는 FK 컬럼을 CHECK에서 쓸 수 없다. CHECK에 들어가는 FK는 참조 동작 없이 만든다.
- **다형 참조**: `target_type + target_id` 대신 대상별 nullable FK 컬럼 + CHECK.
- **개인정보**: 휴대폰 번호 등은 `_enc`(AES-256), 검색이 필요하면 `_hash`(SHA-256)를 함께. CI·토큰은 해시만. 탈퇴는 soft delete + 마스킹(`withdrawn_{ID}@deleted.local`, 이름 `탈퇴회원`, 닉네임 `deleted_{ID}`, `ci_hash` NULL).
- **캐시 컬럼**: 찜·리뷰 수, 평점 등은 note에 `캐시`로 표시하고 원본과 같은 트랜잭션에서 갱신.
- **이력 테이블 패턴**: 상태·가격·재고 변경은 이력 테이블에 남기고, 시스템 변경이면 `changed_by`는 NULL.

## 확정된 설계 (묶음별)

### 1. 고객 · 회원 기본 (`member_basic`)
- `member_account`: 구매 고객 계정만 (마켓 관리자·운영자 계정은 별도 테이블 예정). 성별·생년월일은 선택 입력(맞춤 추천 피드 기본값). 상태 ACTIVE/DORMANT/SUSPENDED/WITHDRAWN, **로그인 5회 실패 잠금은 상태가 아니라 `locked_until`**. 휴면은 `last_login_at` 11개월에 안내 → 1년 미접속 DORMANT(분리보관 없음). 닉네임 변경 후 30일 재변경 불가.
- `member_social`: 제공자 KAKAO/NAVER/APPLE/GOOGLE, 같은 소셜 계정은 한 회원에게만, 회원당 제공자별 1개.
- `member_body` (1:1): 키·몸무게·평소 상의/하의 사이즈·신발 사이즈(mm)·발볼. 사이즈 추천과 "나와 비슷한 체형" 리뷰 필터, 리뷰 공개 여부 `is_review_public`.
- `address`: 회원당 여러 개, 기본 배송지 1개(함수 기반 unique), 배송 요청사항은 주문 시 기본값으로 복사.

## 저장소 메모

- 루트의 `2026-*.txt`, `conversation-*.txt`는 Claude Code 대화 기록 export다. 커밋하지 않는다.
- 커밋 메시지와 문서는 한국어로 작성한다.
- 수정된 내용은 자동으로 커밋하고 푸시한다.
