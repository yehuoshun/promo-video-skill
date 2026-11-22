/**
 * 翻转瀑布流字幕 —— 照 D:/1/Videos/11月21日(1).mp4 那条参考片做的。
 *
 * 参考片里读出来的机制（逐帧量过，不是猜）：
 *
 *   1. 只有一行字。字号占行高七成，行首行尾被画面边沿裁掉，不是多行瀑布。
 *   2. 字一个一个出来，相邻字错开约 0.08 秒，整行像一道从左往右扫的翻转波。
 *   3. 每字出生是一张竖着的白色实心卡，绕**底边**往前倒（rotateX 0°→90°），
 *      投影高度按 cos 收成 0；同一个格子里，字形同时从躺平（90°）立到正对（0°）。
 *      交接完成时白卡消失、字留下 —— 这就是「翻转」的全部。
 *   4. 字一直往右加，整行被顶得往左走，走过左边沿就被裁掉。
 *      这就是「瀑布流」：不是淡入淡出，是一直在流。
 *   5. 颜色按词换：白 / 薄荷绿交替，一段一个色，不逐字跳色。
 *
 * 全部由 frame 算出来，纯函数。不要用 CSS animation：Remotion 并行抓帧，
 * CSS 的时间轴不在你手里，同一帧能渲出不同结果。
 */
import React from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from "remotion";
import { clamp, easeInOutCubic, easeOutCubic } from "../lib/anim";
import { theme } from "../lib/theme";
import { BPM, HEIGHT, WIDTH } from "../lib/timing";

/** 一拍 = 配乐一拍。场景里别手写秒数，换 BPM 后整段卡点会匀速漂走。 */
export const BEAT_SEC = 60 / BPM;

export type Cell = { ch: string; accent: boolean };

/** "不是**淡入**淡出" -> 逐字，双星之间在默认色与强调色之间取反 */
export function cells(text: string): Cell[] {
  const out: Cell[] = [];
  let flip = false;
  for (let i = 0; i < text.length; i++) {
    if (text[i] === "*" && text[i + 1] === "*") {
      flip = !flip;
      i++;
      continue;
    }
    out.push({ ch: text[i], accent: flip });
  }
  return out;
}

/** 汉字全角、拉丁窄 —— 按字符类别给宽度，字距才不会被 ASCII 撑开 */
const charWidth = (ch: string, fontSize: number): number =>
  (ch.codePointAt(0) ?? 0) > 0x2e80 ? fontSize : fontSize * 0.56;

export interface FlipLineProps {
  /** 词表。一个词播完，下一词接着从右边涌进来，整行被往左顶 */
  rows: string[];
  /** 每个词固定占几拍。不填就按字数自动算并向上取整到整拍 */
  phraseBeats?: number;
  /** 词读完后停多久再进下一词（秒）。这是句读，不是节拍 */
  phrasePause?: number;
  /** 逐字错峰（秒） */
  charStagger?: number;
  /** 单个字翻完的时长（秒） */
  flipDur?: number;
  /** 白卡立住多久再开始倒（秒） */
  cardHold?: number;
  /** 翻转时顺带的一点偏航（deg）。参考片中段的字是斜的，纯 rotateX 拍不出那个角度 */
  yaw?: number;
  /** 行所在的纵坐标（0 顶 / 1 底，1920x1080 布局坐标） */
  anchor?: number;
  /** 字号 */
  fontSize?: number;
  /** 行高。必须 >= fontSize × 1.15，否则翻转时白卡会压到相邻行 */
  rowHeight?: number;
  /** 换词时的额外间隔（px） */
  gap?: number;
  /** 透视距离（px）。越小越「冲」，越大越平 */
  depth?: number;
  /** 第一个字什么时候出生（秒） */
  from?: number;
  /** 白卡不透明度：0 = 不出白卡，1 = 参考片那样整块实心白 */
  card?: number;
  /**
   * 白卡高度占行高的倍数。
   * 参考片实测（1080 宽裁切坐标）：卡 121×343，字形格 222×259 → 343/259 ≈ 1.32。
   * 卡比字高三成，上下各探出一截。**这个比值别再凭感觉放大**：
   * 放到 2 倍以上时，卡会伸进相邻那条字幕，读起来像一根白条飘在行外面。
   */
  cardHeightRatio?: number;
  /** 白卡宽度占**卡高**的比例。参考片 121/343 ≈ 0.35（卡是竖条，不是方块） */
  cardWidthRatio?: number;
  /** 右端停靠位置（占画面宽比例） */
  rightMargin?: number;
}

export const FlipLine: React.FC<FlipLineProps> = ({
  rows,
  phraseBeats,
  phrasePause = 0.16,
  charStagger = 0.08,
  flipDur = 0.26,
  cardHold = 0.04,
  yaw = -10,
  anchor = 0.58,
  fontSize = 190,
  rowHeight = 260,
  gap = 40,
  depth = 900,
  from = 0.2,
  card = 1,
  cardHeightRatio = 1.32,
  cardWidthRatio = 0.35,
  rightMargin = 0.94,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  if (rowHeight < fontSize * 1.15) {
    throw new Error(
      "FlipLine: rowHeight(" + rowHeight + ") 必须 >= fontSize × 1.15(" +
        Math.round(fontSize * 1.15) + ")，否则翻转时白卡会压到相邻行；" +
        "这里抛错不静默 clamp，免得只有到交付片里才发现叠字",
    );
  }

  // 先拆字，再给每个词算「自然时长」并整拍：短词不空等，长词不挤。
  const phraseCells = rows.map((text) => cells(text));
  const phraseStart: number[] = [];
  let beat = Math.round(from / BEAT_SEC);
  phraseCells.forEach((cs) => {
    phraseStart.push(beat * BEAT_SEC);
    if (phraseBeats !== undefined) {
      beat += phraseBeats;
    } else {
      const natural = (cs.length - 1) * charStagger + flipDur + phrasePause;
      beat += Math.max(1, Math.ceil(natural / BEAT_SEC - 1e-6));
    }
  });

  // 颜色按词交替：白 / 强调色，** ** 只在词内局部取反
  type Born = Cell & { at: number; w: number; phrase: number };
  const stream: Born[] = [];
  rows.forEach((_, r) => {
    const base = r % 2 === 1;
    phraseCells[r].forEach((c, k) => {
      stream.push({
        ch: c.ch,
        accent: c.accent ? !base : base,
        at: phraseStart[r] + k * charStagger,
        w: charWidth(c.ch, fontSize),
        phrase: r,
      });
    });
  });

  const t = frame / fps;
  if (t < phraseStart[0]) return <AbsoluteFill />;

  // 每个字「占多宽的位」：本字宽 + 换词时的 gap。位移和偏移必须用同一个量，
  // 否则 gap 只加在偏移上、不加在位移里，每换一次词整行就往右偏一格，越换越跑偏。
  const advance: number[] = stream.map((c, i) =>
    c.w + (i > 0 && c.phrase !== stream[i - 1].phrase ? gap : 0),
  );

  // 每个字相对整行左端的偏移
  const leftOf: number[] = [];
  let acc = 0;
  for (let i = 0; i < stream.length; i++) {
    leftOf.push(acc);
    acc += advance[i];
  }

  // 整行往左挪多少 = 已出生各字的占位之和，各字按自己的翻转进度平滑贡献。
  // 这样每进一个字，整行是「推」出去一截，而不是一帧内跳一格。
  let pushed = 0;
  for (let i = 0; i < stream.length; i++) {
    if (t < stream[i].at) break;
    pushed += advance[i] * easeOutCubic(clamp((t - stream[i].at) / Math.max(1e-3, flipDur)));
  }
  const lineX = WIDTH * rightMargin - pushed;

  // anchor 是「字底的基线」，不是行中心：卡从基线往上立，比字高两倍多
  const anchorPx = HEIGHT * anchor;
  // 两端渐隐：字是被画面边沿「吃掉」的，不是被硬切成半个
  const mask = "linear-gradient(to right, transparent 0.5%, #000 7%, #000 93%, transparent 99.5%)";

  return (
    <AbsoluteFill>
      {/* 只裁左右，不裁上下：白卡比字行高一大截，纵向裁掉就没了「竖条刷下来」的样子。
          容器直接铺满整幅，字的底边钉在 anchor 上。 */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          WebkitMaskImage: mask,
          maskImage: mask,
        }}
      >
        {stream.map((c, i) => {
          if (t < c.at) return null;

          const q = clamp((t - c.at - cardHold) / Math.max(1e-3, flipDur));
          const e = easeInOutCubic(q);
          // 一次翻转 = 卡倒下去 + 字立起来，共用同一个 e：
          //   卡 0°（立着，满高） -> 90°（躺平，投影为 0）
          //   字 90°（躺着，一条线） -> 0°（正对镜头，完整）
          // 末态交换位置。写反了就成「字从站着躺下去」，落定后永远看不到正脸。
          const cardRot = 90 * e;
          const glyphRot = 90 * (1 - e);
          const cardFacing = Math.abs(Math.cos((cardRot * Math.PI) / 180));
          const glyphFacing = Math.abs(Math.cos((glyphRot * Math.PI) / 180));
          const rotY = yaw * Math.sin(Math.PI * e);

          // 卡倒过一半就把位置让给字。参考片里卡是「迅速缩没」，不留灰色薄边——
          // 倒到 90° 才淡出的话会先变成一条灰线，看着像画面里的脏点。
          const cardA = card * clamp(1 - (q - 0.35) / 0.45);
          // 宽度跟着卡高走（不是行高）：卡是「竖白条」，宽高比固定才不至于细成一条线
          const cardH = rowHeight * cardHeightRatio;
          const cardW = cardH * cardWidthRatio * (0.86 + 0.14 * cardFacing);
          // 参考片里卡在行上竖直居中（上下各探出约 0.16 卡高），不是挂在基线上
          const cardSink = (cardH - rowHeight) / 2;

          return (
            <span
              key={i}
              style={{
                position: "absolute",
                left: lineX + leftOf[i],
                bottom: HEIGHT - anchorPx,
                width: c.w,
                height: rowHeight,
                textAlign: "center",
                fontFamily: theme.font,
                fontSize,
                fontWeight: 800,
                lineHeight: rowHeight + "px",
                color: c.accent ? theme.accent : theme.ink,
                // 字本身不透明：可见性由翻转角给出（侧对时就是一条线）。
                // 再叠透明度会变成「淡入」，那不是参考片的做法。
              }}
            >
              <span
                style={{
                  display: "inline-block",
                  // perspective() 写在 transform 里，不靠祖先的 perspective：
                  // 中间隔一层带 mask 的裁剪层时祖先透视会失效，rotateX 退化成 2D 压扁
                  transform:
                    "perspective(" + depth + "px) rotateX(" + glyphRot.toFixed(2) + "deg)" +
                    (yaw ? " rotateY(" + rotY.toFixed(2) + "deg)" : ""),
                  transformOrigin: "50% 100%",
                  backfaceVisibility: "hidden",
                  filter: "brightness(" + (0.6 + 0.4 * glyphFacing).toFixed(3) + ")",
                }}
              >
                {c.ch === " " ? "\u00a0" : c.ch}
              </span>
              {cardA > 0.001 ? (
                <span
                  style={{
                    position: "absolute",
                    left: (c.w - cardW) / 2,
                    // 卡在行上居中：底边沉到字底以下一截，顶边高过字顶一截
                    bottom: -cardSink,
                    width: cardW,
                    height: cardH,
                    background: "#ffffff",
                    opacity: cardA,
                    transform:
                      "perspective(" + depth + "px) rotateX(" + cardRot.toFixed(2) + "deg)" +
                      (yaw ? " rotateY(" + rotY.toFixed(2) + "deg)" : ""),
                    transformOrigin: "50% 100%",
                    // 卡不要跟字共用亮度曲线：卡整体比字亮（实心白），暗下来才像侧光
                    filter: "brightness(" + (0.82 + 0.18 * cardFacing).toFixed(3) + ")",
                  }}
                />
              ) : null}
            </span>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};