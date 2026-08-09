/**
 * 客户端交互（原生 TypeScript，无框架）。
 *
 * 页面正文是构建期预渲染的静态 HTML，本文件只做少量渐进增强：
 * - MathJax 按需加载：仅当页面含公式时注入脚本，并用官方推荐的
 *   `typesetPromise([container])` 元素级排版（而非全文档重复扫描）；
 * - 排版完成后兜底清理危险链接（见 sanitizeMathLinks）；
 * - 移动端侧边栏折叠（≤940px 时导航默认收起，点击按钮展开）。
 *
 * 无轮询、无定时器：脚本加载完成用一次性 onload 事件等待。
 */

/** 排版后不允许存在的危险协议（大小写/前导空白不敏感） */
const UNSAFE_HREF_PROTOCOL = /^\s*(?:javascript|vbscript|data):/i;

/**
 * 排版完成后兜底清理危险链接：MathJax v4 的 tex-mml-chtml 单文件 bundle
 * 未内置 `ui/safe` 组件，`\href{javascript:alert(1)}{x}` 会被排版为可点击的
 * 危险链接。此处统一清除（与构建期 DOMPurify 消毒构成双层防线，覆盖
 * 构建期不可见的、由 MathJax 运行期生成的链接）。
 */
export function sanitizeMathLinks(container: Element): void {
  container.querySelectorAll('a[href]').forEach((anchor) => {
    const href = anchor.getAttribute('href') ?? '';
    if (UNSAFE_HREF_PROTOCOL.test(href)) {
      anchor.removeAttribute('href');
    }
  });
}

const main = document.getElementById('main');
const mathjaxSrc = document.body.dataset.mathjaxSrc;

// --- MathJax 按需加载与元素级排版 ---
if (main?.dataset.hasMath === 'true' && mathjaxSrc) {
  const script = document.createElement('script');
  script.src = mathjaxSrc;
  script.async = true;
  script.onload = () => {
    // 官方推荐：动态内容排版时传入容器元素，限定扫描范围
    window.MathJax?.typesetPromise?.([main])
      .then(() => sanitizeMathLinks(main))
      .catch((err: unknown) => {
        console.warn('[mathjax] 排版失败:', err);
      });
  };
  script.onerror = () => {
    console.warn('[mathjax] 脚本加载失败:', mathjaxSrc);
  };
  document.head.appendChild(script);
}

// --- 移动端侧边栏折叠 ---
const toggle = document.querySelector<HTMLButtonElement>('.nav-toggle');
const sidebar = document.querySelector('.sidebar');
toggle?.addEventListener('click', () => {
  const open = sidebar?.classList.toggle('open') ?? false;
  toggle.setAttribute('aria-expanded', String(open));
});
