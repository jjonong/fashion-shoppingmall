// Mermaid 흐름도·상태도 원본 (build.js, summary.js 공용)
module.exports = {
  login: `flowchart TD
  A["로그인 시도"] --> B{"계정 존재?"}
  B -- 없음 --> F1["FAIL_NOT_FOUND"]
  B -- 있음 --> C{"locked_until<br/>지났나?"}
  C -- 잠김 --> F2["FAIL_LOCKED"]
  C -- 지남 --> D{"비밀번호<br/>bcrypt 일치?"}
  D -- 불일치 --> E["login_fail_count + 1<br/>5회면 30분 잠금"] --> F3["FAIL_PASSWORD"]
  D -- 일치 --> G["실패 횟수 초기화<br/>member_session 발급"] --> OK["SUCCESS"]
  F1 & F2 & F3 & OK -.-> H[("login_history")]
  classDef bad fill:#FDECEC,stroke:#C0392B,color:#7b1d14
  classDef good fill:#EAF7EF,stroke:#3C9A63,color:#1d5a37
  class F1,F2,F3 bad
  class OK good`,
  mstatus: `stateDiagram-v2
  direction LR
  [*] --> ACTIVE: 가입
  ACTIVE --> DORMANT: 1년 미접속 배치 (11개월에 안내)
  DORMANT --> ACTIVE: 로그인 + 본인 확인
  ACTIVE --> SUSPENDED: 신고 승인 · 관리자 제재
  SUSPENDED --> ACTIVE: 기한 만료 배치
  ACTIVE --> WITHDRAWN: 탈퇴
  DORMANT --> WITHDRAWN: 탈퇴
  WITHDRAWN --> [*]`,
  withdraw: `flowchart TB
  W(["탈퇴 요청"]) --> M["member_account 마스킹<br/>email → withdrawn_ID 마스킹 주소<br/>(도메인 deleted.local)<br/>name → 탈퇴회원 · nickname → deleted_ID<br/>PHONE · BIRTH · CI · DI → NULL"]
  W --> R["CI 해시만 옮김<br/><b>withdrawn_identity</b><br/>30일 재가입 제한<br/>member_id 없이 보관 → 기한 후 파기"]
  W --> X["행 삭제<br/>member_home · member_room · address<br/>member_social · member_session"]
  W --> C["커뮤니티<br/>글 → HIDDEN<br/>댓글 작성자 → 탈퇴한 회원"]
  W --> K["기록 유지<br/>status = WITHDRAWN<br/>withdrawn_at · 사유"]
  classDef keep fill:#FFF3E3,stroke:#D98A2B,color:#1d2733
  class R keep`,
  option: `flowchart LR
  P["<b>product</b><br/>원목 수납 침대 프레임"]
  P --> G1["<b>OPTION_GROUP</b><br/>색상"]
  P --> G2["<b>OPTION_GROUP</b><br/>사이즈"]
  G1 --> V1(["화이트오크 · 11"])
  G1 --> V2(["월넛 · 12"])
  G2 --> V3(["SS · 21"])
  G2 --> V4(["Q · 22 · +50,000원"])
  V1 & V3 -.-> S1["<b>SKU</b> 11-21<br/>재고 8"]
  V1 & V4 -.-> S2["<b>SKU</b> 11-22<br/>재고 3"]
  V2 & V3 -.-> S3["<b>SKU</b> 12-21<br/>재고 0 · 품절"]
  V2 & V4 -.-> S4["<b>SKU</b> 12-22<br/>재고 5"]
  classDef sku fill:#FFF3E3,stroke:#D98A2B,color:#1d2733
  classDef val fill:#F4F6F8,stroke:#8795A1,color:#1d2733
  class S1,S2,S3,S4 sku
  class V1,V2,V3,V4 val`,
  stock: `flowchart LR
  IN(["입고"]) --> STK["<b>product_sku.stock</b><br/>판매 가능 재고"]
  ORD(["주문"]) -->|"WHERE stock >= :qty<br/>0건이면 품절"| STK
  CAN(["취소 · 반품"]) --> STK
  STK -.->|"같은 트랜잭션"| HIS[("<b>stock_history</b><br/>재고 원장")]
  STK -->|"0 → 양수"| RS["<b>restock_request</b><br/>WAITING 신청자"]
  RS --> NT["재입고 알림 발송<br/>NOTIFIED"]
  classDef main fill:#FFF3E3,stroke:#D98A2B,color:#1d2733
  class STK main`,
  pstatus: `stateDiagram-v2
  direction LR
  [*] --> DRAFT: 등록
  DRAFT --> ON_SALE: 판매 시작
  ON_SALE --> SOLD_OUT: 전 SKU 재고 0 (자동)
  SOLD_OUT --> ON_SALE: 재입고 (자동)
  ON_SALE --> STOPPED: 판매 중지
  SOLD_OUT --> STOPPED: 판매 중지
  STOPPED --> ON_SALE: 재개`,
  shipfee: `flowchart TB
  A(["배송지 zipcode"]) --> B["<b>delivery_zone_zipcode</b><br/>가장 좁은 범위의 권역"]
  B --> C{"<b>shipping_policy_zone</b><br/>is_available?"}
  C -- N --> X["배송 불가 안내<br/>(설치배송 제주 · 도서산간 등)"]
  C -- "Y 또는 행 없음" --> D["기본 배송비<br/>free_threshold 이상이면 0 (THRESHOLD)<br/>등급 무료배송 · 일반택배면 0 (GRADE)<br/>사유는 shipment.free_reason"]
  D --> E["권역 extra_fee 추가"]
  E --> T["배송비 합계 shipment.fee_total<br/>= 기본 배송비 + 권역 추가비"]
  T --> R["출고 예정 = lead_days<br/>+ 권역 extra_lead_days<br/>(주문제작은 + make_days)"]
  E -.-> F{"엘리베이터 없음 · 고층?<br/>address.has_elevator · floor_no"}
  F -- 예 --> Q["현장 추가 비용 안내<br/>shipping_policy.onsite_fee_notice<br/>사다리차 · 계단 운반비는 고객 현장 정산<br/>(결제 금액에 포함 안 함)"]
  classDef bad fill:#FDECEC,stroke:#C0392B,color:#7b1d14
  classDef good fill:#EAF7EF,stroke:#3C9A63,color:#1d5a37
  classDef warn fill:#FFF3E3,stroke:#D98A2B,color:#1d2733
  class X bad
  class Q warn
  class T,R good`,
  post: `flowchart LR
  post(("<b>post</b><br/>공통"))
  subgraph TYPES["유형별 상세 (1:1)"]
    direction TB
    PH["PHOTO 집사진<br/>(상세 없음)"]
    HW["housewarming_detail<br/>평수 · 주거형태 · 시공 · 예산"]
    KH["magazine_detail<br/>운영자 작성 · 주제 · 부제"]
  end
  subgraph BODY["본문"]
    direction TB
    IMG["post_image<br/>사진 · 공간 유형"]
    BLK["post_block<br/>블록 에디터"]
    TAG["post_product_tag<br/>사진 속 상품 위치"]
  end
  subgraph REACT["반응 · 분류 (모든 유형 공통)"]
    direction TB
    RX["<b>반응</b><br/>post_comment · post_like<br/>scrap"]
    CL["<b>분류 · 운영</b><br/>post_style · report"]
  end
  post --- PH & HW & KH
  post --- IMG & BLK
  IMG --- TAG
  post --- RX & CL
  TAG ==>|"구매 연결"| PROD["<b>product</b><br/>스토어 상품"]
  BLK ==>|"상품 카드"| PROD
  classDef store fill:#FFF3E3,stroke:#D98A2B,color:#1d2733
  classDef core fill:#3C9A63,stroke:#2b7049,color:#ffffff
  class PROD store
  class post core
  style TYPES fill:#F6FBF8,stroke:#3C9A63
  style BODY fill:#F6FBF8,stroke:#3C9A63
  style REACT fill:#F6FBF8,stroke:#3C9A63`,
  verify: `flowchart LR
  T(["상품 태그 저장"]) --> A{"product_id<br/>있음?"}
  A -- "외부 제품" --> N1["purchase_verified = N<br/>(인증 불가)"]
  A -- 있음 --> B{"글 작성자의<br/>구매 확정 주문 상품?"}
  B -- 없음 --> N2["N<br/>나중에 구매 확정되면 재확인"]
  B -- 있음 --> Y["purchase_verified = Y<br/>verified_order_item_id<br/>verified_at"]
  Y -->|"반품 · 취소"| N3["N으로 되돌림"]
  Y ==> P["상품 상세<br/>구매 인증 사진 먼저 노출"]
  classDef good fill:#EAF7EF,stroke:#3C9A63,color:#1d5a37
  classDef bad fill:#FDECEC,stroke:#C0392B,color:#7b1d14
  class Y,P good
  class N1,N2,N3 bad`,
  recommend: `flowchart LR
  subgraph IN["회원 정보 (고객)"]
    direction TB
    H["<b>member_home</b><br/>주거형태 · 평수 · 가족 · 반려동물"]
    R["<b>member_room</b> · <b>address</b><br/>방 치수 · 방문 폭<br/>현관문 · 엘리베이터 치수"]
    ST["<b>member_style</b><br/>취향 스타일"]
  end
  subgraph SC["점수 계산"]
    direction TB
    S1["주거 조건 일치<br/>product_home_fit"]
    S2["스타일 일치<br/>product_style"]
    S3["집에 들어가는지<br/>SKU 치수 ≤ 방 치수<br/>sku_package ≤ 현관문 · 엘리베이터<br/>(address 반입 경로) · 방문 폭"]
    S4["비슷한 집의 집들이<br/>housewarming_detail<br/>→ post_product_tag<br/>(구매 인증 가중치)"]
  end
  H --> S1
  H --> S4
  ST --> S2
  R --> S3
  S1 & S2 & S3 & S4 ==> OUT["<b>맞춤 추천 상품</b><br/>추천 이유 함께 표시"]
  classDef out fill:#FFF3E3,stroke:#D98A2B,color:#1d2733
  classDef comm fill:#EAF7EF,stroke:#3C9A63,color:#1d5a37
  class OUT out
  class S4 comm
  style IN fill:#F4F6F8,stroke:#8795A1
  style SC fill:#F6FBF8,stroke:#3C9A63`,
  orderflow: `flowchart TB
  C(["장바구니<br/>cart_item"]) --> O["주문서<br/>배송비 계산 · 반입 확인<br/>함께 받기 · 설치 희망일 선택"]
  O --> R["주문 생성 PENDING<br/>orders · order_item · shipment<br/>재고 조건부 차감 + stock_history<br/>설치 슬롯 booked_count + 1"]
  R --> P{"PG 결제<br/>카드 · 간편 · 이체는 30분<br/>가상계좌는 입금 기한까지"}
  P -- 승인 --> OK["payment PAID<br/>order_item PAID"]
  P -- "실패 · 기한 초과" --> X["EXPIRED<br/>재고 · 슬롯 복구"]
  OK --> D["출고 · 배송 · 설치"] --> CF["구매 확정<br/>sales_count · 누적 구매액"]
  classDef bad fill:#FDECEC,stroke:#C0392B,color:#7b1d14
  classDef good fill:#EAF7EF,stroke:#3C9A63,color:#1d5a37
  classDef main fill:#FFF3E3,stroke:#D98A2B,color:#1d2733
  class X bad
  class OK,CF good
  class R main`,
  itemstatus: `stateDiagram-v2
  direction LR
  [*] --> PENDING: 주문 생성
  PENDING --> PAID: 결제 승인
  PENDING --> CANCELED: 결제 기한 초과
  PAID --> PREPARING: 출고 준비 · 제작 시작
  PAID --> CANCELED: 즉시 취소 (환불)
  PREPARING --> CANCEL_REQUESTED: 취소 요청
  CANCEL_REQUESTED --> CANCELED: 관리자 승인
  CANCEL_REQUESTED --> PREPARING: 거절
  PREPARING --> SHIPPED: 출고
  SHIPPED --> DELIVERED: 배송 · 설치 완료
  DELIVERED --> CONFIRMED: 7일 후 자동 · 직접 확정
  DELIVERED --> RETURNED: 반품 완료 (order_claim)
  CONFIRMED --> RETURNED: 하자 반품 (3개월 이내)`,
  claim: `flowchart TB
  A(["반품 · 교환 접수<br/>order_claim REQUESTED<br/>대상 주문 상품 order_claim_item"]) --> B{"관리자 확인<br/>기한 · 주문제작 · 리퍼 규정"}
  B -- 불가 --> RJ["REJECTED<br/>reject_reason"]
  B -- 승인 --> C["APPROVED<br/>귀책 fault_party 확정<br/>고객 귀책이면 회수 배송비 return_fee_amount"]
  C --> D["COLLECTING<br/>회수 일정 · 송장<br/>화물 · 설치배송은 기사 회수"]
  D --> E{"검수 inspect_result"}
  E -- "DAMAGED_BY_CUSTOMER" --> RJ
  E -- PASS --> F{"claim_type"}
  F -- RETURN --> G["환불 payment_cancel<br/>final_amount 합 - 회수 배송비<br/>재고 복구 · order_item RETURNED"]
  F -- EXCHANGE --> H["교환품 발송<br/>exchange_sku_id 재고 차감 · 회수 SKU 복구<br/>reship 송장"]
  G --> Z["COMPLETED"]
  H --> Z
  classDef bad fill:#FDECEC,stroke:#C0392B,color:#7b1d14
  classDef good fill:#EAF7EF,stroke:#3C9A63,color:#1d5a37
  class RJ bad
  class Z good`,
  install: `flowchart TB
  A(["설치배송 상품 주문서"]) --> B["출고 가능일<br/>= 오늘 + lead_days + 권역 extra_lead_days<br/>(주문제작은 + make_days)"]
  B --> C["<b>install_slot</b> 조회<br/>배송지 권역 · 날짜 ≥ 출고 가능일<br/>is_closed = N · booked_count < capacity"]
  C --> D["고객이 희망일 · 오전/오후 선택<br/>shipment.desired_date"]
  D --> E{"슬롯 예약<br/>조건부 UPDATE"}
  E -- "0건 (그 사이 마감)" --> C
  E -- "성공: booked_count + 1" --> F["shipment.install_slot_id"]
  F --> G["일정 확정 · 기사 배정<br/>install_date · installer<br/>SCHEDULED"]
  G --> H["설치 완료 DELIVERED<br/>공동현관 비밀번호 파기"]
  classDef good fill:#EAF7EF,stroke:#3C9A63,color:#1d5a37
  classDef main fill:#FFF3E3,stroke:#D98A2B,color:#1d2733
  class H good
  class E main`,
  cartcheck: `flowchart TB
  CI(["<b>cart_item</b><br/>담은 상품"]) --> R0{"⓪ SKU 상태 · 가격"}
  R0 -- SOLD_OUT --> SO["주문 제외<br/>재입고 알림 신청 · restock_request"]
  R0 -- STOPPED --> ST["주문 제외<br/>비슷한 상품 · product_relation SIMILAR"]
  R0 -- 판매 중 --> PR["added_price와 비교<br/>가격 인하 · 인상 표시"]
  PR --> R1["① 방별로 묶기 · room_id<br/>바닥 면적 점유율<br/>SKU 치수 ≤ member_room 치수"]
  R1 --> R2["② 반입 확인 (화물 · 설치배송만)<br/>입력값 없으면 주거형태 기본값 · 애매하면 기사 확인"]
  R2 -- "통과 · 정보 없음" --> R3["③ 배송 묶음 미리보기<br/>배송 정책 · 묶음배송별 그룹<br/>예상 배송비 · 출고 예정일"]
  R2 -- 불가 --> W["반입 어려움 경고<br/>사다리차 · 계단 운반 필요 가능<br/>(고객 부담 · 현장 정산 안내)"] --> R3
  R3 --> R4["함께 받기면<br/>모든 묶음 수령일 맞춤<br/>(이사 예정일 기본값)"]
  R4 --> R5["④ 제안<br/>함께 사면 좋은 상품 · product_relation ADDON<br/>조립 어려움 · 2인 조립이면 미리 안내"]
  R5 ==> OUT["주문서로"]
  classDef bad fill:#FDECEC,stroke:#C0392B,color:#7b1d14
  classDef good fill:#EAF7EF,stroke:#3C9A63,color:#1d5a37
  class W,SO,ST bad
  class OUT good`,
  plan: `flowchart TB
  A(["<b>interior_plan</b><br/>방 · 스타일 · 예산"]) --> B["후보 담기<br/>상품 상세 · 집들이 글에서<br/>CANDIDATE"]
  B --> C["비교 · 확정<br/>자리마다 하나를 CHOSEN"]
  C --> D["계산 (저장 안 함)<br/>합계 vs 예산<br/>방 치수 · 반입 확인"]
  D --> E["공유 링크<br/>가족과 함께 보기"]
  E --> F["장바구니로 담기<br/>cart_item · plan_id · room_id<br/>source_post_id 유지"]
  classDef good fill:#EAF7EF,stroke:#3C9A63,color:#1d5a37
  classDef main fill:#FFF3E3,stroke:#D98A2B,color:#1d2733
  class A main
  class F good`,
  carry: `flowchart TB
  A(["배송 묶음 shipment"]) --> B{"배송 방식"}
  B -- "택배 (조립식 · 소형)" --> N["NOT_REQUIRED<br/>판단 안 함"]
  B -- "화물 · 설치배송" --> C["치수 = 고객 입력값<br/>없으면 carry_default_spec<br/>(address.building_type)"]
  C --> D["박스의 짧은 두 변 vs 현관문 폭<br/>엘리베이터는 깊이 · 높이 대각선까지"]
  D --> E{"엘리베이터 · 계단<br/>통과?"}
  E -- "통과 (고객 입력값)" --> OK["OK"]
  E -- "통과 (기본값만 · 여유 작음)" --> NC["NEEDS_CHECK<br/>출고 전 기사 확인 전화"]
  E -- 불가 --> W["주문 전 경고<br/>사다리차 · 계단 운반 필요 가능<br/>(고객 부담 · 현장 정산)"] --> NC
  NC --> M["해피콜로 carry_method 확정<br/>ELEVATOR · STAIRS · LADDER<br/>현장 정산 예상 금액 onsite_fee_estimate"]
  M -- 사다리차로도 불가 --> CS["CONSULT<br/>배송 상담 · 취소"]
  classDef bad fill:#FDECEC,stroke:#C0392B,color:#7b1d14
  classDef good fill:#EAF7EF,stroke:#3C9A63,color:#1d5a37
  classDef main fill:#FFF3E3,stroke:#D98A2B,color:#1d2733
  class CS bad
  class OK,N good
  class NC main`,
  partreq: `flowchart LR
  A(["조립 설명서<br/>assembly_step"]) --> B["단계별 부품 확인<br/>assembly_step_part"]
  B --> C{"부품 문제?"}
  C -- "누락 · 파손" --> D["part_request<br/>MISSING · DAMAGED<br/>요청 내용 · 파손은 사진 첨부<br/>받는 주소(기본값 주문 배송지)"]
  C -- "추가로 필요" --> E["part_request PURCHASE<br/>is_orderable 부품만 유료<br/>PAYMENT_PENDING"]
  D --> F["관리자 승인 APPROVED<br/>구매 확정 후 30일까지 무료"]
  E --> P["결제 payment<br/>payment_target = PART_REQUEST"]
  P -- 승인 --> F2["APPROVED<br/>관리자 승인 없이 발송 준비"]
  P -- 기한 초과 --> X["CANCELED"]
  F2 --> G
  F --> G["부품 발송<br/>송장 · SHIPPED"]
  G --> H["배송 완료<br/>DELIVERED"]
  classDef good fill:#EAF7EF,stroke:#3C9A63,color:#1d5a37
  class H good`,
  vbank: `flowchart TB
  A(["가상계좌 선택<br/>현금영수증 정보 · 에스크로 여부 입력"]) --> B["PG 가상계좌 발급<br/>payment WAITING_DEPOSIT<br/>vbank_account_no · deposit_due_at"]
  B --> C["orders.expires_at = deposit_due_at<br/>재고 · 설치 슬롯 유지"]
  C --> D{"입금 기한 안에<br/>입금 통보(웹훅)?"}
  D -- 예 --> E["payment PAID<br/>deposited_at · depositor_name"]
  D -- 아니오 --> X["payment · orders EXPIRED<br/>재고 · 슬롯 복구"]
  E --> F{"현금영수증<br/>요청 정보 있음?"}
  F -- 있음 --> G["<b>cash_receipt</b> ISSUE<br/>소득공제 · 지출증빙"]
  F -- "없음 · 10만 원 이상" --> H["<b>cash_receipt</b> ISSUE<br/>SELF_ISSUED (010-000-1234)"]
  F -- "없음 · 10만 원 미만" --> N["발급 안 함"]
  classDef bad fill:#FDECEC,stroke:#C0392B,color:#7b1d14
  classDef good fill:#EAF7EF,stroke:#3C9A63,color:#1d5a37
  class X bad
  class E,G,H good`,
  poststatus: `stateDiagram-v2
  direction LR
  [*] --> DRAFT: 작성 시작
  DRAFT --> DRAFT: 자동 임시저장
  DRAFT --> PUBLISHED: 발행 (published_at 기록)
  PUBLISHED --> HIDDEN: 작성자 숨김
  HIDDEN --> PUBLISHED: 다시 공개
  PUBLISHED --> BLINDED: 신고 누적 · 관리자
  BLINDED --> PUBLISHED: 신고 기각
  PUBLISHED --> DELETED: 삭제
  HIDDEN --> DELETED: 삭제`,
  coupon: `flowchart TB
  subgraph ISSUE["발급 (coupon.issue_type)"]
    direction LR
    D1["DOWNLOAD<br/>상품 상세 · 이벤트에서 받기"]
    D2["AUTO<br/>가입(본인인증) · 생일 · 등급 달성"]
    D3["CODE<br/>coupon_code 입력"]
    D4["REWARD<br/>집들이 · 구매 인증 사진 발행<br/>(글마다 1장)"]
  end
  ISSUE --> LIM{"발급 한도<br/>issued_count &lt; total_issue_limit<br/>1인 한도 per_member_limit"}
  LIM -- 통과 --> MC["<b>member_coupon</b> AVAILABLE<br/>사용 기간 계산해 저장"]
  LIM -- 초과 --> NO["발급 불가 (소진)"]
  MC --> PICK["주문서: 종류별 1장씩 선택<br/>상품 쿠폰(줄마다) · 주문 쿠폰 · 배송비 쿠폰"]
  PICK --> USE["<b>coupon_use</b> 기록 · member_coupon USED"]
  USE --> SPLIT["할인 안분<br/>상품·주문 쿠폰 → order_item.coupon_discount_amount<br/>배송비 쿠폰 → shipment.coupon_discount_amount"]
  SPLIT --> C{"주문 결과"}
  C -- "주문 상품 전체 취소<br/>또는 결제 기한 초과" --> RS["복원: coupon_use.restored_at<br/>member_coupon AVAILABLE<br/>(기간 지났으면 EXPIRED)"]
  C -- 부분 취소 --> PART["복원 안 함<br/>final_amount(쿠폰 안분 반영)만 환불"]
  MC -. 기간 만료 배치 .-> EX["EXPIRED"]
  MC -. 보상 글 블라인드 · 삭제 .-> RV["REVOKED"]
  classDef good fill:#EAF7EF,stroke:#3C9A63,color:#1d5a37
  classDef bad fill:#FDECEC,stroke:#C0392B,color:#7b1d14
  classDef main fill:#FFF3E3,stroke:#D98A2B,color:#1d2733
  class MC,RS good
  class NO,EX,RV bad
  class D4 main`,
};
