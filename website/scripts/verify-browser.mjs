/**
 * 真实浏览器渲染回归测试（可选，需本地 chromium）
 *
 * 用法:
 *   1. pnpm build && pnpm preview        （另开终端，默认 http://localhost:4173/）
 *   2. node scripts/verify-browser.mjs [URL]   （默认 4173）
 *
 * 环境要求: playwright 官方安装的浏览器
 *   pnpm exec playwright install chromium
 * （不硬编码浏览器路径/系统库目录；换架构/升级 playwright 均自动适配）
 *
 * 断言（针对 X25519 教程内容）: 首页重定向与预渲染 HTML、侧边栏导航、可点击标题锚点、
 *       含公式页面 MathJax 排版出 mjx-container、无公式页不加载 MathJax、
 *       代码高亮、跨页链接可达、无致命 console 错误。
 */
import { chromium } from 'playwright';

const url = process.argv[2] ?? 'http://localhost:4173/';

const browser = await chromium.launch({ headless: true });
let failed = 0;
const check = (name, ok, detail) => {
  console.log(`${ok ? '✓' : '✗'} ${name}${ok ? '' : detail ? ` — ${detail}` : ''}`);
  if (!ok) failed++;
};

try {
  const page = await browser.newPage();
  const fatal = [];
  page.on('pageerror', (e) => fatal.push(String(e).slice(0, 200)));
  page.on('console', (m) => {
    if (m.type() === 'error') fatal.push(m.text().slice(0, 200));
  });

  // ---- 首页（index.html → 00-introduction.html，无公式）----
  await page.goto(url, { waitUntil: 'load', timeout: 30000 });
  await page.waitForTimeout(2000);

  const r = await page.evaluate(() => ({
    title: document.title,
    bodyLen: document.querySelector('.markdown-body')?.textContent?.length ?? -1,
    mjx: document.querySelectorAll('mjx-container').length,
    navLinks: document.querySelectorAll('.sidebar a').length,
    anchors: document.querySelectorAll('.header-anchor').length,
    skipLink: !!document.querySelector('.skip-link'),
    navLandmark: document.querySelectorAll('nav.sidebar').length,
    mathjaxScripts: [...document.scripts].filter((s) => s.src.includes('tex-mml-chtml')).length,
  }));
  check('页面标题为教程站点', r.title.includes('X25519 从零实现教程'), r.title);
  check('正文为预渲染 HTML（长度 > 500）', r.bodyLen > 500, `len=${r.bodyLen}`);
  check('首页无公式 → 不加载 MathJax', r.mathjaxScripts === 0, `scripts=${r.mathjaxScripts}`);
  check('侧边栏导航链接存在', r.navLinks >= 10, `navLinks=${r.navLinks}`);
  check('标题锚点链接存在', r.anchors >= 1, `anchors=${r.anchors}`);
  check('skip-link 与 nav landmark', r.skipLink && r.navLandmark === 1);

  // ---- 含公式页面（第 1 章）应加载并排版 MathJax ----
  await page.goto(new URL('01-modular-arithmetic.html', url).href, { waitUntil: 'load' });
  await page.waitForTimeout(5000); // 等 MathJax 排版
  const math = await page.evaluate(() => ({
    mjx: document.querySelectorAll('mjx-container').length,
    mathjaxScripts: [...document.scripts].filter((s) => s.src.includes('tex-mml-chtml')).length,
    codeBlocks: document.querySelectorAll('pre code.hljs').length,
  }));
  check('公式页加载 MathJax 脚本', math.mathjaxScripts === 1, `scripts=${math.mathjaxScripts}`);
  check('MathJax 排版出公式容器', math.mjx > 0, `mjx=${math.mjx}`);
  check('C 代码高亮生效', math.codeBlocks > 0, `hljs=${math.codeBlocks}`);

  // ---- 跨页导航可达（第 12 章，含公式与阶梯代码）----
  await page.goto(new URL('12-scalar-multiplication.html', url).href, { waitUntil: 'load' });
  await page.waitForTimeout(5000);
  const ladder = await page.evaluate(() => ({
    mjx: document.querySelectorAll('mjx-container').length,
    codeBlocks: document.querySelectorAll('pre code.hljs').length,
  }));
  check('第 12 章公式排版', ladder.mjx > 0, `mjx=${ladder.mjx}`);
  check('第 12 章代码高亮', ladder.codeBlocks > 0, `hljs=${ladder.codeBlocks}`);

  check('无致命 console/page 错误', fatal.length === 0, fatal.slice(0, 3).join(' | '));
} catch (e) {
  console.error('浏览器验证失败:', e.message);
  failed++;
} finally {
  await browser.close();
}

console.log(failed === 0 ? '\n全部通过' : `\n${failed} 项失败`);
process.exit(failed === 0 ? 0 : 1);
