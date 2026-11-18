# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 프로젝트 상태

**인테리어 가구몰 + 커뮤니티** 포트폴리오 프로젝트 (오늘의집 벤치마킹: 스토어 + 고객 사진/집들이 + 브랜드 매거진). 현재는 **DB 설계 단계**로, 애플리케이션 코드·빌드·테스트 명령은 아직 없다. 모든 산출물은 `docs/`에 있다.

- 대상 DB: **MySQL 8.0** (8.0.16 이상: CHECK 제약이 실제로 검사됨, 8.0.13 이상: 함수 기반 인덱스). InnoDB, `utf8mb4` / `utf8mb4_0900_ai_ci`. (Oracle에서 전환함. Oracle 버전은 `docs/archive_oracle/`)
- 판매 방식: 여러 브랜드 상품을 **자사가 직접 판매** (입점 판매자·정산 없음). 사용자가 확정한 사항이므로 오픈마켓 구조로 바꾸지 않는다. 브랜드·업체는 실제 업체가 아닌 가상 데이터로 채운다.
- 커뮤니티 범위: 자사몰은 대형 플랫폼만큼 사용자가 모이지 않으므로 **구매 고객 사진·집들이 + 운영자 매거진으로 축소** (사용자 확정). 팔로우·차단·해시태그·댓글 좋아요·스크랩 폴더·질문과답변(상품 문의와 중복)은 의도적으로 뺐다. 다시 넣기 전에 사용자와 상의한다.
- 단계: 1단계 고객(19) + 2단계 상품(34) + 3단계 커뮤니티(12) = **65개 테이블**.
- **다음 단계(장바구니·주문·결제, 구매 리뷰, 쿠폰·포인트)는 대기 중.** 사용자가 요청하기 전에는 테이블을 추가하지 않는다. `stock_history.ref_id`는 다음 단계의 주문/클레임 테이블을 가리킬 예정.
- 작업 방식: 사용자는 **설계를 먼저 확정한 뒤 파일(DDL SQL 등)을 만들기**를 원한다. 요청 없이 SQL 파일을 만들지 않는다.

## 설계 문서와 동기화

| 파일 | 역할 |
|---|---|
| `docs/erd.dbml` | **기준 원본(source of truth)**. 65개 테이블, 인덱스, 관계(`Ref`), `TableGroup` 14개. https://dbdiagram.io/d 에 붙여넣어 확인 |
| `docs/DB_설계서.pdf` | `erd.dbml`에서 생성한 설계서 (표지, 전체 구조, 설계 원칙, 흐름도, 영역별 ERD, 테이블 명세, FK 목록). **모든 페이지 A4 세로** (사용자 요청, 가로 페이지 섞지 않음). 직접 수정 불가, 설계가 바뀌면 `tools/design-doc`에서 `npm run pdf`로 다시 생성 |
| `docs/고객_설계_요약.pdf` | 1단계 고객 요약본 (약 8쪽: 한눈에 보기·핵심 결정, 고객 전체 ERD, 테이블 요약표, 설계 과정, 보안, 생명주기, 정책·향후 검토). 전체 설계서가 길어서 사용자가 요청한 별도 문서. `npm run summary`로 생성 |
| `docs/erd/index.html` | ERD 웹페이지 (GitHub Pages: https://jjonong.github.io/fashon-shoppingmall/erd/). 영역별 ERD + 테이블 클릭 시 전체 컬럼·인덱스·관계, 검색. 단일 HTML(외부 라이브러리 없음). 직접 수정 불가, `npm run erd`로 생성. Pages 소스는 main 브랜치 `/docs` (`docs/.nojekyll`로 Jekyll 생략) |
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
npm run all            # PDF 2개 + ERD 웹페이지 모두
node build.js <in.dbml> <out.pdf> <미리보기폴더>     # 도식별 PNG 미리보기까지 생성 (summary.js도 같은 인자)
```

- 파일 구성: `lib.js`(DBML 로드, Graphviz ERD, Mermaid 초기화, Chrome PDF 출력 공통), `diagrams.js`(Mermaid 흐름도·상태도 원본, 두 문서 공용), `build.js`(전체 설계서), `summary.js`(고객 요약본), `style.css`, `erd-page.js`(ERD 웹페이지 생성, 화면은 `web/erd.css`·`web/erd.js`를 인라인). Chrome 경로가 다르면 `CHROME_PATH` 환경변수.
- 테이블 명세·ERD·FK 목록·요약표는 DBML에서 자동 생성된다. **표지·설계 원칙·핵심 결정·정책 설명은 `build.js`/`summary.js`에 직접 쓴 문장**이고 흐름도는 `diagrams.js`에 있으므로, 테이블/컬럼 이름이나 설계 규칙이 바뀌면 해당 문장도 함께 고치고 두 PDF를 모두 다시 만든다(`npm run all`).
- 요약본 ERD는 `member_account`를 가운데 두는 허브형 배치(`erSvg`의 `leftOf` 옵션)를 쓴다. 다른 영역 요약본을 추가할 때도 `summary.js`의 구성을 따른다.
- 영역별 설명(`groupDesc`, `lib.js`에 있음: 전체 설계서와 ERD 웹페이지 공용)과 단계 구분은 `TableGroup` 이름 접두사(`member_`, `product_`, `community_`)를 기준으로 한다. 새 영역을 추가하면 이 규칙을 따른다.
- 스타일은 `style.css`. 모든 페이지 A4 세로 (가로 페이지 금지).

## 설계 규칙 (DBML 전반에 일관되게 적용됨)

- **이름**: 테이블·컬럼·인덱스 모두 **소문자 snake_case** (OS마다 테이블명 대소문자 처리가 달라서). 인덱스 이름 접두사 `uk_`(unique), `ux_`(함수 기반 unique), `ix_`(일반). PK 제약 이름은 MySQL에서 항상 `PRIMARY`.
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
- **개인정보**: 휴대폰 번호·공동현관 비밀번호는 `_enc`(AES-256), 검색이 필요하면 `_hash`(SHA-256)를 함께 둔다. CI/DI·토큰은 해시만 저장. 탈퇴는 soft delete + 마스킹(`withdrawn_{ID}@deleted.local`, 이름 `탈퇴회원`, 닉네임 `deleted_{ID}`), 커뮤니티 글은 숨김·댓글은 "탈퇴한 회원" 표시. 관리자 조회는 `privacy_access_log`에 기록.
- **캐시 컬럼**: 좋아요·스크랩·댓글·리뷰 수, 평점 등은 note에 `캐시`로 표시하고 원본과 같은 트랜잭션에서 갱신.
- **이력 테이블 패턴**: `price_history`, `stock_history`, `product_status_history`, `member_status_history`, `nickname_history`, `password_history`, `member_terms_agreement`. 시스템 변경이면 `changed_by`/`created_by`는 NULL.

## 회원 상태·닉네임 정책 (1단계 고객)
- **상태**: `member_account.status` = ACTIVE / DORMANT / SUSPENDED / WITHDRAWN. 바뀔 때마다 `member_status_history`에 이전·다음 상태, 사유 유형, 처리자, 근거 신고(`report_id`)를 기록. **로그인 5회 실패 잠금은 상태가 아니라 `locked_until`로 판단**한다.
- **휴면**: 상태값만 쓴다 (사용자 확정, 2023년 개정으로 분리보관 의무 없음). `last_login_at` 기준 11개월에 안내(`dormant_notice_sent_at`), 1년 미접속이면 배치로 DORMANT, 로그인 + 본인 확인 시 ACTIVE. 분리보관 테이블은 만들지 않는다.
- **정지**: 신고 승인·관리자 제재로 SUSPENDED, `suspended_until`이 지나면 배치로 ACTIVE.
- **닉네임**: 2~12자 한글/영문/숫자/_ (앱 검증), `forbidden_word`(닉네임·글·댓글 공용 금칙어) 불가, 변경 후 30일간 재변경 불가(`nickname_changed_at`), 이전 닉네임은 `nickname_history`에 남겨 30일간 다른 회원 사용 불가(사칭 방지).
- **배송지**: 층수·엘리베이터(사다리차 판단), 배송 요청사항(주문 시 기본값으로 복사), 공동현관 비밀번호(암호화).

## 핵심 도메인 구조

### 상품
- **옵션 구조**: `product` → `product_option_group`(색상/사이즈/구성, 상품마다 다름) → `product_option_value` → `product_sku`(값 조합). 조합은 `product_sku_option`(SKU당 그룹별 값 1개), 중복은 `option_key`(값 ID 오름차순 연결) + `UK(product_id, option_key)`. 옵션 없는 상품도 SKU 1개(`DEFAULT`). **SKU가 재고·장바구니·주문의 기준 단위**.
- **가구 특화**: 치수(상품 대표 + SKU별), `assembly_type`(완제품/자가조립/기사 설치), `sale_type`(일반/예약/주문제작: 주문제작은 재고 차감 없음), SKU별 포장 박스(`sku_package`).
- **가구 배송**: `shipping_policy`(일반택배/화물/설치배송, 사다리차·계단 운반비, 출고 소요일, 오늘출발 마감) + `delivery_zone`(권역) + `delivery_zone_zipcode`(우편번호 범위, 겹치면 좁은 범위 우선) + `shipping_policy_zone`(권역별 배송 가능 여부·추가비·추가 소요일). 배송지 `address.floor_no`·`has_elevator`로 사다리차/계단비 판단. 계산 순서는 설계서의 "가구 배송비 계산 흐름" 참고.
- **재고**: `product_sku.stock` 하나로 관리(조건부 UPDATE로 차감, 낙관적 락 `version`), 모든 변경은 `stock_history`에 기록. 0 → 양수가 되면 `restock_request`(WAITING) 신청자에게 재입고 알림.
- **상품정보제공고시**: 품목마다 법정 항목이 달라서 컬럼이 아닌 행 구조. `notice_type`(FURNITURE/BEDDING_CURTAIN/KITCHENWARE/HOME_APPLIANCE...) → `notice_item`(유형별 항목) → `product_notice`(상품별 유형, 1:1) + `product_notice_value`(항목 값). `category.notice_type_id`가 기본 유형. 필수 항목이 모두 있어야 ON_SALE. 항목 유형 일치는 앱 검증.
- **상품 상태 흐름**: `DRAFT → ON_SALE ⇄ SOLD_OUT`, `STOPPED`. 품절 기준은 SKU 재고로 통일(전 SKU 0이면 시스템이 SOLD_OUT, changed_by NULL).
- **자사몰 규모로 축소한 것 (사용자 확정)**: 창고별 실물 재고(`warehouse`, `sku_inventory`), 상품 검수 승인(`product_approval`), 검색 로그(`search_log`), MD 검색 키워드(`product_search_keyword`)는 뺐다. 다시 넣기 전에 사용자와 상의한다. 포트폴리오 초점은 **가구몰 특화 + 커뮤니티**.
- **세트 상품**: `product_type='SET'`은 자체 SKU 없이 `product_set_item` 구성품 SKU를 각각 선택.
- **필터**: 컬러 계열(옵션 값 단위), 소재(부위별), 카테고리별 속성(`attribute`, 데이터로 추가). 동의어·검색 로그는 스토어/커뮤니티 공용.

### 커뮤니티 (글쓰기 중심)
- **슈퍼타입/서브타입**: 공통 `post`(`post_type` = PHOTO/HOUSEWARMING/MAGAZINE) + 1:1 상세(`housewarming_detail`, `magazine_detail`). PHOTO·HOUSEWARMING은 고객, MAGAZINE은 EDITOR/ADMIN만 작성. 댓글·좋아요·스크랩·신고·스타일은 모두 `post`에 연결.
- **블록 에디터**: 본문은 `post_block`(HEADING/TEXT/IMAGE/QUOTE/DIVIDER/PRODUCT)을 `sort_order` 순으로 저장. 이미지는 `post_image`(공간 유형, 원본 크기).
- **상품 태그**: `post_product_tag`는 사진 위 % 좌표 + 스토어 상품 또는 외부 제품명(둘 중 하나). 상품 상세의 "이 상품이 쓰인 사진" 근거.
- **글 상태**: `DRAFT → PUBLISHED → HIDDEN/BLINDED/DELETED`. 신고 누적은 `report_count` 캐시로 자동 BLINDED.
- **스크랩 = 글 저장 + 상품 찜** (`scrap`, 폴더 없음).
- **구매 인증**: `post_product_tag.purchase_verified`(Y/N) + `verified_order_item_id` + `verified_at`. 글 작성자의 구매 확정 주문 상품이 있으면 Y, 반품·취소되면 N. 외부 제품 태그는 인증 불가(CHECK). 주문 테이블이 다음 단계라 `verified_order_item_id`는 지금 FK 없이 ID만 보관 → 주문 단계에서 `order_item` FK로 연결한다.
- **주거 맞춤 추천**: `member_home`(주거형태·평수·가족·반려동물) ↔ `product_home_fit`(MD 지정 주거 조건), `member_room`(방 치수·방문 폭) ↔ SKU 치수·`sku_package`, `member_style` ↔ `product_style`, 비슷한 집의 `housewarming_detail` → `post_product_tag`(구매 인증 가중치). 결과는 저장하지 않고 조회 시 계산. 공간 코드는 `post_image.space_type`·`member_room.space_type`·`product_home_fit`(SPACE)이 공유.

### 공유 마스터
- `style`(인테리어 스타일)은 `member_style`, `product_style`, `post_style`이 함께 사용.
- 회원 주거 정보 `member_home`은 맞춤 추천과 집들이 작성 기본값에 사용.
- 마케팅 수신: `member_notification_setting`의 EVENT(광고성) 알림은 마케팅 약관 동의가 있어야 발송. `notification`은 앱 내 알림함.

## 저장소 메모

- 루트의 `2026-*.txt`는 Claude Code 대화 기록 export이며 `.gitignore`로 제외된다. 커밋하지 않는다.
- 커밋 메시지와 문서는 한국어로 작성한다.
- 수정된 내용은 자동으로 커밋하고 푸시한다.