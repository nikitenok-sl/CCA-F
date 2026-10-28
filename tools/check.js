// Проверяет все наборы перед публикацией: set.json, notes.html и каждый вопрос.
// Сборки нет, сайт читает эти файлы напрямую, поэтому ошибка здесь = сломанный набор на сайте.
// Запуск: node tools/check.js
const fs = require('fs');
const path = require('path');

const SETS = path.join(__dirname, '..', 'sets');
const errors = [];
const err = (where, msg) => errors.push(`${where}: ${msg}`);
const readJSON = (file, where) => {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch (e) { err(where, `не читается JSON (${e.message})`); return null; }
};

const ids = readJSON(path.join(SETS, 'index.json'), 'sets/index.json') || [];
const keys = new Set(), allIds = new Map();
const banks = {};

for (const id of ids) {
  const dir = path.join(SETS, id);
  const set = readJSON(path.join(dir, 'set.json'), `${id}/set.json`);
  if (!set) continue;
  for (const k of ['name', 'blurb', 'title', 'source', 'sub', 'footer', 'storageKey', 'defaultView', 'notesTab', 'progressLabel', 'files', 'requires', 'countNote', 'progress', 'cardSource', 'examRule', 'exam', 'palette'])
    if (set[k] === undefined) err(`${id}/set.json`, `нет поля ${k}`);
  if (keys.has(set.storageKey)) err(`${id}/set.json`, `storageKey ${set.storageKey} уже занят другим набором`);
  keys.add(set.storageKey);
  if (!['practice', 'exam', 'notes'].includes(set.defaultView)) err(`${id}/set.json`, `defaultView=${set.defaultView}`);
  if (set.progress === 'group' && !set.group) err(`${id}/set.json`, 'progress: group без group');
  if (!fs.existsSync(path.join(dir, 'notes.html'))) err(id, 'нет notes.html');

  const qdir = path.join(dir, 'questions');
  const onDisk = fs.existsSync(qdir) ? fs.readdirSync(qdir).filter(f => f.endsWith('.json')) : [];
  for (const f of onDisk) if (!(set.files || []).includes(f)) err(id, `questions/${f} не указан в set.json → files и на сайте не появится`);

  const bank = [];
  for (const f of set.files || []) {
    const items = readJSON(path.join(qdir, f), `${id}/questions/${f}`);
    if (!items) continue;
    for (const q of items) {
      const where = `${id}/${f}:${q.id}`;
      const need = ['id', 'domain', 'task', 'scenario', ...(set.requires || []), 'type', 'select', 'stem', 'options', 'answer', 'explanation_ru', 'why_wrong_ru', 'takeaway_ru'];
      for (const k of need) if (q[k] === undefined || q[k] === '') err(where, `нет поля ${k}`);
      if (allIds.has(q.id)) err(where, `id уже есть в наборе ${allIds.get(q.id)}`);
      allIds.set(q.id, id);
      if (![1, 2, 3, 4, 5].includes(q.domain)) err(where, `domain=${q.domain}`);
      if (![1, 2, 3, 4, 5, 6].includes(q.scenario)) err(where, `scenario=${q.scenario}`);
      if (String(q.task).split('.')[0] !== String(q.domain)) err(where, `task ${q.task} не из домена ${q.domain}`);
      const opts = (q.options || []).map(o => o.key);
      const want = q.type === 'multi' ? 'ABCDE' : 'ABCD';
      if (opts.join('') !== want) err(where, `варианты ${opts.join('')}, ожидалось ${want}`);
      if (!Array.isArray(q.answer) || q.answer.length !== q.select) err(where, `answer не совпадает с select=${q.select}`);
      for (const a of q.answer || []) if (!opts.includes(a)) err(where, `ответ ${a} не среди вариантов`);
      const wrong = opts.filter(k => !(q.answer || []).includes(k)).sort().join('');
      const ww = Object.keys(q.why_wrong_ru || {}).sort().join('');
      if (wrong !== ww) err(where, `why_wrong_ru для ${ww}, а неверные ${wrong}`);
      bank.push(q);
    }
  }
  for (const [size, e] of Object.entries(set.exam || {})) {
    for (const [d, n] of Object.entries(e.per || {}))
      if (bank.filter(q => q.domain === +d).length < n) err(`${id}/set.json`, `exam.${size}: в D${d} меньше ${n} вопросов`);
  }
  banks[id] = bank;
}
// targets ссылаются на вопросы других наборов: проверяем, что такие id есть
for (const [id, bank] of Object.entries(banks))
  for (const q of bank) for (const t of q.targets || []) if (!allIds.has(t)) err(`${id}:${q.id}`, `targets: нет вопроса ${t}`);

for (const [id, bank] of Object.entries(banks)) {
  const by = bank.reduce((m, q) => (m[q.domain] = (m[q.domain] || 0) + 1, m), {});
  console.log(`${id.padEnd(11)} ${String(bank.length).padStart(3)} вопр., multi ${bank.filter(q => q.type === 'multi').length}, по доменам ${JSON.stringify(by)}`);
}
if (errors.length) {
  console.error(`\nОшибки (${errors.length}):\n` + errors.map(e => '  - ' + e).join('\n'));
  process.exit(1);
}
console.log('\nВсё в порядке.');
