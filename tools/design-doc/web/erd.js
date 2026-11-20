(function () {
  'use strict';
  const D = window.ERD;
  const $ = (s, el = document) => el.querySelector(s);
  const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const side = $('#side'), main = $('#main'), q = $('#q'), results = $('#results');

  const stageOf = (g) => D.stages.findIndex((s) => g.startsWith(s.prefix + '_'));
  const stageColor = (g) => `var(--s${stageOf(g) + 1})`;
  const PT = 4 / 3; // Graphviz pt → px
  // draw.io에서 열기: GitHub Pages(http)에서만. 이 페이지(…/erd/) 옆의 ../erd.drawio를 diagrams.net이 직접 불러옴
  const DRAWIO = /^https?:$/.test(location.protocol)
    ? 'https://app.diagrams.net/#U' + encodeURIComponent(new URL('../erd.drawio', location.href).href)
    : '';

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
    renderSide();
    selectTable(next.t);
    document.body.classList.remove('side-open');
  }

  // ---------- 사이드바 ----------
  function renderSide() {
    let h = `<a class="home${cur.g ? '' : ' on'}" href="#">전체 개요</a>`;
    D.stages.forEach((s, i) => {
      const n = s.groups.reduce((a, g) => a + D.groups[g].tables.length, 0);
      // 영역 이름을 누르면 그 영역의 모든 테이블 ERD
      h += `<div class="stage"><a class="stage-h${s.all === cur.g ? ' on' : ''}" href="#g=${s.all}" title="${esc(s.name)} 전체 ERD 보기"><span class="dot" style="background:var(--s${i + 1})"></span>${esc(s.name)}<span class="n">${n}개</span></a>`;
      s.groups.forEach((g) => {
        const G = D.groups[g];
        const on = g === cur.g;
        h += `<a class="g-item${on ? ' on' : ''}" href="#g=${g}"><span>${esc(G.title)}</span><span class="n">${G.tables.length}</span></a>`;
        if (on) {
          h += `<div class="t-list">${G.tables.map((t) => `<a href="#g=${g}&t=${t}" class="${t === cur.t ? 'on' : ''}" title="${t}">${esc(tLg(t))}</a>`).join('')}</div>`;
        }
      });
      h += '</div>';
    });
    side.innerHTML = h;
    const on = $('.g-item.on', side);
    if (on && on.scrollIntoViewIfNeeded) on.scrollIntoViewIfNeeded(false);
  }

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
      <h1>패션 마켓 입점형 쇼핑몰 ERD</h1>
      <p class="lead">소호 쇼핑몰(마켓)이 입점해 의류·신발·가방·잡화를 판매하는 쇼핑몰의 DB 설계입니다. 고객 → 마켓 → 상품 순서로 묶음 단위로 설계 중입니다.
        영역을 고르면 ERD가 열리고, 테이블을 누르면 전체 컬럼과 관계를 볼 수 있습니다.</p>
      <div class="stats">
        <div class="stat"><b>${D.counts.tables}</b><span>테이블</span></div>
        <div class="stat"><b>${D.counts.refs}</b><span>FK 관계</span></div>
        <div class="stat"><b>${D.counts.groups}</b><span>영역</span></div>
        <div class="stat"><b>MySQL 8.0</b><span>InnoDB · utf8mb4</span></div>
      </div>
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
        <li>고객 외 영역 ERD에서는 관리자 감사 컬럼(created_by 등) → member_account 선을 생략했습니다. 상세 패널에는 FK로 표시됩니다.</li>
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

  function specCard(t, no) {
    const T = D.tables[t];
    const rows = T.fields.map((f) => `<tr class="${f.keys.includes('PK') ? 'is-pk' : ''}">
        <td class="c-lg">${esc(f.logical || f.name)}</td>
        <td class="c-name">${esc(f.name)}</td>
        <td class="c-type">${esc(f.type)}</td>
        <td class="c-key">${keyBadges(f)}</td>
        <td class="c-nn">${f.nn ? 'Y' : ''}</td>
        <td class="c-def">${esc(f.def)}</td>
        <td class="c-desc">${f.ref ? `<div class="c-ref">→ ${link(f.ref.split('.')[0], f.ref.split('.')[1])}</div>` : ''}${esc(f.note)}</td></tr>`).join('');
    const idx = T.indexes.map((i) => `<li><code>${esc(i.pk ? 'PRIMARY' : i.name)}</code> ${i.pk ? '<span class="badge PK">PK</span>' : i.unique ? '<span class="badge UK">UNIQUE</span>' : ''}
        <code class="cols-of">(${esc(i.cols)})</code>${i.note ? ` <span class="i-note">${esc(i.note)}</span>` : ''}</li>`).join('');
    const outs = T.out.map((r) => `<li><code>${esc(r.col)}</code> → ${link(r.table, r.pcol)}${r.one ? ' <span class="i-note">1:1</span>' : ''}</li>`).join('');
    const ins = T.in.map((r) => `<li>${link(r.table, r.col)}${r.one ? ' <span class="i-note">1:1</span>' : ''}</li>`).join('');
    return `<section class="spec" id="spec-${t}">
      <header class="spec-h">
        <span class="no">${no}</span>
        <h3>${esc(tLg(t))} ${phys(t)}</h3>
        <span class="cnt">컬럼 ${T.fields.length}</span>
        <button class="icon-btn to-erd" data-erd="${t}">ERD에서 보기 ↑</button>
      </header>
      <p class="tnote">${esc(T.note)}</p>
      <div class="tbl-wrap"><table class="cols">
        <thead><tr><th>논리명</th><th>물리명</th><th>타입</th><th>키</th><th>NN</th><th>기본값</th><th>설명</th></tr></thead>
        <tbody>${rows}</tbody></table></div>
      <div class="spec-foot">
        ${idx ? `<div><h4>인덱스</h4><ul>${idx}</ul></div>` : ''}
        ${outs ? `<div><h4>참조하는 테이블</h4><ul>${outs}</ul></div>` : ''}
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
        <h1>${esc(G.title)} <span style="color:var(--muted);font-weight:400;font-size:15px">${G.tables.length}개 테이블</span></h1>
        <p>${esc(G.desc)}</p>
        ${G.ext.length ? `<p class="ext">다른 영역 참조(회색): ${G.ext.map((t) => link(t)).join(', ')}${G.hideAudit ? ' · 관리자 감사 컬럼 → member_account 선 생략' : ''}</p>` : ''}
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
  $('#menuBtn').onclick = () => document.body.classList.toggle('side-open');
  $('#scrim').onclick = () => document.body.classList.remove('side-open');
  let rt;
  window.addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(() => { refit(); }, 150); });
  window.addEventListener('hashchange', route);
  route();
})();
