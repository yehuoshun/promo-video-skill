/**
 * 横竖两个版式的画布常量与取值小工具。
 *
 * 版式一律按「短边 1080」这一档设计：横版 1920×1080、竖版 1080×1920。
 * 每个场景组件都按这两套尺寸重排（不是把横版裁一刀），
 * 所以组件里到处需要「横版给这个值、竖版给那个值」——这里收成一个函数。
 */
export const canvas = (vertical: boolean) => ({
  W: vertical ? 1080 : 1920,
  H: vertical ? 1920 : 1080,
  /** 左右安全边距 */
  pad: vertical ? 72 : 132,
});

/** 按版式二选一：pick(vertical, 横版值, 竖版值) */
export const pick = <T,>(vertical: boolean, h: T, v: T): T => (vertical ? v : h);