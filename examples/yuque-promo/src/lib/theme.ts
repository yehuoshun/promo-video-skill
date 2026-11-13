/**
 * 配色只改这里。三色基调，别加第四种强调色——片子会脏。
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
