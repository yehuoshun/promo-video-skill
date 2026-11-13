import React from "react";
import { AbsoluteFill, Img, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { Backdrop } from "../components/Backdrop";
import { theme } from "../lib/theme";
import { ramp } from "../lib/anim";

type Props = {
  /** public/ 下的文件名 */
  src: string;
  /** 原图像素尺寸，用来算缩放后高度（别指望读 DOM） */
  imgW: number;
  imgH: number;
  /** 卡片外框尺寸（1920×1080 坐标系） */
  cardW: number;
  cardH: number;
  /** 截图四周留白，默认 0 */
  pad?: number;
  /** 标题栏里显示的文字 */
  url: string;
  /** 竖向滚动 0→1 扫完整张图；不传就静止 */
  scroll?: number;
  /** 缓慢推入的缩放幅度，默认 0.04 */
  zoom?: number;
  /** 整体上移多少像素：字幕条压在底部 96px 处，卡片要躲开它 */
  offsetY?: number;
  /** 上下渐隐：滚动截图靠它藏住被切断的半行；一屏放得下的不用 */
  fade?: boolean;
};

/**
 * 真实截图卡片：浏览器窗体 + 截图，进场从下方推入并轻微放大。
 * 整页截图比卡片高时用 scroll 把它扫过去（比硬塞进一张图清楚得多）。
 */
const Shot: React.FC<Props> = ({
  src,
  imgW,
  imgH,
  cardW,
  cardH,
  pad = 0,
  url,
  scroll,
  zoom = 0.04,
  offsetY = -70,
  fade = true,
}) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();

  const enter = ramp(frame, 0, 18, { from: 64, to: 0 });
  const op = ramp(frame, 0, 14);
  const scale = ramp(frame, 0, Math.min(durationInFrames, fps * 1.2), { from: 0.965, to: 1 });
  const push = ramp(frame, 0, durationInFrames, { from: 1, to: 1 + zoom });

  const imageW = cardW - pad * 2;
  const boxH = cardH - pad * 2;
  const imageH = (imageW * imgH) / imgW;
  const maxScroll = Math.max(0, imageH - boxH);
  const s = typeof scroll === "number" ? Math.min(1, Math.max(0, scroll)) : 0;

  return (
    <AbsoluteFill style={{ fontFamily: theme.font, color: theme.ink }}>
      <Backdrop gridIn={0.8} />

      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center" }}>
        <div
          style={{
            width: cardW,
            borderRadius: 18,
            border: `1px solid ${theme.line}`,
            background: "rgba(12,16,22,0.9)",
            boxShadow: "0 40px 120px rgba(0,0,0,0.6)",
            overflow: "hidden",
            opacity: op,
            transform: `translateY(${enter + offsetY}px) scale(${scale * push})`,
          }}
        >
          {/* 标题栏 */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              padding: "15px 22px",
              borderBottom: `1px solid ${theme.line}`,
              background: "rgba(255,255,255,0.03)",
            }}
          >
            <span style={{ width: 12, height: 12, borderRadius: "50%", background: "#ff5f57" }} />
            <span style={{ width: 12, height: 12, borderRadius: "50%", background: "#febc2e" }} />
            <span style={{ width: 12, height: 12, borderRadius: "50%", background: "#28c840" }} />
            <div
              style={{
                marginLeft: 16,
                flex: 1,
                height: 30,
                borderRadius: 8,
                background: "rgba(255,255,255,0.06)",
                display: "flex",
                alignItems: "center",
                paddingLeft: 16,
                fontSize: 15,
                color: theme.inkFaint,
                fontFamily: theme.mono,
                whiteSpace: "nowrap",
                overflow: "hidden",
              }}
            >
              {url}
            </div>
          </div>

          {/* 截图区：超出卡片的部分裁掉，靠 scroll 平移 */}
          <div
            style={{
              position: "relative",
              height: cardH,
              padding: pad,
              boxSizing: "border-box",
              overflow: "hidden",
            }}
          >
            <div style={{ height: boxH, overflow: "hidden" }}>
              <Img
                src={staticFile(src)}
                style={{
                  display: "block",
                  width: imageW,
                  height: imageH,
                  transform: `translateY(${-maxScroll * s}px)`,
                }}
              />
            </div>
            {/* 上下渐隐：滚动截图靠它藏住被切断的半行 */}
            {fade ? (
              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  pointerEvents: "none",
                  background: `linear-gradient(180deg, rgba(7,9,13,0.86) 0%, rgba(7,9,13,0.82) 3%, rgba(7,9,13,0) 13%, rgba(7,9,13,0) 87%, rgba(7,9,13,0.84) 97%, rgba(7,9,13,0.9) 100%)`,
                }}
              />
            ) : null}
          </div>
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

/** 终端：真实 stdout，一屏放得下，不滚也不渐隐 */
export const TerminalShot: React.FC = () => (
  <Shot
    src="terminal.png"
    imgW={2050}
    imgH={1283}
    cardW={1200}
    cardH={766}
    pad={20}
    url="PowerShell — d2l-zh"
    zoom={0}
    offsetY={-85}
    fade={false}
  />
);

/** 语雀目录树：竖长图，慢慢往下扫 */
export const TreeShot: React.FC = () => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const t = Math.min(1, frame / (durationInFrames * 0.82));
  return (
    <Shot
      src="yuque-toc.png"
      imgW={1459}
      imgH={1540}
      cardW={1240}
      cardH={760}
      pad={26}
      url="语雀 · 知识库管理 · 目录管理"
      scroll={t}
      zoom={0}
    />
  );
};

/** 知识库列表：四张公开库卡，静态略带推入 */
export const CardsShot: React.FC = () => (
  <Shot
    src="yuque-cards.png"
    imgW={2074}
    imgH={1030}
    cardW={1550}
    cardH={770}
    url="语雀 · 我的知识库"
    zoom={0.03}
  />
);
