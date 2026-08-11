import { defineCollection } from 'astro:content';
import { docsSchema } from '@astrojs/starlight/schema';
import type { Loader } from 'astro/loaders';
import { readdirSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * 教程单一来源：仓库根目录下的 x25519-tutorial/。
 * 本 loader 在构建/开发时直接读取这些 Markdown 文件并注入 frontmatter
 * （title 取自 H1、description 取自首段、sidebar.order 按章节号），
 * 不再生成任何中间副本（旧方案曾同步出 src/content/docs/）。
 * 内容只维护在 x25519-tutorial/ 一处。
 */
const SRC = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'x25519-tutorial');

/** 从 Markdown 正文提取 H1 标题 */
function extractTitle(md: string): string {
  const m = md.match(/^#\s+(.+)$/m);
  return m ? m[1].trim() : '';
}

/** 提取首个正文段落作为 description（跳过标题、引用、frontmatter、空行） */
function extractDescription(md: string): string {
  const lines = md.split('\n');
  let buf = '';
  for (const line of lines) {
    const s = line.trim();
    if (!s || s.startsWith('#') || s.startsWith('>') || s.startsWith('```') || s.startsWith('|')) {
      if (buf) break; // 段落结束
      continue;
    }
    buf += (buf ? ' ' : '') + s;
    if (buf.length > 160) break;
  }
  return buf.slice(0, 200);
}

/** 章节号：文件名前两位数字 */
function chapterOrder(file: string): number {
  const m = file.match(/^(\d{2})-/);
  return m ? parseInt(m[1], 10) : 99;
}

/** README 内部链接 .md → 站内绝对路径 */
function fixIntroLinks(md: string): string {
  return md.replace(/\]\(([a-zA-Z0-9_-]+\.md)(#[^)]*)?\)/g, (_m, slug: string, anchor = '') => {
    return `](/x25519/${slug.replace(/\.md$/, '')}/${anchor})`;
  });
}

/**
 * display 公式格式适配：
 * remark-math 6 只把“$$ 独占首行”的 fenced 多行块识别为 display math，
 * 其他两种常见写法都会被当作行内公式解析（导致 \tag 等报错）：
 *   1. 单行 `$$content$$`（同行闭合）
 *   2. 多行块：首行“$$ 后直接跟内容”，末行“内容以 $$ 结尾”
 * 这里统一改写为 fenced 三行块（数学内容不变）。
 * 注意：替换串中的 $$ 会被 JS 解释为字面 $，必须用函数替换；
 *       内容行必须继承 fence 的缩进——若 $$ 块在列表项内（有缩进），
 *       内容行脱离缩进会被 markdown 判为列表项外，导致 math flow 未闭合
 *       而吞掉后续正文。
 */
function fixDisplayMath(md: string): string {
  md = md.replace(/^(\s*)\$\$(.+)\$\$\s*$/gm, (_, pre: string, c: string) => `${pre}$$\n${pre}${c}\n${pre}$$`);
  md = md.replace(
    /^(\s*)\$\$([^\n$][^\n]*)\n((?:[^\n]*\n)*?)([^\n]*?)\$\$\s*$/gm,
    (_m, pre: string, first: string, mid: string, last: string) => {
      const midFixed = mid ? mid.split('\n').map((l) => pre + l).join('\n') : '';
      return `${pre}$$\n${pre}${first}\n${midFixed}${pre}${last}\n${pre}$$`;
    },
  );
  return md;
}

const tutorialLoader: Loader = {
  name: 'x25519-tutorial-loader',
  async load({ store, parseData, generateDigest, renderMarkdown, logger }) {
    const files = readdirSync(SRC).filter((f) => f.endsWith('.md')).sort();
    for (const file of files) {
      const raw = readFileSync(join(SRC, file), 'utf-8');
      let body = raw;
      let id: string;
      let title: string;
      if (file === 'README.md') {
        id = 'index'; // Starlight 约定：index.md → 站点根路由 /x25519/
        body = fixIntroLinks(raw);
        title = 'X25519 椭圆曲线密码学从零实现教程';
      } else {
        id = file.replace(/\.md$/, ''); // 01-modular-arithmetic.md → slug
        body = raw.replace(/^---[\s\S]*?---\s*/, ''); // 去掉可能的旧 frontmatter
        title = extractTitle(body);
      }
      body = fixDisplayMath(body);
      const description = extractDescription(body);
      const order = file === 'README.md' ? 0 : chapterOrder(file);
      const editUrl = `https://github.com/TsiaohanWang/x25519/edit/master/x25519-tutorial/${file}`;
      const data = await parseData({
        id,
        data: { title, description, sidebar: { order }, editUrl },
        filePath: join(SRC, file),
      });
      const rendered = await renderMarkdown(body);
      store.set({
        id,
        data,
        rendered,
        digest: generateDigest({ id, body, title, description, order }),
      });
    }
    logger.info(`已加载 ${files.length} 篇教程（直接读取 x25519-tutorial/，无中间副本）`);
  },
};

export const collections = {
  docs: defineCollection({ loader: tutorialLoader, schema: docsSchema() }),
};
