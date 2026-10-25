/**
 * Собранный JS должен разбираться старыми, но живыми браузерами — Chrome 61+ и Safari 12, в том числе встроенные
 * браузеры приложений на старых Android. Один `?.` или `catch {}` в бандле роняет его целиком, и
 * форма заявки не работает вовсе (avtofin.org, 19.10.2026). Babel в webpack.config.js это
 * предотвращает; проверка ловит то, что прошло мимо него (пакеты из node_modules, ручные правки).
 *
 * Порог — ES2018: spread в объектах (`{...a}`) Chrome понимает с 60, Safari с 11.1, и Babel под
 * browserslist его не трогает. ES2019+ (`catch {}`, `?.`, `??`) — уже падение.
 */
const fs = require('fs');
const path = require('path');
const acorn = require('acorn');

const root = path.resolve(__dirname, '../..');
const build = path.join(root, 'assets/js/build');
const built = fs.existsSync(build) ? fs.readdirSync(build).filter((f) => f.endsWith('.js')) : [];
if (!built.length) {
  console.error('check:es — нет собранных файлов в assets/js/build');
  process.exit(1);
}
// Плюс скрипты, которые шаблоны подключают напрямую, мимо сборки.
const files = built
  .map((f) => path.join('assets/js/build', f))
  .concat(['assets/js/utils/utm.js', 'assets/js/utils/web-vitals.js'].filter((f) => fs.existsSync(path.join(root, f))));

let failed = 0;
for (const file of files) {
  const code = fs.readFileSync(path.join(root, file), 'utf8');
  try {
    acorn.parse(code, { ecmaVersion: 2018, sourceType: 'script' });
  } catch (e) {
    failed += 1;
    const at = e.pos !== undefined ? code.slice(Math.max(0, e.pos - 40), e.pos + 40) : '';
    console.error(`check:es — ${file}: ${e.message}\n  …${at}…`);
  }
}
if (failed) {
  console.error(`check:es — ${failed} из ${files.length} файлов не разбираются как ES2018`);
  process.exit(1);
}
console.log(`check:es — ${files.length} файлов, ES2018 ок`);
