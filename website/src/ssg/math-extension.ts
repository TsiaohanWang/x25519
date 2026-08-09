import type { TokenizerAndRendererExtension, Tokens } from 'marked';

/**
 * 数学公式保护扩展（marked tokenizer 层 + 占位符输出），构建期运行。
 *
 * 在 tokenizer 阶段将 `$...$`（行内）与 `$$...$$`（块级）提取为 math token；
 * renderer 输出一个空 `<span data-math="i">` 占位符（i 为该公式在 store 中的
 * 序号），由上层（src/ssg/markdown.ts）在 DOMPurify 消毒后按序号还原为
 * `$...$` 文本。
 *
 * 为什么用占位符而非实体编码：marked-smartypants 是 postprocess hook，会在
 * 完整 HTML 输出后全局替换 `--`、`'`、`"`、`...` 等字符（仅跳过
 * pre/code/kbd/script/math 标签内内容）——占位符不含这些字符，天然免疫；
 * 而 DOMPurify 消毒基于 DOM 解析，会把数字实体（`&#45;` 等）解码为字面字符，
 * 实体编码方案在消毒后会失效。占位符是空元素（`data-*` 属性默认保留），
 * 消毒前后均不被改动。
 */
interface MathToken {
  type: 'inlineMath' | 'blockMath';
  raw: string;
  math: string;
  display: boolean;
}

export interface MathStore {
  /** 记录一条公式，返回其序号（从 0 开始，与输出顺序一致） */
  push(math: string, display: boolean): number;
  /** 按序号取回公式内容与展示方式 */
  get(index: number): { math: string; display: boolean } | undefined;
}

/** 占位符正则：<span data-math="i"></span>（i 为十进制数字） */
export const MATH_PLACEHOLDER_RE = /<span data-math="(\d+)"><\/span>/g;

/**
 * 行内公式：$...$（$ 后/前不能直接跟空白，内容单行、不含 $）。
 * 内容允许单字符（$x$、$'$ 均匹配）；`(?=\S)` 与尾部 `\S` 共同保证内容非空，
 * `[^$\n]*?` 惰性匹配 + 尾部 `\S` 保证不以空白结尾。
 */
function inlineMathExtension(store: MathStore): TokenizerAndRendererExtension {
  return {
    name: 'inlineMath',
    level: 'inline',
    start(src: string) {
      return src.indexOf('$');
    },
    tokenizer(src: string): Tokens.Generic | undefined {
      const m = /^\$(?=\S)([^$\n]*?\S)\$/.exec(src);
      if (!m) return undefined;
      return { type: 'inlineMath', raw: m[0], math: m[1], display: false } as Tokens.Generic;
    },
    renderer(token: Tokens.Generic): string {
      const t = token as MathToken;
      const i = store.push(t.math, t.display);
      return `<span data-math="${i}"></span>`;
    },
  };
}

/** 块级公式：$$...$$（$$ 后可换行，内容跨行、至少 1 字符、不含 $$；行首或行中均可） */
function blockMathExtension(store: MathStore): TokenizerAndRendererExtension {
  return {
    name: 'blockMath',
    level: 'block',
    start(src: string) {
      return src.indexOf('$$');
    },
    tokenizer(src: string): Tokens.Generic | undefined {
      // 允许 "$$\n内容\n$$" 形式（内容首尾可含换行/空白）；$$$$ 空公式不匹配
      const m = /^\$\$([\s\S]+?)\$\$/.exec(src);
      if (!m) return undefined;
      return { type: 'blockMath', raw: m[0], math: m[1], display: true } as Tokens.Generic;
    },
    renderer(token: Tokens.Generic): string {
      const t = token as MathToken;
      const i = store.push(t.math, t.display);
      return `<span data-math="${i}"></span>\n`;
    },
  };
}

/** 注册到 marked.use({ extensions }) 的扩展数组（注入 store，消毒后还原用） */
export function mathExtensions(store: MathStore): TokenizerAndRendererExtension[] {
  return [inlineMathExtension(store), blockMathExtension(store)];
}
