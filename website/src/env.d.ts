/// <reference types="vite/client" />

/* window.MathJax 全局对象（v4 启动后挂载，由构建期配置脚本初始化） */
interface Window {
  MathJax?: {
    startup?: {
      /** 启动流程完成的 Promise */
      promise: Promise<unknown>;
    };
    /** 排版函数：对传入元素（默认整个文档）执行公式渲染 */
    typesetPromise?: (elements?: Element[]) => Promise<unknown>;
  };
}
