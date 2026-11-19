# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 프로젝트 상태

**인테리어 가구몰 + 커뮤니티** 포트폴리오 프로젝트 (오늘의집 벤치마킹: 스토어 + 고객 사진/집들이 + 브랜드 매거진). 현재는 **DB 설계 단계**로, 애플리케이션 코드·빌드·테스트 명령은 아직 없다. 모든 산출물은 `docs/`에 있다.

- 대상 DB: **MySQL 8.0** (8.0.16 이상: CHECK 제약이 실제로 검사됨, 8.0.13 이상: 함수 기반 인덱스). InnoDB, `utf8mb4` / `utf8mb4_0900_ai_ci`. (Oracle에서 전환함. Oracle 버전은 `docs/archive_oracle/`)
- 판매 방식: **자사 브랜드(PB) 상품만 직접 판매** (입점 판매자·정산·브랜드 구분 없음, 사용자 확정). 오픈마켓 구조로 바꾸지 않는다. 브랜드 테이블(`brand`, `member_brand_preference`)은 이 결정으로 뺐으므로 다시 넣기 전에 사용자와 상의한다. 업체·상품은 실제가 아닌 가상 데이터로 채운다.
- 커뮤니티 범위: 자사몰은 대형 플랫폼만큼 사용자가 모이지 않으므로 **구매 고객 사진·집들이 + 운영자 매거진으로 축소** (사용자 확정). 팔로우·차단·해시태그·댓글 좋아요·스크랩 폴더·질문과답변(상품 문의와 중복)은 의도적으로 뺐다. 다시 넣기 전에 사용자와 상의한다.
- 영역 8개 (쇼핑 흐름 순, 사용자 확정): 고객(20) + 상품(33) + 커뮤니티(12) + 장바구니(4) + 주문(7) + 결제(3) + 배송(7) + 혜택(5) = **91개 테이블**. 예전 "1~4단계" 표기는 쓰지 않는다.
- **다음 단계(구매 리뷰, 포인트, 반품·교환 클레임, 등급 산정 기준)는 대기 중.** 사용자가 요청하기 전에는 테이블을 추가하지 않는다. `stock_history.ref_type = CLAIM`의 `ref_id`와 주문 금액의 `point_used_amount`(지금은 0)가 다음 단계와 연결될 자리. 포인트를 만들면 '혜택' 영역(`benefit_`)에 둔다.
- 작업 방식: 사용자는 **설계를 먼저 확정한 뒤 파일(DDL SQL 등)을 만들기**를 원한다. 요청 없이 SQL 파일을 만들지 않는다.

## 설계 문서와 동기화

| 파일 | 역할 |
|---|---|
| `docs/erd.dbml` | **기준 원본(source of truth)**. 91개 테이블, 인덱스, 관계(`Ref`), `TableGroup` 24개. https://dbdiagram.io/d 에 붙여넣어 확인 |
| `docs/DB_설계서.pdf` | `erd.dbml`에서 생성한 설계서 (표지, 전체 구조, 설계 원칙, 흐름도, 영역별 ERD, 테이블 명세, FK 목록). **모든 페이지 A4 세로** (사용자 요청, 가로 페이지 섞지 않음). 직접 수정 불가, 설계가 바뀌면 `tools/design-doc`에서 `npm run pdf`로 다시 생성 |
| `docs/고객_설계_요약.pdf` | 고객 영역 요약본 (약 8쪽: 한눈에 보기·핵심 결정, 고객 전체 ERD, 테이블 요약표, 설계 과정, 보안, 생명주기, 정책·향후 검토). 전체 설계서가 길어서 사용자가 요청한 별도 문서. `npm run summary`로 생성 |
| `docs/erd/index.html` | ERD 웹페이지 (GitHub Pages: https://jjonong.github.io/interior-shoppingmall/erd/). 영역 이름(고객·상품 등)을 누르면 그 영역 전체 ERD(세부 영역별 ERD를 상자로 격자 배치, `lib.areaSvg`) + 세부 영역별 ERD + 테이블 클릭 시 전체 컬럼·인덱스·관계, 검색. 단일 HTML(외부 라이브러리 없음). 직접 수정 불가, `npm run erd`로 생성. Pages 소스는 main 브랜치 `/docs` (`docs/.nojekyll`로 Jekyll 생략). **테이블 드래그 배치**: 끌어 옮기면 연결선이 따라오고 배치는 브라우저(localStorage `erd-layout-v1`)에 저장, "배치 초기화"·"배치 내보내기", "draw.io에서 열기"(Pages에서만) |
| `docs/erd-layout.json` | (선택) 웹페이지 공유 배치. 웹페이지 "배치 내보내기"로 받은 파일을 여기 두고 `npm run erd`하면 모든 사람에게 같은 배치. 화면키 → {노드키(영역 전체 화면은 `그룹/테이블`): [dx, dy]}. 설계 변경으로 자동 배치가 달라지면 어긋날 수 있음 → 다시 내보내기 |
| `docs/erd.drawio` | draw.io(diagrams.net) 파일. 첫 페이지 "전체"(91개 한 장, 영역 색) + 영역별 페이지 8개(다른 영역은 PK만 회색), 논리명 · 물리명 · 타입 · 키 전체 컬럼, 세부 영역 상자, 관계선. 직접 수정 불가, `npm run drawio`로 생성. **한 방향**: draw.io에서 옮기거나 꾸민 내용은 `erd.dbml`에 반영되지 않음 (사용자 확정: draw.io는 보조, 원본은 dbml) |
| `docs/archive_fashion/` | 이전 패션몰 설계 (Oracle). 참고용, 갱신하지 않음 |
| `docs/archive_oracle/` | 인테리어몰 Oracle 버전 (MySQL 전환 직전). 참고용, 갱신하지 않음 |

테이블/컬럼을 바꿀 때는 `erd.dbml`을 고치고, 상단 주석의 테이블 개수와 하단 `Ref`/`TableGroup` 섹션도 함께 맞춘 뒤 PDF와 ERD 웹페이지를 다시 만든다(`npm run all`).

## 설계서 생성 도구 (`tools/design-doc/`)

```
cd tools/design-doc
npm install            # 최초 1회 (PUPPETEER_SKIP_DOWNLOAD=true 권장: 브라우저는 로컬 Chrome 사용)
npm run check          # docs/erd.dbml 문법 검증 (dbdiagram.io와 같은 파서) → OK tables= refs= groups=
npm run pdf            # 검증 후 docs/DB_설계서.pdf 재생성
npm run summary        # 검증 후 docs/고객_설계_요약.pdf 재생성
npm run erd            # 검증 후 docs/erd/index.html (ERD 웹페이지) 재생성
npm run drawio         # 검증 후 docs/erd.drawio (draw.io 파일) 재생성
npm run all            # PDF 2개 + ERD 웹페이지 + draw.io 모두
node build.js <in.dbml> <out.pdf> <미리보기폴더>     # 도식별 PNG 미리보기까지 생성 (summary.js도 같은 인자)
```

- 파일 구성: `lib.js`(DBML 로드, Graphviz ERD, Mermaid 초기화, Chrome PDF 출력 공통), `diagrams.js`(Mermaid 흐름도·상태도 원본, 두 문서 공용), `build.js`(전체 설계서), `summary.js`(고객 요약본), `style.css`, `erd-page.js`(ERD 웹페이지 생성, 화면은 `web/erd.css`·`web/erd.js`를 인라인), `drawio.js`(draw.io 파일 생성, 세부 영역 격자는 `lib.gridPlace`를 `areaSvg`와 공용). Chrome 경로가 다르면 `CHROME_PATH` 환경변수.
- 테이블 명세·ERD·FK 목록·요약표는 DBML에서 자동 생성된다. **표지·설계 원칙·핵심 결정·정책 설명은 `build.js`/`summary.js`에 직접 쓴 문장**이고 흐름도는 `diagrams.js`에 있으므로, 테이블/컬럼 이름이나 설계 규칙이 바뀌면 해당 문장도 함께 고치고 두 PDF를 모두 다시 만든다(`npm run all`).
- 요약본 ERD는 `member_account`를 가운데 두는 허브형 배치(`erSvg`의 `leftOf` 옵션)를 쓴다. 다른 영역 요약본을 추가할 때도 `summary.js`의 구성을 따른다.
- 영역별 설명(`groupDesc`, `lib.js`에 있음: 전체 설계서와 ERD 웹페이지 공용)과 영역 구분은 `TableGroup` 이름 접두사(`member_`, `product_`, `community_`, `cart_`, `order_`, `payment_`, `delivery_`, `benefit_`)를 기준으로 한다. 영역 목록·이름·색은 `lib.js`의 `AREAS` 한 곳에서 관리한다(설계서 장 구성은 `build.js`, 화면 색은 `web/erd.css`의 `--s1`~`--s8`·`style.css`의 `s1`~`s8`). 새 영역을 추가하면 이 규칙을 따른다.
- 스타일은 `style.css`. 모든 페이지 A4 세로 (가로 페이지 금지).

## 설계 규칙 (DBML 전반에 일관되게 적용됨)

- **이름**: 테이블·컬럼·인덱스 모두 **소문자 snake_case** (OS마다 테이블명 대소문자 처리가 달라서). 인덱스 이름 접두사 `uk_`(unique), `ux_`(함수 기반 unique), `ix_`(일반). PK 제약 이름은 MySQL에서 항상 `PRIMARY`.
- **논리명(한글 이름)**: 모든 테이블·컬럼의 note 맨 앞에 `[논리명]`을 둔다 (예: `note: '[등급명] WELCOME/SILVER/GOLD/VIP'`, 설명이 없으면 `note: '[등록일시]'`). 생성 도구가 `lib.logicalOf`로 읽어 ERD 상자·명세표·툴팁·검색에 표시하고, `noteOf`는 논리명을 뺀 설명만 돌려준다. 테이블·컬럼을 추가하면 논리명도 반드시 넣는다. 컬럼 논리명은 **그 자체로 뜻이 통하게 구체적으로** 쓴다(사용자 요청): `이름`이 아니라 `회원 이름`, `등록일시`가 아니라 `주문 상품 등록일시`, 회원·관리자 참조는 역할까지(`글 작성 회원 ID`, `상품 등록 관리자 ID`, `신고된 글 ID`). **표시는 논리명 우선**(구조 설계 단계, 사용자 요청): ERD 상자·명세표·목록·팝업·검색 결과 모두 논리명을 앞에 크게, 물리명은 뒤에 작은 회색 고정폭으로.
- **예약어 회피**: `member`는 MySQL 8.0.17+ 예약어라 회원 테이블은 **`member_account`** (PK는 `member_id`, 다른 테이블의 FK 컬럼도 `member_id`). 댓글은 `post_comment`. 새 이름을 만들 때 MySQL 예약어인지 확인한다.
- **PK**: `bigint` AUTO_INCREMENT(`increment`). 1:1 확장 테이블(`member_home`, `product_notice`, `*_detail`)은 부모 PK를 그대로 PK로 사용. 매핑 테이블은 복합 PK.
- **타입**: ID·금액 `bigint`, 카운트 `int`, 작은 수 `smallint`/`tinyint`, 비율·평점·치수 소수 `decimal(p,s)`, 문자열 `varchar(n)`(글자 수), 본문 `text`(상세페이지·약관은 `mediumtext`), 시각 `datetime`(TIMESTAMP의 2038년 제한·시간대 변환 회피), 치수는 mm 정수.
- **상태값**: `varchar` + CHECK 제약 (허용 값은 컬럼 `note`에 `A/B/C` 형식, 값은 대문자). **Y/N**은 `char(1)` + CHECK.
- **시간**: `created_at datetime NOT NULL DEFAULT CURRENT_TIMESTAMP`, `updated_at`은 DDL에서 `ON UPDATE CURRENT_TIMESTAMP` (DBML로는 표현 불가).
- **FK 컬럼에는 인덱스**를 둔다 (`created_by`, `reviewer_id`, `handled_by` 등 관리자 참조 포함).
- **UNIQUE 처리 (MySQL 특성)**:
  - 이메일: 대소문자 무시 콜레이션이라 일반 `UNIQUE(email)`로 대소문자 중복 방지.
  - 회원당 기본 배송지 1개: 함수 기반 인덱스 `ux_address_default ((CASE WHEN is_default='Y' THEN member_id END))`.
  - nullable 대상 중복 방지(스크랩, 신고): MySQL UNIQUE는 NULL이 포함된 행을 중복으로 보지 않으므로 일반 복합 UNIQUE `(member_id, post_id)`로 충분.
- **CHECK + FK 주의 (DDL 작성 시)**: MySQL은 `ON DELETE CASCADE`/`SET NULL` 같은 참조 동작이 있는 FK 컬럼을 CHECK에서 쓸 수 없다. CHECK에 들어가는 FK(예: `product_relation`, `scrap`, `report`, `post_product_tag`)는 참조 동작 없이 만든다.
- **다형 참조**: 대상이 여러 종류인 테이블은 `target_type + target_id` 대신 대상별 nullable FK 컬럼을 둔다. `scrap`, `report`는 CHECK로 정확히 하나만 채우고, `notification`은 관련 대상(글+댓글 등)을 함께 채울 수 있다.
- **개인정보**: 휴대폰 번호·공동현관 비밀번호는 `_enc`(AES-256), 검색이 필요하면 `_hash`(SHA-256)를 함께 둔다. CI/DI·토큰은 해시만 저장. 탈퇴는 soft delete + 마스킹(`withdrawn_{ID}@deleted.local`, 이름 `탈퇴회원`, 닉네임 `deleted_{ID}`), 커뮤니티 글은 숨김·댓글은 "탈퇴한 회원" 표시. 탈퇴 시 `ci_hash`는 NULL로 지우고 `withdrawn_identity`(CI 해시만, member_id 없이)로 옮겨 **30일 재가입 제한** 후 파기. 신규 가입 혜택은 본인인증 회원에게만. 관리자 조회는 `privacy_access_log`에 기록.
- **보관 기간**: `login_history` 1년, `privacy_access_log` 2년, 세션 만료 30일·토큰 만료 7일 후 삭제, `password_history` 최근 3개. 정리 배치용 `created_at`/`expires_at` 인덱스를 둔다.
- **캐시 컬럼**: 좋아요·스크랩·댓글·리뷰 수, 평점 등은 note에 `캐시`로 표시하고 원본과 같은 트랜잭션에서 갱신.
- **이력 테이블 패턴**: `price_history`, `stock_history`, `product_status_history`, `member_status_history`, `nickname_history`, `password_history`, `member_terms_agreement`. 시스템 변경이면 `changed_by`/`created_by`는 NULL.

## 회원 상태·닉네임 정책 (고객)
- **상태**: `member_account.status` = ACTIVE / DORMANT / SUSPENDED / WITHDRAWN. 바뀔 때마다 `member_status_history`에 이전·다음 상태, 사유 유형, 처리자, 근거 신고(`report_id`)를 기록. **로그인 5회 실패 잠금은 상태가 아니라 `locked_until`로 판단**한다.
- **휴면**: 상태값만 쓴다 (사용자 확정, 2023년 개정으로 분리보관 의무 없음). `last_login_at` 기준 11개월에 안내(`dormant_notice_sent_at`), 1년 미접속이면 배치로 DORMANT, 로그인 + 본인 확인 시 ACTIVE. 분리보관 테이블은 만들지 않는다.
- **정지**: 신고 승인·관리자 제재로 SUSPENDED, `suspended_until`이 지나면 배치로 ACTIVE.
- **닉네임**: 2~12자 한글/영문/숫자/_ (앱 검증), `forbidden_word`(닉네임·글·댓글 공용 금칙어) 불가, 변경 후 30일간 재변경 불가(`nickname_changed_at`), 이전 닉네임은 `nickname_history`에 남겨 30일간 다른 회원 사용 불가(사칭 방지).
- **배송지**: 주거형태 `building_type`(반입 기본값 근거), 층수·엘리베이터(반입 경고·해피콜 근거), 반입 치수(현관문 폭, 엘리베이터 문 폭·내부 깊이·높이)는 **"우리 집이 다를 때"만 입력하는 선택값**, 배송 요청사항(주문 시 기본값으로 복사), 공동현관 비밀번호(암호화).
- **반입 판단** (사용자 확정: 고객 입력 부담 최소화): 화물·설치배송 묶음만 판단(택배는 NOT_REQUIRED). 치수 = 고객 입력값 → 없으면 `carry_default_spec`(주거형태별 기본값). 기본값으로만 통과·여유 작음이면 NEEDS_CHECK → 출고 전 기사 확인 전화(해피콜)로 `shipment.carry_method`(ELEVATOR/STAIRS/LADDER) 확정, 사다리차로도 불가면 CONSULT. **사다리차·계단 운반비는 업계 관행대로 주문 금액에 넣지 않고 고객이 현장에서 직접 정산**(사용자 확정): 주문 전에는 `shipping_policy.onsite_fee_notice`로 안내, 해피콜에서 안내한 예상 금액은 `shipment.onsite_fee_estimate`(CS 기록용). 결과만 `shipment.carry_check_status`에 저장. "우리 집" 배송지는 `member_home.address_id`.
- **토큰**: `member_token.token_type` = EMAIL_VERIFY/PASSWORD_RESET/EMAIL_CHANGE(`new_email` 필수)/DORMANT_RELEASE.
- **등급 산정**: 지금은 누적 구매액 기준(강등 없음). 최근 N개월 실적·등급 이력은 주문 영역에서 함께 설계.

## 핵심 도메인 구조

### 상품
- **옵션 구조**: `product` → `product_option_group`(색상/사이즈/구성, 상품마다 다름) → `product_option_value` → `product_sku`(값 조합). 조합은 `product_sku_option`(SKU당 그룹별 값 1개), 중복은 `option_key`(값 ID 오름차순 연결) + `UK(product_id, option_key)`. 옵션 없는 상품도 SKU 1개(`DEFAULT`). **SKU가 재고·장바구니·주문의 기준 단위**.
- **가구 특화**: 치수(상품 대표 + SKU별), `assembly_type`(완제품/자가조립/기사 설치), `sale_type`(일반/예약/주문제작: 주문제작은 재고 차감 없음), SKU별 포장 박스(`sku_package`).
- **재고**: `product_sku.stock` 하나로 관리(조건부 UPDATE로 차감, 낙관적 락 `version`), 모든 변경은 `stock_history`에 기록. 0 → 양수가 되면 `restock_request`(WAITING) 신청자에게 재입고 알림.
- **상품정보제공고시**: 품목마다 법정 항목이 달라서 컬럼이 아닌 행 구조. `notice_type`(FURNITURE/BEDDING_CURTAIN/KITCHENWARE/HOME_APPLIANCE...) → `notice_item`(유형별 항목) → `product_notice`(상품별 유형, 1:1) + `product_notice_value`(항목 값). `category.notice_type_id`가 기본 유형. 필수 항목이 모두 있어야 ON_SALE. 항목 유형 일치는 앱 검증.
- **상품 상태 흐름**: `DRAFT → ON_SALE ⇄ SOLD_OUT`, `STOPPED`. 품절 기준은 SKU 재고로 통일(전 SKU 0이면 시스템이 SOLD_OUT, changed_by NULL).
- **자사몰 규모로 축소한 것 (사용자 확정)**: 창고별 실물 재고(`warehouse`, `sku_inventory`), 상품 검수 승인(`product_approval`), 검색 로그(`search_log`), MD 검색 키워드(`product_search_keyword`)는 뺐다. 다시 넣기 전에 사용자와 상의한다. 포트폴리오 초점은 **가구몰 특화 + 커뮤니티**.
- **세트 상품**: `product_type='SET'`은 자체 SKU 없이 `product_set_item` 구성품 SKU를 각각 선택.
- **필터**: 컬러 계열(옵션 값 단위), 소재(부위별), 카테고리별 속성(`attribute`, 데이터로 추가). 동의어·검색 로그는 스토어/커뮤니티 공용.
- **조립식 특화** (사용자 확정: 완제품·조립식 모두 취급): `product.assembly_difficulty/minutes/people/tools`, 부품 목록 `product_part`(설명서 코드, 옵션별 부품, 단품 구매 가능), 단계별 설명서 `assembly_step` + `assembly_step_part`, 부품 요청 `part_request`(MISSING·DAMAGED는 구매 확정 후 30일 무료, PURCHASE 유료) + `part_request_item`. 조립 HARD·2인 이상이면 조립 서비스 우선 제안.
- **부가 서비스**: `addon_service`(DISPOSAL 폐가구 수거 / ASSEMBLY 조립) + `product_addon_service`(상품별 제공·금액) → `cart_item_addon` → `order_item_addon`(스냅샷). 조립은 자가조립 상품만, 수거는 기사 방문 배송만. 금액은 할인·무료배송 기준에서 제외, `order_item.addon_amount`로 `final_amount`에 포함(취소 시 함께 환불).

### 커뮤니티 (글쓰기 중심)
- **슈퍼타입/서브타입**: 공통 `post`(`post_type` = PHOTO/HOUSEWARMING/MAGAZINE) + 1:1 상세(`housewarming_detail`, `magazine_detail`). PHOTO·HOUSEWARMING은 고객, MAGAZINE은 EDITOR/ADMIN만 작성. 댓글·좋아요·스크랩·신고·스타일은 모두 `post`에 연결.
- **블록 에디터**: 본문은 `post_block`(HEADING/TEXT/IMAGE/QUOTE/DIVIDER/PRODUCT)을 `sort_order` 순으로 저장. 이미지는 `post_image`(공간 유형, 원본 크기).
- **상품 태그**: `post_product_tag`는 사진 위 % 좌표 + 스토어 상품 또는 외부 제품명(둘 중 하나). 상품 상세의 "이 상품이 쓰인 사진" 근거.
- **글 상태**: `DRAFT → PUBLISHED → HIDDEN/BLINDED/DELETED`. 신고 누적은 `report_count` 캐시로 자동 BLINDED.
- **스크랩 = 글 저장 + 상품 찜** (`scrap`, 폴더 없음).
- **구매 인증**: `post_product_tag.purchase_verified`(Y/N) + `verified_order_item_id` + `verified_at`. 글 작성자의 구매 확정 주문 상품이 있으면 Y, 반품·취소되면 N. 외부 제품 태그는 인증 불가(CHECK). 근거 `verified_order_item_id` → `order_item` FK (작성자의 CONFIRMED 주문 상품).
- **주거 맞춤 추천**: `member_home`(주거형태·평수·가족·반려동물) ↔ `product_home_fit`(MD 지정 주거 조건), `member_room`(방 치수·방문 폭) ↔ SKU 치수·`sku_package`, `member_style` ↔ `product_style`, 비슷한 집의 `housewarming_detail` → `post_product_tag`(구매 인증 가중치). 결과는 저장하지 않고 조회 시 계산. 공간 코드는 `post_image.space_type`·`member_room.space_type`·`product_home_fit`(SPACE)이 공유.

### 장바구니
- **장바구니** `cart_item`: 회원(`member_id`) 또는 비회원(`guest_token_hash`, 쿠키 토큰 SHA-256) 중 정확히 하나(CHECK → member_id FK는 참조 동작 없이). 로그인 시 회원 장바구니로 합침(같은 SKU 수량 합산, added_price는 낮은 값). 주문은 회원만. 담은 시점 단가 `added_price`로 가격 변동 표시, 가격 인하 시 PRICE_DROP 알림(광고성 조건) + `price_alert_price`로 중복 방지. `product.cart_count` 캐시. 품절은 재입고 알림 신청, 판매중지는 비슷한 상품 제안(장바구니 진단). 세트는 구성품 SKU를 `set_product_id` + `bundle_key`(UUID)로 묶음. 같은 SKU 중복 방지는 함수 기반 `ux_cart_item (COALESCE(member_id, 0), COALESCE(guest_token_hash, ''), sku_id, COALESCE(bundle_key, ''))`.
- **가구몰 장바구니**: 놓을 방 `cart_item.room_id`(→ 주문 시 `order_item.room_name` 스냅샷), 유입 글 `source_post_id`(장바구니 → 주문 상품, last-touch) → 구매 확정 시 `post.purchase_count` 증가(작성자 본인 구매 제외). 이사일에 한 번에 받기 `orders.receive_together` + `desired_receive_date`(기본값 `member_home.move_in_planned_at`). 장바구니 진단(방 치수·반입·배송 묶음·연관 상품)은 저장하지 않고 계산.
- **인테리어 플랜** `interior_plan`(방·스타일·예산·공유 토큰) + `interior_plan_item`(후보 CANDIDATE → 확정 CHOSEN, SKU 미정 가능, 유입 글). 합계·예산 대비·방 치수 확인은 계산만. "장바구니로 담기"는 CHOSEN을 `cart_item`으로 복사(`plan_id`·`room_id`·`source_post_id` 유지).

### 주문
- **이름**: `order`는 MySQL 예약어라 주문 테이블은 **`orders`**.
- **상태 단위**: 상태는 **`order_item`별**(PENDING → PAID → PREPARING → SHIPPED → DELIVERED → CONFIRMED, CANCEL_REQUESTED → CANCELED), `orders.status`는 요약(PENDING/PAID/COMPLETED/CANCELED/EXPIRED). 변경은 `order_item_status_history`.
- **스냅샷**: 상품명·옵션 문구·단가는 `order_item`, 배송지·반입 경로는 `order_address`(1:1), 배송비 내역은 `shipment`에 복사.
- **재고 차감 시점**: 주문 생성(PENDING) 시 조건부 UPDATE로 차감 + `stock_history`(ref_type ORDER, ref_id = order_item_id). 결제 기한 30분(`orders.expires_at`)이 지나면 배치로 EXPIRED + 재고·설치 슬롯 복구. MADE_TO_ORDER는 차감 없음.
- **할인 안분·부분 취소**: 등급 할인(다음 단계 쿠폰·포인트 포함)을 `order_item`별로 나눠 저장, `final_amount`가 환불 기준. 취소는 주문 상품 한 줄 단위(수량 일부 취소 없음). PAID는 즉시 취소, PREPARING부터는 요청 → 관리자 승인, 출고 후는 반품(다음 단계).
- **구매 확정**: 배송 완료 7일 후 자동(또는 직접). 이때 `product.sales_count`, `member_account.total_purchase_amount` 갱신.

### 결제
- **결제**: `payment`는 PG 시도마다 1행(주문당 PAID 1건, `pg_tid` UK), `payment_cancel` 1건이 여러 `order_item`을 환불(`order_item.payment_cancel_id`). 무료배송 기준이 깨지면 `shipping_fee_adjust`.
- **결제수단**: CARD / 간편결제(KAKAO·NAVER·TOSS_PAY) / TRANSFER(실시간 계좌이체) / VIRTUAL_ACCOUNT(가상계좌). 가상계좌는 `WAITING_DEPOSIT` → 입금 통보(웹훅) 시 PAID, `orders.expires_at`을 `deposit_due_at`으로 연장해 그때까지 재고·설치 슬롯 유지, 기한이 지나면 EXPIRED + 복구. 가상계좌 취소는 환불 계좌(`payment_cancel.refund_*`, 계좌번호 암호화·환불 후 파기) 필수.
- **현금영수증** `cash_receipt`: 현금성 결제(TRANSFER, VIRTUAL_ACCOUNT)의 발급·취소 이력. 가구 소매업은 의무발행업종이라 요청이 없어도 10만 원 이상이면 자진 발급(SELF_ISSUED, 010-000-1234). 부분 취소 시 원 발급 CANCEL(`original_receipt_id`) + 남은 금액 ISSUE, `payment_cancel_id`로 연결.
- **에스크로**: 현금성 결제에서 고객 선택(`payment.is_escrow`). 출고 시 PG에 송장 등록(`shipment.escrow_registered_at`)해야 정산·구매 확정 진행.

### 배송
- **가구 배송**: `shipping_policy`(일반택배/화물/설치배송, 현장 추가 비용 안내 문구 `onsite_fee_notice`, 출고 소요일, 오늘출발 마감) + `delivery_zone`(권역) + `delivery_zone_zipcode`(우편번호 범위, 겹치면 좁은 범위 우선) + `shipping_policy_zone`(권역별 배송 가능 여부·추가비·추가 소요일). 배송비 = 기본 배송비 + 권역 추가비 (사다리차·계단비 미포함). 배송지 `address.floor_no`·`has_elevator`는 현장 추가 비용 안내·해피콜 근거. 계산 순서는 설계서의 "가구 배송비 계산 흐름" 참고.
- **배송 묶음** `shipment`: 같은 배송 정책 + `is_bundle_allowed = Y`면 한 묶음. 택배·화물은 송장, 설치배송은 `install_slot`(권역 × 날짜 × AM/PM, `capacity`/`booked_count`)을 조건부 UPDATE로 예약 → 확정일·기사 배정. 설치 컬럼 CHECK에 `install_slot_id`가 들어가므로 FK는 참조 동작 없이.
- **반입 판단**은 위 "회원 상태·닉네임 정책"의 반입 판단 항목 참고 (`carry_default_spec`은 배송 영역).

### 혜택 (쿠폰)
- **구조** (사용자 확정): `coupon`(쿠폰 정의) → `coupon_target`(상품 쿠폰 적용 대상: 상품·카테고리 중 하나, `is_exclude`로 제외 지정, CHECK → FK 참조 동작 없이) / `coupon_code`(PUBLIC 공용·SINGLE 1회용) → `member_coupon`(회원 쿠폰함, 발급 1건 = 1행) → `coupon_use`(주문 적용 1건 = 1행, 복원해도 이력 유지).
- **종류·중복**: PRODUCT(주문 상품 한 줄에 1장, `uk_coupon_use_item`) + ORDER(주문당 1장) + SHIPPING(주문당 1장, 배송 묶음 하나에 적용, `ux_coupon_use_order` 함수 기반) 동시 사용. 배송비 쿠폰은 `shipping_delivery_type`으로 "설치배송비 무료" 같은 가구 특화 쿠폰.
- **발급**: DOWNLOAD / AUTO(SIGNUP·BIRTHDAY·GRADE_UP, 가입 쿠폰은 `verified_only` 본인인증 회원만, 생일 쿠폰은 연도별 쿠폰 행) / CODE / **REWARD(커뮤니티 활동 보상: 집들이 발행, 구매 인증 사진 발행)**. 보상은 `member_coupon.reward_post_id` + UK(coupon_id, reward_post_id)로 글마다 1장, 글이 BLINDED·DELETED되면 미사용 쿠폰 REVOKED. 총 한도는 `issued_count` 조건부 UPDATE.
- **금액**: 상품·주문 쿠폰 → `order_item.coupon_discount_amount`(주문 쿠폰은 상품 금액 비율로 안분) 합계가 `orders.coupon_discount_amount`. 배송비 쿠폰 → `shipment.coupon_discount_amount`, 합계 `orders.shipping_coupon_discount_amount`. `fee_total`은 할인 전 금액.
- **취소** (사용자 확정): 주문 상품 **전부 취소 또는 결제 기한 초과(EXPIRED)면 복원**(`coupon_use.restored_at`, `member_coupon` AVAILABLE, 기간 지났으면 EXPIRED). 부분 취소는 복원 안 함(안분된 `final_amount`만 환불).
- 알림: `noti_type` COUPON(발급·만료 임박)은 **광고성**으로 분류.

### 공유 마스터
- `style`(인테리어 스타일)은 `member_style`, `product_style`, `post_style`이 함께 사용.
- 회원 주거 정보 `member_home`은 맞춤 추천과 집들이 작성 기본값에 사용.
- 마케팅 수신: **법적 동의의 유일한 기준은 `member_terms_agreement`** (MARKETING_SMS/EMAIL/PUSH/KAKAO 채널별, 야간 21~08시는 MARKETING_NIGHT 별도). `member_notification_setting`은 회원이 켜고 끄는 스위치이고, 광고성 유형(EVENT, PRICE_DROP)은 스위치 ON + 해당 채널 동의(+ 야간 동의)가 모두 있어야 발송. 동의 행 = 동의 1건(철회는 `withdrawn_at`, 재동의는 새 행), 2년마다 동의 사실 안내(`reconfirm_notified_at`). `notification`은 앱 내 알림함.

## 저장소 메모

- 루트의 `2026-*.txt`는 Claude Code 대화 기록 export이며 `.gitignore`로 제외된다. 커밋하지 않는다.
- 커밋 메시지와 문서는 한국어로 작성한다.
- 수정된 내용은 자동으로 커밋하고 푸시한다.