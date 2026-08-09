# X25519 从零实现教程 — 网页版

本目录是《X25519 椭圆曲线密码学从零实现教程》的网页应用，由
[minimal-spec-template](https://github.com/TsiaohanWang/minimal-spec-template)
（Vite 8 + marked + MathJax 的构建期 SSG 模板）生成：

- **构建期渲染**：`content/*.md` 在构建期渲染为多页静态 HTML，运行时无框架、零渲染成本；
- **导航自动派生**：侧边栏目录从各页标题结构自动生成；
- **公式按需加载**：仅含公式的页面注入 MathJax（`tex-mml-chtml.js`，离线可用）。

## 内容

教程正文位于 `content/`（与 `x25519-tutorial/` 下的 16 章 markdown 保持同步，
另加 `00-introduction.md` 首页）。修改内容只需编辑 `content/*.md`，导航自动更新。

> 提醒：`x25519-tutorial/` 是教程内容的**源**（含可编译的 C 实现）；
> `content/` 是网站副本。改内容时两处都要同步（或用 `cp x25519-tutorial/[0-9][0-9]-*.md content/`）。

## 快速开始

要求 Node >= 20.19，包管理器为 pnpm（`packageManager: pnpm@11.20.0`）。

```bash
pnpm install        # 安装依赖（pnpm store 固定在项目内 .pnpm-store）
pnpm run dev        # 开发预览（http://localhost:5173/）
pnpm run verify     # typecheck + lint + test + build 全量验证
pnpm run preview    # 本地预览构建产物（dist/）
```

构建产物在 `dist/`：17 个 HTML 页面 + `index.html`（重定向到首页）+
`assets/` + MathJax 资产（`tex-mml-chtml-*.js`、`sre/`），可部署到任意静态托管。

## 本地实测预览

三种方式，从轻到重：

### 1. 开发预览（推荐日常使用）

```bash
pnpm run dev
```

启动 Vite 开发服务器：<http://localhost:5173/>。内容修改即时热更新（HMR），
公式排版、侧边栏导航与生产构建一致。

### 2. 生产构建预览（验证构建产物）

```bash
pnpm run build      # 生成 dist/
pnpm run preview    # 预览 dist/，默认 http://localhost:4173/
```

`preview` 服务的就是最终部署到 GitHub Pages 的那份 `dist/`，与线上完全一致。
可用 curl 快速自检：

```bash
curl -I http://localhost:4173/            # 200，index.html 重定向到首页
curl -s http://localhost:4173/ | grep -o 'url=[^"]*'   # url=00-introduction.html
curl -I http://localhost:4173/01-modular-arithmetic.html
```

### 3. 真实浏览器回归（可选，最严格）

用 Playwright 启动无头 Chromium，对预渲染 HTML、MathJax 排版、代码高亮、
跨页导航做逐项断言（`scripts/verify-browser.mjs`，已适配本教程内容）：

```bash
pnpm exec playwright install chromium   # 首次需要，下载约 150MB
pnpm run build
pnpm run preview                        # 另开一个终端，保持运行
pnpm run verify:browser                 # 断言全部通过输出「全部通过」
```

> Linux 上若提示「Host system is missing dependencies」，先执行
> `sudo pnpm exec playwright install-deps` 安装浏览器系统库（macOS/Windows
> 通常不需要）。

也可以一条命令串起来（后台起 preview 再验证）：

```bash
pnpm run build
(pnpm run preview >/tmp/preview.log 2>&1 &)
sleep 2 && pnpm run verify:browser
pkill -f "vite preview"
```

## 部署到 GitHub Pages

### 方案 A（推荐）：website 作为独立 GitHub 仓库

把 `website/` 目录的内容推到一个新的 GitHub 仓库（例如 `x25519-tutorial-site`），
仓库内已自带 `.github/workflows/deploy.yml`（push 到 main 时自动构建并发布）：

```bash
cd x25519/website
git init
git add .
git commit -m "X25519 教程网站"
git remote add origin https://github.com/<你的用户名>/x25519-tutorial-site.git
git push -u origin main
```

然后在 GitHub 网页上操作一次：

1. 打开仓库 **Settings → Pages**；
2. **Build and deployment → Source** 选择 **GitHub Actions**（不要选 "Deploy from a
   branch"，部署由工作流完成）；
3. 等待 Actions 里名为 **Deploy to GitHub Pages** 的工作流跑完（绿色对勾）。

之后网站地址为：

```
https://<你的用户名>.github.io/x25519-tutorial-site/
```

以后每次 `git push` 到 main 都会自动重新构建并发布，无需手动操作。

> 若推送后 Actions 工作流没有出现：确认仓库根存在 `.github/workflows/deploy.yml`
> （本文件位于 `website/.github/workflows/deploy.yml`，即仓库根的
> `.github/workflows/`），且 `node_modules/`、`dist/` 未被 `git add`（已被
> `.gitignore` 排除）。

### 方案 B：整个 x25519 仓库部署（website 是子目录）

如果不想另建仓库，也可以把**整个 x25519 仓库**发布到 Pages，只部署其中的
`website/dist`：

1. 把 `x25519/website/.github/workflows/deploy.yml` 移动到仓库根
   `x25519/.github/workflows/deploy.yml`；
2. 工作流里 `build` job 的 `working-directory` 改为 `website`：
   ```yaml
   defaults:
     run:
       working-directory: website
   ```
3. 其余步骤不变（构建后在 `website/dist`，`upload-pages-artifact` 的 `path: dist`
   需相应改为 `website/dist`）；
4. 同样在 **Settings → Pages → Source: GitHub Actions** 开启。

网站地址为 `https://<你的用户名>.github.io/<x25519仓库名>/`。

### 方案 C：手动部署（不使用 Actions）

适合只想一次性发布、或想部署到任意静态托管（Netlify / Vercel / OSS 等）的情况：

```bash
pnpm run build
```

把 `dist/` 目录**内容**推送到仓库的 `gh-pages` 分支（或用 Netlify Drop、
`vercel deploy`、任意静态文件服务器）：

```bash
# 示例：用 git subtree 把 dist/ 发布到 gh-pages 分支
git add dist && git commit -m "build"
git subtree push --prefix dist origin gh-pages
```

然后在 **Settings → Pages → Source** 选择 **Deploy from a branch** →
`gh-pages` / `/(root)`。

> 提示：`dist/` 被 `.gitignore` 排除，手动部署前需要先 `git add -f dist` 或
> 临时取消忽略，否则 subtree push 无内容。

## 与模板的差异

1. **站点信息**（`vite.config.ts`）：`siteName: 'X25519 从零实现教程'`，
   版权标注为 Public Domain。
2. **代码高亮语言**（`src/ssg/markdown.ts`）：追加注册 `c`（含 `cpp`）、`python`、
   `makefile`，以覆盖教程中的 C / SageMath Python / Makefile 代码块。
3. **测试适配**（`tests/site.test.ts`、`scripts/verify-browser.mjs`）：主流程回归与
   真实浏览器回归均从模板示例页改为教程的 17 个页面。
4. **MathJax 字体本地化**（`src/ssg/site.ts`）：模板默认让 MathJax 从
   jsdelivr CDN 按需加载字形（`@mathjax/mathjax-newcm-font`），网络受限
   （如访问 jsdelivr 不稳定）时公式会因字体加载失败而不渲染。本站在构建期把
   该字体包的最小运行集复制到站点根 `mathjax-newcm-font/`（字形 + 动态数据，
   约 7 MB），并在页面 MathJax 配置中设置
   `output: { font: 'mathjax-newcm', fontPath: '/mathjax-newcm-font' }` 与
   `loader: { paths: { fonts: '/mathjax-newcm-font' } }`，公式渲染完全离线、
   不依赖任何外部网络。注意：MathJax 单文件 bundle 以**非 module** 方式加载
   动态字体数据，复制时必须取字体包内 `chtml/` 目录的 **UMD** 格式文件
   （`mjs/` 是 ESM，含 `import`，会导致
   `Cannot use import statement outside a module` 报错）。
5. **代码高亮颜色主题**（`src/style.css`）：模板的 markdown 渲染会输出
   highlight.js 的 token 类名（`hljs-keyword` 等），但样式表**未附带任何
   hljs 主题**，代码块实际显示为无颜色区分的纯文本。本站在 `style.css`
   末尾补全了 GitHub 浅色主题的 token 颜色规则（限定 `.markdown-body`
   作用域、背景沿用模板变量），C/Python/Makefile 等代码块恢复彩色高亮。
6. **部署 base 路径**（`vite.config.ts` + `src/ssg/site.ts`）：模板的产物
   全部使用站点根绝对路径（`/assets/...`），部署到 GitHub Pages 项目站点
   `<user>.github.io/<repo>/` 时所有资源会 404。本站在 `SiteConfig` 增加
   `base`（当前 `'/x25519/'`，必须与仓库名一致），构建期把 base 前缀注入
   assets、`data-mathjax-src`、MathJax `fontPath`/`paths.fonts`；dev 模式
   仍用 `/` 保证开发体验不变。自定义域名/域根部署时把 `base` 改为 `'/'`。

## 测试

```bash
pnpm run verify        # typecheck + lint + test + build 全量验证
pnpm run verify:browser  # 真实浏览器回归（需先装 chromium，见上文「本地实测预览」）
```

`pnpm run verify` 覆盖渲染管线（Markdown/GFM/公式/消毒）、站点生成（导航派生、
死链接/死锚点/重复 id 校验）、客户端交互（MathJax 按需注入、侧边栏折叠）；
`verify:browser` 额外用无头 Chromium 实测首页重定向、MathJax 排版、代码高亮与
跨页导航。

## 许可

模板为 [MIT](LICENSE)；教程正文与代码基于 Kleppmann 论文与 TweetNaCl，均为
可自由使用的内容（Public Domain）。
