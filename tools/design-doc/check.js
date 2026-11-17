// DBML 문법 검증 (dbdiagram.io와 같은 파서). 사용: npm run check  또는  node check.js <in.dbml>
const fs = require('fs');
const path = require('path');
const { Parser } = require('@dbml/core');

const src = process.argv[2] || path.resolve(__dirname, '..', '..', 'docs', 'erd.dbml');
try {
  const s = new Parser().parse(fs.readFileSync(src, 'utf8'), 'dbmlv2').schemas[0];
  console.log(`OK tables=${s.tables.length} refs=${s.refs.length} groups=${s.tableGroups.length}`);
} catch (e) {
  console.error('ERROR');
  console.error(JSON.stringify(e.diags ? e.diags.map((d) => ({ msg: d.message, loc: d.location })) : String(e), null, 1));
  process.exit(1);
}
