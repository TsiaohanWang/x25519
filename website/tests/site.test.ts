/**
 * 站点生成测试（node 环境）：多页输出、导航派生、构建期校验、MathJax/静态资产。
 * 主流程用仓库真实 content/ 目录（回归保护：内容自身不得有死链接/死锚点），
 * 错误场景用临时目录构造。
 */
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type GeneratedSite, generateSite, type SiteConfig } from '../src/ssg/site.ts';

const tmpRoot = mkdtempSync(join(tmpdir(), 'ssg-site-'));
const outDir = join(tmpRoot, 'out');

const config: SiteConfig = {
  siteName: 'Test Docs',
  siteVersion: '1.0',
  copyright: 'Test Org',
  contentDir: 'content',
  outputDir: outDir,
};

let site: GeneratedSite;

beforeAll(() => {
  site = generateSite(config);
});

afterAll(() => {
  // 临时输出目录由 generateSite 在下次运行时清空，无需手动清理
});

function readOut(file: string): string {
  return readFileSync(join(outDir, file), 'utf8');
}

/** 在临时目录构造站点（每用例独立），返回生成结果 */
function generateInTmp(files: Record<string, string>): GeneratedSite {
  const dir = mkdtempSync(join(tmpRoot, 'case-'));
  for (const [name, content] of Object.entries(files)) {
    writeFileSync(join(dir, name), content);
  }
  return generateSite({
    siteName: 'T',
    siteVersion: '1.0',
    copyright: 'T',
    contentDir: dir,
    outputDir: join(dir, 'out'),
  });
}

describe('主流程（真实 content/）', () => {
  // 教程内容：首页 + 16 章（文件名即 slug，排序后首页为入口）
  const EXPECTED_SLUGS = [
    '00-introduction',
    '01-modular-arithmetic',
    '02-group-theory',
    '03-finite-fields',
    '04-elliptic-curves',
    '05-data-representation',
    '06-addition-subtraction',
    '07-multiplication',
    '08-multiplicative-inverse',
    '09-pack-unpack',
    '10-curve-equation',
    '11-point-addition',
    '12-scalar-multiplication',
    '13-key-generation',
    '14-key-exchange',
    '15-complete-implementation',
    '16-code-listings',
  ];

  it('生成全部页面且无校验错误（内容自身无死链接/死锚点）', () => {
    expect(site.errors).toEqual([]);
    expect(site.pages.map((p) => p.slug)).toEqual(EXPECTED_SLUGS);
  });

  it('输出文件齐全：全部页面 + index 重定向 + MathJax 资产', () => {
    for (const f of [...EXPECTED_SLUGS.map((s) => `${s}.html`), 'index.html']) {
      expect(existsSync(join(outDir, f))).toBe(true);
    }
    const publicFiles = readdirSync(join(outDir, 'public'));
    expect(publicFiles.some((f) => f.startsWith('tex-mml-chtml-') && f.endsWith('.js'))).toBe(true);
  });

  it('代码高亮主题：style.css 提供 hljs token 颜色（缺失则代码块无高亮）', () => {
    const css = readFileSync(join(process.cwd(), 'src', 'style.css'), 'utf8');
    expect(css).toContain('.markdown-body .hljs-keyword');
    expect(css).toContain('color: #d73a49');
    expect(css).toContain('.markdown-body .hljs-comment');
  });

  it('MathJax 字体本地化：字形与动态数据已复制到站点根', () => {
    // 公式渲染不依赖 jsdelivr CDN（网络受限时也能显示）
    expect(
      existsSync(join(outDir, 'public', 'mathjax-newcm-font', 'chtml', 'woff2', 'mjx-ncm-n.woff2')),
    ).toBe(true);
    // 动态字体数据必须是 UMD 格式（(()=>{...}），ESM（含 import）无法被
    // MathJax 单文件 bundle 以非 module 方式加载
    const dyn = readFileSync(
      join(outDir, 'public', 'mathjax-newcm-font', 'chtml', 'dynamic', 'double-struck.js'),
      'utf8',
    );
    expect(dyn.startsWith('(()=>{')).toBe(true);
    expect(dyn).not.toContain('import ');
  });

  it('含公式页面的 MathJax 配置指向本地字体路径', () => {
    const html = readOut('01-modular-arithmetic.html');
    expect(html).toContain("font: 'mathjax-newcm'");
    expect(html).toContain("fontPath: '/mathjax-newcm-font'");
  });

  it('部署 base 前缀：字体与 MathJax 脚本路径带上 base（子路径部署）', () => {
    // 默认 base='/' 的行为（主流程已断言），此处验证 base='/x25519/' 的前缀注入
    const baseDir = join(tmpRoot, 'out-base');
    const site2 = generateSite({ ...config, outputDir: baseDir }, '/x25519/');
    expect(site2.errors).toEqual([]);
    const html = readFileSync(join(baseDir, '01-modular-arithmetic.html'), 'utf8');
    expect(html).toContain("fontPath: '/x25519/mathjax-newcm-font'");
    expect(html).toContain("paths: { fonts: '/x25519/mathjax-newcm-font' }");
    expect(html).toMatch(/data-mathjax-src="\/x25519\/tex-mml-chtml-[0-9a-f]{8}\.js"/);
  });

  it('index.html 重定向到第一页（首页）', () => {
    expect(readOut('index.html')).toContain('http-equiv="refresh"');
    expect(readOut('index.html')).toContain('url=00-introduction.html');
  });

  it('页面模板：SEO title/description、skip-link、nav、可点击锚点', () => {
    const html = readOut('00-introduction.html');
    const year = new Date().getFullYear();
    expect(html).toContain('<title>X25519 椭圆曲线密码学从零实现教程 — Test Docs v1.0</title>');
    expect(html).toContain('<meta name="description" content="');
    expect(html).toContain('<a class="skip-link" href="#main">');
    expect(html).toContain('<nav class="sidebar" aria-label="文档导航">');
    expect(html).toContain('class="header-anchor"');
    expect(html).toContain(`© ${year} Test Org`);
  });

  it('导航从标题派生：当前页高亮 + 嵌套子级锚点', () => {
    const html = readOut('00-introduction.html');
    expect(html).toContain('<li class="current"><a href="00-introduction.html">');
    // 其他页为普通项，其子标题以 file#anchor 形式出现
    expect(html).toContain('<a href="01-modular-arithmetic.html">');
    expect(html).toContain('<a href="12-scalar-multiplication.html#');
  });

  it('MathJax 按需标记：公式页 true、无公式页 false', () => {
    // 首页无公式（仅反引号代码片段），第 1 章含大量公式
    expect(readOut('00-introduction.html')).toContain('data-has-math="false"');
    expect(readOut('01-modular-arithmetic.html')).toContain('data-has-math="true"');
  });

  it('body 携带 MathJax 资产 URL（按需注入用）', () => {
    const html = readOut('01-modular-arithmetic.html');
    expect(html).toMatch(/data-mathjax-src="\/tex-mml-chtml-[0-9a-f]{8}\.js"/);
  });

  it('每页 title 取自 h1', () => {
    expect(site.pages[0].title).toBe('X25519 椭圆曲线密码学从零实现教程');
    expect(site.pages[1].title).toBe('第 1 章：模运算与同余');
  });
});

describe('构建期校验（错误场景）', () => {
  it('死锚点：指向本页不存在的 id → 报错', () => {
    const result = generateInTmp({ 'a.md': '## Real\n\n[跳转](#nope)' });
    expect(result.errors.some((e) => e.includes('死锚点') && e.includes('#nope'))).toBe(true);
  });

  it('死链接：指向不存在的页面 → 报错', () => {
    const result = generateInTmp({ 'a.md': '# A\n\n[页](missing.html)' });
    expect(result.errors.some((e) => e.includes('死链接') && e.includes('missing.html'))).toBe(
      true,
    );
  });

  it('跨页死锚点：指向其他页不存在的 id → 报错', () => {
    const result = generateInTmp({
      'a.md': '# A\n\n## Real',
      'b.md': '# B\n\n[去 A](a.html#nope)',
    });
    expect(result.errors.some((e) => e.includes('死锚点') && e.includes('a.html#nope'))).toBe(true);
  });

  it('页内重复 id → 报错', () => {
    // "## a" 生成 id="a"，再手写 <a id="a"> 形成页内重复
    const result = generateInTmp({ 'a.md': '## a\n\n<a id="a"></a>' });
    expect(result.errors.some((e) => e.includes('页内重复 id'))).toBe(true);
  });

  it('非法文件名（非 ASCII slug）→ 报错', () => {
    const result = generateInTmp({ 'hello world.md': '# Hi' });
    expect(result.errors.some((e) => e.includes('ASCII slug'))).toBe(true);
  });

  it('空 content 目录 → 报错', () => {
    const result = generateInTmp({});
    expect(result.errors.some((e) => e.includes('content 目录为空'))).toBe(true);
  });

  it('outputDir 配置为项目根或父级 → 拒绝（防递归删除）', () => {
    const dir = mkdtempSync(join(tmpRoot, 'guard-'));
    const result = generateSite({
      siteName: 'T',
      siteVersion: '1.0',
      copyright: 'T',
      contentDir: join(dir, 'content'),
      outputDir: '.', // 项目根
    });
    expect(result.errors.some((e) => e.includes('outputDir 不能是项目根'))).toBe(true);
  });

  it('public/ 子目录静态资产递归复制', () => {
    const dir = mkdtempSync(join(tmpRoot, 'assets-'));
    // 约定：public/ 与 content/ 同级
    mkdirSync(join(dir, 'content'));
    writeFileSync(join(dir, 'content', 'page.md'), '# Page');
    mkdirSync(join(dir, 'public', 'img'), { recursive: true });
    writeFileSync(join(dir, 'public', 'img', 'pic.svg'), '<svg/>');
    const out = join(dir, 'out');
    const result = generateSite({
      siteName: 'T',
      siteVersion: '1.0',
      copyright: 'T',
      contentDir: join(dir, 'content'),
      outputDir: out,
    });
    expect(result.errors).toEqual([]);
    expect(existsSync(join(out, 'public', 'img', 'pic.svg'))).toBe(true);
  });
});
