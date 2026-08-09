/**
 * 脚注标号带圈数字化：把 marked-footnote 输出的 `[1]` 标号替换为 ① ② … ㊿
 * （U+2460 起）。href 锚点与回链结构不变，仅替换展示文本。
 *
 * 映射：1–20 → ①–⑳（U+2460–U+2473），21–35 → ㉑–㉟（U+3251–U+325F），
 * 36–50 → ㊱–㊿（U+32B1–U+32BF）。超出范围或非数字标号保持原样。
 */

const RANGES: ReadonlyArray<readonly [start: number, count: number]> = [
  [0x2460, 20],
  [0x3251, 15],
  [0x32b1, 15],
];

const CIRCLED: readonly string[] = RANGES.flatMap(([start, count]) =>
  Array.from({ length: count }, (_, i) => String.fromCodePoint(start + i)),
);

/** 把容器内所有脚注引用标号替换为带圈数字（就地修改 DOM） */
export function circulizeFootnotes(container: Element): void {
  container.querySelectorAll('a[data-footnote-ref]').forEach((anchor) => {
    // marked-footnote 1.4 的标号文本为纯数字（如 "1"），非 "[1]"
    const match = /^(\d+)$/.exec(anchor.textContent?.trim() ?? '');
    if (!match) return;
    const n = Number(match[1]);
    if (n < 1 || n > CIRCLED.length) return;
    anchor.textContent = CIRCLED[n - 1];
  });
}
