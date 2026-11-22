import React from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from "remotion";
import { BEAT_SEC, FlipLine } from "../effects/FlipCascade";
import { HEIGHT, WIDTH } from "../lib/timing";
import { theme } from "../lib/theme";

/**
 * 翻转瀑布流字幕样板间 —— 只为看效果，不参与成片。
 *
 * 参考片里**只有一行字**，所以样板间也先按单行给（Flip / FlipCalm），
 * 另外给一条多行构图（FlipMulti）证明它能同屏叠几行——多行时行距必须
 * ≥ 行高 × 1.4，因为白卡比行高出一截（cardHeightRatio ≈ 1.32），
 * 行距按行高给会叠成一团。
 *
 * 字号按参考片实测：字形格 222×259（1080 宽裁切坐标）≈ 一行 5 个字。
 * 字再小就看不出白卡翻转，会读成一排小字在淡入。
 */
/** 主行词表：参考片那种一段一段换词的流 */
export const ROWS_MAIN = ["不是**淡入**淡出", "是**一直**在流", "旧词被**挤出去**", "新词从**右边**来"];

const plain = (s: string) => s.replace(/\*\*/g, "");

/**
 * 一条字幕要播多久（帧）。按字数算自然时长再向上取整到整拍——
 * 短词不空等、长词不挤团。别在 Root.tsx 里手写帧数，换词表后必漂。
 */
export const flipFrames = (rows: string[], flipDur: number, charStagger: number, from = 0.15) => {
  const sec = rows.reduce((acc, r) => {
    const natural = (plain(r).length - 1) * charStagger + flipDur + 0.16;
    return acc + Math.max(1, Math.ceil(natural / BEAT_SEC - 1e-6)) * BEAT_SEC;
  }, from);
  return Math.round((sec + 1.2) * 30);
};

const GRID = "linear-gradient(" + theme.line + " 2px, transparent 2px)";
const GRID_X = "linear-gradient(90deg, " + theme.line + " 2px, transparent 2px)";

const Backdrop: React.FC = () => (
  <AbsoluteFill style={{ background: theme.bg }}>
    <AbsoluteFill
      style={{ backgroundImage: GRID + "," + GRID_X, backgroundSize: "96px 96px", opacity: 0.55 }}
    />
  </AbsoluteFill>
);

const Caption: React.FC<{ text: string; top: number }> = ({ text, top }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return (
    <div
      style={{
        position: "absolute",
        left: 64,
        top,
        fontFamily: theme.font,
        fontSize: 22,
        letterSpacing: 2,
        color: theme.inkFaint,
        opacity: Math.min(1, Math.max(0, (frame / fps - 0.05) / 0.3)),
      }}
    >
      {text}
    </div>
  );
};

/** 单行 · 参考片的原样 */
const Single: React.FC<{ flipDur: number; charStagger: number }> = ({
  flipDur,
  charStagger,
}) => (
  <AbsoluteFill>
    <Backdrop />
    <Caption top={120} text="白卡逐字翻转 · 整行往左流 · 旧词被画面吃掉" />
    <FlipLine
      rows={ROWS_MAIN}
      anchor={0.52}
      fontSize={220}
      rowHeight={260}
      from={0.15}
      charStagger={charStagger}
      flipDur={flipDur}
      yaw={-10}
    />
  </AbsoluteFill>
);

/** 多行 · 行距按行高 1.6 倍给，卡才不压到邻行 */
const Multi: React.FC = () => (
  <AbsoluteFill>
    <Backdrop />
    <Caption top={92} text="三行同屏：每条各走各的节拍，行距 ≥ 行高 × 1.4" />
    <FlipLine
      rows={["第一行**翻过来**", "然后就**走掉了**"]}
      anchor={0.26}
      fontSize={150}
      rowHeight={180}
      from={0.15}
      charStagger={0.08}
      flipDur={0.26}
      yaw={-10}
    />
    <FlipLine
      rows={["第二行**慢半拍**", "照样往左**流**"]}
      anchor={0.52}
      fontSize={150}
      rowHeight={180}
      from={0.35}
      charStagger={0.08}
      flipDur={0.26}
      yaw={-10}
    />
    <FlipLine
      rows={["第三行**压住底**", "一起被**吃掉**"]}
      anchor={0.78}
      fontSize={150}
      rowHeight={180}
      from={0.55}
      charStagger={0.08}
      flipDur={0.26}
      yaw={-10}
    />
  </AbsoluteFill>
);

/** 快档：0.26s 翻完、0.08s 错峰（参考片实测值） */
export const Flip: React.FC = () => <Single flipDur={0.26} charStagger={0.08} />;

/** 慢档：放慢一倍，用来看清白卡是怎么倒的 */
export const FlipCalm: React.FC = () => <Single flipDur={0.52} charStagger={0.16} />;

/** 多行构图 */
export const FlipMulti: React.FC = () => <Multi />;

/**
 * 4K 参照：**必须像 Root 的 Video 那样套 zoom 容器再放大**。
 * 直接拿 3840×2160 渲染的话，组件的布局坐标还是 1920×1080，
 * 而 AbsoluteFill 变成了 2160 高，于是 anchor/bottom 全部按 2160 算 —
 * 字幕会掉到画面 0.78 处、字号相对只剩一半（2026-11-22 实测：0.655~0.781，应为 0.52）。
 */
export const Flip4k: React.FC = () => {
  const { width } = useVideoConfig();
  const zoom = width / WIDTH;
  return (
    <AbsoluteFill style={{ background: theme.bg }}>
      <div style={{ width: WIDTH, height: HEIGHT, position: "relative", overflow: "hidden", zoom }}>
        <Single flipDur={0.26} charStagger={0.08} />
      </div>
    </AbsoluteFill>
  );
};