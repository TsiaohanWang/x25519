import { defineConfig } from 'vite';
import type { SiteConfig } from './src/ssg/site.ts';
import { ssgPlugin } from './src/ssg/vite-plugin.ts';

// 站点参数：模板使用者改这里即可更新 logo、页脚、版本号与部署路径
const site: SiteConfig = {
  siteName: 'X25519 从零实现教程',
  siteVersion: '1.0',
  copyright: 'Public Domain（基于 Kleppmann 论文与 TweetNaCl）',
  contentDir: 'content',
  outputDir: '.ssg',
  // 部署到 GitHub Pages 项目站点（<user>.github.io/x25519/）时，这里必须与仓库名
  // 一致；域根部署（如自定义域名）改为 '/'。改动后重新 pnpm build 并推送即可。
  base: '/x25519/',
};

export default defineConfig(({ mode }) => ({
  // build 用 site.base（产物资源路径带前缀，配合 GitHub Pages 子路径），
  // dev 用 '/'（SSG 的 dev 路由中间件不处理 base 前缀）
  base: mode === 'production' ? (site.base ?? '/') : '/',
  plugins: [ssgPlugin(site)],
  build: {
    target: 'esnext',
  },
}));
