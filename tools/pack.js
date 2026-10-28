// Упаковывает наборы из sets/ в data/*.js, чтобы index.html открывался и без сервера (двойным кликом).
// Источник правды остаётся в sets/. data/ править руками не нужно: после любой правки в sets/ запустите этот скрипт.
//   node tools/pack.js           проверить наборы и пересобрать data/
//   node tools/pack.js --check   только проверить, что data/ совпадает с sets/ (код возврата 1, если устарело)
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const SETS = path.join(ROOT, 'sets');
const DATA = path.join(ROOT, 'data');
const checkOnly = process.argv.includes('--check');

// JSON → JS-литерал, безопасный и внутри <script>, и во внешнем файле
const lit = v => JSON.stringify(v).replace(/<\//g, '<\\/').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');

function pack() {
  const ids = JSON.parse(fs.readFileSync(path.join(SETS, 'index.json'), 'utf8'));
  const files = {};
  const manifest = [];
  for (const id of ids) {
    const dir = path.join(SETS, id);
    const set = JSON.parse(fs.readFileSync(path.join(dir, 'set.json'), 'utf8'));
    const bank = set.files.flatMap(f => JSON.parse(fs.readFileSync(path.join(dir, 'questions', f), 'utf8')));
    const notes = fs.readFileSync(path.join(dir, 'notes.html'), 'utf8');
    manifest.push({ id, ...set });
    files[`${id}.js`] = `/* Сгенерировано tools/pack.js из sets/${id}/. Руками не править. */\n(window.CCA = window.CCA || {}).sets = window.CCA.sets || {};\nCCA.sets[${lit(id)}] = ${lit({ bank, notes })};\n`;
  }
  files['manifest.js'] = `/* Сгенерировано tools/pack.js из set.json каждого набора. Руками не править. */\n(window.CCA = window.CCA || {}).manifest = ${lit(manifest)};\n`;
  return files;
}

if (!checkOnly) {
  const r = spawnSync(process.execPath, [path.join(__dirname, 'check.js')], { stdio: 'inherit' });
  if (r.status !== 0) { console.error('\nНаборы с ошибками не упаковываю.'); process.exit(1); }
}

const files = pack();
if (checkOnly) {
  const stale = [];
  for (const [name, content] of Object.entries(files)) {
    const p = path.join(DATA, name);
    if (!fs.existsSync(p) || fs.readFileSync(p, 'utf8') !== content) stale.push(name);
  }
  const extra = fs.existsSync(DATA) ? fs.readdirSync(DATA).filter(f => !(f in files)) : [];
  if (stale.length || extra.length) {
    console.error(`data/ устарела: ${[...stale, ...extra.map(f => f + ' (лишний)')].join(', ')}. Запустите node tools/pack.js`);
    process.exit(1);
  }
  console.log('data/ совпадает с sets/.');
} else {
  fs.mkdirSync(DATA, { recursive: true });
  for (const f of fs.readdirSync(DATA)) if (!(f in files)) fs.unlinkSync(path.join(DATA, f));
  for (const [name, content] of Object.entries(files)) {
    fs.writeFileSync(path.join(DATA, name), content);
    console.log(`data/${name}  ${(Buffer.byteLength(content) / 1024).toFixed(0)} КБ`);
  }
}
