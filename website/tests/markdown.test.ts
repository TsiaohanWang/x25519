/**
 * Markdown 渲染管线测试（node 环境）：基础 + GFM + 扩展 + 公式 + 消毒。
 * 直接复用 src/ssg/markdown.ts 的 createMarkdownRenderer（纯函数、无 DOM 依赖）。
 */
import { describe, expect, it } from 'vitest';
import { createMarkdownRenderer } from '../src/ssg/markdown.ts';

const renderer = createMarkdownRenderer();

function render(source: string): string {
  return renderer.render(source).html;
}

describe('基础 Markdown', () => {
  it('标题层级与段落', () => {
    const html = render('# H1\n\n正文段落');
    // addHeaderAnchors 会在标题内注入可点击锚点，故不断言闭合标签
    expect(html).toContain('<h1 id="h1">H1');
    expect(html).toContain('class="header-anchor"');
    expect(html).toContain('<p>正文段落</p>');
  });

  it('列表、引用、代码块、水平线', () => {
    const html = render('- 甲\n- 乙\n\n> 引用\n\n```\ncode\n```\n\n---');
    expect(html).toContain('<ul>');
    expect(html).toContain('<li>甲</li>');
    expect(html).toContain('<blockquote>');
    expect(html).toContain('<pre><code>code');
    expect(html).toContain('<hr>');
  });

  it('行内代码与链接', () => {
    const html = render('`code` 与 [链接](https://example.com)');
    expect(html).toContain('<code>code</code>');
    expect(html).toContain('<a href="https://example.com">链接</a>');
  });
});

describe('GFM', () => {
  it('表格（含对齐）', () => {
    const html = render('| a | b |\n| :- | -: |\n| 1 | 2 |');
    expect(html).toContain('<table>');
    expect(html).toContain('<th align="left">a</th>');
    expect(html).toContain('<th align="right">b</th>');
    expect(html).toContain('<td align="right">2</td>');
  });

  it('删除线、任务列表、自动链接', () => {
    const html = render('~~删~~\n\n- [x] 完成\n- [ ] 待办\n\nwww.example.com');
    expect(html).toContain('<del>删</del>');
    expect(html).toContain('<input checked="" disabled="" type="checkbox">');
    expect(html).toContain('<a href="http://www.example.com">www.example.com</a>');
  });
});

describe('扩展语法', () => {
  it('标题锚点 slug（GitHub 风格）', () => {
    const html = render('## Design Goals');
    expect(html).toContain('<h2 id="design-goals">');
  });

  it('跨文件共享 slugger：同名标题自动加 -1 后缀（避免重复 id）', () => {
    // 同一 renderer 实例连续渲染两篇含同名标题的文档
    render('# One\n\n## Concepts');
    const second = render('# Two\n\n## Concepts');
    expect(second).toContain('<h2 id="concepts-1">');
  });

  it('超大数字实体不抛错（防 RangeError 整页退化）', () => {
    // &#1114112; 超出 Unicode 码点范围，旧实现 fromCodePoint 抛 RangeError 导致整页退化
    const html = render('# &#1114112; 标题');
    expect(html).toContain('标题');
    expect(html).not.toContain('markdown-error');
  });

  it('脚注标号带圈数字', () => {
    const html = render('文字[^1]\n\n[^1]: 脚注内容');
    expect(html).toContain('data-footnote-ref');
    expect(html).toContain('>①</a>'); // 标号 1 → ①
    expect(html).toContain('id="footnote-1"');
    expect(html).toContain('href="#footnote-ref-1"'); // 回链
  });

  it('GFM Alerts 五种', () => {
    for (const kind of ['note', 'tip', 'important', 'warning', 'caution']) {
      const html = render(`> [!${kind.toUpperCase()}]\n> 提示内容`);
      expect(html).toContain(`markdown-alert-${kind}`);
    }
  });

  it('Emoji 短码', () => {
    const html = render(':rocket: 起飞');
    expect(html).toContain('🚀');
  });

  it('智能标点', () => {
    const html = render('"引号" 与 -- 破折号 与 ...');
    expect(html).toContain('“引号”');
    expect(html).toContain('–'); // en dash
    expect(html).toContain('…');
  });

  it('代码高亮（highlight.js）', () => {
    const html = render('```ts\nconst x: number = 1;\n```');
    expect(html).toContain('class="hljs language-ts"');
  });
});

describe('数学公式', () => {
  it("行内公式（含单字符 $x$、$'$）", () => {
    const html = render("$e^{i\\pi} + 1 = 0$ 与 $x$ 与 $'$");
    // 反斜杠原样保留；单引号被 HTML 转义（浏览器解析后还原为 TeX 原字符）
    expect(html).toContain('$e^{i\\pi} + 1 = 0$');
    expect(html).toContain('$x$');
    // 单引号在 HTML 文本节点无需转义，最终输出为字面 TeX 原字符（MathJax 直接排版）
    expect(html).toContain("$'$");
  });

  it('块级公式与跨行矩阵（反斜杠与 & 转义保留）', () => {
    const html = render('$$\\begin{pmatrix} a & b \\\\ c & d \\end{pmatrix}$$');
    expect(html).toContain('$$');
    expect(html).toContain('\\\\'); // 矩阵换行 \\ 原样保留（HTML 中转义为 &#92; 亦可）
    expect(html).toContain('&amp;'); // 与号转义，MathJax 收到原始 &
  });

  it('hasMath 探测', () => {
    expect(renderer.render('普通文本')).toHaveProperty('hasMath', false);
    expect(renderer.render('含公式 $x$')).toHaveProperty('hasMath', true);
    expect(renderer.render('$$\\int dx$$')).toHaveProperty('hasMath', true);
  });

  it('公式内容不受 smartypants 破坏', () => {
    const html = render('$a - b$');
    expect(html).toContain('$a - b$');
    expect(html).not.toContain('$a – b$'); // en dash 未侵入公式
  });
});

describe('安全（信任边界：DOMPurify 消毒）', () => {
  it('javascript: URL 被清除', () => {
    const html = render('[click](javascript:alert(1))');
    expect(html).not.toContain('javascript:');
  });

  it('事件属性被清除', () => {
    const html = render('<img src=x onerror=alert(1)>');
    expect(html).not.toContain('onerror');
  });

  it('<script> 与内联脚本被清除', () => {
    const html = render('<script>alert(1)</script>正文');
    expect(html).not.toContain('<script');
    expect(html).toContain('正文');
  });
});
