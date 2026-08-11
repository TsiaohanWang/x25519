# X25519 椭圆曲线密码学从零实现教程

本仓库包含：

- `curve25519-zh.md` —— Martin Kleppmann 论文
  《Implementing Curve25519/X25519: A Practical Guide to Security Properties and
  Their Proofs》的中文转录文本（附论文 PDF）。
- `x25519-tutorial/` —— 依据论文编写的系列教程（单一内容来源，18 个 Markdown
  文件：`README.md` 简介 + `01`~`17` 章）。配套 C 实现 `x25519.c`/`x25519.h`
  与测试 `test.c`（`cd x25519-tutorial && make && ./test`）。
- `website/` —— 教程的网页应用（**Astro + Starlight**，GitHub Pages 部署）。

## 网站构建与开发

```bash
cd website
pnpm install        # 安装依赖
pnpm dev            # 本地开发（自动同步内容后启动 http://localhost:4321/x25519/）
pnpm build          # 同步内容 + 构建到 dist/
pnpm preview        # 预览构建产物
pnpm check          # 类型检查（astro check）
```

- **内容单一来源**：`../x25519-tutorial/*.md`。`src/content.config.ts` 中的
  自定义 loader 在构建/开发时**直接读取**该目录并注入 frontmatter（title 取自
  H1、description 取自首段、sidebar order 按章节号），修正 display 公式格式、
  改写简介内部链接，并在 loader 内用 `renderMarkdown` 预渲染正文——**不生成
  任何中间副本**，`src/content/docs/` 已不存在。内容只维护在
  `x25519-tutorial/` 一处。
- **数学公式**：KaTeX（`remark-math` + `rehype-katex`）。
- **代码高亮**：Starlight 内置 expressive-code（c/bash/makefile 等语言）。
- **搜索**：Starlight 内置 Pagefind。
- **部署**：`.github/workflows/deploy.yml`，push 到 `master` 自动构建发布，
  站点根路径 `/x25519/`（`site` + `base` 配置于 `website/astro.config.mjs`）。
