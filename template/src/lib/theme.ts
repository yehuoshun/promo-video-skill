/**
 * 配色只改这里。三色基调，别加第四种强调色——片子会脏。
 *
 * 注意：`public/lottie/demo-badge.json` 里的颜色是这里几个值的 0~1 浮点拷贝
 * （accent → `[0.5569, 0.9412, 0.7843, 1]`、bg → `[0.0275, 0.0353, 0.051, 1]`），
 * JSON 里存不了 hex，也没法 import 这个文件。改这里的色值要同步那份 JSON，
 * 否则样板间第 7 段（Lottie）会和画面其余部分不同调。
 */
export const theme = {
  bg: "#07090d",
  bgDeep: "#04060a",
  ink: "#f2f4f7",
  inkSoft: "rgba(242,244,247,0.62)",
  inkFaint: "rgba(242,244,247,0.42)",
  accent: "#8ef0c8",
  accentSoft: "rgba(142,240,200,0.16)",
  blue: "rgba(90,140,255,0.14)",
  line: "rgba(255,255,255,0.10)",
  card: "rgba(255,255,255,0.045)",
  font:
    '"Microsoft YaHei", "PingFang SC", "Noto Sans SC", "Source Han Sans SC", sans-serif',
  mono: '"Cascadia Mono", "Consolas", ui-monospace, monospace',
} as const;
