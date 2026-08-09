/**
 * 客户端交互测试（jsdom 环境）：MathJax 按需注入、侧边栏折叠。
 * client.ts 为顶层执行代码，通过 vi.resetModules + 动态 import 反复执行；
 * beforeEach 同时清空 document.head 与 body，避免注入的 script 跨用例残留。
 */
// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { sanitizeMathLinks } from '../src/client';

function setupBody(hasMath: string, mathjaxSrc = ''): void {
  document.body.dataset.mathjaxSrc = mathjaxSrc;
  document.body.innerHTML = `
    <main id="main" data-has-math="${hasMath}"></main>
    <nav class="sidebar"></nav>
    <button type="button" class="nav-toggle" aria-expanded="false">☰ 目录</button>
  `;
}

function mathjaxScript(): HTMLScriptElement | null {
  return document.head.querySelector('script[src*="tex-mml-chtml"]');
}

beforeEach(() => {
  vi.resetModules();
  document.head.innerHTML = '';
  document.body.innerHTML = '';
  delete document.body.dataset.mathjaxSrc;
});

describe('MathJax 按需加载', () => {
  it('含公式页面注入脚本（async）', async () => {
    setupBody('true', '/tex-mml-chtml-abc123.js');
    await import('../src/client');
    const script = mathjaxScript();
    expect(script).not.toBeNull();
    expect(script?.async).toBe(true);
    expect(script?.src).toContain('/tex-mml-chtml-abc123.js');
  });

  it('无公式页面不注入脚本', async () => {
    setupBody('false', '/tex-mml-chtml-abc123.js');
    await import('../src/client');
    expect(mathjaxScript()).toBeNull();
  });

  it('无 mathjax URL 时不注入', async () => {
    setupBody('true', '');
    await import('../src/client');
    expect(mathjaxScript()).toBeNull();
  });
});

describe('移动端侧边栏折叠', () => {
  it('点击展开/收起并同步 aria-expanded', async () => {
    setupBody('false');
    await import('../src/client');
    const toggle = document.querySelector<HTMLButtonElement>('.nav-toggle');
    const sidebar = document.querySelector('.sidebar');
    expect(sidebar?.classList.contains('open')).toBe(false);
    toggle?.dispatchEvent(new MouseEvent('click'));
    expect(sidebar?.classList.contains('open')).toBe(true);
    expect(toggle?.getAttribute('aria-expanded')).toBe('true');
    toggle?.dispatchEvent(new MouseEvent('click'));
    expect(sidebar?.classList.contains('open')).toBe(false);
    expect(toggle?.getAttribute('aria-expanded')).toBe('false');
  });
});

describe('sanitizeMathLinks（MathJax \\href 协议注入兜底）', () => {
  it('清除 javascript: 协议链接，保留合法链接', () => {
    document.body.innerHTML = `
      <main id="main">
        <a href="javascript:alert(1)">坏</a>
        <a href="https://example.com">好</a>
        <a href="#anchor">锚点</a>
      </main>
    `;
    const main = document.getElementById('main') as HTMLElement;
    sanitizeMathLinks(main);
    const hrefs = [...document.querySelectorAll('#main a[href]')].map((a) =>
      a.getAttribute('href'),
    );
    expect(hrefs).toEqual(['https://example.com', '#anchor']);
  });

  it('大小写与前导空白变体同样清除', () => {
    document.body.innerHTML = `
      <main id="main">
        <a href="  JaVaScRiPt:alert(1)">变体1</a>
        <a href="data:text/html,<script>alert(1)</script>">变体2</a>
        <a href="vbscript:msgbox(1)">变体3</a>
      </main>
    `;
    sanitizeMathLinks(document.getElementById('main') as HTMLElement);
    expect(document.querySelectorAll('#main a[href]').length).toBe(0);
  });
});
