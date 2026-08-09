/**
 * SSG Vite 插件：dev 与 build 共用同一渲染管线。
 *
 * - `config` 钩子：生成 .ssg/*.html（含导航、校验），注入为 rollup 多页 input，
 *   并把 MathJax 资产目录设为 publicDir（不经过 Vite 模块分析，免疫依赖扫描问题）；
 * - `handleHotUpdate`：content/*.md 变更时重新生成并整页刷新；
 * - `configureServer`：dev 把 / 与 /*.html 请求路由到生成目录；
 * - `closeBundle`：构建后把 .ssg/*.html 移到 dist/ 根（部署惯例）。
 */
import { existsSync, readdirSync, renameSync, rmSync } from 'node:fs';
import { join, sep } from 'node:path';
import type { Plugin } from 'vite';
import { generateSite, type SiteConfig } from './site.ts';

export function ssgPlugin(config: SiteConfig): Plugin {
  const contentDirAbs = join(process.cwd(), config.contentDir);

  const regenerate = (): void => {
    const site = generateSite(config);
    if (site.errors.length > 0) {
      throw new Error(`SSG 校验失败:\n${site.errors.map((e) => `  - ${e}`).join('\n')}`);
    }
  };

  return {
    name: 'minimal-spec-ssg',
    config(userConfig) {
      const site = generateSite(config);
      if (site.errors.length > 0) {
        throw new Error(`SSG 校验失败:\n${site.errors.map((e) => `  - ${e}`).join('\n')}`);
      }
      return {
        ...userConfig,
        // MathJax 资产目录（构建期复制，避免 Vite 分析其内部动态导入）
        publicDir: join(process.cwd(), config.outputDir, 'public'),
        build: {
          ...userConfig.build,
          rollupOptions: {
            ...userConfig.build?.rollupOptions,
            input: site.input,
          },
        },
      };
    },
    handleHotUpdate(ctx) {
      // 以目录分隔符结尾，避免前缀误匹配（content-evil/xxx.md 不算 content/ 内）
      if (ctx.file.startsWith(contentDirAbs + sep)) {
        try {
          regenerate();
        } catch (error) {
          const err = error instanceof Error ? error : new Error(String(error));
          ctx.server.ws.send({
            type: 'error',
            err: { message: err.message, stack: err.stack ?? '' },
          });
          return [];
        }
        ctx.server.ws.send({ type: 'full-reload' });
        return [];
      }
    },
    // dev：生成的页面在 .ssg/ 下，把 / 与 /*.html 请求路由过去
    // （页面内相对链接随之解析到 /.ssg/ 下，dev 与 build 行为一致）
    configureServer(server) {
      server.middlewares.use((req, _res, next) => {
        const url = req.url ?? '';
        const file = url === '/' ? 'index.html' : url.startsWith('/') ? url.slice(1) : url;
        // 拒绝路径穿越（../ 或反斜杠），防止路由到生成目录之外的文件
        if (file.includes('..') || file.includes('\\')) return next();
        if (file.endsWith('.html') && existsSync(join(process.cwd(), config.outputDir, file))) {
          req.url = `/${config.outputDir}/${file}`;
        }
        next();
      });
    },
    // build：rollup 按 input 相对位置把 html 输出到 dist/.ssg/，
    // 这里移到 dist/ 根（部署惯例：index.html 在站点根），页面内相对链接不受影响
    closeBundle() {
      const distRoot = join(process.cwd(), 'dist');
      const htmlDir = join(distRoot, config.outputDir);
      if (!existsSync(htmlDir)) return;
      for (const f of readdirSync(htmlDir)) {
        if (f.endsWith('.html')) {
          renameSync(join(htmlDir, f), join(distRoot, f));
        }
      }
      rmSync(htmlDir, { recursive: true, force: true });
    },
  };
}
