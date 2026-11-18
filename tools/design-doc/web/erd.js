(function () {
  'use strict';
  const D = window.ERD;
  const $ = (s, el = document) => el.querySelector(s);
  const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const side = $('#side'), main = $('#main'), q = $('#q'), results = $('#results');

  const stageOf = (g) => D.stages.findIndex((s) => g.startsWith(s.prefix));
  const stageColor = (g) => `var(--s${stageOf(g) + 1})`;
  const PT = 4 / 3; // Graphviz pt → px

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
      h += `<div class="stage"><div class="stage-h"><span class="dot" style="background:var(--s${i + 1})"></span>${esc(s.name)}<span class="n">${n}개</span></div>`;
      s.groups.forEach((g) => {
        const G = D.groups[g];
        const on = g === cur.g;
        h += `<a class="g-item${on ? ' on' : ''}" href="#g=${g}"><span>${esc(G.title)}</span><span class="n">${G.tables.length}</span></a>`;
        if (on) {
          h += `<div class="t-list">${G.tables.map((t) => `<a href="#g=${g}&t=${t}" class="${t === cur.t ? 'on' : ''}">${t}</a>`).join('')}</div>`;
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
      cols += `<section class="stage-col" style="--c:var(--s${i + 1})"><h2>${esc(s.name)}<span>${n}개 테이블</span></h2>`;
      s.groups.forEach((g) => {
        const G = D.groups[g];
        cols += `<a class="g-card" href="#g=${g}"><b>${esc(G.title)} <span class="n" style="color:var(--muted);font-weight:400">· ${G.tables.length}</span></b>
          <p>${esc(G.desc)}</p><div class="chips">${G.tables.map((t) => `<span>${t}</span>`).join('')}</div></a>`;
      });
      cols += '</section>';
    });
    main.innerHTML = `<div class="overview">
      <h1>인테리어 가구몰 + 커뮤니티 ERD</h1>
      <p class="lead">여러 브랜드 가구를 자사가 직접 판매하는 쇼핑몰(장바구니·주문·결제·설치배송 포함)과 구매 고객 사진·집들이·브랜드 매거진 커뮤니티의 DB 설계입니다.
        영역을 고르면 ERD가 열리고, 테이블을 누르면 전체 컬럼과 관계를 볼 수 있습니다.</p>
      <div class="stats">
        <div class="stat"><b>${D.counts.tables}</b><span>테이블</span></div>
        <div class="stat"><b>${D.counts.refs}</b><span>FK 관계</span></div>
        <div class="stat"><b>${D.counts.groups}</b><span>영역</span></div>
        <div class="stat"><b>MySQL 8.0</b><span>InnoDB · utf8mb4</span></div>
      </div>
      <div class="stage-cols">${cols}</div>
      <div class="legend"><h3>ERD 읽는 법</h3><ul>
        <li>각 영역 ERD에는 키 컬럼(PK·FK·UK)만 보이고, 나머지는 <b>+ N columns</b>로 줄여 표시합니다. 테이블을 누르면 전체 컬럼이 나옵니다.</li>
        <li>선 끝 모양: 까마귀발 = 여러 개(N), 세로줄 = 반드시 1개, 동그라미 = 없을 수 있음(0).</li>
        <li>회색 테이블은 다른 영역에 있는 참조 대상입니다 (PK만 표시).</li>
        <li>상품·커뮤니티 ERD에서는 관리자 감사 컬럼(created_by 등) → member_account 선을 생략했습니다. 상세 패널에는 FK로 표시됩니다.</li>
        <li>원본: <code>docs/erd.dbml</code> (dbdiagram.io 형식). 이 페이지는 <code>tools/design-doc</code>의 <code>npm run erd</code>로 생성됩니다.</li>
      </ul></div>
    </div>`;
    main.scrollTop = 0;
  }

  // ---------- 영역 화면: ERD + 테이블 명세 ----------
  let view = null; // { svg, w, h, canvas, zoomEl, g }
  const link = (name, col) => `<a href="#g=${D.tables[name].group}&t=${name}"><code>${name}</code></a>${col ? `<code>.${esc(col)}</code>` : ''}`;
  const keyBadges = (f) => f.keys.map((k) => `<span class="badge ${k}">${k}</span>`).join('') + (f.inc ? '<span class="badge AI">AI</span>' : '');

  function specCard(t, no) {
    const T = D.tables[t];
    const rows = T.fields.map((f) => `<tr class="${f.keys.includes('PK') ? 'is-pk' : ''}">
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
        <h3>${t}</h3>
        <span class="cnt">컬럼 ${T.fields.length}</span>
        <button class="icon-btn to-erd" data-erd="${t}">ERD에서 보기 ↑</button>
      </header>
      <p class="tnote">${esc(T.note)}</p>
      <div class="tbl-wrap"><table class="cols">
        <thead><tr><th>컬럼</th><th>타입</th><th>키</th><th>NN</th><th>기본값</th><th>설명</th></tr></thead>
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
        <nav class="jump" aria-label="테이블 명세 바로가기">${G.tables.map((t) => `<a href="#g=${g}&t=${t}">${t}</a>`).join('')}</nav>
      </div>
      <div class="toolbar">
        <button class="icon-btn" data-z="out" aria-label="축소">−</button>
        <span class="zoom" id="zoomVal">100%</span>
        <button class="icon-btn" data-z="in" aria-label="확대">+</button>
        <button class="icon-btn" data-z="fit">화면 맞춤</button>
        <button class="icon-btn" data-z="one">100%</button>
        <span class="hint">테이블·컬럼에 마우스를 올리면 설명 · 테이블을 누르면 아래 명세로 이동 · 드래그로 이동 · Ctrl + 휠로 확대</span>
      </div>
      <div class="canvas" id="canvas"><div class="pad"></div></div>
      <div class="specs"><h2 class="specs-h">테이블 명세</h2>${G.tables.map((t, i) => specCard(t, i + 1)).join('')}</div>
    </div>`;
    const canvas = $('#canvas');
    const tpl = document.getElementById(`svg-${g}`);
    $('.pad', canvas).appendChild(tpl.content.cloneNode(true));
    const svg = $('svg', canvas);
    const vb = svg.viewBox.baseVal;
    view = { svg, w: vb.width, h: vb.height, canvas, zoomEl: $('#zoomVal'), g };
    svg.querySelectorAll('g.node').forEach((n) => {
      const t = $('title', n).textContent.trim();
      n.dataset.t = t;
      const T = D.tables[t];
      if (!T) return;
      // 마우스 팝업용 표시: 컬럼 이름 텍스트 → data-col, "+ N columns" → data-more
      const texts = [...n.querySelectorAll('text')];
      texts.forEach((tx) => {
        const name = tx.textContent.trim();
        if (T.fields.some((x) => x.name === name)) tx.dataset.col = name;
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
    if (zoomOf[g]) setZoom(zoomOf[g]); else fit();
    main.scrollTop = 0;
  }
  // 긴 설명은 첫 문장(마침표·괄호 전)까지만
  function shortNote(s) {
    const t = s.split(/\. |\n/)[0];
    return t.length > 60 ? t.slice(0, 58) + '…' : t;
  }
  function maxCanvasH() { return Math.max(320, Math.round(window.innerHeight * 0.62)); }
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

  // 드래그 이동 (조금만 움직이면 클릭으로 처리)
  let drag = null;
  main.addEventListener('pointerdown', (e) => {
    const c = e.target.closest('.canvas');
    if (!c || e.button !== 0) return;
    drag = { c, x: e.clientX, y: e.clientY, sl: c.scrollLeft, st: c.scrollTop, moved: false };
  });
  window.addEventListener('pointermove', (e) => {
    if (!drag) return;
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
    if (!drag.moved && Math.abs(dx) + Math.abs(dy) > 4) { drag.moved = true; drag.c.classList.add('drag'); }
    if (drag.moved) { drag.c.scrollLeft = drag.sl - dx; drag.c.scrollTop = drag.st - dy; }
  });
  window.addEventListener('pointerup', (e) => {
    if (!drag) return;
    const d = drag;
    drag = null;
    d.c.classList.remove('drag');
    if (d.moved) return;
    const n = e.target.closest && e.target.closest('g.node');
    // 이 영역 테이블은 아래 명세로, 회색(다른 영역) 테이블은 그 영역으로 이동
    if (n && n.dataset.t && D.tables[n.dataset.t]) go(D.tables[n.dataset.t].group, n.dataset.t);
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
    let h = `<div class="tip-h"><code>${T.name}</code><span>${esc(G.title)}</span></div>
      <p class="tip-note">${esc(T.note)}</p>`;
    if (tx && tx.dataset.col) {
      const f = T.fields.find((x) => x.name === tx.dataset.col);
      h += `<div class="tip-col"><div><code>${esc(f.name)}</code> <span class="tip-type">${esc(f.type)}</span>${f.keys.map((k) => ` <span class="badge ${k}">${k}</span>`).join('')}</div>
        ${f.ref ? `<div class="tip-ref">→ ${esc(f.ref)}</div>` : ''}${f.note ? `<div>${esc(f.note)}</div>` : ''}</div>`;
    } else if (tx && tx.dataset.more) {
      const shown = new Set((n.dataset.shown || '').split(','));
      const rest = T.fields.filter((f) => !shown.has(f.name));
      h += `<ul class="tip-list">${rest.slice(0, 14).map((f) => `<li><code>${esc(f.name)}</code>${f.note ? ` — ${esc(shortNote(f.note))}` : ''}</li>`).join('')}
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
    if (!n || !n.dataset.t) { hideTip(); return; }
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
      if (T.name.includes(s)) hits.push({ t: T.name, score: T.name.startsWith(s) ? 0 : 1, sub: g });
      else {
        const cols = T.fields.filter((f) => f.name.includes(s)).map((f) => f.name);
        if (cols.length) hits.push({ t: T.name, score: 2, sub: `${g} · 컬럼 ${cols.slice(0, 4).join(', ')}${cols.length > 4 ? ' …' : ''}` });
        else if (T.note.toLowerCase().includes(s)) hits.push({ t: T.name, score: 3, sub: `${g} · ${T.note.slice(0, 50)}` });
      }
    });
    hits.sort((a, b) => a.score - b.score || a.t.localeCompare(b.t));
    hits = hits.slice(0, 40);
    hitOn = 0;
    results.innerHTML = hits.length
      ? hits.map((h, i) => `<button data-i="${i}" class="${i === 0 ? 'on' : ''}"><span class="r-name">${h.t}</span><span class="r-sub">${esc(h.sub)}</span></button>`).join('')
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
