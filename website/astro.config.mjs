// @ts-check
import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';
import sitemap from '@astrojs/sitemap';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';

// https://astro.build/config
export default defineConfig({
  site: 'https://tsiaohanwang.github.io',
  base: '/x25519/',
  trailingSlash: 'ignore',
  markdown: {
    remarkPlugins: [remarkMath],
    rehypePlugins: [rehypeKatex],
    // Shiki 跳过 language-math（remark-math 输出的公式节点），
    // 否则 display 公式的 <code class="language-math"> 会被当作代码块高亮改写
    syntaxHighlight: { type: 'shiki', excludeLangs: ['math'] },
  },
  integrations: [
    starlight({
      title: 'X25519 从零实现教程',
      description:
        '基于 Martin Kleppmann 论文《Implementing Curve25519/X25519》的 X25519 从零实现教程',
      logo: {
        src: './src/assets/x25519-logo.svg',
        alt: 'X25519',
      },
      editLink: {
        baseUrl: 'https://github.com/TsiaohanWang/x25519/edit/master/x25519-tutorial/',
      },
      lastUpdated: true,
      customCss: ['./src/styles/custom.css'],
      pagination: true,
      social: {
        github: 'https://github.com/TsiaohanWang/x25519',
      },
    }),
    sitemap(),
  ],
});
