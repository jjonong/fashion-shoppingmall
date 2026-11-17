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
  W --> X["행 삭제<br/>member_home · address<br/>member_social · member_session"]
  W --> C["커뮤니티<br/>글 → HIDDEN<br/>댓글 작성자 → 탈퇴한 회원"]
  W --> K["기록 유지<br/>status = WITHDRAWN<br/>withdrawn_at · 사유"]`,
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
  C -- "Y 또는 행 없음" --> D["기본 배송비<br/>free_threshold 이상이면 0"]
  D --> E["권역 extra_fee 추가"]
  E --> F{"엘리베이터 있음?<br/>address.has_elevator"}
  F -- 있음 --> T["합계"]
  F -- 없음 --> G{"floor_no ≥<br/>ladder_floor_from?"}
  G -- 예 --> L["사다리차<br/>ladder_fee 추가"] --> T
  G -- 아니오 --> S["계단 운반비 추가<br/>stair_fee_per_floor × (floor_no − 1)"] --> T
  T --> R["출고 예정 = lead_days<br/>+ 권역 extra_lead_days"]
  classDef bad fill:#FDECEC,stroke:#C0392B,color:#7b1d14
  classDef good fill:#EAF7EF,stroke:#3C9A63,color:#1d5a37
  class X bad
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
};
