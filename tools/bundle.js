// Собирает автономный файл dist/ccar-f-offline.html: стили, движок и все пять наборов внутри одной страницы.
// Его можно отправить в мессенджер или открыть с флешки: сервер не нужен. Из внешнего грузятся только шрифты Google,
// без них страница работает на запасных шрифтах.
//   node tools/bundle.js
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const r = spawnSync(process.execPath, [path.join(__dirname, 'pack.js')], { stdio: 'inherit' });
if (r.status !== 0) process.exit(1);

const rd = p => fs.readFileSync(path.join(ROOT, p), 'utf8');
// содержимое вставляется внутрь <script>/<style>, поэтому закрывающие теги в нём экранируем
const inScript = s => s.replace(/<\/script/gi, '<\\/script').replace(/<!--/g, '<\\!--');
const inStyle = s => s.replace(/<\/style/gi, '<\\/style');

let html = rd('index.html');
const swap = (from, to) => {
  if (html.split(from).length !== 2) throw new Error(`в index.html не нашёл ровно одно ${from}`);
  html = html.replace(from, () => to);
};

swap('<link rel="stylesheet" href="assets/app.css">', `<style>\n${inStyle(rd('assets/app.css'))}</style>`);
const data = fs.readdirSync(path.join(ROOT, 'data')).filter(f => f.endsWith('.js') && f !== 'manifest.js').sort();
swap('<script src="data/manifest.js"></script>\n<script src="assets/app.js"></script>',
  [...data.map(f => `<script>\n${inScript(rd('data/' + f))}</script>`),
   `<script>\n${inScript(rd('data/manifest.js'))}</script>`,
   `<script>\n${inScript(rd('assets/app.js'))}</script>`].join('\n'));

const out = path.join(ROOT, 'dist', 'ccar-f-offline.html');
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, html);
console.log(`\ndist/ccar-f-offline.html  ${(Buffer.byteLength(html) / 1024).toFixed(0)} КБ`);
