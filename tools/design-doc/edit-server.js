// ERD 로컬 편집 모드: 브라우저에서 테이블·컬럼·PK·FK·인덱스·묶음을 고치면 docs/erd.dbml을 바로 고치고 ERD를 다시 만든다.
// - 내 PC에서만 (127.0.0.1). 공개 페이지(GitHub Pages)는 보기 전용 그대로
// - 매 요청마다 파일을 새로 읽어서 줄 단위로 고친다 (주석·서식 보존, 채팅으로 고친 내용과 섞여도 안전)
// - 파서 검증에 실패하면 저장하지 않는다. 커밋·푸시는 하지 않는다 (사용자가 하거나 Claude에게 요청)
// 사용: npm run edit   또는 저장소 루트의 편집.bat 더블클릭
//       node edit-server.js [in.dbml] [port] [--no-open]
const fs = require('fs');
const path = require('path');
const http = require('http');
const { execFileSync, execFile, exec } = require('child_process');
const { Parser } = require('@dbml/core');

const ROOT = path.resolve(__dirname, '..', '..');
const args = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const SRC = path.resolve(args[0] || path.join(ROOT, 'docs', 'erd.dbml'));
const PORT = Number(args[1] || 3000);
const OPEN = !process.argv.includes('--no-open');
const DIR = path.dirname(SRC);
const PUBLIC_HTML = path.join(DIR, 'erd', 'index.html'); // 공개 페이지 (docs/erd/index.html)
const DRAWIO = path.join(DIR, 'erd.drawio');
const EDIT_HTML = path.join(__dirname, '.build', 'erd-edit.html'); // 편집 화면 (커밋 안 함)
const LIB = path.join(__dirname, 'lib.js'); // 묶음 설명(groupDesc)·영역(AREAS)
// 편집 대상이 실제 docs/erd.dbml일 때만 lib.js의 묶음 설명을 고친다 (복사본으로 시험할 때는 건드리지 않음)
const WRITE_LIB = SRC === path.join(ROOT, 'docs', 'erd.dbml');

// ---------- 규칙 ----------
const NAME_RE = /^[a-z][a-z0-9_]{0,63}$/;
const TYPE_RE = /^[a-z]+(\(\d+(,\d+)?\))?$/;
// 자주 부딪히는 MySQL 8.0 예약어 (전체 목록은 아님)
const RESERVED = new Set(('add all alter and as asc before between bigint both by call cascade case change char character check collate column condition constraint '
  + 'convert create cross current_date current_time current_timestamp current_user cursor database databases date day default delete desc describe distinct div double drop '
  + 'each else elseif empty exists explain false fetch float for force foreign from fulltext function grant group grouping groups having if ignore in index inner insert int '
  + 'integer interval into is join key keys kill lag lead leading leave left like limit lines load lock long loop match member mod natural not null numeric of on option or '
  + 'order out outer over partition primary range rank read real recursive references regexp release rename repeat replace require restrict return revoke right rlike row '
  + 'rows schema select set show signal smallint spatial sql table terminated then time timestamp to trailing trigger true union unique unlock unsigned update usage use using '
  + 'values varchar when where while window with write year zerofill').split(/\s+/));
const AUDIT_TAIL = ['created_by', 'updated_by', 'created_at', 'updated_at']; // 시간·감사 컬럼은 맨 끝

class UserError extends Error {}
const fail = (msg) => { throw new UserError(msg); };
const q = (s) => String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'"); // DBML 작은따옴표 문자열
const re = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const has = (v) => v !== undefined && v !== null && String(v).trim() !== '';

function checkName(kind, name) {
  if (!NAME_RE.test(name || '')) fail(`${kind} 물리명은 영문 소문자로 시작하는 소문자·숫자·밑줄(snake_case)이어야 합니다: ${name || '(비어 있음)'}`);
  if (RESERVED.has(name)) fail(`${name}은(는) MySQL 예약어라 쓸 수 없습니다. 다른 이름으로 지어 주세요 (예: member → member_account)`);
}
function checkLogical(kind, s) {
  if (!s || !String(s).trim()) fail(`${kind} 논리명(한글 이름)은 꼭 적어야 합니다`);
  if (/[[\]]/.test(s)) fail(`${kind} 논리명에는 [ ] 를 쓸 수 없습니다`);
}
function normType(type) {
  const t = String(type || '').trim().toLowerCase().replace(/\s+/g, '');
  if (!TYPE_RE.test(t)) fail(`타입 형식이 올바르지 않습니다: ${type || '(비어 있음)'} (예: varchar(50), bigint, decimal(10,2), datetime)`);
  return t;
}

// ---------- DBML 읽기 ----------
function parse(text) {
  try { return new Parser().parse(text, 'dbmlv2').schemas[0]; } catch (e) {
    const d = e.diags && e.diags[0];
    fail(`DBML 문법 오류${d && d.location ? ` (${d.location.start.line}행)` : ''}: ${d ? d.message : String(e)}`);
  }
}
function refsOf(S) {
  return S.refs.map((r) => {
    const [a, b] = r.endpoints;
    let child = a, parent = b;
    if (a.relation === '1' && b.relation === '*') { child = b; parent = a; }
    return { child: child.tableName, ccol: child.fieldNames[0], parent: parent.tableName, pcol: parent.fieldNames[0] };
  });
}
const tableOf = (S, name) => S.tables.find((x) => x.name === name) || fail(`테이블이 없습니다: ${name}`);
const fieldOf = (t, name) => t.fields.find((x) => x.name === name) || fail(`컬럼이 없습니다: ${t.name}.${name}`);
const pkCols = (t) => {
  const idx = (t.indexes || []).find((i) => i.pk);
  return idx ? idx.columns.map((c) => c.value) : t.fields.filter((f) => f.pk).map((f) => f.name);
};
const typeOf = (f) => f.type.type_name.toLowerCase().replace(/\s+/g, '');
// 부모 쪽 컬럼은 PK(단일) 또는 UNIQUE여야 FK가 가리킬 수 있음
const isKey = (t, c) => {
  const pk = pkCols(t);
  if (pk.length === 1 && pk[0] === c) return true;
  if (t.fields.find((f) => f.name === c && f.unique)) return true;
  return (t.indexes || []).some((i) => (i.unique || i.pk) && i.columns.length === 1 && i.columns[0].value === c);
};

// ---------- DBML 텍스트 (줄 단위) ----------
// 최상위 블록 (Table / TableGroup): 시작 줄 ~ 첫 번째 0열 '}' 줄
function block(lines, kind, name) {
  const start = lines.findIndex((l) => new RegExp(`^${kind}\\s+${re(name)}(\\s|\\[|\\{|$)`).test(l));
  if (start < 0) return null;
  let end = start;
  while (end < lines.length && lines[end] !== '}') end++;
  if (end >= lines.length) fail(`${kind} ${name} 블록의 끝(})을 찾지 못했습니다`);
  return { start, end };
}
const mustBlock = (lines, kind, name) => block(lines, kind, name) || fail(`${kind} ${name}을(를) 파일에서 찾지 못했습니다`);
// 대괄호 설정 안을 최상위 쉼표로 나눔 (따옴표·백틱·괄호 안의 쉼표는 무시)
function splitTop(s) {
  const out = []; let cur = '', quote = null, depth = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (quote) { cur += c; if (c === '\\') { cur += s[++i] ?? ''; continue; } if (c === quote) quote = null; continue; }
    if (c === "'" || c === '"' || c === '`') { quote = c; cur += c; continue; }
    if (c === '(' || c === '[') depth++;
    if (c === ')' || c === ']') depth--;
    if (c === ',' && depth === 0) { out.push(cur.trim()); cur = ''; continue; }
    cur += c;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}
// 컬럼 줄: "  name type [settings]"
function parseFieldLine(l) {
  const m = /^ {2}([a-z][a-z0-9_]*)\s+(\S+)(?:\s+\[(.*)\])?\s*$/.exec(l);
  if (!m || m[1] === 'indexes' || m[1] === 'note') return null;
  return { name: m[1], type: m[2], settings: m[3] ? splitTop(m[3]) : [] };
}
const fieldLine = (l) => { const f = parseFieldLine(l); return f && f.name; };
const buildFieldLine = (name, type, settings) => `  ${name} ${type}${settings.length ? ` [${settings.join(', ')}]` : ''}`;
// 인덱스 줄: "    head [settings]" (head = 컬럼 | (a, b) | `식`)
function parseIndexLine(l) {
  const m = /^ {4}(`[^`]*`|\([^)]*\)|[a-z][a-z0-9_]*)(?:\s+\[(.*)\])?\s*$/.exec(l);
  if (!m) return null;
  const settings = m[2] ? splitTop(m[2]) : [];
  const nm = settings.map((s) => /^name:\s*'(.*)'$/.exec(s)).find(Boolean);
  return {
    head: m[1],
    cols: m[1].startsWith('`') ? [] : m[1].replace(/[()]/g, '').split(',').map((s) => s.trim()).filter(Boolean),
    settings, name: nm ? nm[1] : '', pk: settings.includes('pk'), unique: settings.includes('unique'),
  };
}
// 테이블 블록 안 컬럼 줄 (indexes { } 안은 제외)
function fieldLines(lines, b) {
  const out = []; let depth = 0;
  for (let i = b.start + 1; i < b.end; i++) {
    const l = lines[i];
    if (/\{\s*$/.test(l)) { depth++; continue; }
    if (/^\s+\}\s*$/.test(l)) { depth--; continue; }
    if (depth === 0) { const f = parseFieldLine(l); if (f) out.push({ i, ...f }); }
  }
  return out;
}
// indexes { } 블록 위치 (없으면 null)
function indexBlock(lines, b) {
  for (let i = b.start + 1; i < b.end; i++) {
    if (/^ {2}indexes \{\s*$/.test(lines[i])) {
      let j = i + 1; while (j < b.end && !/^ {2}\}\s*$/.test(lines[j])) j++;
      return { start: i, end: j };
    }
  }
  return null;
}
function ensureIndexBlock(lines, b) {
  const ib = indexBlock(lines, b);
  if (ib) return ib;
  lines.splice(b.end, 0, '', '  indexes {', '  }');
  return { start: b.end + 1, end: b.end + 2 };
}
function dropEmptyIndexBlock(lines, table) {
  const b = mustBlock(lines, 'Table', table);
  const ib = indexBlock(lines, b);
  if (ib && ib.end === ib.start + 1) {
    lines.splice(ib.start, 2);
    if (lines[ib.start - 1] !== undefined && lines[ib.start - 1].trim() === '') lines.splice(ib.start - 1, 1);
  }
}
function fmtDefault(v) {
  v = String(v).trim();
  if (/^-?\d+(\.\d+)?$/.test(v)) return v;
  if (/^(true|false|null)$/i.test(v)) return v.toLowerCase();
  if (/^`.*`$/.test(v)) return v;
  if (/^(CURRENT_TIMESTAMP|NOW\(\))$/i.test(v)) return `\`${v.toUpperCase()}\``;
  if (/^'.*'$/.test(v)) v = v.slice(1, -1).replace(/\\'/g, "'");
  return `'${q(v)}'`;
}
const noteSetting = (logical, note) => `note: '[${q(String(logical).trim())}]${has(note) ? ' ' + q(String(note).trim()) : ''}'`;
function columnLine({ name, type, logical, note, notNull, def, pk }) {
  const st = [];
  if (pk) st.push('pk');
  if (notNull && !pk) st.push('not null');
  if (has(def)) st.push(`default: ${fmtDefault(def)}`);
  st.push(noteSetting(logical, note));
  return buildFieldLine(name, type, st);
}
const tokSrc = (table, col) => `(^|[\\s(])${re(table)}\\.${re(col)}(?=[\\s)\\]]|$)`;
const tok = (table, col) => new RegExp(tokSrc(table, col)); // g 없음: test()를 여러 줄에 재사용해도 안전
const refLineIdx = (lines) => lines.map((l, i) => (/^Ref\b/.test(l) ? i : -1)).filter((i) => i >= 0);
// 상단 주석 "= N개 테이블" 숫자만 맞춤 (영역별 내역 문장은 Claude 검토 때 정리)
const syncCount = (text, n) => text.replace(/= \d+개 테이블/, `= ${n}개 테이블`);
const dropBlankRuns = (lines) => lines.filter((l, i) => !(l.trim() === '' && i > 0 && lines[i - 1].trim() === ''));
const isLeading = (t, c) => pkCols(t)[0] === c || (t.indexes || []).some((i) => i.columns[0] && i.columns[0].value === c);
const idxName = (prefix, table, cols) => {
  let n = `${prefix}_${table}_${cols.join('_')}`;
  if (n.length > 64) n = n.slice(0, 64).replace(/_+$/, '');
  return n;
};

// 새 테이블 블록 (PK 1개면 컬럼에 pk, 여러 개면 복합 PK 인덱스)
function tableBlock(p) {
  checkName('테이블', p.name);
  checkLogical('테이블', p.logical);
  const pks = (Array.isArray(p.pks) && p.pks.length ? p.pks : [{ name: p.pkName, type: p.pkType, logical: p.pkLogical, note: p.pkNote }])
    .filter((k) => has(k.name) || has(k.type) || has(k.logical));
  if (!pks.length) fail('PK 컬럼을 하나 이상 적어 주세요');
  const seen = new Set();
  pks.forEach((k, i) => {
    checkName(`PK 컬럼 ${i + 1}`, k.name);
    k.type = normType(k.type);
    checkLogical(`PK 컬럼 ${i + 1}`, k.logical);
    if (AUDIT_TAIL.includes(k.name)) fail(`${k.name}은(는) 시간·감사 컬럼 이름이라 PK로 쓸 수 없습니다`);
    if (seen.has(k.name)) fail(`PK 컬럼 이름이 겹칩니다: ${k.name}`);
    seen.add(k.name);
  });
  const lg = String(p.logical).trim();
  const composite = pks.length > 1;
  const body = [
    `Table ${p.name} [note: '[${q(lg)}]${has(p.note) ? ' ' + q(String(p.note).trim()) : ''}'] {`,
    ...pks.map((k) => columnLine({ ...k, pk: !composite, notNull: composite })),
    `  created_at datetime [not null, default: \`CURRENT_TIMESTAMP\`, note: '[등록일시] ${q(lg)} 등록일시']`,
    `  updated_at datetime [note: '[수정일시] ${q(lg)} 수정일시']`,
  ];
  if (composite) body.push('', '  indexes {', `    (${pks.map((k) => k.name).join(', ')}) [pk${has(p.pkIdxNote) ? `, note: '${q(p.pkIdxNote)}'` : ''}]`, '  }');
  body.push('}');
  return body;
}

// ---------- 편집 동작 ----------
const ops = {
  // 컬럼 ------------------------------------------------------------
  'column/add'(lines, S, p) {
    const t = tableOf(S, p.table);
    checkName('컬럼', p.name);
    p.type = normType(has(p.type) ? p.type : DEFAULT_TYPE);
    checkLogical('컬럼', p.logical);
    if (t.fields.some((f) => f.name === p.name)) fail(`${p.table}에 이미 ${p.name} 컬럼이 있습니다`);
    const b = mustBlock(lines, 'Table', p.table);
    const fl = fieldLines(lines, b);
    let at;
    if (has(p.before)) at = (fl.find((x) => x.name === p.before) || fail(`위치 기준 컬럼이 없습니다: ${p.before}`)).i;
    else at = fl.length ? fl[fl.length - 1].i + 1 : b.start + 1;
    lines.splice(at, 0, columnLine(p));
    return `${p.table}.${p.name} 컬럼을 추가했습니다`;
  },
  // 여러 컬럼을 한 번에: 논리명·물리명·키만 필수, 타입은 비우면 자동
  'columns/add'(lines, S, p) {
    const t = tableOf(S, p.table);
    const rows = prepRows(S, p.rows, p.table, t.fields.map((f) => f.name));
    if (!rows.length) fail('추가할 컬럼을 한 줄 이상 적어 주세요');
    return `${p.table}에 컬럼 ${rows.length}개를 추가했습니다${finishRows(lines, p.table, rows)}`;
  },
  'column/edit'(lines, S, p) {
    const t = tableOf(S, p.table);
    const f = fieldOf(t, p.column);
    const name = String(p.name || p.column).trim();
    checkName('컬럼', name);
    const type = normType(has(p.type) ? p.type : typeOf(f)); // 비우면 지금 타입 유지
    checkLogical('컬럼', p.logical);
    if (name !== p.column && t.fields.some((x) => x.name === name)) fail(`${p.table}에 이미 ${name} 컬럼이 있습니다`);
    const refs = refsOf(S);
    const isPk = pkCols(t).includes(p.column);
    // 관계로 이어진 컬럼은 타입이 같아야 함
    if (type !== typeOf(f)) {
      const partners = refs.filter((r) => (r.child === p.table && r.ccol === p.column) || (r.parent === p.table && r.pcol === p.column))
        .map((r) => (r.child === p.table && r.ccol === p.column ? `${r.parent}.${r.pcol}` : `${r.child}.${r.ccol}`));
      if (partners.length) fail(`관계(FK)로 이어진 컬럼이 있어 타입을 바꿀 수 없습니다: ${partners.join(', ')}. 양쪽을 함께 바꾸려면 채팅으로 요청해 주세요`);
    }
    const b = mustBlock(lines, 'Table', p.table);
    const row = fieldLines(lines, b).find((x) => x.name === p.column) || fail(`컬럼 줄을 찾지 못했습니다: ${p.column}`);
    // 유지할 설정: pk, unique, increment, ref 등 (not null / null / default / note만 새로 씀)
    const keep = row.settings.filter((s) => !/^(not null|null|default:|note:)/i.test(s));
    const st = [...keep];
    const fieldPk = keep.includes('pk');
    if (p.notNull && !fieldPk) st.push('not null');
    if (has(p.def)) st.push(`default: ${fmtDefault(p.def)}`);
    st.push(noteSetting(p.logical, p.note));
    lines[row.i] = buildFieldLine(name, type, st);
    const changed = [];
    if (name !== p.column) {
      // 같은 테이블 인덱스와 관계(Ref)의 이름도 바꿈
      const ib = indexBlock(lines, b);
      if (ib) for (let i = ib.start + 1; i < ib.end; i++) {
        const sp = lines[i].indexOf(' [');
        const head = sp > 0 ? lines[i].slice(0, sp) : lines[i];
        const nh = head.replace(new RegExp(`\\b${re(p.column)}\\b`, 'g'), name);
        if (nh !== head) {
          // 자동으로 지은 인덱스 이름(ix_테이블_컬럼)에 들어 있는 옛 컬럼 이름도 바꿈
          const rest = (sp > 0 ? lines[i].slice(sp) : '').replace(/name: '([^']*)'/, (m0, n) => `name: '${n.replace(new RegExp(`(^|_)${re(p.column)}(?=_|$)`, 'g'), `$1${name}`).slice(0, 64)}'`);
          lines[i] = nh + rest;
          changed.push('인덱스');
        }
      }
      refLineIdx(lines).forEach((i) => {
        const nl = lines[i].replace(new RegExp(tokSrc(p.table, p.column), 'g'), (m0, pre) => `${pre}${p.table}.${name}`);
        if (nl !== lines[i]) { lines[i] = nl; changed.push('관계'); }
      });
      if (isPk) changed.push('PK');
    }
    return `${p.table}.${name} 컬럼을 수정했습니다${changed.length ? ` (이름 변경을 함께 반영: ${[...new Set(changed)].join('·')})` : ''}`;
  },
  'column/delete'(lines, S, p) {
    const t = tableOf(S, p.table);
    fieldOf(t, p.column);
    if (pkCols(t).includes(p.column)) fail(`${p.column}은(는) PK라 지울 수 없습니다. 먼저 [PK 변경]으로 PK에서 빼 주세요`);
    const used = refsOf(S).filter((r) => r.parent === p.table && r.pcol === p.column && !(r.child === p.table && r.ccol === p.column));
    if (used.length) fail(`다른 테이블이 이 컬럼을 참조하고 있어 지울 수 없습니다: ${used.map((r) => `${r.child}.${r.ccol}`).join(', ')}`);
    const multi = (t.indexes || []).filter((i) => !i.pk && i.columns.length > 1 && i.columns.some((c) => c.value === p.column));
    if (multi.length) fail(`복합 인덱스에 들어 있어 지울 수 없습니다: ${multi.map((i) => i.name || '(이름 없음)').join(', ')}. 인덱스를 먼저 지워 주세요`);
    const b = mustBlock(lines, 'Table', p.table);
    const removed = [];
    for (let i = b.end - 1; i > b.start; i--) {
      if (fieldLine(lines[i]) === p.column) { lines.splice(i, 1); continue; }
      const ix = parseIndexLine(lines[i]);
      if (ix && !ix.pk && ix.cols.length === 1 && ix.cols[0] === p.column) { lines.splice(i, 1); removed.push('인덱스'); }
    }
    dropEmptyIndexBlock(lines, p.table);
    for (let i = lines.length - 1; i >= 0; i--) if (/^Ref\b/.test(lines[i]) && tok(p.table, p.column).test(lines[i])) { lines.splice(i, 1); removed.push('관계'); }
    return `${p.table}.${p.column} 컬럼을 삭제했습니다${removed.length ? ` (함께 정리: ${[...new Set(removed)].join('·')})` : ''}`;
  },

  // PK --------------------------------------------------------------
  'pk/set'(lines, S, p) {
    const t = tableOf(S, p.table);
    const cols = (p.columns || []).map(String);
    if (!cols.length) fail('PK로 쓸 컬럼을 하나 이상 골라 주세요');
    cols.forEach((c) => fieldOf(t, c));
    const bad = cols.filter((c) => AUDIT_TAIL.includes(c));
    if (bad.length) fail(`시간·감사 컬럼은 PK로 쓸 수 없습니다: ${bad.join(', ')}`);
    // 이 테이블의 PK를 가리키던 FK가 계속 유효한지 (단일 PK나 UNIQUE여야 함)
    const lost = refsOf(S).filter((r) => r.parent === p.table && r.child !== p.table)
      .filter((r) => !(cols.length === 1 && cols[0] === r.pcol) && !t.fields.find((f) => f.name === r.pcol && f.unique)
        && !(t.indexes || []).some((i) => i.unique && !i.pk && i.columns.length === 1 && i.columns[0].value === r.pcol));
    if (lost.length) fail(`다른 테이블이 지금 PK를 참조하고 있어 바꿀 수 없습니다: ${[...new Set(lost.map((r) => `${r.child}.${r.ccol} → ${r.parent}.${r.pcol}`))].join(', ')}`);
    const b = mustBlock(lines, 'Table', p.table);
    const composite = cols.length > 1;
    fieldLines(lines, b).forEach((row) => {
      let st = row.settings.filter((s) => s !== 'pk');
      const inPk = cols.includes(row.name);
      const wasPk = row.settings.includes('pk');
      if (inPk && !composite) st = ['pk', ...st.filter((s) => !/^(not null|null)$/i.test(s))];
      else if (inPk && composite && !st.some((s) => /^not null$/i.test(s))) st = ['not null', ...st];
      else if (wasPk && !inPk && !st.some((s) => /^not null$/i.test(s))) st = ['not null', ...st]; // PK에서 빠져도 값은 필수로 유지
      lines[row.i] = buildFieldLine(row.name, row.type, st);
    });
    // 기존 복합 PK 인덱스 줄 제거 후 새로
    let ib = indexBlock(lines, b);
    if (ib) for (let i = ib.end - 1; i > ib.start; i--) { const ix = parseIndexLine(lines[i]); if (ix && ix.pk) lines.splice(i, 1); }
    if (composite) {
      ib = ensureIndexBlock(lines, mustBlock(lines, 'Table', p.table));
      lines.splice(ib.start + 1, 0, `    (${cols.join(', ')}) [pk${has(p.note) ? `, note: '${q(String(p.note).trim())}'` : ''}]`);
    }
    dropEmptyIndexBlock(lines, p.table);
    return `${p.table}의 PK를 (${cols.join(', ')})(으)로 바꿨습니다${composite ? ' (복합 PK)' : ''}`;
  },

  // 인덱스 ----------------------------------------------------------
  'index/add'(lines, S, p) {
    const t = tableOf(S, p.table);
    const cols = (p.columns || []).map(String);
    if (!cols.length) fail('인덱스에 넣을 컬럼을 하나 이상 골라 주세요');
    cols.forEach((c) => fieldOf(t, c));
    const unique = p.kind === 'unique';
    const name = has(p.name) ? String(p.name).trim() : idxName(unique ? 'uk' : 'ix', p.table, cols);
    if (!/^(uk|ix)_[a-z0-9_]+$/.test(name) || name.length > 64) fail(`인덱스 이름은 ${unique ? 'uk_' : 'ix_'}로 시작하는 소문자 snake_case(64자 이하)여야 합니다: ${name}`);
    if (unique !== name.startsWith('uk_')) fail(`UNIQUE 인덱스는 uk_, 일반 인덱스는 ix_로 시작해야 합니다: ${name}`);
    if (S.tables.some((x) => (x.indexes || []).some((i) => i.name === name))) fail(`같은 이름의 인덱스가 이미 있습니다: ${name}`);
    const same = (t.indexes || []).find((i) => i.columns.map((c) => c.value).join(',') === cols.join(','));
    if (same) fail(`같은 컬럼 조합의 인덱스가 이미 있습니다: ${same.pk ? 'PK' : same.name}`);
    const b = mustBlock(lines, 'Table', p.table);
    const ib = ensureIndexBlock(lines, b);
    const head = cols.length > 1 ? `(${cols.join(', ')})` : cols[0];
    const st = [...(unique ? ['unique'] : []), `name: '${name}'`, ...(has(p.note) ? [`note: '${q(String(p.note).trim())}'`] : [])];
    lines.splice(ib.end, 0, `    ${head} [${st.join(', ')}]`);
    return `${p.table}에 ${unique ? 'UNIQUE ' : ''}인덱스 ${name}을(를) 추가했습니다`;
  },
  'index/delete'(lines, S, p) {
    tableOf(S, p.table);
    const b = mustBlock(lines, 'Table', p.table);
    const ib = indexBlock(lines, b) || fail(`${p.table}에 인덱스가 없습니다`);
    let hit = -1;
    for (let i = ib.start + 1; i < ib.end; i++) { const ix = parseIndexLine(lines[i]); if (ix && !ix.pk && ix.name === p.name) hit = i; }
    if (hit < 0) fail(`인덱스를 찾지 못했습니다: ${p.name} (PK는 [PK 변경]으로)`);
    lines.splice(hit, 1);
    dropEmptyIndexBlock(lines, p.table);
    return `${p.table}의 인덱스 ${p.name}을(를) 삭제했습니다`;
  },

  // 관계(FK) --------------------------------------------------------
  'ref/add'(lines, S, p) {
    const ct = tableOf(S, p.table), cf = fieldOf(ct, p.column);
    const pt = tableOf(S, p.parent), pf = fieldOf(pt, p.parentColumn);
    if (p.table === p.parent && p.column === p.parentColumn) fail('자기 자신을 가리킬 수 없습니다');
    if (typeOf(cf) !== typeOf(pf)) fail(`타입이 다릅니다: ${p.table}.${p.column} ${typeOf(cf)} ↔ ${p.parent}.${p.parentColumn} ${typeOf(pf)}. FK는 같은 타입이어야 합니다`);
    if (!isKey(pt, p.parentColumn)) fail(`${p.parent}.${p.parentColumn}은(는) PK(단일)나 UNIQUE가 아니라 FK가 가리킬 수 없습니다`);
    const refs = refsOf(S);
    if (refs.some((r) => r.child === p.table && r.ccol === p.column)) fail(`${p.table}.${p.column}에는 이미 관계가 있습니다. 먼저 지워 주세요`);
    const rel = p.rel === '1:1' ? '-' : '>';
    const onDel = { cascade: 'cascade', 'set null': 'set null', restrict: 'restrict' }[p.onDelete] || '';
    if (onDel === 'set null' && (cf.not_null || pkCols(ct).includes(p.column))) fail('ON DELETE SET NULL은 NULL을 허용하는 컬럼에만 쓸 수 있습니다');
    const line = `Ref: ${p.table}.${p.column} ${rel} ${p.parent}.${p.parentColumn}${onDel ? ` [delete: ${onDel}]` : ''}`;
    const ri = refLineIdx(lines);
    let at;
    if (ri.length) at = ri[ri.length - 1] + 1;
    else {
      const h = lines.findIndex((l) => /^\/\/ 관계/.test(l));
      if (h < 0) fail('관계 구역(// 관계)을 찾지 못했습니다');
      at = h + 2;
      lines.splice(at, 0, '');
      at++;
    }
    lines.splice(at, 0, line);
    let extra = '';
    if (p.addIndex && !isLeading(ct, p.column)) {
      const name = idxName('ix', p.table, [p.column]);
      const ib = ensureIndexBlock(lines, mustBlock(lines, 'Table', p.table));
      lines.splice(ib.end, 0, `    ${p.column} [name: '${name}', note: 'FK 인덱스']`);
      extra = ` (FK 인덱스 ${name}도 추가)`;
    }
    return `관계를 추가했습니다: ${p.table}.${p.column} → ${p.parent}.${p.parentColumn}${extra}`;
  },
  'ref/delete'(lines, S, p) {
    const r = refsOf(S).find((x) => x.child === p.table && x.ccol === p.column) || fail(`관계를 찾지 못했습니다: ${p.table}.${p.column}`);
    const a = tok(r.child, r.ccol), b = tok(r.parent, r.pcol);
    const i = lines.findIndex((l) => /^Ref\b/.test(l) && a.test(l) && b.test(l));
    if (i < 0) fail('Ref 줄을 찾지 못했습니다 (컬럼 설정 안에 ref가 있으면 채팅으로 요청해 주세요)');
    lines.splice(i, 1);
    return `관계를 삭제했습니다: ${r.child}.${r.ccol} → ${r.parent}.${r.pcol} (FK 인덱스는 남겨 둠)`;
  },

  // 테이블 ----------------------------------------------------------
  'table/add'(lines, S, p) {
    const g = S.tableGroups.find((x) => x.name === p.group) || fail(`묶음이 없습니다: ${p.group}`);
    if (S.tables.some((x) => x.name === p.name)) fail(`이미 ${p.name} 테이블이 있습니다`);
    const rest = rowsToPks(S, p);
    const body = tableBlock(p);
    const last = g.tables.map((x) => block(lines, 'Table', x.name)).filter(Boolean).sort((a, b) => b.end - a.end)[0];
    const at = last ? last.end + 1 : relHeader(lines);
    lines.splice(at, 0, '', ...body);
    const gb = mustBlock(lines, 'TableGroup', p.group);
    lines.splice(gb.end, 0, `  ${p.name}`);
    const more = finishRows(lines, p.name, rest);
    return `${p.name} 테이블을 ${p.group} 묶음에 추가했습니다${more}`;
  },
  'table/delete'(lines, S, p) {
    tableOf(S, p.table);
    const used = refsOf(S).filter((r) => r.parent === p.table && r.child !== p.table);
    if (used.length) fail(`다른 테이블이 이 테이블을 참조하고 있어 지울 수 없습니다: ${[...new Set(used.map((r) => `${r.child}.${r.ccol}`))].join(', ')}`);
    const b = mustBlock(lines, 'Table', p.table);
    lines.splice(b.start, b.end - b.start + 1);
    const t2 = new RegExp(`(^|[\\s(])${re(p.table)}\\.`);
    for (let i = lines.length - 1; i >= 0; i--) if (/^Ref\b/.test(lines[i]) && t2.test(lines[i])) lines.splice(i, 1);
    let emptied = '';
    S.tableGroups.filter((g) => g.tables.some((x) => x.name === p.table)).forEach((g) => {
      const gb = mustBlock(lines, 'TableGroup', g.name);
      for (let i = gb.end - 1; i > gb.start; i--) if (lines[i].trim() === p.table) lines.splice(i, 1);
      const gb2 = mustBlock(lines, 'TableGroup', g.name);
      if (gb2.end === gb2.start + 1) { lines.splice(gb2.start, 2); emptied = g.name; }
    });
    return `${p.table} 테이블을 삭제했습니다${emptied ? ` (비어 버린 묶음 ${emptied}도 삭제)` : ''}`;
  },

  // 묶음 (TableGroup) -----------------------------------------------
  'group/add'(lines, S, p) {
    const areas = loadAreas();
    const area = areas.find((a) => a.prefix === p.area) || fail(`영역이 없습니다: ${p.area}`);
    const name = String(p.groupName || '').trim();
    if (!new RegExp(`^${area.prefix}_[a-z0-9_]+$`).test(name)) fail(`묶음 이름은 ${area.prefix}_ 로 시작하는 소문자 snake_case여야 합니다 (예: ${area.prefix}_basic): ${name || '(비어 있음)'}`);
    if (S.tableGroups.some((g) => g.name === name)) fail(`이미 ${name} 묶음이 있습니다`);
    if (!has(p.groupTitle) || /['[\]]/.test(p.groupTitle)) fail('묶음 이름(한글)을 적어 주세요 (작은따옴표·대괄호 불가)');
    if (S.tables.some((x) => x.name === p.name)) fail(`이미 ${p.name} 테이블이 있습니다`);
    const title = String(p.groupTitle).trim();
    const rest = rowsToPks(S, p);
    const body = tableBlock(p); // 묶음은 테이블이 있어야 그릴 수 있어서 첫 테이블을 같이 만듦
    // 같은 영역의 마지막 묶음 테이블 뒤, 없으면 관계 구역 앞
    const sameArea = S.tableGroups.filter((g) => g.name.startsWith(area.prefix + '_'));
    const ends = sameArea.flatMap((g) => g.tables.map((x) => block(lines, 'Table', x.name))).filter(Boolean).sort((a, b) => b.end - a.end);
    const at = ends.length ? ends[0].end + 1 : relHeader(lines);
    const bar = '// ' + '='.repeat(69);
    lines.splice(at, 0, '', bar, `// ${area.name} - ${title}`, bar, '', ...body);
    // TableGroup: 같은 영역 마지막 묶음 뒤, 없으면 파일 끝
    const gl = [`TableGroup ${name} [note: '${area.name} - ${q(title)}'] {`, `  ${p.name}`, '}'];
    const lastG = sameArea.map((g) => block(lines, 'TableGroup', g.name)).filter(Boolean).sort((a, b) => b.end - a.end)[0];
    if (lastG) lines.splice(lastG.end + 1, 0, '', ...gl);
    else { while (lines.length && lines[lines.length - 1].trim() === '') lines.pop(); lines.push('', ...gl, ''); }
    if (has(p.groupDesc)) pendingDesc = { name, desc: String(p.groupDesc).trim() };
    const more = finishRows(lines, p.name, rest);
    return `${area.name} 영역에 묶음 ${name}(${title})을(를) 만들고 ${p.name} 테이블을 넣었습니다${more}`;
  },
};
let pendingDesc = null; // 묶음 설명은 dbml이 아니라 lib.js groupDesc에 (저장 성공 후 기록)
function relHeader(lines) {
  const h = lines.findIndex((l) => /^\/\/ 관계/.test(l));
  if (h < 1) fail('관계 구역(// 관계)을 찾지 못했습니다');
  return h - 1; // ==== 줄 앞
}
function loadAreas() {
  const src = fs.readFileSync(LIB, 'utf8');
  const out = [];
  for (const m of src.matchAll(/\{\s*prefix:\s*'([a-z]+)',\s*name:\s*'([^']+)'/g)) out.push({ prefix: m[1], name: m[2] });
  return out;
}
function writeGroupDesc({ name, desc }) {
  if (!WRITE_LIB) return;
  const src = fs.readFileSync(LIB, 'utf8');
  if (new RegExp(`^  ${re(name)}:`, 'm').test(src)) return;
  const out = src.replace(/^const groupDesc = \{\r?\n/m, (m0) => `${m0}  ${name}: '${desc.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}',\n`);
  if (out !== src) fs.writeFileSync(LIB, out, 'utf8');
}

// ---------- 줄(row) 단위 빠른 입력: 논리명·물리명·키 ----------
const DEFAULT_TYPE = 'varchar(50)', DEFAULT_PK_TYPE = 'varchar(20)';
const KEYS = ['', 'PK', 'FK', 'PK+FK', 'UK'];
const isPkKey = (k) => k === 'PK' || k === 'PK+FK';
const isFkKey = (k) => k === 'FK' || k === 'PK+FK';
// 고친 줄로 다시 파싱해서 다른 동작을 이어서 실행
const runOp = (lines, op, p) => ops[op](lines, parse(lines.join('\n')), p);
// 입력 줄 검사 + 타입 채우기 (FK는 부모 PK 타입, PK는 varchar(20), 나머지 varchar(50))
function prepRows(S, rows, table, existing) {
  const seen = new Set(existing || []);
  return (Array.isArray(rows) ? rows : []).filter((r) => r && (has(r.name) || has(r.logical))).map((r, i) => {
    const n = `${i + 1}번째 줄`;
    const row = { name: String(r.name || '').trim(), logical: String(r.logical || '').trim(), key: KEYS.includes(r.key) ? r.key : '',
      parent: String(r.parent || '').trim(), note: r.note, notNull: !!r.notNull };
    try { checkLogical('컬럼', row.logical); checkName('컬럼', row.name); } catch (e) { fail(`${n}: ${e.message}`); }
    if (seen.has(row.name)) fail(`${n}: 컬럼 이름이 겹칩니다: ${row.name}`);
    seen.add(row.name);
    if (AUDIT_TAIL.includes(row.name)) fail(`${n}: ${row.name}은(는) 자동으로 들어가거나 끝에 두는 시간·감사 컬럼입니다`);
    let parentType = null;
    if (isFkKey(row.key)) {
      if (!has(row.parent)) fail(`${n}: FK는 참조할 테이블을 골라야 합니다`);
      if (row.parent === table) fail(`${n}: 자기 테이블 참조는 테이블을 만든 뒤 [+ FK]로 걸어 주세요`);
      const pt = S.tables.find((x) => x.name === row.parent) || fail(`${n}: 참조할 테이블이 없습니다: ${row.parent}`);
      const pk = pkCols(pt);
      if (pk.length !== 1) fail(`${n}: ${row.parent}의 PK가 ${pk.length ? '복합' : '없음'}이라 이 줄로는 FK를 걸 수 없습니다 (채팅으로 요청)`);
      row.parentColumn = pk[0];
      parentType = typeOf(fieldOf(pt, pk[0]));
    }
    try {
      row.type = has(r.type) ? normType(r.type) : parentType || (isPkKey(row.key) ? DEFAULT_PK_TYPE : DEFAULT_TYPE);
    } catch (e) { fail(`${n}: ${e.message}`); }
    if (parentType && row.type !== parentType) fail(`${n}: FK 타입은 부모(${row.parent}.${row.parentColumn})와 같아야 합니다: ${parentType} (타입 칸을 비우면 자동)`);
    return row;
  });
}
// 테이블·묶음 추가: 줄 중 PK를 p.pks로 옮기고 나머지 줄을 돌려줌
function rowsToPks(S, p) {
  if (!Array.isArray(p.rows)) return [];
  checkName('테이블', p.name);
  const rows = prepRows(S, p.rows, p.name, []);
  const pkRows = rows.filter((r) => isPkKey(r.key));
  if (!pkRows.length) fail('PK 컬럼이 하나 이상 있어야 합니다 (키 칸에서 PK 선택)');
  p.pks = pkRows.map((r) => ({ name: r.name, type: r.type, logical: r.logical, note: r.note }));
  return rows.map((r) => (isPkKey(r.key) ? { ...r, pkDone: true } : r));
}
// 컬럼 추가 → PK 반영 → FK → UNIQUE 순서로 처리하고 덧붙일 안내 문구를 돌려줌
function finishRows(lines, table, rows) {
  if (!rows.length) return '';
  const notes = [];
  const t0 = tableOf(parse(lines.join('\n')), table);
  const tail = t0.fields.find((f) => AUDIT_TAIL.includes(f.name));
  rows.filter((r) => !r.pkDone).forEach((r) => runOp(lines, 'column/add', { table, name: r.name, type: r.type, logical: r.logical, note: r.note, notNull: r.notNull || isFkKey(r.key), before: tail ? tail.name : '' }));
  const newPk = rows.filter((r) => isPkKey(r.key) && !r.pkDone).map((r) => r.name);
  if (newPk.length) { runOp(lines, 'pk/set', { table, columns: [...pkCols(t0), ...newPk] }); notes.push('PK'); }
  rows.filter((r) => isFkKey(r.key)).forEach((r) => runOp(lines, 'ref/add', { table, column: r.name, parent: r.parent, parentColumn: r.parentColumn, rel: 'N:1', addIndex: true }));
  if (rows.some((r) => isFkKey(r.key))) notes.push('FK');
  rows.filter((r) => r.key === 'UK').forEach((r) => runOp(lines, 'index/add', { table, kind: 'unique', columns: [r.name] }));
  if (rows.some((r) => r.key === 'UK')) notes.push('UNIQUE');
  return notes.length ? ` (${notes.join('·')} 설정 포함)` : '';
}

function apply(op, p) {
  if (!ops[op]) fail(`알 수 없는 작업: ${op}`);
  const before = fs.readFileSync(SRC, 'utf8');
  const nl = before.includes('\r\n') ? '\r\n' : '\n';
  const S = parse(before);
  const lines = before.split(/\r?\n/);
  pendingDesc = null;
  const msg = ops[op](lines, S, p || {});
  let text = dropBlankRuns(lines).join(nl);
  const S2 = parse(text); // 실패하면 저장하지 않음
  text = syncCount(text, S2.tables.length);
  fs.writeFileSync(SRC, text, 'utf8');
  if (pendingDesc) writeGroupDesc(pendingDesc);
  try { rebuild(); } catch (e) {
    fs.writeFileSync(SRC, before, 'utf8');
    try { rebuild(); } catch (e2) { /* 원본으로도 실패하면 그대로 둠 */ }
    fail(`ERD 생성 중 오류가 나서 되돌렸습니다: ${String(e.stderr || e.message).split('\n').filter(Boolean).slice(-3).join(' / ')}`);
  }
  return msg;
}

// 저장 응답을 빠르게: 편집 화면만 바로 만들고, 공개 페이지·draw.io는 뒤에서 (연달아 저장하면 마지막 것만)
function rebuild() {
  execFileSync(process.execPath, ['erd-page.js', SRC, EDIT_HTML, '--edit'], { cwd: __dirname, stdio: 'pipe' });
  scheduleOutputs();
}
let bgRunning = false, bgAgain = false;
function scheduleOutputs() {
  if (bgRunning) { bgAgain = true; return; }
  bgRunning = true; bgAgain = false;
  execFile(process.execPath, ['erd-page.js', SRC, PUBLIC_HTML], { cwd: __dirname }, (e1) => {
    execFile(process.execPath, ['drawio.js', SRC, DRAWIO], { cwd: __dirname }, (e2) => {
      if (e1 || e2) console.error('공개 페이지·draw.io 생성 실패:', String((e1 || e2).message).split('\n')[0]);
      bgRunning = false;
      if (bgAgain) scheduleOutputs();
    });
  });
}

// ---------- 서버 ----------
const send = (res, code, type, body) => { res.writeHead(code, { 'Content-Type': type, 'Cache-Control': 'no-store' }); res.end(body); };
const server = http.createServer((req, res) => {
  if (req.method === 'GET' && (req.url === '/' || req.url.startsWith('/#') || req.url.startsWith('/?'))) {
    return send(res, 200, 'text/html; charset=utf-8', fs.readFileSync(EDIT_HTML));
  }
  const m = /^\/api\/([a-z]+\/[a-z]+)$/.exec(req.url);
  if (req.method === 'POST' && m) {
    let body = '';
    req.on('data', (c) => { body += c; if (body.length > 1e6) req.destroy(); });
    req.on('end', () => {
      try {
        const msg = apply(m[1], JSON.parse(body || '{}'));
        console.log('저장:', msg);
        send(res, 200, 'application/json; charset=utf-8', JSON.stringify({ ok: true, msg }));
      } catch (e) {
        const user = e instanceof UserError;
        if (!user) console.error(e);
        send(res, user ? 400 : 500, 'application/json; charset=utf-8', JSON.stringify({ ok: false, msg: user ? e.message : `서버 오류: ${e.message}` }));
      }
    });
    return;
  }
  send(res, 404, 'text/plain; charset=utf-8', 'not found');
});

if (require.main === module) {
  try { parse(fs.readFileSync(SRC, 'utf8')); } catch (e) { console.error(e.message); process.exit(1); }
  fs.mkdirSync(path.dirname(EDIT_HTML), { recursive: true });
  execFileSync(process.execPath, ['erd-page.js', SRC, EDIT_HTML, '--edit'], { cwd: __dirname, stdio: 'pipe' });
  server.listen(PORT, '127.0.0.1', () => {
    const url = `http://localhost:${PORT}/`;
    console.log(`ERD 편집 모드: ${url}`);
    console.log(`원본: ${SRC}`);
    console.log('끝내려면 이 창을 닫거나 Ctrl+C. 커밋·푸시는 따로 해야 공개 페이지에 반영됩니다.');
    if (OPEN) exec(process.platform === 'win32' ? `start "" "${url}"` : process.platform === 'darwin' ? `open "${url}"` : `xdg-open "${url}"`);
  });
}
