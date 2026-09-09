const fs = require('node:fs');
const path = require('node:path');
const dir = path.resolve('assets/book-icons-vector');
const catalog = JSON.parse(fs.readFileSync(path.join(dir, 'catalog.json'), 'utf8'));
const output = path.resolve(process.argv[2] || 'output/imagegen/full-book-icons-2026-09-09');
const escape = (text) =>
  text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('"', '&quot;');
const symbols = catalog
  .filter((row) => !row[2].startsWith('@'))
  .map(([id]) => {
    const svg = fs.readFileSync(path.join(dir, `${id.toLowerCase()}.svg`), 'utf8');
    return `<symbol id="${id}" viewBox="0 0 768 768">${svg.trim().replace(/^<svg[^>]*>|<\/svg>$/g, '')}</symbol>`;
  })
  .join('');
const cards = catalog
  .map(([id, name, subject], index) => {
    const icon = subject.startsWith('@') ? subject.slice(1) : id;
    return `<article data-name="${escape(name.toLowerCase())}"><span class="order">${String(index + 1).padStart(2, '0')}</span><svg class="main" aria-hidden="true"><use href="#${icon}"/></svg><h2>${escape(name)}</h2><div class="samples"><svg width="32" height="32" aria-hidden="true"><use href="#${icon}"/></svg><svg width="48" height="48" aria-hidden="true"><use href="#${icon}"/></svg></div></article>`;
  })
  .join('');
fs.mkdirSync(output, { recursive: true });
fs.writeFileSync(
  path.join(output, 'preview.html'),
  `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>EveryBible · Book icons</title><style>
:root{--paper:#F0ECE5;--ink:#1A1914;--line:#d0cbc1}body.dark{--paper:#11110D;--ink:#EFEBE1;--line:#3D382E}*{box-sizing:border-box}body{margin:0;background:var(--paper);color:var(--ink);font-family:system-ui,sans-serif}header{padding:38px 5vw 24px;position:sticky;top:0;background:var(--paper);border-bottom:1px solid var(--line);z-index:1}h1{font:36px Georgia,serif;margin:0 0 8px}p{margin:0 0 20px}nav{display:flex;gap:10px;flex-wrap:wrap}button,input{font:inherit;color:inherit;border:1px solid var(--line);background:transparent;border-radius:10px;padding:10px 16px}button{cursor:pointer}button[aria-pressed=true]{background:var(--ink);color:var(--paper)}input{min-width:0;max-width:100%}main{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));max-width:1500px;margin:auto;padding:24px;gap:12px}article{position:relative;text-align:center;border:1px solid var(--line);border-radius:16px;padding:24px 12px 14px}.order{position:absolute;left:12px;top:10px;font-size:11px;opacity:.55}.main{width:120px;height:120px}h2{font-size:14px;font-weight:500;margin:10px 0 12px}.samples{display:flex;align-items:center;justify-content:center;gap:18px;height:48px}.definitions{position:absolute;width:0;height:0;overflow:hidden}article[hidden]{display:none}@media(max-width:400px){main{grid-template-columns:repeat(2,minmax(0,1fr));padding:12px;gap:8px}.main{width:100px;height:100px}header{padding:22px 16px}h1{font-size:28px}}
</style><body><svg class="definitions" aria-hidden="true"><defs>${symbols}</defs></svg><header><h1>EveryBible book icons</h1><p>66 books. One family of symbols.</p><nav><button id="light" aria-pressed="true">Light</button><button id="dark" aria-pressed="false">Dark</button><input id="search" aria-label="Find a book" placeholder="Find a book…"></nav></header><main>${cards}</main><script>
for(const mode of ['light','dark'])document.getElementById(mode).onclick=()=>{document.body.classList.toggle('dark',mode==='dark');for(const value of ['light','dark'])document.getElementById(value).setAttribute('aria-pressed',String(value===mode))};document.getElementById('search').oninput=event=>{for(const card of document.querySelectorAll('article'))card.hidden=!card.dataset.name.includes(event.target.value.toLowerCase())};
</script></body></html>`
);
console.log(path.join(output, 'preview.html'));
