/* Тренажёр CCAR-F: один движок для всех наборов.
   Источник правды — sets/<id>/ (set.json, notes.html, questions/*.json), список наборов — sets/index.json.
   Страница читает не их, а упакованные data/*.js: так она открывается и двойным кликом, без сервера.
   Упаковка: node tools/pack.js. Адрес: #<набор>/<practice|exam|notes>. */

const DOMAINS = {
  1:{code:'D1',short:'Агенты',name:'Агентная архитектура и оркестрация',w:27,n:16},
  2:{code:'D2',short:'Tools и MCP',name:'Дизайн инструментов и MCP',w:18,n:11},
  3:{code:'D3',short:'Claude Code',name:'Конфигурация Claude Code',w:20,n:12},
  4:{code:'D4',short:'Промпты',name:'Промпты и структурированный вывод',w:20,n:12},
  5:{code:'D5',short:'Контекст',name:'Контекст и надёжность',w:15,n:9}
};
const SCENARIOS = {
  1:{en:'Customer Support Resolution Agent',ru:'Агент поддержки клиентов',d:[1,2,5],text:'You are building a customer support resolution agent using the Claude Agent SDK. The agent handles high-ambiguity requests like returns, billing disputes, and account issues. It has access to your backend systems through custom Model Context Protocol (MCP) tools (get_customer, lookup_order, process_refund, escalate_to_human). Your target is 80%+ first-contact resolution while knowing when to escalate.'},
  2:{en:'Code Generation with Claude Code',ru:'Генерация кода в Claude Code',d:[3,5],text:'You are using Claude Code to accelerate software development. Your team uses it for code generation, refactoring, debugging, and documentation. You need to integrate it into your development workflow with custom slash commands, CLAUDE.md configurations, and understand when to use plan mode vs direct execution.'},
  3:{en:'Multi-Agent Research System',ru:'Мультиагентная исследовательская система',d:[1,2,5],text:'You are building a multi-agent research system using the Claude Agent SDK. A coordinator agent delegates to specialized subagents: one searches the web, one analyzes documents, one synthesizes findings, and one generates reports. The system researches topics and produces comprehensive, cited reports.'},
  4:{en:'Developer Productivity with Claude',ru:'Инструменты продуктивности разработчиков',d:[2,3,1],text:'You are building developer productivity tools using the Claude Agent SDK. The agent helps engineers explore unfamiliar codebases, understand legacy systems, generate boilerplate code, and automate repetitive tasks. It uses the built-in tools (Read, Write, Bash, Grep, Glob) and integrates with Model Context Protocol (MCP) servers.'},
  5:{en:'Claude Code for Continuous Integration',ru:'Claude Code в CI/CD',d:[3,4],text:'You are integrating Claude Code into your Continuous Integration/Continuous Deployment (CI/CD) pipeline. The system runs automated code reviews, generates test cases, and provides feedback on pull requests. You need to design prompts that provide actionable feedback and minimize false positives.'},
  6:{en:'Structured Data Extraction',ru:'Извлечение структурированных данных',d:[4,5],text:'You are building a structured data extraction system using Claude. The system extracts information from unstructured documents, validates the output using JavaScript Object Notation (JSON) schemas, and maintains high accuracy. It must handle edge cases gracefully and integrate with downstream systems.'}
};
const CUT = 72;
const VIEWS = ['practice', 'exam', 'notes'];
const LAST_SET = 'ccarf.site.set';

const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
const escA = s => esc(s).replace(/"/g, '&quot;');
const CODE_RE = new RegExp([
  String.raw`\b(?:isError|isRetryable|errorCategory|allowedTools|AgentDefinition|PostToolUse|PreToolUse|allowed-tools|argument-hint)\b`,
  String.raw`context: fork`,
  String.raw`\$\{[A-Z_]+\}`,
  String.raw`(?<![\w\/.])\/(?:memory|compact|review|init|clear)\b`,
  String.raw`(?<![\w.\/-])[\w.\-*\/~]*[\w*]\.(?:md|json|tsx|ts|jsx|js|py|ya?ml|toml)\b`,
  String.raw`(?<![\w.\/])(?:~\/\.?|\*\*\/|\.)[\w\-*]+(?:[\w.\-*\/]*[\w*\/])?`,
  String.raw`(?<![\w.\/])[a-z][\w\-]*\/(?:[\w\-]+\/)*\*[\w.*\/]*`,
  String.raw`(?<![\w.\/])[a-z][\w\-]*\/(?:[\w\-]+\/)+`,
  String.raw`\b[a-z][a-z0-9]*(?:_[a-z0-9]+)+\b`,
  String.raw`(?<![\w\-])--?[a-z](?:[a-z\-]*[a-z])?\b`
].join('|'), 'g');
function fmt(t){
  return String(t ?? '').split('`').map((seg, i) => i % 2 ? `<code>${esc(seg)}</code>` : esc(seg).replace(CODE_RE, m => `<code>${m}</code>`)).join('');
}
const same = (a, b) => a.length === b.length && a.every(x => b.includes(x));
function shuffle(a){ for(let i = a.length - 1; i > 0; i--){ const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
const byDefault = (a, b) => a.domain - b.domain || parseFloat(a.task) - parseFloat(b.task) || (b.official ? 1 : 0) - (a.official ? 1 : 0) || a.id.localeCompare(b.id);
// {name} в тексте из set.json: vars — уже экранированные значения
const fill = (text, vars) => esc(text).replace(/\{(\w+)\}/g, (m, k) => k in vars ? vars[k] : m);

function lsGet(k){ try { return localStorage.getItem(k); } catch(e){ return null; } }
function lsSet(k, v){ try { localStorage.setItem(k, v); } catch(e){} }
function lsDel(k){ try { localStorage.removeItem(k); } catch(e){} }

/* ---------- текущий набор ---------- */
let SETS = [];
window.CCA = window.CCA || {};
CCA.sets = CCA.sets || {};
let SET = null, BANK = [], BYID = {}, DB = null, openToken = 0;
const freshFilters = () => ({domain:0, scenario:0, wrong:false, flag:false, group:'', shuffle:false});
const S = {
  resetAllAsk: false,
  view: 'practice',
  f: freshFilters(),
  p: {list:[], idx:0, ans:{}},
  examView: 'run',
  confirm: false,
  resetAsk: false
};
function load(){ try { return JSON.parse(lsGet(SET.storageKey)) || {}; } catch(e){ return {}; } }
function save(){ lsSet(SET.storageKey, JSON.stringify(DB)); renderResetAll(); }

function loadScript(src){
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src; s.onload = resolve;
    s.onerror = () => reject(new Error(`Не удалось загрузить ${src}`));
    document.head.appendChild(s);
  });
}
// data/<id>.js кладёт {bank, notes} в CCA.sets[id]. В автономной сборке (tools/bundle.js) все наборы уже на странице.
async function loadSet(id){
  if (!CCA.sets[id]) await loadScript(`data/${id}.js`);
  if (!CCA.sets[id]) throw new Error(`data/${id}.js не содержит набор ${id}`);
  return CCA.sets[id];
}

/* ---------- shared pieces ---------- */
function cardSource(q){
  if (SET.flag && q[SET.flag.field] && SET.cardSourceFlag) return esc(SET.cardSourceFlag);
  const vars = {};
  for (const [k, v] of Object.entries(q)) vars[k] = esc(Array.isArray(v) ? v.join(', ') : v);
  return fill(SET.cardSource, vars);
}
function cardHTML(q, o){
  // o: {num, total, sel, reveal, showMeta}
  const sc = SCENARIOS[q.scenario];
  const right = new Set(q.answer);
  const meta = [
    `<span class="num">Вопрос ${o.num} / ${o.total}</span>`,
    o.showMeta ? `<span>${DOMAINS[q.domain].code} · ${esc(DOMAINS[q.domain].short)}</span><span>Task ${esc(q.task)}</span>` : '',
    q.official && o.showMeta ? `<span class="badge">Официальный пример</span>` : ''
  ].join('');
  const opts = q.options.map(op => {
    const sel = o.sel.includes(op.key), ok = right.has(op.key);
    let cls = 'opt' + (sel ? ' sel' : '');
    let tag = '', why = '';
    if (o.reveal){
      if (ok){ cls += ' right'; tag = `<span class="tag ok">${sel ? '✓ ваш выбор, верно' : '✓ верный'}</span>`; }
      else if (sel){ cls += ' wrong'; tag = `<span class="tag bad">✗ ваш выбор</span>`; }
      if (!ok && q.why_wrong_ru && q.why_wrong_ru[op.key]) why = `<span class="why" lang="ru">${fmt(q.why_wrong_ru[op.key])}</span>`;
    }
    return `<li><button type="button" class="${cls}" data-key="${op.key}" aria-pressed="${sel}"${o.reveal ? ' aria-disabled="true"' : ''}><span class="bub">${op.key}</span><span class="otext"><span lang="en">${fmt(op.text)}</span>${tag}${why}</span></button></li>`;
  }).join('');
  const instr = q.select > 1 ? `Выберите ${q.select === 2 ? 'ДВА' : q.select} ответа` : 'Выберите один ответ';
  const debrief = o.reveal ? `
    <section class="debrief" lang="ru">
      <p class="lbl">Разбор</p>
      <p>${fmt(q.explanation_ru)}</p>
      ${q.signal_ru ? `<div class="signal"><p class="lbl">Подсказка в условии</p><p>${fmt(q.signal_ru)}</p></div>` : ''}
      <div class="takeaway"><p class="lbl">Запомнить</p><p>${fmt(q.takeaway_ru)}</p></div>
      <p class="src">${DOMAINS[q.domain].code} · Task ${esc(q.task)} · ${cardSource(q)}</p>
    </section>` : '';
  return `
    <div class="qmeta">${meta}</div>
    <details class="scen"><summary>Сценарий: ${esc(sc.en)} · ${esc(sc.ru)}</summary><p lang="en">${fmt(sc.text)}</p></details>
    <p class="stem" lang="en">${fmt(q.stem)}</p>
    <p class="instr">${instr}</p>
    <ol class="opts" role="list">${opts}</ol>
    <div class="actions card-actions"></div>
    ${debrief}`;
}

function barsHTML(rows, cut){
  return `<div class="bars">${rows.map(r => {
    const p = r.pct;
    const mark = p == null ? '' : (cut ? (p >= cut ? '<span class="hi">✓</span> ' : '<span class="lo">↓</span> ') : '');
    return `<div class="bar-row">
      <span class="bar-lbl"><span>${esc(r.label)}</span><small>${esc(r.note || '')}</small></span>
      <span class="bar-track"><span class="bar-fill" style="width:${p ?? 0}%"></span>${cut ? `<span class="bar-cut" style="left:${cut}%" title="Ориентир ${cut}%"></span>` : ''}</span>
      <span class="bar-val">${mark}${p == null ? '—' : p + '%'}</span>
    </div>`;
  }).join('')}</div>${cut ? `<p class="cutnote">Чёрная риска: ориентир ${cut}% верных. ✓ выше, ↓ ниже.</p>` : ''}`;
}

// Темы или разделы набора: сначала в порядке group.order из set.json, остальные по порядку банка
function groupOrder(){
  const g = SET.group;
  if (!g) return [];
  const seen = [];
  BANK.slice().sort(byDefault).forEach(q => { if (!seen.includes(q[g.field])) seen.push(q[g.field]); });
  return g.order ? g.order.filter(t => seen.includes(t)).concat(seen.filter(t => !g.order.includes(t))) : seen;
}
function statRow(label, qs){
  const done = qs.filter(q => DB.results[q.id]);
  const ok = done.filter(q => DB.results[q.id].ok).length;
  return {label, pct: done.length ? Math.round(ok / done.length * 100) : null, note:`${ok}/${done.length} · из ${qs.length}`};
}
function progressRows(){
  if (SET.progress === 'group') return groupOrder().map(t => statRow(t, BANK.filter(q => q[SET.group.field] === t)));
  return [1,2,3,4,5].map(d => statRow(`${DOMAINS[d].code} · ${DOMAINS[d].short}`, BANK.filter(q => q.domain === d)));
}

/* ---------- practice ---------- */
function buildPractice(keepId){
  const f = S.f, g = SET.group;
  let list = BANK.filter(q => (!f.domain || q.domain === f.domain) && (!f.scenario || q.scenario === f.scenario)
    && (!f.flag || q[SET.flag.field]) && (!f.group || q[g.field] === f.group)
    && (!f.wrong || (DB.results[q.id] && !DB.results[q.id].ok)));
  list = f.shuffle ? shuffle(list.slice()) : list.slice().sort(byDefault);
  const i = keepId ? list.findIndex(q => q.id === keepId) : -1;
  S.p.list = list; S.p.idx = Math.max(0, i);
}
const pq = () => S.p.list[S.p.idx];
const pstate = q => (S.p.ans[q.id] ||= {sel:[], checked:false});

function groupSelect(f){
  const g = SET.group, n = {};
  BANK.forEach(q => { n[q[g.field]] = (n[q[g.field]] || 0) + 1; });
  return `<select class="select" id="f-group" aria-label="${escA(g.label)}"><option value="">${esc(g.all)}</option>${groupOrder().map(x => `<option value="${escA(x)}"${x === f.group ? ' selected' : ''}>${esc(x)} · ${n[x]}</option>`).join('')}</select>`;
}
function renderFilters(){
  const f = S.f;
  const cnt = d => BANK.filter(q => !d || q.domain === d).length;
  const chips = [0,1,2,3,4,5].map(d => `<button type="button" class="chip" data-domain="${d}" aria-pressed="${f.domain === d}">${d ? DOMAINS[d].code + ' ' + esc(DOMAINS[d].short) : 'Все'}<small>${cnt(d)}</small></button>`).join('');
  const scen = `<select class="select" id="f-scen" aria-label="Сценарий"><option value="0">Все сценарии</option>${Object.entries(SCENARIOS).map(([k, s]) => `<option value="${k}"${+k === f.scenario ? ' selected' : ''}>${k}. ${esc(s.ru)}</option>`).join('')}</select>`;
  const wrongN = Object.values(DB.results).filter(r => !r.ok).length;
  $('#p-filters').innerHTML = chips + '<span class="sep"></span>' + scen +
    `<label class="tg"><input type="checkbox" id="f-wrong"${f.wrong ? ' checked' : ''}> Мои ошибки (${wrongN})</label>` +
    (SET.flag ? `<label class="tg"><input type="checkbox" id="f-flag"${f.flag ? ' checked' : ''}> ${esc(SET.flag.label)}</label>` : '') +
    (SET.group ? groupSelect(f) : '') +
    `<label class="tg"><input type="checkbox" id="f-shuf"${f.shuffle ? ' checked' : ''}> Перемешать</label>`;
}

function renderPractice(){
  renderFilters();
  const P = S.p, card = $('#p-card');
  $('#p-count').textContent = P.list.length + ' вопр.';
  const sess = Object.values(P.ans).filter(a => a.checked);
  $('#p-session').textContent = sess.length ? `${sess.filter(a => a.ok).length} / ${sess.length}` : '—';
  $('#p-progress').innerHTML = barsHTML(progressRows(), CUT);
  $('#p-grid').innerHTML = P.list.map((q, i) => {
    const r = DB.results[q.id];
    const cls = 'cell' + (r ? (r.ok ? ' ok' : ' bad') : '') + (i === P.idx ? ' cur' : '');
    return `<button type="button" class="${cls}" data-idx="${i}" aria-label="Вопрос ${i + 1}${r ? (r.ok ? ', верно' : ', ошибка') : ''}">${i + 1}</button>`;
  }).join('');
  if (!P.list.length){
    card.innerHTML = `<div class="empty">${S.f.wrong ? 'Ошибок в этой подборке нет. Снимите фильтр «Мои ошибки» или выберите другой домен.' : 'Под эти фильтры вопросов нет.'}</div>`;
    return;
  }
  const q = pq(), st = pstate(q);
  card.innerHTML = cardHTML(q, {num:P.idx + 1, total:P.list.length, sel:st.sel, reveal:st.checked, showMeta:true});
  const last = P.idx === P.list.length - 1;
  card.querySelector('.card-actions').innerHTML = st.checked
    ? `<span class="verdict ${st.ok ? 'ok' : 'bad'}">${st.ok ? '✓ Верно' : '✗ Неверно'}</span>
       <button type="button" class="btn ghost push" data-act="prev"${P.idx ? '' : ' disabled'}>← Назад</button>
       <button type="button" class="btn" data-act="next" id="btn-next"${last ? ' disabled' : ''}>${last ? 'Конец подборки' : 'Дальше →'}</button>`
    : `<button type="button" class="btn" data-act="check"${st.sel.length === q.select ? '' : ' disabled'}>Проверить</button>
       <span class="hint"><kbd>A</kbd>–<kbd>${q.options[q.options.length - 1].key}</kbd> выбрать · <kbd>Enter</kbd> проверить · <kbd>→</kbd> пропустить</span>
       <button type="button" class="btn ghost push" data-act="prev"${P.idx ? '' : ' disabled'}>←</button>
       <button type="button" class="btn ghost" data-act="next"${last ? ' disabled' : ''}>→</button>`;
}

function pick(st, q, key){
  if (q.select === 1) st.sel = [key];
  else {
    const i = st.sel.indexOf(key);
    if (i >= 0) st.sel.splice(i, 1);
    else { if (st.sel.length >= q.select) st.sel.shift(); st.sel.push(key); }
  }
}

function practiceCheck(){
  const q = pq(); if (!q) return;
  const st = pstate(q);
  if (st.checked || st.sel.length !== q.select) return;
  st.checked = true; st.ok = same(st.sel, q.answer);
  const prev = DB.results[q.id];
  DB.results[q.id] = {ok:st.ok, n:(prev ? prev.n : 0) + 1, t:Date.now()};
  save(); renderPractice();
  const nb = $('#btn-next'); if (nb && !nb.disabled) nb.focus();
}
function practiceGo(d){
  const n = S.p.idx + d;
  if (n < 0 || n >= S.p.list.length) return;
  S.p.idx = n; renderPractice();
  $('#p-card').scrollIntoView({block:'nearest'});
}

/* ---------- exam ---------- */
// set.exam.<size>: {label, per?:{домен:число}, n?:число}. Без per и n — весь банк; n — столько вопросов пропорционально доменам.
function examCfg(size){
  const e = SET.exam[size] || {label:''};
  const count = d => BANK.filter(q => q.domain === d).length;
  let per = e.per;
  if (!per && e.n){
    const total = Math.min(e.n, BANK.length);
    const raw = [1,2,3,4,5].map(d => ({d, x:count(d) * total / BANK.length}));
    per = Object.fromEntries(raw.map(r => [r.d, Math.floor(r.x)]));
    let left = total - Object.values(per).reduce((a, b) => a + b, 0);
    raw.sort((a, b) => (b.x % 1) - (a.x % 1)).forEach(r => { if (left > 0 && per[r.d] < count(r.d)){ per[r.d]++; left--; } });
  }
  if (!per) per = Object.fromEntries([1,2,3,4,5].map(d => [d, count(d)]));
  const total = Object.values(per).reduce((a, b) => a + b, 0);
  return {label:e.label, per, total, min:total * 2};
}
let tick = null;
function startExam(size){
  const cfg = examCfg(size);
  const picked = [];
  for (const d of Object.keys(cfg.per)){
    const pool = shuffle(BANK.filter(q => q.domain === +d));
    picked.push(...pool.slice(0, cfg.per[d]));
  }
  const order = shuffle([1,2,3,4,5,6]);
  shuffle(picked).sort((a, b) => order.indexOf(a.scenario) - order.indexOf(b.scenario));
  DB.exam = {ids:picked.map(q => q.id), ans:{}, flags:[], idx:0, size, start:Date.now(), ends:Date.now() + cfg.min * 60000, done:false};
  S.examView = 'run'; S.confirm = false;
  save(); renderExam();
}
function finishExam(){
  const e = DB.exam; if (!e || e.done) return;
  const by = {}; let ok = 0;
  e.ids.forEach(id => {
    const q = BYID[id], a = e.ans[id] || [];
    const r = a.length === q.select && same(a, q.answer);
    if (r) ok++;
    by[q.domain] ||= {ok:0, n:0}; by[q.domain].n++; if (r) by[q.domain].ok++;
    const prev = DB.results[id];
    DB.results[id] = {ok:r, n:(prev ? prev.n : 0) + 1, t:Date.now()};
  });
  e.done = true; e.finished = Date.now(); e.score = {ok, n:e.ids.length, by}; e.idx = 0;
  DB.exams.unshift({t:Date.now(), size:e.size, ok, n:e.ids.length});
  DB.exams = DB.exams.slice(0, 10);
  S.examView = 'results'; S.confirm = false;
  save(); renderExam();
}
const mmss = ms => { const s = Math.max(0, Math.round(ms / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
function updateTimer(){
  if (!DB) return;
  const e = DB.exam, el = $('#timer');
  if (!e || e.done) return;
  const left = e.ends - Date.now();
  if (left <= 0){ finishExam(); return; }
  if (el){ el.textContent = mmss(left); el.classList.toggle('low', left < 5 * 60000); }
}
function histHTML(){
  if (!DB.exams.length) return '<p class="hint">Пока нет завершённых попыток.</p>';
  return `<ul class="hist">${DB.exams.map(h => `<li><span>${new Date(h.t).toLocaleDateString('ru-RU', {day:'numeric', month:'short'})} · ${h.size === 'full' ? 'полный' : 'короткий'}</span><b>${h.ok}/${h.n} · ${Math.round(h.ok / h.n * 100)}%</b></li>`).join('')}</ul>`;
}

function renderExam(){
  const host = $('#view-exam'), e = DB.exam;
  if (!e){
    const btns = Object.keys(SET.exam).map((k, i) => {
      const c = examCfg(k);
      return `<button type="button" class="btn${i ? ' ghost' : ''}" data-start="${k}">${esc(c.label)} <span>${c.total} вопр. · ${c.min} мин</span></button>`;
    }).join('\n          ');
    host.innerHTML = `<div class="intro">
      <div class="panel" style="padding:24px">
        <h2>Пробный экзамен</h2>
        <ul class="rules">
          <li>${fill(SET.examRule, {n:BANK.length})}</li>
          <li>Правильные ответы и разборы откроются только после завершения.</li>
          <li>Вопрос можно отметить и вернуться к нему. Таймер идёт, даже если закрыть вкладку.</li>
          <li>Ориентир: ${CUT}% верных. Реальный порог 720 считается по нелинейной шкале.</li>
        </ul>
        <div class="choice">
          ${btns}
        </div>
      </div>
      <div class="panel"><p class="lbl">Прошлые попытки</p>${histHTML()}</div>
    </div>`;
    return;
  }
  if (e.done && S.examView === 'results'){
    const s = e.score, pct = Math.round(s.ok / s.n * 100), pass = pct >= CUT;
    const rows = [1,2,3,4,5].filter(d => s.by[d]).map(d => ({label:`${DOMAINS[d].code} · ${DOMAINS[d].short}`, pct:Math.round(s.by[d].ok / s.by[d].n * 100), note:`${s.by[d].ok}/${s.by[d].n}`}));
    const misses = e.ids.map((id, i) => ({id, i})).filter(x => !DB.results[x.id].ok);
    host.innerHTML = `<div class="results">
      <div class="panel" style="padding:24px">
        <p class="lbl">Результат · ${esc(examCfg(e.size).label)}</p>
        <p class="score">${pct}%<small>${s.ok} из ${s.n}</small></p>
        <span class="pill ${pass ? 'ok' : 'bad'}">${pass ? '✓ Выше ориентира' : '↓ Ниже ориентира'} ${CUT}%</span>
        <p class="hint" style="margin-top:12px">Время: ${mmss(e.finished - e.start)}. Неотвеченные вопросы засчитаны как ошибки.</p>
        <div class="actions">
          <button type="button" class="btn" data-act="review">Разобрать ответы</button>
          <button type="button" class="btn ghost" data-act="new-exam">Новый экзамен</button>
        </div>
        ${misses.length ? `<p class="lbl" style="margin-top:22px">Ошибки · ${misses.length}</p><div class="miss">${misses.map(x => `<button type="button" class="cell bad" data-review="${x.i}" aria-label="Разобрать вопрос ${x.i + 1}">${x.i + 1}</button>`).join('')}</div>` : ''}
      </div>
      <div class="panel" style="padding:20px">
        <p class="lbl">Процент верных по доменам</p>
        ${barsHTML(rows, CUT)}
        <p class="lbl" style="margin-top:22px">Прошлые попытки</p>${histHTML()}
      </div>
    </div>`;
    return;
  }
  const reviewing = e.done;
  const q = BYID[e.ids[e.idx]];
  const sel = e.ans[q.id] || [];
  const answered = e.ids.filter(id => (e.ans[id] || []).length === BYID[id].select).length;
  const flagged = e.flags.includes(q.id);
  const bar = reviewing
    ? `<span class="lbl" style="margin:0">Разбор экзамена · ${e.score.ok}/${e.score.n}</span><button type="button" class="btn ghost push" data-act="results">К результатам</button>`
    : `<span class="timer" id="timer" aria-label="Осталось времени">${mmss(e.ends - Date.now())}</span>
       <span class="hint">Отвечено ${answered} из ${e.ids.length}${e.flags.length ? ` · отмечено ${e.flags.length}` : ''}</span>
       <button type="button" class="btn ghost push" data-act="ask-finish">Завершить экзамен</button>`;
  const confirm = S.confirm && !reviewing ? `<div class="confirm" role="alert"><span>Без ответа: ${e.ids.length - answered}. Они будут засчитаны как ошибки.</span><button type="button" class="btn danger" data-act="finish">Завершить</button><button type="button" class="btn ghost" data-act="cancel-finish">Продолжить экзамен</button></div>` : '';
  host.innerHTML = `
    <div class="exambar">${bar}</div>${confirm}
    <div class="layout">
      <article class="sheet" id="e-card" aria-live="polite"></article>
      <aside class="side"><div class="panel">
        <p class="lbl">Лист ответов</p>
        <div class="grid" id="e-grid"></div>
        <div class="legend">${reviewing ? '<span><i class="ok"></i>верно</span><span><i class="bad"></i>ошибка</span>' : '<span><i class="done"></i>отвечен</span><span><i></i>нет ответа</span><span><i class="flag"></i>отмечен</span>'}</div>
      </div></aside>
    </div>`;
  $('#e-card').innerHTML = cardHTML(q, {num:e.idx + 1, total:e.ids.length, sel, reveal:reviewing, showMeta:reviewing});
  const last = e.idx === e.ids.length - 1;
  $('#e-card').querySelector('.card-actions').innerHTML = `
    ${reviewing ? `<span class="verdict ${DB.results[q.id] && same(sel, q.answer) ? 'ok' : 'bad'}">${same(sel, q.answer) ? '✓ Верно' : (sel.length ? '✗ Неверно' : '✗ Без ответа')}</span>` : `<button type="button" class="btn ghost" data-act="flag" aria-pressed="${flagged}">${flagged ? '★ Отмечен' : '☆ Отметить'}</button>`}
    <button type="button" class="btn ghost push" data-act="eprev"${e.idx ? '' : ' disabled'}>← Назад</button>
    ${!reviewing && last ? `<button type="button" class="btn" data-act="ask-finish">Завершить</button>` : `<button type="button" class="btn" data-act="enext"${last ? ' disabled' : ''}>Дальше →</button>`}`;
  $('#e-grid').innerHTML = e.ids.map((id, i) => {
    const a = e.ans[id] || [], qq = BYID[id];
    let cls = 'cell';
    if (reviewing) cls += DB.results[id] && same(a, qq.answer) ? ' ok' : ' bad';
    else if (a.length === qq.select) cls += ' done';
    if (!reviewing && e.flags.includes(id)) cls += ' flag';
    if (i === e.idx) cls += ' cur';
    return `<button type="button" class="${cls}" data-eidx="${i}" aria-label="Вопрос ${i + 1}">${i + 1}</button>`;
  }).join('');
}
function examGo(i){
  const e = DB.exam; if (!e || i < 0 || i >= e.ids.length) return;
  e.idx = i; save(); renderExam();
  const c = $('#e-card'); if (c) c.scrollIntoView({block:'nearest'});
}

/* ---------- notes ---------- */
// notes.html набора сам решает, какие блоки показывать: заполняются только те id, что в нём есть
function put(sel, html){ const el = $(sel); if (el) el.innerHTML = html; }
function renderNotes(){
  put('#n-weights', barsHTML([1,2,3,4,5].map(d => ({label:`${DOMAINS[d].code} · ${DOMAINS[d].name}`, pct:DOMAINS[d].w, note:`≈${DOMAINS[d].n} вопр.`})), 0));
  put('#n-progress', barsHTML(progressRows(), CUT));
  put('#n-reset', S.resetAsk
    ? `<span class="hint">Удалить все ответы и историю экзаменов этого набора?</span><button type="button" class="btn danger" data-act="reset-yes">Удалить</button><button type="button" class="btn ghost" data-act="reset-no">Отмена</button>`
    : (Object.keys(DB.results).length ? `<button type="button" class="btn ghost" data-act="reset-ask">Сбросить прогресс</button>` : ''));
  put('#n-scens', Object.entries(SCENARIOS).map(([k, s]) => `<div><h3>${k}. ${esc(s.en)}</h3><p>${esc(s.ru)}</p><p class="dm">Домены: ${s.d.map(d => DOMAINS[d].code).join(' · ')} · вопросов в наборе: ${BANK.filter(q => q.scenario === +k).length}</p></div>`).join(''));
  put('#n-takeaways', [1,2,3,4,5].map(d => {
    const qs = BANK.filter(q => q.domain === d && q.takeaway_ru).sort(byDefault);
    if (!qs.length) return '';
    return `<p class="tk-d">${DOMAINS[d].code} · ${esc(DOMAINS[d].name)}</p><ul class="tk">${qs.map(q => `<li><button type="button" data-goto="${q.id}"><span class="t">${esc(q.task)}</span><span>${fmt(q.takeaway_ru)}</span></button></li>`).join('')}</ul>`;
  }).join(''));
}

/* ---------- сброс прогресса во всех наборах ---------- */
function setHasProgress(s){
  try {
    const d = JSON.parse(lsGet(s.storageKey));
    return !!d && (Object.keys(d.results || {}).length > 0 || (d.exams || []).length > 0 || !!d.exam);
  } catch(e){ return false; }
}
function renderResetAll(){
  const host = $('#reset-all'); if (!host) return;
  const n = SETS.filter(setHasProgress).length;
  host.innerHTML = S.resetAllAsk
    ? `<span class="hint">Удалить прогресс во всех ${SETS.length} наборах на этом устройстве? Вернуть его будет нельзя.</span><button type="button" class="btn danger" data-act="reset-all-yes">Удалить всё</button><button type="button" class="btn ghost" data-act="reset-all-no">Отмена</button>`
    : `<span class="hint">Прогресс хранится только в этом браузере.</span><button type="button" class="btn ghost" data-act="reset-all-ask"${n ? '' : ' disabled'}>Сбросить прогресс во всех наборах${n ? ` (${n})` : ''}</button>`;
}
function resetAll(){
  SETS.forEach(s => lsDel(s.storageKey));
  lsDel(LAST_SET);
  DB = {results:{}, exams:[], exam:null};
  Object.assign(S, {resetAllAsk:false, resetAsk:false, confirm:false, examView:'run'});
  S.p.ans = {};
  buildPractice(); setView(S.view);
}

/* ---------- shell ---------- */
function setView(v){
  S.view = v;
  VIEWS.forEach(n => {
    $('#view-' + n).hidden = n !== v;
    $('#tab-' + n).setAttribute('aria-selected', String(n === v));
  });
  try { history.replaceState(null, '', `#${SET.id}/${v}`); } catch(e){}
  if (v === 'practice') renderPractice();
  if (v === 'exam') renderExam();
  if (v === 'notes') renderNotes();
  renderResetAll();
}

function applyTheme(){
  const decl = o => Object.entries(o).map(([k, v]) => `--${k}:${v};`).join('');
  const {light, dark} = SET.palette;
  $('#set-theme').textContent = `:root{${decl(light)}}
@media (prefers-color-scheme: dark){:root:not([data-theme="light"]){${decl(dark)}}}
:root[data-theme="dark"]{${decl(dark)}}`;
}
function applyTexts(){
  document.title = SET.title;
  $('#set-title').textContent = SET.title;
  $('#set-sub').textContent = SET.sub;
  $('#set-source').textContent = SET.source;
  $('#set-footer').innerHTML = SET.footer;
  $('#tab-notes').textContent = SET.notesTab;
  $('#p-progress-lbl').textContent = SET.progressLabel;
  const flagged = SET.flag ? BANK.filter(q => q[SET.flag.field]).length : 0;
  const groups = SET.group ? new Set(BANK.map(q => q[SET.group.field])).size : 0;
  $('#bank-count').textContent = SET.countNote.replace(/\{(\w+)\}/g, (m, k) => ({n:BANK.length, flagged, groups})[k] ?? m);
  document.querySelectorAll('#sets .set').forEach(a => a.dataset.set === SET.id ? a.setAttribute('aria-current', 'page') : a.removeAttribute('aria-current'));
}
function renderSwitcher(){
  $('#sets').innerHTML = SETS.map(s => `<a class="set" href="#${escA(s.id)}" data-set="${escA(s.id)}" style="--c:${escA(s.palette.light.form)};--cd:${escA(s.palette.dark.form)}"><b>${esc(s.name)}</b><small>${esc(s.blurb)}</small></a>`).join('');
}

function failLoad(err){
  $('#p-card').innerHTML = `<div class="empty">Не удалось загрузить набор. Обновите страницу.<br><small>${esc(err.message)}</small><br><small>Если правили вопросы, запустите <code>node tools/pack.js</code>.</small></div>`;
  ['exam', 'notes'].forEach(n => { $('#view-' + n).hidden = true; });
  $('#view-practice').hidden = false;
}

async function openSet(id, view){
  if (!SETS.some(s => s.id === id)) id = SETS[0].id;
  const token = ++openToken;
  document.body.classList.add('loading');
  let data;
  try { data = await loadSet(id); }
  catch(err){ if (token === openToken){ document.body.classList.remove('loading'); failLoad(err); } return; }
  if (token !== openToken) return;
  document.body.classList.remove('loading');
  SET = SETS.find(s => s.id === id);
  BANK = data.bank;
  BYID = Object.fromEntries(BANK.map(q => [q.id, q]));
  DB = Object.assign({results:{}, exams:[], exam:null}, load());
  if (DB.exam && DB.exam.ids.some(x => !BYID[x])) DB.exam = null;
  S.f = freshFilters(); S.p = {list:[], idx:0, ans:{}};
  S.examView = 'run'; S.confirm = false; S.resetAsk = false;
  lsSet(LAST_SET, id);
  applyTheme(); applyTexts();
  $('#view-notes').innerHTML = data.notes;
  buildPractice();
  setView(VIEWS.includes(view) ? view : (DB.exam && !DB.exam.done ? 'exam' : SET.defaultView));
}
function parseHash(){
  const [a, b] = decodeURIComponent(location.hash.slice(1)).split('/');
  return VIEWS.includes(a) ? [null, a] : [a || null, b];
}
window.addEventListener('hashchange', () => {
  if (!SETS.length) return;
  const [id, view] = parseHash();
  if (SET && (!id || id === SET.id)) return setView(VIEWS.includes(view) ? view : S.view);
  openSet(id, view);
});

document.addEventListener('click', ev => {
  const t = ev.target.closest('button');
  if (!t || !SET) return;
  if (t.dataset.view) return setView(t.dataset.view);
  if (t.dataset.domain !== undefined){ S.f.domain = +t.dataset.domain; buildPractice(); return renderPractice(); }
  if (t.dataset.idx !== undefined){ S.p.idx = +t.dataset.idx; return renderPractice(); }
  if (t.dataset.start) return startExam(t.dataset.start);
  if (t.dataset.eidx !== undefined) return examGo(+t.dataset.eidx);
  if (t.dataset.review !== undefined){ S.examView = 'review'; DB.exam.idx = +t.dataset.review; return renderExam(); }
  if (t.dataset.goto){
    S.f = freshFilters();
    buildPractice(t.dataset.goto); setView('practice');
    return $('#p-card').scrollIntoView({block:'start'});
  }
  if (t.dataset.key){
    if (t.getAttribute('aria-disabled') === 'true') return;
    if (S.view === 'practice'){ const q = pq(); pick(pstate(q), q, t.dataset.key); return renderPractice(); }
    if (S.view === 'exam' && DB.exam && !DB.exam.done){
      const e = DB.exam, q = BYID[e.ids[e.idx]], st = {sel:(e.ans[q.id] || []).slice()};
      pick(st, q, t.dataset.key); e.ans[q.id] = st.sel; save(); return renderExam();
    }
    return;
  }
  const a = t.dataset.act;
  if (!a) return;
  const e = DB.exam;
  switch (a){
    case 'check': return practiceCheck();
    case 'next': return practiceGo(1);
    case 'prev': return practiceGo(-1);
    case 'enext': return examGo(e.idx + 1);
    case 'eprev': return examGo(e.idx - 1);
    case 'flag': { const id = e.ids[e.idx]; e.flags = e.flags.includes(id) ? e.flags.filter(x => x !== id) : e.flags.concat(id); save(); return renderExam(); }
    case 'ask-finish': S.confirm = true; renderExam(); window.scrollTo({top:0}); return;
    case 'cancel-finish': S.confirm = false; return renderExam();
    case 'finish': return finishExam();
    case 'review': S.examView = 'review'; e.idx = 0; return renderExam();
    case 'results': S.examView = 'results'; return renderExam();
    case 'new-exam': DB.exam = null; save(); return renderExam();
    case 'reset-ask': S.resetAsk = true; return renderNotes();
    case 'reset-no': S.resetAsk = false; return renderNotes();
    case 'reset-all-ask': S.resetAllAsk = true; return renderResetAll();
    case 'reset-all-no': S.resetAllAsk = false; return renderResetAll();
    case 'reset-all-yes': return resetAll();
    case 'reset-yes': DB.results = {}; DB.exams = []; DB.exam = null; S.p.ans = {}; S.resetAsk = false; save(); buildPractice(); return renderNotes();
  }
});

document.addEventListener('change', ev => {
  if (!SET) return;
  const id = ev.target.id;
  if (id === 'f-scen') S.f.scenario = +ev.target.value;
  else if (id === 'f-wrong') S.f.wrong = ev.target.checked;
  else if (id === 'f-flag') S.f.flag = ev.target.checked;
  else if (id === 'f-group') S.f.group = ev.target.value;
  else if (id === 'f-shuf') S.f.shuffle = ev.target.checked;
  else return;
  buildPractice(); renderPractice();
});

document.addEventListener('keydown', ev => {
  if (!SET || ev.metaKey || ev.ctrlKey || ev.altKey || ev.target.closest('input,select,textarea,summary')) return;
  const k = ev.key.toLowerCase();
  const map = {a:'A', b:'B', c:'C', d:'D', e:'E', '1':'A', '2':'B', '3':'C', '4':'D', '5':'E'};
  const exam = S.view === 'exam' && DB.exam && (!DB.exam.done || S.examView === 'review');
  const q = S.view === 'practice' ? pq() : exam ? BYID[DB.exam.ids[DB.exam.idx]] : null;
  if (!q) return;
  if (map[k] && q.options.some(o => o.key === map[k])){
    const b = document.querySelector(`#view-${S.view} .opt[data-key="${map[k]}"]`);
    if (b){ ev.preventDefault(); b.click(); }
    return;
  }
  if (k === 'enter' && !ev.target.closest('button') && S.view === 'practice'){
    ev.preventDefault();
    return pstate(q).checked ? practiceGo(1) : practiceCheck();
  }
  if (k === 'arrowright'){ ev.preventDefault(); return S.view === 'practice' ? practiceGo(1) : examGo(DB.exam.idx + 1); }
  if (k === 'arrowleft'){ ev.preventDefault(); return S.view === 'practice' ? practiceGo(-1) : examGo(DB.exam.idx - 1); }
});

(async function init(){
  if (!CCA.manifest) return failLoad(new Error('нет data/manifest.js'));
  SETS = CCA.manifest;
  renderSwitcher();
  const [id, view] = parseHash();
  await openSet(id || lsGet(LAST_SET) || SETS[0].id, view);
  tick = setInterval(updateTimer, 1000);
})();
