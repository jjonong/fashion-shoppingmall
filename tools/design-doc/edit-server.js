// ERD 로컬 편집 모드: 브라우저에서 테이블·컬럼을 추가/삭제하면 docs/erd.dbml을 바로 고치고 ERD를 다시 만든다.
// - 내 PC에서만 (127.0.0.1). 공개 페이지(GitHub Pages)는 보기 전용 그대로
// - 매 요청마다 파일을 새로 읽어서 고친다 (채팅으로 고친 내용과 섞여도 안전). 문법 검사에 실패하면 저장하지 않음
// - 커밋·푸시는 하지 않는다 (사용자가 하거나 Claude에게 요청)
// 사용: npm run edit   또는 저장소 루트의 편집.bat 더블클릭
//       node edit-server.js [in.dbml] [port] [--no-open]
const fs = require('fs');
const path = require('path');
const http = require('http');
const { execFileSync, exec } = require('child_process');
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

function checkName(kind, name) {
  if (!NAME_RE.test(name || '')) fail(`${kind} 물리명은 영문 소문자로 시작하는 소문자·숫자·밑줄(snake_case)이어야 합니다: ${name || '(비어 있음)'}`);
  if (RESERVED.has(name)) fail(`${name}은(는) MySQL 예약어라 쓸 수 없습니다. 다른 이름으로 지어 주세요 (예: member → member_account)`);
}
function checkLogical(kind, s) {
  if (!s || !s.trim()) fail(`${kind} 논리명(한글 이름)은 꼭 적어야 합니다`);
  if (/[[\]]/.test(s)) fail(`${kind} 논리명에는 [ ] 를 쓸 수 없습니다`);
}
function checkType(type) {
  if (!TYPE_RE.test(type || '')) fail(`타입 형식이 올바르지 않습니다: ${type || '(비어 있음)'} (예: varchar(50), bigint, decimal(10,2), datetime)`);
}

// ---------- DBML 텍스트 ----------
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
// 최상위 블록 (Table / TableGroup): 시작 줄 ~ 첫 번째 0열 '}' 줄
function block(lines, kind, name) {
  const start = lines.findIndex((l) => new RegExp(`^${kind}\\s+${re(name)}(\\s|\\[|\\{|$)`).test(l));
  if (start < 0) return null;
  let end = start;
  while (end < lines.length && lines[end] !== '}') end++;
  if (end >= lines.length) fail(`${kind} ${name} 블록의 끝(})을 찾지 못했습니다`);
  return { start, end };
}
const fieldLine = (l) => { const m = /^ {2}([a-z][a-z0-9_]*)\s+\S/.exec(l); return m && m[1] !== 'indexes' && m[1] !== 'note' ? m[1] : null; };
function fieldLines(lines, b) {
  const out = [];
  let depth = 0;
  for (let i = b.start + 1; i < b.end; i++) {
    const l = lines[i];
    if (/\{\s*$/.test(l)) { depth++; continue; }
    if (/^\s+\}\s*$/.test(l)) { depth--; continue; }
    if (depth === 0) { const f = fieldLine(l); if (f) out.push({ i, name: f }); }
  }
  return out;
}
function fmtDefault(v) {
  v = String(v).trim();
  if (/^-?\d+(\.\d+)?$/.test(v)) return v;
  if (/^(CURRENT_TIMESTAMP|NOW\(\)|true|false|null)$/i.test(v)) return /^(true|false|null)$/i.test(v) ? v.toLowerCase() : `\`${v.toUpperCase()}\``;
  if (/^'.*'$/.test(v)) v = v.slice(1, -1);
  return `'${q(v)}'`;
}
function columnLine({ name, type, logical, note, notNull, def, pk }) {
  const st = [];
  if (pk) st.push('pk');
  if (notNull && !pk) st.push('not null');
  if (def !== undefined && def !== null && String(def).trim() !== '') st.push(`default: ${fmtDefault(def)}`);
  st.push(`note: '[${q(logical.trim())}]${note && note.trim() ? ' ' + q(note.trim()) : ''}'`);
  return `  ${name} ${type} [${st.join(', ')}]`;
}
// 상단 주석 "= N개 테이블" 숫자만 맞춤 (영역별 내역 문장은 Claude 검토 때 정리)
const syncCount = (text, n) => text.replace(/= \d+개 테이블/, `= ${n}개 테이블`);
function dropBlankRuns(lines) { // 빈 줄 2개 이상 → 1개
  return lines.filter((l, i) => !(l.trim() === '' && i > 0 && lines[i - 1].trim() === ''));
}

// ---------- 편집 동작 ----------
const ops = {
  'column/add'(lines, S, p) {
    const t = S.tables.find((x) => x.name === p.table) || fail(`테이블이 없습니다: ${p.table}`);
    checkName('컬럼', p.name);
    checkType(p.type = String(p.type || '').trim().toLowerCase());
    checkLogical('컬럼', p.logical);
    if (t.fields.some((f) => f.name === p.name)) fail(`${p.table}에 이미 ${p.name} 컬럼이 있습니다`);
    const b = block(lines, 'Table', p.table);
    const fl = fieldLines(lines, b);
    let at;
    if (p.before) {
      const f = fl.find((x) => x.name === p.before) || fail(`위치 기준 컬럼이 없습니다: ${p.before}`);
      at = f.i;
    } else {
      const tail = fl.find((x) => AUDIT_TAIL.includes(x.name));
      at = tail ? tail.i : (fl.length ? fl[fl.length - 1].i + 1 : b.start + 1);
    }
    lines.splice(at, 0, columnLine(p));
    return `${p.table}.${p.name} 컬럼을 추가했습니다`;
  },
  'column/delete'(lines, S, p) {
    const t = S.tables.find((x) => x.name === p.table) || fail(`테이블이 없습니다: ${p.table}`);
    const f = t.fields.find((x) => x.name === p.column) || fail(`컬럼이 없습니다: ${p.table}.${p.column}`);
    const cpk = ((t.indexes || []).find((i) => i.pk)?.columns || []).map((c) => c.value);
    if (f.pk || cpk.includes(f.name)) fail(`${p.column}은(는) PK라 여기서 지울 수 없습니다. PK를 바꾸려면 채팅으로 요청해 주세요`);
    const refs = refsOf(S);
    const used = refs.filter((r) => r.parent === p.table && r.pcol === p.column && !(r.child === p.table && r.ccol === p.column));
    if (used.length) fail(`다른 테이블이 이 컬럼을 참조하고 있어 지울 수 없습니다: ${used.map((r) => `${r.child}.${r.ccol}`).join(', ')}`);
    const multi = (t.indexes || []).filter((i) => !i.pk && i.columns.length > 1 && i.columns.some((c) => c.value === p.column));
    if (multi.length) fail(`복합 인덱스에 들어 있어 지울 수 없습니다: ${multi.map((i) => i.name || '(이름 없음)').join(', ')}. 인덱스를 먼저 정리해 주세요(채팅)`);
    const b = block(lines, 'Table', p.table);
    const removed = [];
    // 컬럼 줄 + 단일 컬럼 인덱스 줄
    for (let i = b.end - 1; i > b.start; i--) {
      if (fieldLine(lines[i]) === p.column && !/^ {4}/.test(lines[i])) { lines.splice(i, 1); continue; }
      if (new RegExp(`^ {4}\\(?${re(p.column)}\\)?\\s*(\\[|$)`).test(lines[i])) { lines.splice(i, 1); removed.push('인덱스'); }
    }
    // 비어 버린 indexes { } 블록 제거
    const b2 = block(lines, 'Table', p.table);
    for (let i = b2.start; i < b2.end; i++) {
      if (/^ {2}indexes \{\s*$/.test(lines[i]) && /^ {2}\}\s*$/.test(lines[i + 1])) {
        lines.splice(i, 2);
        if (lines[i - 1] !== undefined && lines[i - 1].trim() === '') lines.splice(i - 1, 1);
        break;
      }
    }
    // 이 컬럼에서 나가는 관계(Ref)
    const tok = new RegExp(`(^|[\\s(])${re(p.table)}\\.${re(p.column)}([\\s)]|$)`);
    for (let i = lines.length - 1; i >= 0; i--) if (/^Ref/.test(lines[i]) && tok.test(lines[i])) { lines.splice(i, 1); removed.push('관계'); }
    return `${p.table}.${p.column} 컬럼을 삭제했습니다${removed.length ? ` (함께 정리: ${[...new Set(removed)].join('·')})` : ''}`;
  },
  'table/add'(lines, S, p) {
    const g = S.tableGroups.find((x) => x.name === p.group) || fail(`묶음이 없습니다: ${p.group}`);
    checkName('테이블', p.name);
    checkLogical('테이블', p.logical);
    if (S.tables.some((x) => x.name === p.name)) fail(`이미 ${p.name} 테이블이 있습니다`);
    checkName('PK 컬럼', p.pkName);
    checkType(p.pkType = String(p.pkType || '').trim().toLowerCase());
    checkLogical('PK 컬럼', p.pkLogical);
    if (AUDIT_TAIL.includes(p.pkName)) fail(`${p.pkName}은(는) 시간·감사 컬럼 이름이라 PK로 쓸 수 없습니다`);
    const lg = p.logical.trim();
    const body = [
      `Table ${p.name} [note: '[${q(lg)}]${p.note && p.note.trim() ? ' ' + q(p.note.trim()) : ''}'] {`,
      columnLine({ name: p.pkName, type: p.pkType, logical: p.pkLogical, note: p.pkNote, pk: true }),
      `  created_at datetime [not null, default: \`CURRENT_TIMESTAMP\`, note: '[등록일시] ${q(lg)} 등록일시']`,
      `  updated_at datetime [note: '[수정일시] ${q(lg)} 수정일시']`,
      '}',
    ];
    // 위치: 같은 묶음의 마지막 테이블 뒤
    const last = g.tables.map((x) => block(lines, 'Table', x.name)).filter(Boolean).sort((a, b) => b.end - a.end)[0];
    const at = last ? last.end + 1 : lines.findIndex((l) => /^\/\/ 관계/.test(l)) - 1;
    lines.splice(at, 0, '', ...body);
    const gb = block(lines, 'TableGroup', p.group);
    lines.splice(gb.end, 0, `  ${p.name}`);
    return `${p.name} 테이블을 ${p.group} 묶음에 추가했습니다 (등록일시·수정일시 자동 포함)`;
  },
  'table/delete'(lines, S, p) {
    S.tables.find((x) => x.name === p.table) || fail(`테이블이 없습니다: ${p.table}`);
    const used = refsOf(S).filter((r) => r.parent === p.table && r.child !== p.table);
    if (used.length) fail(`다른 테이블이 이 테이블을 참조하고 있어 지울 수 없습니다: ${[...new Set(used.map((r) => `${r.child}.${r.ccol}`))].join(', ')}`);
    const b = block(lines, 'Table', p.table);
    lines.splice(b.start, b.end - b.start + 1);
    const tok = new RegExp(`(^|[\\s(])${re(p.table)}\\.`);
    for (let i = lines.length - 1; i >= 0; i--) if (/^Ref/.test(lines[i]) && tok.test(lines[i])) lines.splice(i, 1);
    let emptied = '';
    S.tableGroups.filter((g) => g.tables.some((x) => x.name === p.table)).forEach((g) => {
      const gb = block(lines, 'TableGroup', g.name);
      for (let i = gb.end - 1; i > gb.start; i--) if (lines[i].trim() === p.table) lines.splice(i, 1);
      const gb2 = block(lines, 'TableGroup', g.name);
      if (gb2.end === gb2.start + 1) { lines.splice(gb2.start, 2); emptied = g.name; }
    });
    return `${p.table} 테이블을 삭제했습니다${emptied ? ` (비어 버린 묶음 ${emptied}도 삭제)` : ''}`;
  },
};

function apply(op, p) {
  const before = fs.readFileSync(SRC, 'utf8');
  const nl = before.includes('\r\n') ? '\r\n' : '\n';
  const S = parse(before);
  const lines = before.split(/\r?\n/);
  const msg = ops[op](lines, S, p || {});
  let text = dropBlankRuns(lines).join(nl);
  const S2 = parse(text); // 실패하면 저장하지 않음
  text = syncCount(text, S2.tables.length);
  fs.writeFileSync(SRC, text, 'utf8');
  try { rebuild(); } catch (e) { fs.writeFileSync(SRC, before, 'utf8'); rebuild(); fail(`ERD 생성 중 오류가 나서 되돌렸습니다: ${e.message}`); }
  return msg;
}

function rebuild() {
  const run = (...a) => execFileSync(process.execPath, a, { cwd: __dirname, stdio: 'pipe' });
  run('erd-page.js', SRC, EDIT_HTML, '--edit');
  run('erd-page.js', SRC, PUBLIC_HTML);
  run('drawio.js', SRC, DRAWIO);
}

// ---------- 서버 ----------
const send = (res, code, type, body) => { res.writeHead(code, { 'Content-Type': type, 'Cache-Control': 'no-store' }); res.end(body); };
const server = http.createServer((req, res) => {
  if (req.method === 'GET' && (req.url === '/' || req.url.startsWith('/#') || req.url.startsWith('/?'))) {
    return send(res, 200, 'text/html; charset=utf-8', fs.readFileSync(EDIT_HTML));
  }
  const m = /^\/api\/(column|table)\/(add|delete)$/.exec(req.url);
  if (req.method === 'POST' && m) {
    let body = '';
    req.on('data', (c) => { body += c; if (body.length > 1e6) req.destroy(); });
    req.on('end', () => {
      try {
        const msg = apply(`${m[1]}/${m[2]}`, JSON.parse(body || '{}'));
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
