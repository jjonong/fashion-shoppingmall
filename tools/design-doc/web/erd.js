(function () {
  'use strict';
  const D = window.ERD;
  const $ = (s, el = document) => el.querySelector(s);
  const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const gnb = $('#gnb'), main = $('#main'), q = $('#q'), results = $('#results');

  const stageOf = (g) => D.stages.findIndex((s) => g.startsWith(s.prefix + '_'));
  const stageColor = (g) => `var(--s${stageOf(g) + 1})`;
  const PT = 4 / 3; // Graphviz pt → px
  // draw.io에서 열기: GitHub Pages(http)에서만. 이 페이지(…/erd/) 옆의 ../erd.drawio를 diagrams.net이 직접 불러옴
  const DRAWIO = /^https?:$/.test(location.protocol)
    ? 'https://app.diagrams.net/#U' + encodeURIComponent(new URL('../erd.drawio', location.href).href)
    : '';

  const EDIT = !!window.ERD_EDIT; // 로컬 편집 모드 (edit-server.js). 공개 페이지에서는 false

  let cur = { g: null, t: null };
  const zoomOf = {}; // 영역별 확대 비율 유지
  const manual = {}; // 사용자가 직접 확대/축소한 영역 (아니면 창 크기·상세 패널에 맞춰 다시 맞춤)

  // ---------- 라우팅: #g=영역&t=테이블 / #t=테이블 / (없음)=개요 ----------
  function parseHash() {
    const p = new URLSearchParams(location.hash.slice(1));
    let g = p.get('g'), t = p.get('t');
    if (t && !D.tables[t]) t = null;
    if (g && !D.groups[g]) g = null;
    if (t && !g) g = D.tables[t].group;
    return { g, t };
  }
  function go(g, t) {
    const h = g ? `#g=${g}${t ? `&t=${t}` : ''}` : t ? `#t=${t}` : '#';
    if (location.hash === h || (h === '#' && !location.hash)) route();
    else location.hash = h;
  }
  function route() {
    const next = parseHash();
    const groupChanged = next.g !== cur.g || !main.firstChild;
    cur = next;
    if (groupChanged) next.g ? renderGroup(next.g) : renderOverview();
    renderGnb();
    selectTable(next.t);
    document.body.classList.remove('side-open');
    syncMenu();
  }

  // ---------- 상단 영역 메뉴 (GNB): 영역 → 묶음 드롭다운. 테이블은 묶음 화면의 탭 줄(.jump) ----------
  function renderGnb() {
    const curStage = cur.g ? stageOf(cur.g) : -1;
    let h = `<a class="gnb-home${cur.g ? '' : ' on'}" href="#">전체 개요</a>`;
    D.stages.forEach((s, i) => {
      const n = s.groups.reduce((a, g) => a + D.groups[g].tables.length, 0);
      h += `<div class="gnb-item${i === curStage ? ' on' : ''}">
        <a class="gnb-h${s.all === cur.g ? ' sel' : ''}" href="#g=${s.all}" title="${esc(s.name)} 전체 ERD 보기" aria-haspopup="true"><span class="dot" style="background:var(--s${i + 1})"></span>${esc(s.name)}<span class="n">${n}</span></a>
        <div class="gnb-drop">
          <a class="gnb-all${s.all === cur.g ? ' on' : ''}" href="#g=${s.all}">${esc(s.name)} 전체 ERD<span class="n">${n}개 테이블</span></a>
          <div class="gnb-cols">${s.groups.map((g) => `<div class="gnb-col">
            <a class="gnb-g${g === cur.g ? ' on' : ''}" href="#g=${g}"><span>${esc(D.groups[g].title)}</span><span class="n">${D.groups[g].tables.length}</span></a>
            ${D.groups[g].tables.map((t) => `<a class="gnb-t${g === cur.g && t === cur.t ? ' on' : ''}" href="#g=${g}&t=${t}" title="${t}">${esc(tLg(t))}</a>`).join('')}
          </div>`).join('')}</div>
        </div>
      </div>`;
    });
    gnb.innerHTML = h;
  }
  // 메뉴를 누른 뒤에는 드롭다운을 닫는다 (hover·focus가 남아 열려 있지 않게)
  gnb.addEventListener('click', (e) => {
    if (!e.target.closest('a')) return;
    gnb.classList.add('closing');
    if (document.activeElement && gnb.contains(document.activeElement)) document.activeElement.blur();
  });
  gnb.addEventListener('mouseleave', () => gnb.classList.remove('closing'));
  gnb.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && document.activeElement && gnb.contains(document.activeElement)) document.activeElement.blur();
  });

  // ---------- 개요 ----------
  function renderOverview() {
    view = null;
    let cols = '';
    D.stages.forEach((s, i) => {
      const n = s.groups.reduce((a, g) => a + D.groups[g].tables.length, 0);
      cols += `<section class="stage-col" style="--c:var(--s${i + 1})"><h2><a href="#g=${s.all}" title="${esc(s.name)} 전체 ERD 보기">${esc(s.name)}</a><span>${n}개 테이블</span></h2>`;
      s.groups.forEach((g) => {
        const G = D.groups[g];
        cols += `<a class="g-card" href="#g=${g}"><b>${esc(G.title)} <span class="n" style="color:var(--muted);font-weight:400">· ${G.tables.length}</span></b>
          <p>${esc(G.desc)}</p><div class="chips">${G.tables.map((t) => `<span title="${t}">${esc(tLg(t))}</span>`).join('')}</div></a>`;
      });
      cols += '</section>';
    });
    main.innerHTML = `<div class="overview">
      <h1>패션 브랜드 입점형 쇼핑몰 ERD</h1>
      <p class="lead">여러 패션 브랜드가 입점해 의류·신발·가방·잡화를 판매하는 쇼핑몰(W컨셉 벤치마킹)의 DB 설계입니다. 고객 → 브랜드 → 상품 순서로 묶음 단위로 설계 중입니다.
        영역을 고르면 ERD가 열리고, 테이블을 누르면 전체 컬럼과 관계를 볼 수 있습니다.</p>
      <div class="stats">
        <div class="stat"><b>${D.counts.tables}</b><span>테이블</span></div>
        <div class="stat"><b>${D.counts.refs}</b><span>FK 관계</span></div>
        <div class="stat"><b>${D.counts.groups}</b><span>영역</span></div>
        <div class="stat"><b>MySQL 8.0</b><span>InnoDB · utf8mb4</span></div>
      </div>
      <h2 class="ov-h">벤치마킹 · W컨셉 <span>디자이너 브랜드 입점형 편집숍</span></h2>
      <p class="ov-sub">어떤 회사인지 알고 벤치마킹하기 위한 개요입니다. 공개 기사 기준(2026-11)이며, 금액·실적은 시점에 따라 다릅니다.</p>
      <div class="bench">
        <div class="bench-card">
          <h3>기업 개요</h3>
          <dl>
            <dt>회사</dt><dd>더블유컨셉코리아 (서비스명 W컨셉)</dd>
            <dt>시작</dt><dd>2006년경 국내 신진 디자이너 브랜드 소개로 출발</dd>
            <dt>소유</dt><dd>2021년 SSG닷컴(신세계 그룹)이 약 2,650억~2,700억 원에 인수, 플랫폼은 별도 운영</dd>
            <dt>주 고객</dt><dd>젊은 여성 중심</dd>
            <dt>자체 브랜드</dt><dd>프론트로우 등 (PB)</dd>
            <dt>오프라인</dt><dd>2026-10 한남동 첫 단독 플래그십 'W한남'</dd>
            <dt>최근</dt><dd>신세계 편입 후 첫 적자 보도, 2026-03 첫 여성 대표 선임, 거래액 약 6,500억 원(29CM 약 1.3조 원)</dd>
          </dl>
        </div>
        <div class="bench-card">
          <h3>어떤 스타일의 회사인가</h3>
          <ul>
            <li><b>브랜드를 발굴·육성하는 큐레이션 편집숍</b>: 상품을 쌓아 두는 오픈마켓이 아니라 고른 디자이너 브랜드를 소개하고 키운다</li>
            <li><b>콘텐츠 중심</b>: 온라인 매거진·다큐멘터리로 브랜드 이야기를 전하고, 신진 브랜드 소개 프로그램 'W Stage' 운영</li>
            <li><b>에디토리얼 톤</b>: 할인을 앞세운 쇼핑몰보다 잡지에 가까운 화면</li>
            <li><b>PC 웹 1920 폭</b>: 헤더·본문이 화면을 꽉 채우는 레이아웃 (FHD 작업 레퍼런스)</li>
          </ul>
        </div>
        <div class="bench-card">
          <h3>설계에 활용할 점</h3>
          <ul>
            <li><b>브랜드가 핵심 단위</b>: 브랜드 소개·스토리, 신진 브랜드 표시, 입점 브랜드와 자체 브랜드(PB) 구분 → 브랜드 기본 묶음</li>
            <li><b>여성 고객 중심이라 사이즈·체형이 중요</b> → 회원 체형(<code>member_body</code>), 상품 실측</li>
            <li><b>콘텐츠(매거진·기획전)와 상품 연결</b> → 상품 단계 이후 차별점 후보</li>
          </ul>
        </div>
      </div>
      <p class="bench-src">출처: <a href="https://thevc.kr/wconceptkorea" target="_blank" rel="noopener">THE VC</a> · <a href="https://dealsite.co.kr/articles/72841" target="_blank" rel="noopener">딜사이트</a> · <a href="https://news.bizwatch.co.kr/article/consumer/2026/10/19/0034" target="_blank" rel="noopener">비즈워치(2026-10)</a> · <a href="https://news.bizwatch.co.kr/article/consumer/2026/03/09/0034" target="_blank" rel="noopener">비즈워치(2026-03)</a> · <a href="https://byline.network/?p=9004111222470663" target="_blank" rel="noopener">바이라인네트워크</a></p>
      <h2 class="ov-h">전체 구조 <span>${D.counts.tables}개 테이블 · 영역별 묶음</span></h2>
      <p class="ov-sub">테이블 이름만 표시한 전체 관계도입니다. 색은 영역(${D.stages.map((s) => s.name).join(" · ")}), 선은 FK(까마귀발 쪽이 여러 개). 관리자 감사 컬럼(created_by 등) 선은 생략했습니다.</p>
      <div class="ov-erd">
        ${toolbarHtml('테이블을 끌어 옮기기 · 빈 곳을 끌어 화면 이동 · 누르면 그 영역으로 · Ctrl + 휠로 확대')}
        <div class="canvas" id="canvas"><div class="pad"></div></div>
      </div>
      <h2 class="ov-h">영역별 보기</h2>
      <div class="stage-cols">${cols}</div>
      <div class="legend"><h3>ERD 읽는 법</h3><ul>
        <li>각 영역 ERD에는 키 컬럼(PK·FK·UK)만 보이고, 나머지는 <b>+ N columns</b>로 줄여 표시합니다. 테이블을 누르면 전체 컬럼이 나옵니다.</li>
        <li>선 끝 모양: 까마귀발 = 여러 개(N), 세로줄 = 반드시 1개, 동그라미 = 없을 수 있음(0).</li>
        <li>회색 테이블은 다른 영역에 있는 참조 대상입니다 (PK만 표시).</li>
        <li>관리자 감사 컬럼(등록·수정 관리자 created_by/updated_by, 운영 영역 밖의 처리 관리자) → 운영자(admin_user) 선은 생략했습니다. 테이블 명세에는 FK로 표시됩니다.</li>
        <li>테이블을 끌어 옮긴 배치는 이 브라우저에 저장됩니다. <b>배치 내보내기</b>로 받은 <code>erd-layout.json</code>을 <code>docs/</code>에 넣으면 모든 사람에게 같은 배치로 보입니다. 설계가 바뀌어 배치가 어긋나면 <b>배치 초기화</b>를 누르세요.</li>
        <li>원본: <code>docs/erd.dbml</code> (dbdiagram.io 형식). 이 페이지는 <code>tools/design-doc</code>의 <code>npm run erd</code>로 생성됩니다.</li>
      </ul></div>
    </div>`;
    mountDiagram('__all');
    main.scrollTop = 0;
  }

  // ---------- 영역 화면: ERD + 테이블 명세 ----------
  let view = null; // { svg, w, h, canvas, zoomEl, g }
  // 구조 설계 단계라 논리명(한글)을 앞에, 물리명은 작은 회색 고정폭으로
  const tLg = (t) => (D.tables[t] && D.tables[t].logical) || t;
  const fLg = (t, c) => { const f = D.tables[t] && D.tables[t].fields.find((x) => x.name === c); return (f && f.logical) || c; };
  const phys = (s) => `<code class="phys">${esc(s)}</code>`;
  const link = (name, col) => `<a href="#g=${D.tables[name].group}&t=${name}">${esc(tLg(name))}${col ? '.' + esc(fLg(name, col)) : ''}</a> ${phys(name + (col ? '.' + col : ''))}`;
  const keyBadges = (f) => f.keys.map((k) => `<span class="badge ${k}">${k}</span>`).join('') + (f.inc ? '<span class="badge AI">AI</span>' : '');

  const AUDIT_TAIL_COLS = ['created_by', 'updated_by', 'created_at', 'updated_at']; // 맨 끝 고정 (편집 서버와 같음)
  function specCard(t, no) {
    const T = D.tables[t];
    const movable = (f) => EDIT && !AUDIT_TAIL_COLS.includes(f.name);
    const rows = T.fields.map((f) => `<tr class="${f.keys.includes('PK') ? 'is-pk' : ''}"${EDIT ? ` data-mv-t="${t}" data-mv-c="${esc(f.name)}"` : ''}>
        <td class="c-lg">${movable(f) ? '<span class="ed-drag" title="끌어서 순서 바꾸기" aria-hidden="true">⠿</span>' : EDIT ? '<span class="ed-drag off" aria-hidden="true"></span>' : ''}${esc(f.logical || f.name)}</td>
        <td class="c-name">${esc(f.name)}${EDIT ? `<span class="ed-row"><button class="ed-x" data-ed="col-edit" data-t="${t}" data-c="${esc(f.name)}" title="이 컬럼 수정" aria-label="${esc(f.name)} 컬럼 수정">✎</button><button class="ed-x" data-ed="col-del" data-t="${t}" data-c="${esc(f.name)}" title="이 컬럼 삭제" aria-label="${esc(f.name)} 컬럼 삭제">×</button></span>` : ''}</td>
        <td class="c-type">${esc(f.type)}</td>
        <td class="c-key">${keyBadges(f)}</td>
        <td class="c-nn">${f.nn ? 'Y' : ''}</td>
        <td class="c-def">${esc(f.def)}</td>
        <td class="c-desc">${f.ref ? `<div class="c-ref">→ ${link(f.ref.split('.')[0], f.ref.split('.')[1])}</div>` : ''}${esc(f.note)}</td></tr>`).join('');
    const idx = T.indexes.map((i) => `<li><code>${esc(i.pk ? 'PRIMARY' : i.name)}</code> ${i.pk ? '<span class="badge PK">PK</span>' : i.unique ? '<span class="badge UK">UNIQUE</span>' : ''}
        <code class="cols-of">(${esc(i.cols)})</code>${i.note ? ` <span class="i-note">${esc(i.note)}</span>` : ''}${EDIT && !i.pk && i.name ? `<button class="ed-x on" data-ed="idx-del" data-t="${t}" data-i="${esc(i.name)}" title="이 인덱스 삭제" aria-label="${esc(i.name)} 인덱스 삭제">×</button>` : ''}</li>`).join('');
    const outs = T.out.map((r) => `<li><code>${esc(r.col)}</code> → ${link(r.table, r.pcol)}${r.one ? ' <span class="i-note">1:1</span>' : ''}${EDIT ? `<button class="ed-x on" data-ed="fk-del" data-t="${t}" data-c="${esc(r.col)}" title="이 관계 삭제" aria-label="${esc(r.col)} 관계 삭제">×</button>` : ''}</li>`).join('');
    const ins = T.in.map((r) => `<li>${link(r.table, r.col)}${r.one ? ' <span class="i-note">1:1</span>' : ''}</li>`).join('');
    return `<section class="spec" id="spec-${t}">
      <header class="spec-h">
        <span class="no">${no}</span>
        <h3>${esc(tLg(t))} ${phys(t)}</h3>
        <span class="cnt">컬럼 ${T.fields.length}</span>
        ${EDIT ? `<span class="ed-bar"><button class="icon-btn ed-btn" data-ed="col-add" data-t="${t}">+ 컬럼</button><button class="icon-btn ed-btn" data-ed="pk-set" data-t="${t}">PK 변경</button><button class="icon-btn ed-btn" data-ed="fk-add" data-t="${t}">+ FK</button><button class="icon-btn ed-btn" data-ed="idx-add" data-t="${t}">+ 인덱스</button><button class="icon-btn ed-btn" data-ed="tbl-del" data-t="${t}">테이블 삭제</button></span>` : ''}
        <button class="icon-btn to-erd" data-erd="${t}">ERD에서 보기 ↑</button>
      </header>
      <p class="tnote">${esc(T.note)}</p>
      <div class="tbl-wrap"><table class="cols">
        <thead><tr><th>논리명</th><th>물리명</th><th>타입</th><th>키</th><th>NN</th><th>기본값</th><th>설명</th></tr></thead>
        <tbody>${rows}</tbody></table></div>
      <div class="spec-foot">
        ${idx || EDIT ? `<div><h4>인덱스</h4><ul>${idx || '<li class="i-note">없음</li>'}</ul></div>` : ''}
        ${outs || EDIT ? `<div><h4>참조하는 테이블</h4><ul>${outs || '<li class="i-note">없음</li>'}</ul></div>` : ''}
        ${ins ? `<div><h4>참조받는 테이블</h4><ul>${ins}</ul></div>` : ''}
      </div>
    </section>`;
  }

  function renderGroup(g) {
    const G = D.groups[g];
    const s = D.stages[stageOf(g)];
    main.innerHTML = `<div class="g-view" style="--c:${stageColor(g)}">
      <div class="g-head">
        <div class="crumb">${esc(s.name)}</div>
        <h1>${esc(G.title)} <span style="color:var(--muted);font-weight:400;font-size:15px">${G.tables.length}개 테이블</span>${EDIT ? `${G.area ? '' : ` <button class="icon-btn ed-btn" data-ed="tbl-add" data-g="${g}">+ 테이블</button>`} <button class="icon-btn ed-btn" data-ed="grp-add" data-a="${s.prefix}">+ 묶음</button>` : ''}</h1>
        <p>${esc(G.desc)}</p>
        ${G.ext.length ? `<p class="ext">다른 영역 참조(회색): ${G.ext.map((t) => link(t)).join(', ')}${G.hideAudit ? ' · 관리자 감사 컬럼 → 운영자 선 생략' : ''}</p>` : ''}
        <nav class="jump" aria-label="테이블 명세 바로가기">${G.tables.map((t) => `<a href="#g=${g}&t=${t}" title="${t}">${esc(tLg(t))}</a>`).join('')}</nav>
      </div>
      ${toolbarHtml('테이블을 끌어 옮기기 · 빈 곳을 끌어 화면 이동 · 누르면 아래 명세로 · Ctrl + 휠로 확대')}
      <div class="canvas" id="canvas"><div class="pad"></div></div>
      <div class="specs"><h2 class="specs-h">테이블 명세</h2>${G.tables.map((t, i) => specCard(t, i + 1)).join('')}</div>
    </div>`;
    mountDiagram(g);
    main.scrollTop = 0;
  }
  function toolbarHtml(hint) {
    return `<div class="toolbar">
        <button class="icon-btn" data-z="out" aria-label="축소">−</button>
        <span class="zoom" id="zoomVal">100%</span>
        <button class="icon-btn" data-z="in" aria-label="확대">+</button>
        <button class="icon-btn" data-z="fit">화면 맞춤</button>
        <button class="icon-btn" data-z="one">100%</button>
        <span class="sep"></span>
        <button class="icon-btn" data-z="reset" title="이 화면에서 옮긴 배치를 지우고 공유·자동 배치로">배치 초기화</button>
        <button class="icon-btn" data-z="export" title="옮긴 배치를 erd-layout.json으로 받기 (docs/에 넣으면 모두에게 같은 배치)">배치 내보내기</button>
        ${DRAWIO ? `<a class="icon-btn" href="${DRAWIO}" target="_blank" rel="noopener" title="같은 ERD를 draw.io에서 열어 자유롭게 편집 (원본 erd.dbml에는 반영되지 않음)">draw.io에서 열기</a>` : ''}
        <span class="hint">${hint}</span>
      </div>`;
  }
  // #canvas에 svg-{key} 템플릿을 붙이고 노드·선·영역 묶음에 테이블/영역 이름을 표시
  function mountDiagram(key) {
    const canvas = $('#canvas');
    const tpl = document.getElementById(`svg-${key}`);
    $('.pad', canvas).appendChild(tpl.content.cloneNode(true));
    const svg = $('svg', canvas);
    const vb = svg.viewBox.baseVal;
    view = { svg, w: vb.width, h: vb.height, canvas, zoomEl: $('#zoomVal'), g: key };
    svg.querySelectorAll('g.cluster').forEach((c) => {
      const ti = $('title', c);
      if (ti) c.dataset.g = ti.textContent.trim().replace(/^cluster_/, '');
    });
    svg.querySelectorAll('g.node').forEach((n) => {
      const t = $('title', n).textContent.trim();
      n.dataset.t = t;
      const T = D.tables[t];
      if (!T) return;
      // 마우스 팝업용 표시: 컬럼 이름 텍스트 → data-col, "+ N columns" → data-more
      const texts = [...n.querySelectorAll('text')];
      texts.forEach((tx) => {
        const name = tx.textContent.trim();
        const byName = T.fields.find((x) => x.name === name);
        const byLg = !byName && name && T.fields.find((x) => x.logical === name);
        if (byName || byLg) tx.dataset.col = (byName || byLg).name;
        else if (/^\+ \d+ columns$/.test(name)) tx.dataset.more = '1';
      });
      n.dataset.shown = texts.filter((tx) => tx.dataset.col).map((tx) => tx.dataset.col).join(',');
    });
    svg.querySelectorAll('g.edge').forEach((e) => {
      const [a, b] = $('title', e).textContent.split('->');
      e.dataset.a = a.split(':')[0].trim();
      e.dataset.b = b.split(':')[0].trim();
    });
    // 브라우저 기본 툴팁(SVG title) 대신 마우스 팝업을 쓰므로 제거
    svg.querySelectorAll('title').forEach((ti) => ti.remove());
    initLayout(svg, key);
    if (zoomOf[key]) setZoom(zoomOf[key]); else fit();
  }

  // ---------- 테이블 드래그 배치 ----------
  // 배치 = 화면(영역)별 { 노드키: [dx, dy] } (Graphviz 자동 배치에서 옮긴 거리, SVG 좌표)
  // 내 브라우저(localStorage)가 우선, 없으면 공유 배치(docs/erd-layout.json → D.layout), 둘 다 없으면 자동 배치
  const LKEY = 'erd-layout-v1';
  let localLayout = {};
  try { localLayout = JSON.parse(localStorage.getItem(LKEY) || '{}') || {}; } catch (e) { localLayout = {}; }
  const saveLocalLayout = () => { try { localStorage.setItem(LKEY, JSON.stringify(localLayout)); } catch (e) { /* 저장 불가(사생활 보호 모드 등)면 이번 화면에서만 유지 */ } };
  const layoutOf = (key) => localLayout[key] || (D.layout && D.layout[key]) || {};
  // 영역 전체 화면은 같은 테이블이 여러 상자에 회색으로 나오므로 "묶음/테이블"로 구분
  const nodeKey = (n) => { const o = n.ownerSVGElement; const c = o && o.getAttribute('data-cluster'); return (c ? c + '/' : '') + n.dataset.t; };
  const ptsOf = (d) => (d.match(/-?[\d.]+/g) || []).map(Number).reduce((a, v, i, arr) => (i % 2 ? a : a.concat([[v, arr[i + 1]]])), []);
  const center = (el) => { const b = el.getBBox(); return [b.x + b.width / 2, b.y + b.height / 2]; };
  const dist = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1]);

  function initLayout(svg, key) {
    view.vb0 = [svg.viewBox.baseVal.x, svg.viewBox.baseVal.y, view.w, view.h];
    const nodesOf = new Map(); // 같은 svg(묶음) 안에서 테이블 이름 → 노드
    svg.querySelectorAll('g.node').forEach((n) => {
      n._d = [0, 0];
      n._edges = [];
      const o = n.ownerSVGElement;
      if (!nodesOf.has(o)) nodesOf.set(o, {});
      nodesOf.get(o)[n.dataset.t] = n;
    });
    svg.querySelectorAll('g.edge').forEach((e) => {
      const path = e.querySelector('path');
      const map = nodesOf.get(e.ownerSVGElement) || {};
      const na = map[e.dataset.a], nb = map[e.dataset.b];
      if (!path || !na || !nb) return;
      const pts = ptsOf(path.getAttribute('d'));
      if (pts.length < 4) return;
      e._path = path;
      e._pts = [pts[0], pts[1], pts[pts.length - 2], pts[pts.length - 1]];
      // 선의 시작점이 어느 테이블 쪽인지 (Graphviz가 방향을 뒤집어 그리는 경우 대비)
      const ca = center(na), cb = center(nb);
      const flip = dist(e._pts[0], cb) + dist(e._pts[3], ca) < dist(e._pts[0], ca) + dist(e._pts[3], cb);
      e._s = flip ? nb : na;
      e._t = flip ? na : nb;
      // 화살표 모양(까마귀발·동그라미·세로줄)은 가까운 끝을 따라 움직임
      e._parts = [...e.children].filter((c) => c !== path && c.tagName !== 'title').map((c) => {
        const p = center(c);
        return { el: c, end: dist(p, e._pts[0]) <= dist(p, e._pts[3]) ? 's' : 't' };
      });
      na._edges.push(e);
      if (nb !== na) nb._edges.push(e);
    });
    const L = layoutOf(key);
    svg.querySelectorAll('g.node').forEach((n) => { const d = L[nodeKey(n)]; if (d) moveNode(n, d[0], d[1]); });
    growViewBox();
  }
  function moveNode(n, dx, dy) {
    n._d = [dx, dy];
    if (dx || dy) n.setAttribute('transform', `translate(${dx} ${dy})`); else n.removeAttribute('transform');
    n._edges.forEach(redrawEdge);
  }
  function redrawEdge(e) {
    const s = e._s._d, t = e._t._d;
    if (e._s === e._t) { // 자기 참조 선은 통째로
      e.setAttribute('transform', `translate(${s[0]} ${s[1]})`);
      return;
    }
    const [p0, p1, p2, p3] = e._pts;
    const f = (p, o) => `${(p[0] + o[0]).toFixed(1)},${(p[1] + o[1]).toFixed(1)}`;
    e._path.setAttribute('d', `M${f(p0, s)}C${f(p1, s)} ${f(p2, t)} ${f(p3, t)}`);
    e._parts.forEach(({ el, end }) => { const o = end === 's' ? s : t; el.setAttribute('transform', `translate(${o[0]} ${o[1]})`); });
  }
  // 옮긴 테이블이 그림 밖으로 나가면 viewBox를 넓혀 잘리지 않게
  function growViewBox() {
    const svg = view.svg, [x0, y0, w0, h0] = view.vb0;
    let b;
    try { b = svg.getBBox(); } catch (e) { return; }
    // svg.getBBox()는 viewBox와 같은 좌표계 (Graphviz의 g.graph translate 반영됨)
    const x = Math.min(x0, b.x - 8), y = Math.min(y0, b.y - 8);
    const w = Math.max(x0 + w0, b.x + b.width + 8) - x, h = Math.max(y0 + h0, b.y + b.height + 8) - y;
    svg.setAttribute('viewBox', `${x} ${y} ${w} ${h}`);
    view.w = w;
    view.h = h;
    if (zoomOf[view.g]) setZoom(zoomOf[view.g]);
  }
  function resetLayout() {
    if (!view) return;
    delete localLayout[view.g];
    saveLocalLayout();
    // 공유 배치(없으면 자동 배치) 위치로 되돌리고 그림 범위도 원래대로
    const L = layoutOf(view.g);
    view.svg.querySelectorAll('g.node').forEach((n) => { if (n._edges) { const d = L[nodeKey(n)] || [0, 0]; moveNode(n, d[0], d[1]); } });
    const [x, y, w, h] = view.vb0;
    view.svg.setAttribute('viewBox', `${x} ${y} ${w} ${h}`);
    view.w = w;
    view.h = h;
    growViewBox();
  }
  function exportLayout() {
    const all = Object.assign({}, D.layout || {}, localLayout);
    const blob = new Blob([JSON.stringify(all, null, 1)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'erd-layout.json';
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 0);
  }
  // 긴 설명은 첫 문장(마침표·괄호 전)까지만
  function shortNote(s) {
    const t = s.split(/\. |\n/)[0];
    return t.length > 60 ? t.slice(0, 58) + '…' : t;
  }
  function maxCanvasH() { return Math.max(320, Math.round(window.innerHeight * (view && view.g === '__all' ? 0.8 : 0.62))); }
  function setZoom(z) {
    if (!view) return;
    z = Math.max(0.2, Math.min(3, z));
    zoomOf[view.g] = z;
    view.svg.style.width = `${view.w * PT * z}px`;
    view.svg.style.height = `${view.h * PT * z}px`;
    view.zoomEl.textContent = `${Math.round(z * 100)}%`;
  }
  function fit() {
    if (!view) return;
    const c = view.canvas;
    const z = Math.min((c.clientWidth - 48) / (view.w * PT), (maxCanvasH() - 48) / (view.h * PT), 1.2);
    setZoom(z > 0 ? z : 1);
    // 작은 ERD는 캔버스 높이를 그림에 맞춰 줄여서 아래 명세가 바로 보이게
    c.style.height = `${Math.min(maxCanvasH(), Math.ceil(view.h * PT * zoomOf[view.g]) + 48)}px`;
  }
  function refit() { if (view && !manual[view.g]) fit(); }
  function zoomAt(z, cx, cy) {
    // cx, cy: 캔버스 안 좌표. 그 지점이 제자리에 있도록 스크롤 보정
    const c = view.canvas, old = zoomOf[view.g];
    const x = (c.scrollLeft + cx), y = (c.scrollTop + cy);
    setZoom(z);
    const k = zoomOf[view.g] / old;
    c.scrollLeft = x * k - cx;
    c.scrollTop = y * k - cy;
  }

  main.addEventListener('click', (e) => {
    const toErd = e.target.closest('[data-erd]');
    if (toErd) {
      main.scrollTo({ top: 0, behavior: 'smooth' });
      highlight(toErd.dataset.erd);
      return;
    }
    const b = e.target.closest('[data-z]');
    if (!b || !view) return;
    if (b.dataset.z === 'reset') return resetLayout();
    if (b.dataset.z === 'export') return exportLayout();
    const z = zoomOf[view.g];
    const c = view.canvas;
    manual[view.g] = b.dataset.z !== 'fit';
    if (b.dataset.z === 'in') zoomAt(z * 1.25, c.clientWidth / 2, c.clientHeight / 2);
    if (b.dataset.z === 'out') zoomAt(z / 1.25, c.clientWidth / 2, c.clientHeight / 2);
    if (b.dataset.z === 'fit') fit();
    if (b.dataset.z === 'one') setZoom(1);
  });
  main.addEventListener('wheel', (e) => {
    if (!view || !(e.ctrlKey || e.metaKey) || !e.target.closest('.canvas')) return;
    e.preventDefault();
    manual[view.g] = true;
    const r = view.canvas.getBoundingClientRect();
    zoomAt(zoomOf[view.g] * (e.deltaY < 0 ? 1.12 : 1 / 1.12), e.clientX - r.left, e.clientY - r.top);
  }, { passive: false });

  // 드래그: 테이블 위에서 끌면 테이블 이동(배치 저장), 빈 곳에서 끌면 화면 이동. 조금만 움직이면 클릭으로 처리
  let drag = null;
  main.addEventListener('pointerdown', (e) => {
    const c = e.target.closest('.canvas');
    if (!c || e.button !== 0) return;
    const n = view && e.target.closest('g.node');
    if (n && n._edges) {
      e.preventDefault(); // 끄는 동안 페이지 글자가 선택되지 않게
      drag = { c, node: n, x: e.clientX, y: e.clientY, d0: n._d.slice(), moved: false };
    }
    else drag = { c, x: e.clientX, y: e.clientY, sl: c.scrollLeft, st: c.scrollTop, moved: false };
  });
  window.addEventListener('pointermove', (e) => {
    if (!drag) return;
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
    if (!drag.moved && Math.abs(dx) + Math.abs(dy) > 4) {
      drag.moved = true;
      drag.c.classList.add(drag.node ? 'drag-node' : 'drag');
      hideTip();
    }
    if (!drag.moved) return;
    if (drag.node) {
      const k = PT * zoomOf[view.g]; // 화면 px → SVG 좌표
      moveNode(drag.node, drag.d0[0] + dx / k, drag.d0[1] + dy / k);
    } else {
      drag.c.scrollLeft = drag.sl - dx;
      drag.c.scrollTop = drag.st - dy;
    }
  });
  window.addEventListener('pointerup', (e) => {
    if (!drag) return;
    const d = drag;
    drag = null;
    d.c.classList.remove('drag', 'drag-node');
    if (d.moved && d.node) {
      // 옮긴 배치 저장 (이 화면 전체를 내 브라우저에 기록: 공유 배치 위에 덮어씀)
      const L = Object.assign({}, layoutOf(view.g));
      const [x, y] = d.node._d.map((v) => Math.round(v * 10) / 10);
      if (x || y) L[nodeKey(d.node)] = [x, y]; else delete L[nodeKey(d.node)];
      localLayout[view.g] = L;
      saveLocalLayout();
      growViewBox();
      return;
    }
    if (d.moved) return;
    const n = e.target.closest && e.target.closest('g.node');
    // 이 영역 테이블은 아래 명세로, 회색(다른 영역) 테이블은 그 영역으로 이동
    const cl = !n && e.target.closest && e.target.closest('g.cluster');
    if (n && n.dataset.t && D.tables[n.dataset.t]) {
      // 지금 보는 ERD(영역 전체 포함)에 있는 테이블이면 그 자리의 명세로, 아니면 그 테이블의 세부 영역으로
      const here = cur.g && D.groups[cur.g] && D.groups[cur.g].tables.includes(n.dataset.t);
      go(here ? cur.g : D.tables[n.dataset.t].group, n.dataset.t);
    }
    else if (cl && cl.dataset.g && D.groups[cl.dataset.g]) go(cl.dataset.g, null);
    else if (e.target.closest && e.target.closest('.canvas')) highlight(null);
  });

  // ---------- 마우스를 따라다니는 테이블 설명 팝업 ----------
  const tipEl = document.createElement('div');
  tipEl.className = 'tip';
  tipEl.hidden = true;
  document.body.appendChild(tipEl);
  let tipKey = '';
  function tipHtml(n, tx) {
    const T = D.tables[n.dataset.t];
    if (!T) return '';
    const G = D.groups[T.group];
    let h = `<div class="tip-h"><b>${esc(tLg(T.name))}</b> ${phys(T.name)}<span>${esc(G.title)}</span></div>
      <p class="tip-note">${esc(T.note)}</p>`;
    if (tx && tx.dataset.col) {
      const f = T.fields.find((x) => x.name === tx.dataset.col);
      h += `<div class="tip-col"><div><b>${esc(f.logical || f.name)}</b> ${phys(f.name)} <span class="tip-type">${esc(f.type)}</span>${f.keys.map((k) => ` <span class="badge ${k}">${k}</span>`).join('')}</div>
        ${f.ref ? `<div class="tip-ref">→ ${esc(tLg(f.ref.split('.')[0]))}.${esc(fLg(f.ref.split('.')[0], f.ref.split('.')[1]))} ${phys(f.ref)}</div>` : ''}${f.note ? `<div>${esc(f.note)}</div>` : ''}</div>`;
    } else if (tx && tx.dataset.more) {
      const shown = new Set((n.dataset.shown || '').split(','));
      const rest = T.fields.filter((f) => !shown.has(f.name));
      h += `<ul class="tip-list">${rest.slice(0, 14).map((f) => `<li>${esc(f.logical || f.name)} ${phys(f.name)}${f.note ? ` — ${esc(shortNote(f.note))}` : ''}</li>`).join('')}
        ${rest.length > 14 ? `<li class="tip-more">외 ${rest.length - 14}개</li>` : ''}</ul>`;
    } else {
      h += `<div class="tip-foot">컬럼 ${T.fields.length}개 · 컬럼에 올리면 컬럼 설명 · 누르면 ${T.group === (view && view.g) ? '아래 명세로 이동' : '해당 영역으로 이동'}</div>`;
    }
    return h;
  }
  function placeTip(x, y) {
    const pad = 14, r = tipEl.getBoundingClientRect();
    let left = x + pad, top = y + pad + 4;
    if (left + r.width > window.innerWidth - 8) left = x - r.width - pad;
    if (top + r.height > window.innerHeight - 8) top = y - r.height - pad;
    tipEl.style.left = `${Math.max(8, left)}px`;
    tipEl.style.top = `${Math.max(8, top)}px`;
  }
  function hideTip() { tipEl.hidden = true; tipKey = ''; }
  main.addEventListener('mousemove', (e) => {
    const n = !drag && e.target.closest && e.target.closest('.canvas g.node');
    if (!n || !n.dataset.t) {
      // 전체 구조도의 영역 묶음 위: 영역 설명
      const cl = !drag && e.target.closest && e.target.closest('.canvas g.cluster');
      const G = cl && D.groups[cl.dataset.g];
      if (!G) { hideTip(); return; }
      const key = `group|${cl.dataset.g}`;
      if (key !== tipKey) {
        tipKey = key;
        tipEl.innerHTML = `<div class="tip-h"><code>${esc(G.title)}</code><span>${esc(D.stages[stageOf(cl.dataset.g)].name)}</span></div>
          <p class="tip-note">${esc(G.desc)}</p><div class="tip-foot">테이블 ${G.tables.length}개 · 누르면 이 영역의 ERD와 명세로 이동</div>`;
      }
      tipEl.hidden = false;
      placeTip(e.clientX, e.clientY);
      return;
    }
    const tx = e.target.closest('text[data-col], text[data-more]');
    const key = `${n.dataset.t}|${tx ? tx.dataset.col || 'more' : ''}`;
    if (key !== tipKey) { tipKey = key; tipEl.innerHTML = tipHtml(n, tx); }
    tipEl.hidden = false;
    placeTip(e.clientX, e.clientY);
  });
  main.addEventListener('mouseleave', hideTip);
  main.addEventListener('scroll', hideTip, true);

  // ---------- 선택 ----------
  function highlight(t) {
    if (!view) return;
    const svg = view.svg;
    view.canvas.classList.toggle('has-sel', !!t);
    svg.querySelectorAll('g.node').forEach((n) => { n.classList.toggle('sel', n.dataset.t === t); n.classList.remove('rel'); });
    svg.querySelectorAll('g.edge').forEach((e) => {
      const rel = !!t && (e.dataset.a === t || e.dataset.b === t);
      e.classList.toggle('rel', rel);
      if (rel) svg.querySelectorAll('g.node').forEach((n) => {
        if (n.dataset.t === e.dataset.a || n.dataset.t === e.dataset.b) n.classList.add('rel');
      });
    });
    const n = t && svg.querySelector(`g.node[data-t="${t}"]`);
    if (n) {
      // 캔버스 밖이면 캔버스 안에서만 스크롤해서 보이게
      const c = view.canvas, r = n.getBoundingClientRect(), cr = c.getBoundingClientRect();
      if (r.left < cr.left || r.right > cr.right || r.top < cr.top || r.bottom > cr.bottom) {
        c.scrollLeft += r.left + r.width / 2 - (cr.left + cr.width / 2);
        c.scrollTop += r.top + r.height / 2 - (cr.top + cr.height / 2);
      }
    }
  }

  function selectTable(t) {
    highlight(t);
    main.querySelectorAll('.spec.sel').forEach((el) => el.classList.remove('sel'));
    main.querySelectorAll('.jump a').forEach((a) => a.classList.toggle('on', a.textContent === t));
    if (!t) return;
    const card = document.getElementById(`spec-${t}`);
    if (!card) return;
    card.classList.add('sel');
    main.scrollTo({ top: card.offsetTop - 12, behavior: 'smooth' });
  }

  // ---------- 검색 ----------
  let hits = [], hitOn = 0;
  function search() {
    const s = q.value.trim().toLowerCase();
    if (!s) { results.hidden = true; return; }
    hits = [];
    Object.values(D.tables).forEach((T) => {
      const g = D.groups[T.group].title;
      if (T.name.includes(s) || T.logical.includes(s)) hits.push({ t: T.name, score: T.name.startsWith(s) || T.logical.startsWith(s) ? 0 : 1, sub: g });
      else {
        const cols = T.fields.filter((f) => f.name.includes(s) || f.logical.includes(s)).map((f) => f.logical || f.name);
        if (cols.length) hits.push({ t: T.name, score: 2, sub: `${g} · 컬럼 ${cols.slice(0, 4).join(', ')}${cols.length > 4 ? ' …' : ''}` });
        else if (T.note.toLowerCase().includes(s)) hits.push({ t: T.name, score: 3, sub: `${g} · ${T.note.slice(0, 50)}` });
      }
    });
    hits.sort((a, b) => a.score - b.score || a.t.localeCompare(b.t));
    hits = hits.slice(0, 40);
    hitOn = 0;
    results.innerHTML = hits.length
      ? hits.map((h, i) => `<button data-i="${i}" class="${i === 0 ? 'on' : ''}"><span class="r-name">${esc(tLg(h.t))} ${phys(h.t)}</span><span class="r-sub">${esc(h.sub)}</span></button>`).join('')
      : '<div class="empty">일치하는 테이블이 없습니다</div>';
    results.hidden = false;
  }
  function pick(i) {
    const h = hits[i];
    if (!h) return;
    results.hidden = true;
    q.blur();
    go(D.tables[h.t].group, h.t);
  }
  q.addEventListener('input', search);
  q.addEventListener('focus', search);
  q.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      hitOn = (hitOn + (e.key === 'ArrowDown' ? 1 : -1) + hits.length) % Math.max(hits.length, 1);
      results.querySelectorAll('button').forEach((b, i) => b.classList.toggle('on', i === hitOn));
      const on = results.querySelector('button.on');
      if (on) on.scrollIntoView({ block: 'nearest' });
    } else if (e.key === 'Enter') pick(hitOn);
    else if (e.key === 'Escape') { results.hidden = true; q.blur(); }
  });
  results.addEventListener('mousedown', (e) => {
    const b = e.target.closest('button[data-i]');
    if (b) { e.preventDefault(); pick(+b.dataset.i); }
  });
  q.addEventListener('blur', () => setTimeout(() => (results.hidden = true), 100));

  // ---------- 기타 ----------
  document.addEventListener('keydown', (e) => {
    if (e.key === '/' && document.activeElement !== q) { e.preventDefault(); q.focus(); }
  });
  // 다크/라이트 전환: 저장값(erd-theme)이 없으면 시스템 설정을 따름. 첫 화면 깜빡임 방지용 적용은 <head>의 인라인 스크립트
  const themeBtn = $('#themeBtn');
  const darkMq = window.matchMedia('(prefers-color-scheme: dark)');
  const isDark = () => (document.documentElement.dataset.theme || (darkMq.matches ? 'dark' : 'light')) === 'dark';
  function syncTheme() {
    const d = isDark();
    themeBtn.textContent = d ? 'LIGHT' : 'DARK';
    themeBtn.setAttribute('aria-label', d ? '라이트 모드로 전환' : '다크 모드로 전환');
    themeBtn.title = themeBtn.getAttribute('aria-label');
    themeBtn.setAttribute('aria-pressed', String(d));
  }
  themeBtn.onclick = () => {
    const next = isDark() ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem('erd-theme', next); } catch (e) { /* 이번 화면에서만 유지 */ }
    syncTheme();
  };
  darkMq.addEventListener('change', syncTheme);
  syncTheme();

  // 좁은 화면: ☰로 영역 메뉴를 왼쪽 패널로 열기/닫기
  const menuBtn = $('#menuBtn');
  function syncMenu() { menuBtn.setAttribute('aria-expanded', String(document.body.classList.contains('side-open'))); }
  menuBtn.onclick = () => { document.body.classList.toggle('side-open'); syncMenu(); };
  syncMenu();
  $('#scrim').onclick = () => document.body.classList.remove('side-open');
  let rt;
  window.addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(() => { refit(); }, 150); });

  // ---------- 로컬 편집 모드 (edit-server.js가 띄운 화면에서만) ----------
  // 브라우저 alert/confirm 대신 오른쪽 패널에서 입력·확인. 저장하면 서버가 erd.dbml을 고치고 페이지를 다시 만든다
  if (EDIT) {
    const TYPES = ['varchar(20)', 'varchar(30)', 'varchar(50)', 'varchar(100)', 'varchar(200)', 'varchar(500)', 'char(1)', 'char(64)', 'tinyint', 'smallint', 'int', 'bigint', 'decimal(10,2)', 'decimal(4,2)', 'datetime', 'date', 'text', 'mediumtext'];
    const AUDIT = ['created_by', 'updated_by', 'created_at', 'updated_at'];
    const panel = document.createElement('aside');
    panel.className = 'ed-panel';
    panel.hidden = true;
    panel.setAttribute('aria-label', '편집');
    document.body.appendChild(panel);
    const close = () => { panel.hidden = true; panel.innerHTML = ''; };
    const field = (label, name, attrs = '', help = '') => `<label class="ed-f"><span>${label}</span><input name="${name}" ${attrs}>${help ? `<small>${help}</small>` : ''}</label>`;
    const val = (v) => `value="${esc(v ?? '')}"`;
    const typeList = `<datalist id="edTypes">${TYPES.map((t) => `<option value="${t}">`).join('')}</datalist>`;
    const typeOf = (f) => f.type.toLowerCase();
    const colLabel = (f) => `${esc(f.logical || f.name)} <code class="phys">${esc(f.name)}</code>`;
    const pkOf = (T) => T.fields.filter((f) => f.keys.includes('PK')).map((f) => f.name);
    const pkOrder = (T) => { const i = T.indexes.find((x) => x.pk); return i ? i.cols.split(',').map((s) => s.trim()) : pkOf(T); };

    function open(title, body, submitLabel, onSubmit, danger, onMount) {
      panel.innerHTML = `<form class="ed-form" novalidate>
        <div class="ed-h"><h3>${title}</h3><button type="button" class="icon-btn" data-ed-close aria-label="닫기">×</button></div>
        <div class="ed-body">${body}</div>
        <p class="ed-msg" role="status" hidden></p>
        <div class="ed-act"><button type="submit" class="icon-btn ed-ok${danger ? ' danger' : ''}">${submitLabel}</button><button type="button" class="icon-btn" data-ed-close>취소</button></div>
      </form>`;
      panel.hidden = false;
      panel.classList.toggle('wide', body.includes('ed-grid')); // 빠른 입력 표는 넓게
      panel.scrollTop = 0;
      const form = panel.querySelector('form');
      if (onMount) onMount(form);
      const first = form.querySelector('input:not([type=checkbox]), select');
      if (first) first.focus();
      form.onsubmit = async (e) => {
        e.preventDefault();
        const msg = form.querySelector('.ed-msg'), ok = form.querySelector('.ed-ok');
        const data = Object.fromEntries(new FormData(form).entries());
        form.querySelectorAll('input[type=checkbox][name]:not([data-multi])').forEach((c) => (data[c.name] = c.checked));
        ok.disabled = true;
        msg.hidden = false; msg.className = 'ed-msg'; msg.textContent = '저장하고 ERD를 다시 만드는 중…';
        try {
          const r = await onSubmit(data, form);
          const j = await r.json();
          if (!j.ok) throw new Error(j.msg);
          msg.textContent = j.msg + ' · 화면을 새로 고칩니다';
          setTimeout(() => location.reload(), 400);
        } catch (err) {
          msg.className = 'ed-msg err'; msg.textContent = err.message || String(err);
          ok.disabled = false;
        }
      };
    }
    const post = (url, body) => fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const keepHash = (g, t) => { history.replaceState(null, '', `#g=${g}${t ? `&t=${t}` : ''}`); };
    // 체크한 순서를 기억하는 컬럼 목록 (복합 PK·인덱스는 순서가 중요)
    function pickList(T, preset) {
      return `<div class="ed-pick" data-order="${esc(preset.join(','))}">${T.fields.map((f) => `<label class="ed-c"><input type="checkbox" data-multi value="${esc(f.name)}"${preset.includes(f.name) ? ' checked' : ''}> ${colLabel(f)}</label>`).join('')}</div>
        <p class="ed-order">순서: <b data-order-view>${esc(preset.join(', ')) || '(없음)'}</b></p><small class="ed-hint">체크한 순서대로 들어갑니다. 순서를 바꾸려면 해제했다가 다시 체크하세요.</small>`;
    }
    function bindPick(form, onChange) {
      const box = form.querySelector('.ed-pick'), view = form.querySelector('[data-order-view]');
      let order = box.dataset.order ? box.dataset.order.split(',') : [];
      box.addEventListener('change', (e) => {
        const v = e.target.value;
        order = order.filter((x) => x !== v);
        if (e.target.checked) order.push(v);
        view.textContent = order.join(', ') || '(없음)';
        if (onChange) onChange(order);
      });
      return () => order;
    }
    // ----- 빠른 입력 표: 한 줄 = 컬럼 하나. 논리명·물리명·키만 필수, 나머지는 선택 -----
    // 키: PK / FK(참조 테이블 선택) / PK+FK(부모 키를 물려받는 자식 테이블) / UK. FK 타입은 부모에서 자동
    const fkTables = () => Object.keys(D.tables).sort().filter((x) => pkOf(D.tables[x]).length === 1);
    const KEY_OPTS = [['', '—'], ['PK', 'PK'], ['FK', 'FK'], ['PK+FK', 'PK+FK'], ['UK', 'UK']];
    const gridRow = (key = '') => `<tr class="ed-gr">
        <td><input data-g="logical" placeholder="예: 브랜드 아이디" autocomplete="off" aria-label="논리명"></td>
        <td><input data-g="name" class="mono" placeholder="brand_id" autocomplete="off" spellcheck="false" aria-label="물리명"></td>
        <td><select data-g="key" aria-label="키">${KEY_OPTS.map(([v, l]) => `<option value="${v}"${v === key ? ' selected' : ''}>${l}</option>`).join('')}</select></td>
        <td><select data-g="parent" aria-label="참조 테이블" disabled><option value="">—</option>${fkTables().map((x) => `<option value="${x}">${esc(D.tables[x].logical || x)} (${x})</option>`).join('')}</select></td>
        <td><input data-g="type" class="mono" list="edTypes" placeholder="자동" autocomplete="off" spellcheck="false" aria-label="타입"></td>
        <td class="c"><input type="checkbox" data-g="notNull" data-multi aria-label="NOT NULL"></td>
        <td><input data-g="note" placeholder="(선택)" autocomplete="off" aria-label="설명"></td>
        <td><button type="button" class="ed-x on" data-gr-del aria-label="이 줄 빼기">×</button></td></tr>`;
    const grid = (firstKey, rows = 3) => `<table class="ed-grid"><thead><tr><th>논리명 *</th><th>물리명 *</th><th>키</th><th>참조 테이블 (FK)</th><th>타입</th><th>NN</th><th>설명</th><th></th></tr></thead>
        <tbody>${Array.from({ length: rows }, (_, i) => gridRow(i === 0 ? firstKey : '')).join('')}</tbody></table>
        <div class="ed-grid-foot"><button type="button" class="icon-btn ed-more" data-gr-add>+ 줄</button>
        <small>Enter: 다음 줄 · Ctrl+Enter: 저장 · 빈 줄은 무시 · 타입을 비우면 PK varchar(20), FK는 부모와 같게, 그 외 varchar(50) · 물리명이 다른 테이블 PK와 같으면 FK로 자동 선택</small></div>${typeList}`;
    function bindGrid(form, selfTable) {
      const body = form.querySelector('.ed-grid tbody');
      const sync = (tr) => {
        const k = tr.querySelector('[data-g=key]').value, ps = tr.querySelector('[data-g=parent]');
        ps.disabled = !k.includes('FK');
        if (ps.disabled) ps.value = '';
      };
      const add = () => { body.insertAdjacentHTML('beforeend', gridRow()); return body.lastElementChild; };
      form.querySelector('[data-gr-add]').onclick = () => add().querySelector('input').focus();
      body.addEventListener('click', (e) => { if (e.target.closest('[data-gr-del]')) { const tr = e.target.closest('tr'); if (body.rows.length > 1) tr.remove(); else tr.querySelectorAll('input').forEach((i) => (i.value = '')); } });
      body.addEventListener('change', (e) => { if (e.target.dataset.g === 'key') sync(e.target.closest('tr')); });
      // 물리명이 다른 테이블의 단일 PK와 같으면 FK로 골라 둠 (예: brand_id → brand)
      body.addEventListener('input', (e) => {
        if (e.target.dataset.g !== 'name') return;
        const tr = e.target.closest('tr'), ks = tr.querySelector('[data-g=key]'), ps = tr.querySelector('[data-g=parent]');
        const hit = fkTables().find((x) => x !== selfTable && pkOf(D.tables[x])[0] === e.target.value.trim());
        if (hit && (ks.value === '' || ks.value === 'PK')) { ks.value = ks.value === 'PK' ? 'PK+FK' : 'FK'; sync(tr); ps.value = hit; tr.dataset.auto = '1'; }
        else if (!hit && tr.dataset.auto) { ks.value = ks.value === 'PK+FK' ? 'PK' : ''; sync(tr); delete tr.dataset.auto; }
      });
      form.addEventListener('keydown', (e) => {
        if (e.key !== 'Enter' || e.target.tagName === 'BUTTON') return;
        e.preventDefault();
        if (e.ctrlKey || e.metaKey) { form.requestSubmit(); return; }
        const tr = e.target.closest('.ed-gr');
        if (!tr) { const f = body.querySelector('input'); if (f) f.focus(); return; }
        (tr.nextElementSibling || add()).querySelector('input').focus();
      });
      [...body.rows].forEach(sync);
    }
    const collectRows = (form) => [...form.querySelectorAll('.ed-gr')].map((tr) => {
      const g = (k) => tr.querySelector(`[data-g=${k}]`);
      return { logical: g('logical').value.trim(), name: g('name').value.trim(), key: g('key').value, parent: g('parent').value, type: g('type').value.trim(), notNull: g('notNull').checked, note: g('note').value.trim() };
    });
    const tableHead = (prefix) => `<div class="ed-two">${field('테이블 논리명 *', 'logical', 'placeholder="예: 상품 컬러" autocomplete="off"')}${field('테이블 물리명 *', 'name', `class="mono" placeholder="예: ${prefix}_color" autocomplete="off" spellcheck="false"`)}</div>`
      + field('테이블 설명', 'note', 'placeholder="(선택)" autocomplete="off"');

    // ----- 컬럼 -----
    function colForm(T, f) {
      const pk = f && f.keys.includes('PK');
      return field('논리명 *', 'logical', `${val(f && f.logical)} required placeholder="예: 시즌 코드" autocomplete="off"`, '한글 이름. 같은 물리명은 모든 테이블에서 같은 논리명으로')
        + field('물리명 *', 'name', `${val(f && f.name)} class="mono" required placeholder="예: season_code" autocomplete="off" spellcheck="false"`, f ? '바꾸면 이 테이블의 인덱스·관계(Ref)도 같이 바뀝니다' : '영문 소문자 snake_case')
        + field('타입', 'type', `${val(f && typeOf(f))} class="mono" list="edTypes" placeholder="비우면 varchar(50)" autocomplete="off" spellcheck="false"`, f && f.ref ? '관계(FK)로 이어진 컬럼은 타입을 바꿀 수 없습니다(양쪽이 같아야 함)' : '') + typeList
        + field('설명', 'note', `${val(f && f.note)} placeholder="예: 26SS/26FW. 허용 값은 A/B/C 형식" autocomplete="off"`)
        + `<label class="ed-c"><input type="checkbox" name="notNull"${f && f.nn ? ' checked' : ''}${pk ? ' disabled' : ''}> NOT NULL (필수 값)${pk ? ' · PK라 항상 필수' : ''}</label>`
        + field('기본값', 'def', `${val(f && f.def)} placeholder="비우면 없음 · 예: 0, 'Y', CURRENT_TIMESTAMP" autocomplete="off"`, "문자는 'Y'처럼 따옴표, 숫자는 그대로");
    }
    function colAdd(t) {
      const T = D.tables[t];
      open(`컬럼 추가 · ${esc(T.logical || t)} <code class="phys">${esc(t)}</code>`,
        grid('') + '<p class="ed-note">등록·수정 컬럼(created_*, updated_*) 앞에 들어갑니다. 키를 PK로 고르면 지금 PK 뒤에 붙어 복합 PK가 됩니다.</p>',
        '추가', (d, form) => { keepHash(T.group, t); return post('/api/columns/add', { table: t, rows: collectRows(form) }); }, false,
        (form) => bindGrid(form, t));
    }
    function colEdit(t, c) {
      const T = D.tables[t], f = T.fields.find((x) => x.name === c);
      open(`컬럼 수정 · ${esc(T.logical || t)} <code class="phys">${esc(t)}.${esc(c)}</code>`, colForm(T, f),
        '저장', (d) => { keepHash(T.group, t); return post('/api/column/edit', { table: t, column: c, ...d }); });
    }
    function colDel(t, c) {
      const T = D.tables[t], f = T.fields.find((x) => x.name === c);
      open('컬럼 삭제', `<p class="ed-q"><b>${esc(T.logical || t)}</b>의 <b>${esc((f && f.logical) || c)}</b> <code class="phys">${esc(t)}.${esc(c)}</code> 컬럼을 지울까요?</p>
        <p class="ed-note">이 컬럼의 관계(FK)와 단일 컬럼 인덱스도 함께 지웁니다. PK이거나 다른 테이블이 참조하거나 복합 인덱스에 든 컬럼은 지워지지 않습니다. 되돌리려면 git으로.</p>`,
        '삭제', () => { keepHash(T.group, t); return post('/api/column/delete', { table: t, column: c }); }, true);
    }
    // ----- PK -----
    function pkSet(t) {
      const T = D.tables[t];
      const cur = pkOrder(T);
      const ix = T.indexes.find((x) => x.pk);
      let get;
      open(`PK 변경 · ${esc(T.logical || t)} <code class="phys">${esc(t)}</code>`,
        `<p class="ed-note">지금 PK: <b>${esc(cur.join(', ')) || '(없음)'}</b>. 2개 이상 고르면 복합 PK가 됩니다 (예: 부모 키 + 번호).</p>` + pickList(T, cur)
        + field('복합 PK 설명', 'note', `${val(ix && ix.note)} placeholder="예: member_id 선두라 FK 인덱스 겸용" autocomplete="off"`, '복합 PK일 때만 씁니다'),
        '저장', (d) => { keepHash(T.group, t); return post('/api/pk/set', { table: t, columns: get(), note: d.note }); }, false,
        (form) => { get = bindPick(form); });
    }
    // ----- 인덱스 -----
    function idxAdd(t) {
      const T = D.tables[t];
      let get, auto = true;
      open(`인덱스 추가 · ${esc(T.logical || t)} <code class="phys">${esc(t)}</code>`,
        `<label class="ed-f"><span>종류</span><select name="kind"><option value="index">일반 인덱스 (ix_)</option><option value="unique">UNIQUE (uk_)</option></select></label>`
        + `<h4 class="ed-sub">컬럼</h4>` + pickList(T, [])
        + field('인덱스 이름', 'name', 'autocomplete="off" spellcheck="false"', '컬럼을 고르면 자동으로 지어집니다 (직접 바꿔도 됨)')
        + field('설명', 'note', 'placeholder="예: FK 인덱스, 기간별 조회" autocomplete="off"'),
        '추가', (d) => { keepHash(T.group, t); return post('/api/index/add', { table: t, kind: d.kind, name: d.name, note: d.note, columns: get() }); }, false,
        (form) => {
          const nameEl = form.querySelector('[name=name]'), kindEl = form.querySelector('[name=kind]');
          const gen = (cols) => { if (auto) nameEl.value = cols.length ? `${kindEl.value === 'unique' ? 'uk' : 'ix'}_${t}_${cols.join('_')}`.slice(0, 64) : ''; };
          get = bindPick(form, gen);
          nameEl.addEventListener('input', () => { auto = !nameEl.value; });
          kindEl.addEventListener('change', () => gen(get()));
        });
    }
    function idxDel(t, name) {
      const T = D.tables[t];
      open('인덱스 삭제', `<p class="ed-q"><b>${esc(T.logical || t)}</b>의 인덱스 <code>${esc(name)}</code>을(를) 지울까요?</p><p class="ed-note">PK는 [PK 변경]으로 바꿉니다.</p>`,
        '삭제', () => { keepHash(T.group, t); return post('/api/index/delete', { table: t, name }); }, true);
    }
    // ----- 관계(FK) -----
    function fkAdd(t) {
      const T = D.tables[t];
      const has = new Set(T.out.map((r) => r.col));
      const own = T.fields.filter((f) => !has.has(f.name) && !AUDIT.includes(f.name));
      const tables = Object.keys(D.tables).sort();
      const keyCols = (pt) => { const P = D.tables[pt]; const pk = pkOf(P); return P.fields.filter((f) => (pk.length === 1 && pk[0] === f.name) || f.keys.includes('UK') || P.indexes.some((i) => (i.unique || i.pk) && i.cols === f.name)); };
      open(`관계(FK) 추가 · ${esc(T.logical || t)} <code class="phys">${esc(t)}</code>`,
        `<label class="ed-f"><span>이 테이블의 컬럼 (자식)</span><select name="column">${own.map((f) => `<option value="${esc(f.name)}">${esc(f.logical || f.name)} (${esc(f.name)} ${esc(typeOf(f))})</option>`).join('')}</select><small>이미 관계가 있는 컬럼과 감사 컬럼은 빠져 있습니다</small></label>`
        + `<label class="ed-f"><span>참조할 테이블 (부모)</span><select name="parent">${tables.map((x) => `<option value="${x}">${esc(D.tables[x].logical || x)} (${x})</option>`).join('')}</select></label>`
        + `<label class="ed-f"><span>참조할 컬럼</span><select name="parentColumn"></select><small>PK(단일)나 UNIQUE 컬럼만. 타입이 같아야 합니다</small></label>`
        + `<label class="ed-f"><span>관계</span><select name="rel"><option value="N:1">N:1 (여러 행이 부모 하나를 가리킴)</option><option value="1:1">1:1 (확장 테이블)</option></select></label>`
        + `<label class="ed-f"><span>부모가 지워지면</span><select name="onDelete"><option value="">지정 안 함 (기본: 막음)</option><option value="cascade">같이 지움 (CASCADE)</option><option value="set null">NULL로 (SET NULL)</option><option value="restrict">막음 (RESTRICT)</option></select><small>CHECK 제약에 쓰는 FK 컬럼은 참조 동작을 지정하지 않습니다(MySQL 제한)</small></label>`
        + `<label class="ed-c"><input type="checkbox" name="addIndex" checked> FK 인덱스도 추가 (이미 인덱스 선두 컬럼이면 건너뜀)</label>`,
        '추가', (d) => { keepHash(T.group, t); return post('/api/ref/add', { table: t, ...d }); }, false,
        (form) => {
          const ps = form.querySelector('[name=parent]'), pc = form.querySelector('[name=parentColumn]'), cs = form.querySelector('[name=column]');
          const fill = () => { pc.innerHTML = keyCols(ps.value).map((f) => `<option value="${esc(f.name)}">${esc(f.logical || f.name)} (${esc(f.name)} ${esc(typeOf(f))})</option>`).join('') || '<option value="">(가리킬 수 있는 컬럼 없음)</option>'; };
          // 컬럼 이름이 같은 PK를 가진 테이블을 먼저 골라 둠 (예: member_id → member_account)
          const guess = () => { const c = cs.value; const hit = tables.find((x) => x !== t && pkOf(D.tables[x]).length === 1 && pkOf(D.tables[x])[0] === c); if (hit) ps.value = hit; fill(); };
          ps.addEventListener('change', fill); cs.addEventListener('change', guess);
          // 처음에는 다른 테이블 PK와 이름이 같은 컬럼(FK 후보)을, 없으면 PK가 아닌 첫 컬럼을 고름
          const pk = pkOf(T);
          const cand = own.find((f) => tables.some((x) => x !== t && pkOf(D.tables[x]).length === 1 && pkOf(D.tables[x])[0] === f.name))
            || own.find((f) => !pk.includes(f.name));
          if (cand) cs.value = cand.name;
          guess();
        });
    }
    function fkDel(t, c) {
      const T = D.tables[t], r = T.out.find((x) => x.col === c);
      open('관계(FK) 삭제', `<p class="ed-q"><code class="phys">${esc(t)}.${esc(c)}</code> → <code class="phys">${esc(r ? `${r.table}.${r.pcol}` : '?')}</code> 관계를 지울까요?</p><p class="ed-note">컬럼과 FK 인덱스는 남겨 둡니다.</p>`,
        '삭제', () => { keepHash(T.group, t); return post('/api/ref/delete', { table: t, column: c }); }, true);
    }
    // ----- 테이블 -----
    function tblAdd(g) {
      const G = D.groups[g];
      const prefix = D.stages[stageOf(g)].prefix;
      open(`테이블 추가 · ${esc(G.title)} <code class="phys">${esc(g)}</code>`,
        tableHead(prefix) + '<h4 class="ed-sub">컬럼 (PK 하나 이상. 등록일시·수정일시는 자동)</h4>' + grid('PK', 4),
        '추가', (d, form) => { keepHash(g, d.name); return post('/api/table/add', { group: g, name: d.name, logical: d.logical, note: d.note, rows: collectRows(form) }); }, false,
        (form) => bindGrid(form, null));
    }
    function tblDel(t) {
      const T = D.tables[t];
      open('테이블 삭제', `<p class="ed-q"><b>${esc(T.logical || t)}</b> <code class="phys">${esc(t)}</code> 테이블을 지울까요? (컬럼 ${T.fields.length}개)</p>
        <p class="ed-note">이 테이블에서 나가는 관계와 묶음 목록에서도 빠집니다. 묶음이 비면 묶음도 지웁니다. 다른 테이블이 참조하고 있으면 지워지지 않습니다. 되돌리려면 git으로.</p>`,
        '삭제', () => { keepHash(T.group); return post('/api/table/delete', { table: t }); }, true);
    }
    // ----- 묶음 -----
    function grpAdd(prefix) {
      const s = D.stages.find((x) => x.prefix === prefix);
      open(`묶음 추가 · ${esc(s ? s.name : prefix)} 영역`,
        `<div class="ed-two">${field('묶음 이름 *', 'groupTitle', 'placeholder="예: 상품 기본" autocomplete="off"')}${field('묶음 물리명 *', 'groupName', `class="mono" value="${prefix}_" autocomplete="off" spellcheck="false"`)}</div>`
        + field('묶음 설명', 'groupDesc', 'placeholder="(선택) ERD 페이지 상단에 표시" autocomplete="off"')
        + `<h4 class="ed-sub">첫 테이블 (묶음은 테이블이 있어야 만들어집니다)</h4>` + tableHead(prefix) + grid('PK', 4),
        '추가', (d, form) => { history.replaceState(null, '', `#g=${d.groupName}&t=${d.name}`); return post('/api/group/add', { area: prefix, groupName: d.groupName, groupTitle: d.groupTitle, groupDesc: d.groupDesc, name: d.name, logical: d.logical, note: d.note, rows: collectRows(form) }); }, false,
        (form) => bindGrid(form, null));
    }

    // ----- 컬럼 순서 드래그: 손잡이(⠿)를 잡고 끌어서 다른 컬럼 위/아래에 놓음 -----
    const toast = document.createElement('div');
    toast.className = 'ed-toast'; toast.hidden = true;
    document.body.appendChild(toast);
    const say = (text, err) => { toast.hidden = false; toast.textContent = text; toast.classList.toggle('err', !!err); };
    let drag = null; // { t, c, tr }
    const clearMarks = () => document.querySelectorAll('.ed-drop-before, .ed-drop-after').forEach((x) => x.classList.remove('ed-drop-before', 'ed-drop-after'));
    document.addEventListener('mousedown', (e) => {
      const h = e.target.closest('.ed-drag');
      if (h) h.closest('tr').draggable = true;
    });
    document.addEventListener('mouseup', () => { if (!drag) document.querySelectorAll('tr[draggable="true"]').forEach((x) => (x.draggable = false)); });
    document.addEventListener('dragstart', (e) => {
      const tr = e.target.closest && e.target.closest('tr[data-mv-c]');
      if (!tr || !tr.draggable) return;
      drag = { t: tr.dataset.mvT, c: tr.dataset.mvC, tr };
      tr.classList.add('ed-dragging');
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', drag.c);
    });
    document.addEventListener('dragend', () => {
      if (drag) { drag.tr.classList.remove('ed-dragging'); drag.tr.draggable = false; }
      drag = null; clearMarks();
    });
    // 놓을 위치: 마우스가 행의 위쪽 절반이면 그 행 앞, 아래쪽이면 다음 행 앞
    const dropAt = (e) => {
      const tr = drag && e.target.closest && e.target.closest('tr[data-mv-c]');
      if (!tr || tr.dataset.mvT !== drag.t) return null;
      const r = tr.getBoundingClientRect();
      const after = e.clientY > r.top + r.height / 2;
      return { tr, after };
    };
    document.addEventListener('dragover', (e) => {
      const d = dropAt(e);
      if (!d) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      clearMarks();
      d.tr.classList.add(d.after ? 'ed-drop-after' : 'ed-drop-before');
    });
    document.addEventListener('drop', async (e) => {
      const d = dropAt(e);
      if (!d) return;
      e.preventDefault();
      const { t, c } = drag;
      const target = d.after ? d.tr.nextElementSibling : d.tr;
      const before = target ? target.dataset.mvC : '';
      clearMarks();
      if (before === c || (target && target.previousElementSibling === drag.tr) || (!target && d.tr === drag.tr)) return; // 제자리
      say('순서를 저장하고 ERD를 다시 만드는 중…');
      keepHash(D.tables[t].group, t);
      try {
        const j = await (await post('/api/column/move', { table: t, column: c, before })).json();
        if (!j.ok) throw new Error(j.msg);
        say(j.msg + ' · 화면을 새로 고칩니다');
        setTimeout(() => location.reload(), 300);
      } catch (err) {
        say(err.message || String(err), true);
        setTimeout(() => (toast.hidden = true), 5000);
      }
    });

    document.addEventListener('click', (e) => {
      if (e.target.closest('[data-ed-close]')) { close(); return; }
      const b = e.target.closest('[data-ed]');
      if (!b) return;
      e.preventDefault(); e.stopPropagation();
      const d = b.dataset;
      ({
        'col-add': () => colAdd(d.t), 'col-edit': () => colEdit(d.t, d.c), 'col-del': () => colDel(d.t, d.c),
        'pk-set': () => pkSet(d.t), 'idx-add': () => idxAdd(d.t), 'idx-del': () => idxDel(d.t, d.i),
        'fk-add': () => fkAdd(d.t), 'fk-del': () => fkDel(d.t, d.c),
        'tbl-add': () => tblAdd(d.g), 'tbl-del': () => tblDel(d.t), 'grp-add': () => grpAdd(d.a),
      })[d.ed]();
    }, true);
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !panel.hidden) close(); });
  }

  window.addEventListener('hashchange', route);
  route();
})();
