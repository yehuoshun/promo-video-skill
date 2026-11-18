/**
 * 配色只改这里。本片走「语雀绿卡片流」：浅色纸底 + 语雀绿 #00b96b。
 *
 * 两档绿：`accent` 只给大字号/色块/描边用（浅底上细字会糊），
 * 正文里的强调色一律用 `accentInk`（更深的绿），保证对比度够。
 * 别加第四种强调色——片子会脏。
 */
export const theme = {
  /** 纸底 */
  bg: "#f5f8f6",
  /** 纯白卡片 */
  bgCard: "#ffffff",
  /** 旧场景（Showcase/EffectsLab）里叫 card，语义同 bgCard；保留别名免得改两处 */
  card: "#ffffff",
  /** 更深一点的底，用于分区 */
  bgDeep: "#eaf1ed",
  ink: "#1d2129",
  inkSoft: "rgba(29,33,41,0.64)",
  inkFaint: "rgba(29,33,41,0.40)",
  /** 语雀绿：只给大字、色块、描边 */
  accent: "#00b96b",
  /** 深绿：正文强调、小字 */
  accentInk: "#00875a",
  accentSoft: "rgba(0,185,107,0.10)",
  /** 官方数字那一侧的灰：19 个要用「弱」的颜色，别用红色骂人 */
  muted: "#8a949e",
  mutedSoft: "rgba(138,148,158,0.14)",
  line: "rgba(29,33,41,0.10)",
  lineStrong: "rgba(29,33,41,0.18)",
  shadow: "0 24px 64px rgba(29,33,41,0.10), 0 2px 8px rgba(29,33,41,0.06)",
  font:
    '"Microsoft YaHei", "PingFang SC", "Noto Sans SC", "Source Han Sans SC", sans-serif',
  mono: '"Cascadia Mono", "Consolas", ui-monospace, monospace',
} as const;

/** 横竖两个版式的基准画布尺寸（竖版重排版式，不裁切横版） */
export const VW = 1080;
export const VH = 1920;