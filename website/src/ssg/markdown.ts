/**
 * Markdown 渲染管线（构建期，Node 端运行，不进入浏览器 bundle）。
 *
 * 支持的语法矩阵：
 * - 基础 Markdown：标题 / 段落 / 列表 / 引用 / 链接 / 图片 / 代码 / 水平线 / 转义
 * - GFM（marked 默认开启）：表格（含对齐）/ 删除线 / 任务列表 / 自动链接
 * - 扩展：标题锚点 slug、脚注（带圈数字）、GFM Alerts、Emoji 短码、智能标点
 * - 数学公式：$...$ / $$...$$（math tokenizer 保护 + 实体编码，MathJax 排版）
 *
 * 安全（信任边界）：marked 官方明确声明不消毒输出；本模板将「内容不可信」作为
 * 默认假设，渲染结果统一经 DOMPurify 消毒——`javascript:` URL、事件属性、
 * `<script>` 等注入在构建期即被清除，运行时不再接触原始内容。
 */

import DOMPurify from 'dompurify';
import GithubSlugger from 'github-slugger';
import hljs from 'highlight.js/lib/core';
import bash from 'highlight.js/lib/languages/bash';
import c from 'highlight.js/lib/languages/c';
import css from 'highlight.js/lib/languages/css';
import javascript from 'highlight.js/lib/languages/javascript';
import json from 'highlight.js/lib/languages/json';
import makefile from 'highlight.js/lib/languages/makefile';
import markdown from 'highlight.js/lib/languages/markdown';
import plaintext from 'highlight.js/lib/languages/plaintext';
import python from 'highlight.js/lib/languages/python';
import typescript from 'highlight.js/lib/languages/typescript';
import xml from 'highlight.js/lib/languages/xml';
import { JSDOM } from 'jsdom';
import { Marked, type MarkedExtension, type Parser, type Tokens } from 'marked';
import alert from 'marked-alert';
import { markedEmoji } from 'marked-emoji';
import footnote from 'marked-footnote';
import { markedHighlight } from 'marked-highlight';
import { markedSmartypants } from 'marked-smartypants';
import { emojis } from '../data/emojis.ts';
import { circulizeFootnotes } from './footnote.ts';
import { MATH_PLACEHOLDER_RE, type MathStore, mathExtensions } from './math-extension.ts';

// 按需注册代码高亮语言（文档模板常用集；需要更多时在此追加）
hljs.registerLanguage('javascript', javascript);
hljs.registerLanguage('typescript', typescript);
hljs.registerLanguage('xml', xml);
hljs.registerLanguage('css', css);
hljs.registerLanguage('json', json);
hljs.registerLanguage('bash', bash);
hljs.registerLanguage('c', c);
hljs.registerLanguage('cpp', c); // C++ 与 C 共用高亮规则
hljs.registerLanguage('makefile', makefile);
hljs.registerLanguage('python', python);
hljs.registerLanguage('markdown', markdown);
hljs.registerLanguage('plaintext', plaintext);

// DOMPurify 需要 window 环境（Node 端用 jsdom 提供）
const purify = DOMPurify(new JSDOM('').window);

/** 标题锚点扩展：GitHub 风格 slug；slugger 实例跨文件共享（同名标题自动 -1）。 */
function headingIdExtension(slugger: GithubSlugger): MarkedExtension {
  return {
    renderer: {
      heading(this: { parser: Parser }, token: Tokens.Heading) {
        const text = this.parser.parseInline(token.tokens);
        // 与 GitHub slug 规则对齐：解码实体 → 去 HTML 标签 → slug（自动小写、去标点）
        const raw = unescapeHtml(text)
          .trim()
          .replace(/<\/?[a-z][^>]*>/gi, '');
        const id = slugger.slug(raw);
        return `<h${token.depth} id="${id}">${text}</h${token.depth}>\n`;
      },
    },
  };
}

/** 解码常见 HTML 数字/命名实体（标题 slug 前处理）；越界码点安全回退为空 */
function unescapeHtml(text: string): string {
  const codePoint = (code: number): string =>
    Number.isInteger(code) && code >= 0 && code <= 0x10ffff ? String.fromCodePoint(code) : '';
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_, n: string) => codePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h: string) => codePoint(parseInt(h, 16)));
}

export interface RenderedDoc {
  /** 消毒后的正文 HTML（含脚注带圈数字，标题含锚点链接） */
  html: string;
  /** 页面是否含公式（决定客户端是否按需加载 MathJax） */
  hasMath: boolean;
}

/** 标题锚点链接（docs 站标配的可点击 header anchor，构建期注入） */
function addHeaderAnchors(container: Element): void {
  container.querySelectorAll('h1, h2, h3, h4').forEach((h) => {
    const id = h.getAttribute('id');
    if (!id) return;
    const anchor = h.ownerDocument.createElement('a');
    anchor.className = 'header-anchor';
    anchor.href = `#${id}`;
    anchor.textContent = '#';
    anchor.setAttribute('aria-hidden', 'true');
    h.appendChild(anchor);
  });
}

/**
 * 创建渲染器实例。slugger 在实例内共享（跨文件不重置），
 * 同名标题自动加 `-1` 后缀，从根上避免同一文档出现重复 id；
 * 构建系统另做兜底校验（见 site.ts validateSite）。
 */
export function createMarkdownRenderer() {
  const md = new Marked({ gfm: true, breaks: false });
  const mathTokens: string[] = [];
  // 公式内容存储：renderer 输出占位符序号，消毒后按序号还原（见 render）
  const mathStore: Array<{ math: string; display: boolean }> = [];
  const store: MathStore = {
    push: (math, display) => {
      mathStore.push({ math, display });
      return mathStore.length - 1;
    },
    get: (i) => mathStore[i],
  };
  const slugger = new GithubSlugger();

  md.use(
    // 标题锚点（GitHub 风格 slug；## Design Goals → id="design-goals"）
    headingIdExtension(slugger),
    // 脚注：text[^1] + [^1]: 内容
    footnote(),
    // GFM Alerts：> [!NOTE/TIP/IMPORTANT/WARNING/CAUTION]
    alert(),
    // Emoji 短码：:smile: → 😄（映射表见 src/data/emojis.ts）
    markedEmoji({ emojis, renderer: (token) => token.emoji }),
    // 智能标点："引号"、-- 破折号、... 省略号
    markedSmartypants(),
    // 代码块语法高亮（highlight.js；langPrefix 输出 class="hljs language-xxx"）
    markedHighlight({
      langPrefix: 'hljs language-',
      highlight(code, lang) {
        // 未知语言回落 plaintext，避免 highlight.js 抛错；无语言保持纯文本
        const language = lang && hljs.getLanguage(lang) ? lang : 'plaintext';
        return hljs.highlight(code, { language }).value;
      },
    }),
    // 数学公式保护：$...$ / $$...$$ 提取为 math token（占位符输出，消毒后还原）
    { extensions: mathExtensions(store) },
    // 统计公式数量，供「按需加载 MathJax」决策
    {
      walkTokens(token) {
        if (token.type === 'inlineMath' || token.type === 'blockMath') {
          mathTokens.push(token.type);
        }
      },
    },
  );

  return {
    /**
     * 渲染单篇 Markdown 为消毒后的 HTML 字符串。
     * 渲染失败时兜底输出转义后的原文，保证构建不中断。
     */
    render(source: string): RenderedDoc {
      mathTokens.length = 0;
      mathStore.length = 0;
      let html: string;
      try {
        const raw = md.parse(source, { async: false }) as string;
        html = purify.sanitize(raw, { ADD_ATTR: ['target'] });
        // 还原公式占位符：消毒会解码数字实体，故在消毒后按原文插入（HTML 转义防注入）
        html = html.replace(MATH_PLACEHOLDER_RE, (_, index: string) => {
          const item = store.get(Number(index));
          if (!item) return '';
          const body = escapeHtml(item.math);
          return item.display ? `$$${body}$$` : `$${body}$`;
        });
      } catch (err) {
        console.error('[markdown] 渲染失败:', err);
        html = `<pre class="markdown-error">${escapeHtml(source)}</pre>`;
      }
      // 脚注带圈数字 + 标题锚点链接（构建期 DOM 处理，运行时零成本）
      const dom = new JSDOM(`<div class="markdown-body">${html}</div>`);
      const container = dom.window.document.querySelector('.markdown-body');
      if (container) {
        circulizeFootnotes(container);
        addHeaderAnchors(container);
        return { html: container.innerHTML, hasMath: mathTokens.length > 0 };
      }
      return { html, hasMath: mathTokens.length > 0 };
    },
  };
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
