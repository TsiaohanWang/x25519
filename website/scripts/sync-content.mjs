#!/usr/bin/env node
/**
 * 内容同步脚本
 *
 * 单一来源：../x25519-tutorial/*.md（教程正文）
 * 产物：    src/content/docs/*.md（Starlight 内容集合，注入 frontmatter）
 *
 * - README.md → index.md（内部 .md 链接转为站内绝对路径；Starlight 约定
 *   index.md 渲染为站点根路由，即 /x25519/）
 * - 01~17 章 → 同名 slug，sidebar.order 按章节号排序
 * - title 取自 H1，description 取自首个正文段落
 */
import { readdirSync, readFileSync, writeFileSync, rmSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SRC = join(__dirname, '..', '..', 'x25519-tutorial');
const DST = join(__dirname, '..', 'src', 'content', 'docs');

/** YAML 安全的双引号标量（JSON 转义是合法 YAML 双引号） */
const yq = (s) => JSON.stringify(String(s).replace(/\s+/g, ' ').trim());

/** 从 Markdown 正文提取 H1 标题 */
function extractTitle(md) {
  const m = md.match(/^#\s+(.+)$/m);
  return m ? m[1].trim() : '';
}

/** 提取首个正文段落作为 description（跳过标题、引用、frontmatter、空行） */
function extractDescription(md) {
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
function chapterOrder(file) {
  const m = file.match(/^(\d{2})-/);
  return m ? parseInt(m[1], 10) : 99;
}

/** README 内部链接 .md → 站内绝对路径 */
function fixIntroLinks(md) {
  return md.replace(/\]\(([a-zA-Z0-9_-]+\.md)(#[^)]*)?\)/g, (_, slug, anchor = '') => {
    return `](/x25519/${slug.replace(/\.md$/, '')}/${anchor})`;
  });
}

/**
 * display 公式适配：
 * remark-math 6 只把“$$ 独占首行”的 fenced 多行块识别为 display math，
 * 其他两种常见写法都会被当作行内公式解析（导致 \tag 等报错）：
 *   1. 单行 `$$content$$`（同行闭合）
 *   2. 多行块：首行“$$ 后直接跟内容”，末行“内容以 $$ 结尾”
 * 这里统一改写为 fenced 三行块（数学内容不变）。
 */
function fixDisplayMath(md) {
  // 1. 单行 $$content$$（允许行首缩进；替换串中的 $$ 会被 JS 解释为字面 $，必须用函数替换）
  //    内容行必须继承 fence 的缩进：若 $$ 块在列表项内（有缩进），内容行脱离缩进
  //    会被 markdown 判为列表项外，导致 math flow 未闭合而吞掉后续正文。
  md = md.replace(/^(\s*)\$\$(.+)\$\$\s*$/gm, (_, pre, c) => `${pre}$$\n${pre}${c}\n${pre}$$`);
  // 2. 多行块：首行“$$内容”，中间若干行，末行“内容$$”（各行继承 fence 缩进）
  md = md.replace(
    /^(\s*)\$\$([^\n$][^\n]*)\n((?:[^\n]*\n)*?)([^\n]*?)\$\$\s*$/gm,
    (_, pre, first, mid, last) => {
      const midFixed = mid ? mid.split('\n').map((l) => pre + l).join('\n') : '';
      return `${pre}$$\n${pre}${first}\n${midFixed}${pre}${last}\n${pre}$$`;
    },
  );
  return md;
}

function buildFrontmatter({ title, description, order, draft = false }) {
  const lines = ['---', `title: ${yq(title)}`, `description: ${yq(description)}`];
  if (Number.isFinite(order)) lines.push(`sidebar:\n  order: ${order}`);
  lines.push('---');
  return lines.join('\n');
}

// 清空并重建产物目录
rmSync(DST, { recursive: true, force: true });
mkdirSync(DST, { recursive: true });

const files = readdirSync(SRC).filter((f) => f.endsWith('.md')).sort();
let count = 0;
for (const file of files) {
  const md = readFileSync(join(SRC, file), 'utf-8');
  let slug = file.replace(/\.md$/, '');

  if (file === 'README.md') {
    slug = 'index';
    const body = fixIntroLinks(md);
    const title = 'X25519 椭圆曲线密码学从零实现教程';
    const desc = extractDescription(body);
    writeFileSync(join(DST, `${slug}.md`),
      buildFrontmatter({ title, description: desc, order: 0 }) + '\n\n' + body);
    count++;
    continue;
  }

  const body = md.replace(/^---[\s\S]*?---\s*/, ''); // 去掉可能的旧 frontmatter
  const bodyFixed = fixDisplayMath(body);
  const title = extractTitle(bodyFixed);
  const desc = extractDescription(bodyFixed);
  writeFileSync(join(DST, `${slug}.md`),
    buildFrontmatter({ title, description: desc, order: chapterOrder(file) }) + '\n\n' + bodyFixed);
  count++;
}

console.log(`✔ 同步完成：${count} 个文档 → src/content/docs/`);
