/**
 * 站点生成（构建期）：把 content/*.md 渲染为多页静态 HTML。
 *
 * - 导航单一数据源：侧边栏目录完全从渲染后的标题派生（toctree 模式），
 *   不存在手写导航 / 手写「本页目录」，从根上消除死锚点；
 * - 锚点校验：页内重复 id、指向不存在页面的链接、不存在的锚点 → 构建期报错；
 * - 每页独立 SEO title/description；无 JS 时正文完整可读；
 * - MathJax 资产由本模块复制到 public 目录（带内容 hash），客户端按需加载。
 */
import { createHash } from 'node:crypto';
import {
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve, sep } from 'node:path';
import { JSDOM } from 'jsdom';
import { createMarkdownRenderer } from './markdown.ts';

const require = createRequire(import.meta.url);

export interface SiteConfig {
  /** 站点名（logo / title 后缀） */
  siteName: string;
  /** 版本号（logo 下小字） */
  siteVersion: string;
  /** 页脚版权占位（机构/人名） */
  copyright: string;
  /** Markdown 内容目录（相对项目根） */
  contentDir: string;
  /** 生成目录（相对项目根，含页面 HTML 与 public 资产） */
  outputDir: string;
}

export interface Heading {
  level: number;
  text: string;
  id: string;
}

export interface Page {
  /** 文件基名（introduction） */
  slug: string;
  /** 输出文件名（introduction.html） */
  file: string;
  /** 页面标题（h1 文本） */
  title: string;
  /** SEO description（正文首段截断） */
  description: string;
  /** 页面是否含公式（按需加载 MathJax） */
  hasMath: boolean;
  /** 标题结构（用于导航派生） */
  headings: Heading[];
  /** 消毒后的正文 HTML */
  html: string;
}

export interface GeneratedSite {
  /** rollup 多页入口：{ key: 绝对路径 } */
  input: Record<string, string>;
  pages: Page[];
  /** 构建期校验发现的错误（非空时构建/启动必须失败） */
  errors: string[];
}

const SLUG_RE = /^[a-zA-Z0-9_-]+$/;

export function generateSite(config: SiteConfig): GeneratedSite {
  const errors: string[] = [];
  const renderer = createMarkdownRenderer();
  // resolve 而非 join：contentDir/outputDir 允许传入绝对路径（测试等场景）
  const contentDir = resolve(process.cwd(), config.contentDir);
  const outputDir = resolve(process.cwd(), config.outputDir);

  // 安全保护：outputDir 不能是项目根或其祖先目录——否则 rmSync 会递归删除
  // 项目文件（如误配 outputDir: '.' 或 '..'）
  const projectRoot = resolve(process.cwd());
  if (projectRoot === outputDir || projectRoot.startsWith(outputDir + sep)) {
    return {
      input: {},
      pages: [],
      errors: [`outputDir 不能是项目根或其父级目录（当前: ${config.outputDir}）`],
    };
  }

  rmSync(outputDir, { recursive: true, force: true });
  mkdirSync(outputDir, { recursive: true });

  const files = readdirSync(contentDir)
    .filter((f) => f.endsWith('.md'))
    .sort();
  if (files.length === 0) {
    return { input: {}, pages: [], errors: [`content 目录为空: ${config.contentDir}`] };
  }

  const pages: Page[] = [];
  for (const file of files) {
    const slug = file.replace(/\.md$/, '');
    if (!SLUG_RE.test(slug)) {
      errors.push(`文件名必须为 ASCII slug（字母/数字/-/_）: ${file}`);
      continue;
    }
    const source = readFileSync(join(contentDir, file), 'utf8');
    const doc = renderer.render(source);
    const dom = new JSDOM(`<div class="markdown-body">${doc.html}</div>`);
    const container = dom.window.document.querySelector('.markdown-body');
    if (!container) continue; // 理论上不可达（渲染输出自带该容器）
    const headings = extractHeadings(container);
    const title = headings.find((h) => h.level === 1)?.text ?? slug;
    const description = extractDescription(container);
    pages.push({
      slug,
      file: `${slug}.html`,
      title,
      description,
      hasMath: doc.hasMath,
      headings,
      html: doc.html,
    });
  }

  validateSite(pages, errors);

  // 无有效页面（如全部文件名非法）：errors 已含原因，直接返回
  if (pages.length === 0) {
    return { input: {}, pages, errors };
  }

  // 复制 MathJax 入口到 public 目录（带内容 hash，URL 稳定且可缓存）
  const mathjaxUrl = copyMathJax(outputDir);
  // 复制 MathJax 默认字体（mathjax-newcm）到本地，公式字形不依赖 CDN
  copyMathJaxFonts(outputDir);
  // 合并 content 同级 public/ 静态资产（图片等）到生成目录的 public/ 下
  copyStaticAssets(contentDir, outputDir);

  const input: Record<string, string> = {};
  const year = new Date().getFullYear();
  for (const page of pages) {
    const html = renderPageTemplate(config, page, pages, mathjaxUrl, year);
    const out = join(outputDir, page.file);
    writeFileSync(out, html);
    input[page.slug] = out;
  }
  // 根路径重定向到第一页（introduction）
  const entry = pages[0];
  const indexOut = join(outputDir, 'index.html');
  writeFileSync(indexOut, renderIndexPage(config, entry));
  input.index = indexOut;

  return { input, pages, errors };
}

/* ------------------------------------------------------------------ */
/* 标题 / 描述提取                                                      */
/* ------------------------------------------------------------------ */

function extractHeadings(container: Element): Heading[] {
  const headings: Heading[] = [];
  container.querySelectorAll('h1, h2, h3, h4').forEach((h) => {
    // 排除构建期注入的锚点链接文本（#）
    h.querySelector('.header-anchor')?.remove();
    const id = h.getAttribute('id');
    if (!id) return;
    headings.push({ level: Number(h.tagName[1]), text: h.textContent?.trim() ?? '', id });
  });
  return headings;
}

function extractDescription(container: Element): string {
  const first = container.querySelector('p');
  const text = first?.textContent?.trim() ?? '';
  return text.length > 160 ? `${text.slice(0, 157)}…` : text;
}

/* ------------------------------------------------------------------ */
/* 校验：页内重复 id / 死链接 / 死锚点（构建期拦截，模板使用者免踩坑）   */
/* ------------------------------------------------------------------ */

function validateSite(pages: Page[], errors: string[]): void {
  const pageById = new Map<string, Set<string>>();
  for (const page of pages) {
    const dom = new JSDOM(`<div class="markdown-body">${page.html}</div>`);
    const ids = new Set<string>();
    dom.window.document.querySelectorAll('[id]').forEach((el) => {
      const id = el.getAttribute('id') ?? '';
      if (ids.has(id)) {
        errors.push(`页内重复 id: ${page.file}#${id}`);
      }
      ids.add(id);
    });
    pageById.set(page.file, ids);
  }

  for (const page of pages) {
    const dom = new JSDOM(`<div class="markdown-body">${page.html}</div>`);
    const ids = pageById.get(page.file);
    dom.window.document.querySelectorAll('a[href]').forEach((a) => {
      const href = a.getAttribute('href') ?? '';
      checkHref(href, page.file, ids, pageById, errors);
    });
  }
}

/** 检查一个 href 是否指向存在的页面 / 存在的锚点 */
function checkHref(
  href: string,
  currentFile: string,
  currentIds: Set<string> | undefined,
  pageById: Map<string, Set<string>>,
  errors: string[],
): void {
  // 外部 URL / 协议链接（大小写不敏感，含 JavaScript: 等变体；危险协议已由 DOMPurify 清除）
  if (/^(https?:|mailto:|tel:|javascript:)/i.test(href)) {
    return;
  }
  if (href.startsWith('#')) {
    // 纯 # 是占位符（跳到页面顶部），不算死锚点
    if (href === '#') return;
    const id = decodeHash(href.slice(1));
    if (!currentIds?.has(id)) {
      errors.push(`死锚点: ${currentFile} 中 href="${href}" 指向不存在的 id`);
    }
    return;
  }
  // 相对页面链接（同目录扁平结构）
  const [filePart, hashPart] = href.split('#');
  if (!filePart.endsWith('.html')) return; // 非页面资源（图片等），跳过
  const target = pageById.get(filePart);
  if (!target) {
    errors.push(`死链接: ${currentFile} 中 href="${href}" 指向不存在的页面 ${filePart}`);
    return;
  }
  if (hashPart && !target.has(decodeHash(hashPart))) {
    errors.push(
      `死锚点: ${currentFile} 中 href="${href}" 指向 ${filePart} 不存在的 id #${hashPart}`,
    );
  }
}

/** 解码 URL 百分号编码的锚点片段（DOM 中 href 可能是编码形式）；失败时原样返回 */
function decodeHash(part: string): string {
  try {
    return decodeURIComponent(part);
  } catch {
    return part;
  }
}

/* ------------------------------------------------------------------ */
/* 页面模板                                                             */
/* ------------------------------------------------------------------ */

function renderPageTemplate(
  config: SiteConfig,
  page: Page,
  pages: Page[],
  mathjaxUrl: string,
  year: number,
): string {
  const title = `${page.title} — ${config.siteName} v${config.siteVersion}`;
  return `<!DOCTYPE html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="description" content="${escapeAttr(page.description)}" />
    <title>${escapeHtml(title)}</title>
    <script>
      // MathJax v4 配置（必须在其脚本加载之前设置；脚本按需注入，见 src/client.ts）
      window.MathJax = {
        tex: {
          inlineMath: [['$', '$'], ['\\\\(', '\\\\)']],
          displayMath: [['$$', '$$'], ['\\\\[', '\\\\]']],
        },
        options: {
          skipHtmlTags: ['script', 'noscript', 'style', 'textarea', 'pre', 'code'],
        },
        // 公式字形完全本地化（构建期复制 @mathjax/mathjax-newcm-font 到站点根），
        // 不依赖 jsdelivr CDN；见 src/ssg/site.ts 的 copyMathJaxFonts
        loader: {
          paths: { fonts: '/mathjax-newcm-font' },
        },
        output: {
          font: 'mathjax-newcm',
          fontPath: '/mathjax-newcm-font',
        },
      };
    </script>
    <link rel="stylesheet" href="/src/style.css" />
    <script type="module" src="/src/client.ts"></script>
  </head>
  <body data-mathjax-src="${mathjaxUrl}">
    <a class="skip-link" href="#main">跳到主要内容</a>
    <div class="document">
      ${renderSidebar(config, page, pages)}
      <main
        id="main"
        class="body markdown-body"
        data-has-math="${page.hasMath ? 'true' : 'false'}"
      >
${page.html}
      </main>
    </div>
    <footer class="footer">© ${year} ${escapeHtml(config.copyright)}</footer>
  </body>
</html>
`;
}

function renderIndexPage(config: SiteConfig, entry: Page): string {
  const file = escapeAttr(entry.file);
  return `<!DOCTYPE html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta http-equiv="refresh" content="0; url=${file}" />
    <title>${escapeHtml(`${config.siteName} v${config.siteVersion}`)}</title>
  </head>
  <body>
    <p>正在跳转到 <a href="${file}">${escapeHtml(entry.title)}</a>…</p>
  </body>
</html>
`;
}

/* ------------------------------------------------------------------ */
/* 侧边栏（导航单一数据源：从各页标题结构派生）                          */
/* ------------------------------------------------------------------ */

function renderSidebar(config: SiteConfig, current: Page, pages: Page[]): string {
  const nav = pages.map((p) => renderNavItem(p, p.slug === current.slug)).join('');
  return `<nav class="sidebar" aria-label="文档导航">
    <div class="sidebar-inner">
      <button type="button" class="nav-toggle" aria-expanded="false" aria-controls="nav-tree">☰ 目录</button>
      <p class="logo"><a href="${pages[0].file}">${escapeHtml(config.siteName)}<span class="version">v${escapeHtml(config.siteVersion)}</span></a></p>
      <h3 class="nav-title">Navigation</h3>
      <ul class="nav" id="nav-tree">${nav}</ul>
    </div>
  </nav>`;
}

/** 递归渲染一页的导航项：h1 → 顶层，h2/h3/h4 → 嵌套子级 */
function renderNavItem(page: Page, current: boolean): string {
  const top = page.headings.find((h) => h.level === 1);
  const label = top?.text ?? page.title;
  const cls = current ? ' class="current"' : '';
  const children = page.headings.filter((h) => h.level > 1);
  const childrenHtml =
    children.length > 0 ? `<ul>${renderNestedList(children, page.file)}</ul>` : '';
  return `<li${cls}><a href="${page.file}">${escapeHtml(label)}</a>${childrenHtml}</li>`;
}

/**
 * 把标题序列按层级渲染为嵌套 <li> 列表：
 * 每个标题渲染为一项，其后连续「更深层级」的标题递归为子列表。
 * 跳级标题（如 h2 后直接 h4）也正常渲染为一项。
 */
function renderNestedList(headings: Heading[], file: string): string {
  let out = '';
  let i = 0;
  while (i < headings.length) {
    const h = headings[i];
    out += `<li><a href="${file}#${escapeAttr(h.id)}">${escapeHtml(h.text)}</a>`;
    i++;
    const deeper: Heading[] = [];
    while (i < headings.length && headings[i].level > h.level) deeper.push(headings[i++]);
    if (deeper.length > 0) {
      out += `<ul>${renderNestedList(deeper, file)}</ul>`;
    }
    out += '</li>';
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* 工具                                                                 */
/* ------------------------------------------------------------------ */

/** 复制 mathjax 入口到 public 目录（带 sha1 前缀），返回浏览器可用的 URL */
function copyMathJax(outputDir: string): string {
  const src = require.resolve('mathjax/tex-mml-chtml.js');
  const content = readFileSync(src);
  const hash = createHash('sha1').update(content).digest('hex').slice(0, 8);
  const fileName = `tex-mml-chtml-${hash}.js`;
  const publicDir = join(outputDir, 'public');
  mkdirSync(publicDir, { recursive: true });
  const target = join(publicDir, fileName);
  if (!existsSync(target)) {
    writeFileSync(target, content);
  }
  // MathJax 无障碍语音（sre）按需从站点根 /sre/ 加载 worker 与规则数据：
  // 一并复制（官方包资产，离线可用），避免 worker 加载失败产生 console 错误
  const sreDir = join(dirname(src), 'sre');
  if (existsSync(sreDir) && !existsSync(join(publicDir, 'sre'))) {
    cpSync(sreDir, join(publicDir, 'sre'), { recursive: true });
  }
  return `/tex-mml-chtml-${hash}.js`;
}

/**
 * 复制 MathJax v4 默认字体（mathjax-newcm）的最小运行集到站点根，
 * 使公式字形完全本地化（默认从 jsdelivr CDN 加载，网络受限时公式无法渲染）。
 *
 * 参考 https://docs.mathjax.org/en/latest/web/hosting.html 与
 * https://docs.mathjax.org/en/latest/output/fonts.html ：
 *   output.font = 'mathjax-newcm' + output.fontPath = 字体包目录 URL。
 *
 * 字体包是 mathjax 的依赖（pnpm 结构下根 node_modules 无 @mathjax 链接，
 * 故从 mathjax 包内解析）。MathJax 单文件 bundle（UMD）按需加载字形与
 * 动态字体数据，请求路径为 fontPath + /chtml/…，且文件必须是被非 module
 * 脚本可直接执行的 UMD 格式——即包内 chtml/ 目录（mjs/ 是 ESM，含 import，
 * 非 module 加载会报 "Cannot use import statement outside a module"）。
 * 三种目录结构各放一份，覆盖 bundle 内部可能的 fontURL 写法。
 */
function copyMathJaxFonts(outputDir: string): void {
  const fontPkg = createRequire(require.resolve('mathjax/package.json')).resolve(
    '@mathjax/mathjax-newcm-font/package.json',
  );
  const fontDir = dirname(fontPkg);
  const base = join(outputDir, 'public', 'mathjax-newcm-font');
  mkdirSync(base, { recursive: true });

  // 字形（woff2，105 个）与动态字体范围数据（UMD 版，40 个）
  const woffSrc = join(fontDir, 'chtml', 'woff2');
  const dynSrc = join(fontDir, 'chtml', 'dynamic');
  for (const rel of ['chtml', 'js/chtml', 'mjs/chtml']) {
    const dstWoff = join(base, rel, 'woff2');
    if (existsSync(woffSrc) && !existsSync(dstWoff)) {
      cpSync(woffSrc, dstWoff, { recursive: true });
    }
    const dstDyn = join(base, rel, 'dynamic');
    if (existsSync(dynSrc) && !existsSync(dstDyn)) {
      cpSync(dynSrc, dstDyn, { recursive: true });
    }
  }

  // 包元数据
  const pkg = join(fontDir, 'package.json');
  if (existsSync(pkg) && !existsSync(join(base, 'package.json'))) {
    cpSync(pkg, join(base, 'package.json'));
  }
}

/**
 * 合并 content 同级 public/ 静态资产（图片、favicon 等）到生成目录的
 * public/ 下（约定：public/ 与 content/ 位于同一目录，浏览器路径与站点根
 * 一致，如 /xxx.png）。与 MathJax 资产共存于同一 publicDir。
 */
function copyStaticAssets(contentDir: string, outputDir: string): void {
  const projectPublic = join(dirname(contentDir), 'public');
  if (!existsSync(projectPublic)) return;
  const publicDir = join(outputDir, 'public');
  mkdirSync(publicDir, { recursive: true });
  for (const entry of readdirSync(projectPublic)) {
    const src = join(projectPublic, entry);
    const dest = join(publicDir, entry);
    if (!existsSync(dest)) {
      // 递归复制：public/ 下允许子目录（图片目录等）
      cpSync(src, dest, { recursive: true });
    }
  }
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function escapeAttr(text: string): string {
  return escapeHtml(text).replace(/"/g, '&quot;');
}
