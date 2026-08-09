import { defineConfig } from 'vite';
import type { SiteConfig } from './src/ssg/site.ts';
import { ssgPlugin } from './src/ssg/vite-plugin.ts';

// 站点参数：模板使用者改这里即可更新 logo、页脚与版本号
const site: SiteConfig = {
  siteName: 'X25519 从零实现教程',
  siteVersion: '1.0',
  copyright: 'Public Domain（基于 Kleppmann 论文与 TweetNaCl）',
  contentDir: 'content',
  outputDir: '.ssg',
};

export default defineConfig({
  plugins: [ssgPlugin(site)],
  build: {
    target: 'esnext',
  },
});
