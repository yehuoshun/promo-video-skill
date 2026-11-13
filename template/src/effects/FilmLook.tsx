import React from "react";
import { AbsoluteFill } from "remotion";
import { flicker } from "./rand";

/**
 * 颗粒板：一张 200×200 的 SVG 噪点，铺平后平移，看起来一直在动。
 *
 * 为什么不每帧重新生成滤镜：feTurbulence 每次换 seed 都要重新栅格化整块区域，
 * 4K 下能把渲染时间翻几倍。三块板轮换 + 子像素抖动，视觉上分不出，成本几乎为零。
 */
const grainPlate = (seed: number): string => {
  const svg =
    `<svg xmlns='http://www.w3.org/2000/svg' width='200' height='200'>` +
    `<filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' seed='${seed}' stitchTiles='stitch'/>` +
    `<feColorMatrix type='saturate' values='0'/></filter>` +
    `<rect width='200' height='200' filter='url(#n)' opacity='0.6'/></svg>`;
  // utf8 编码 + encodeURIComponent：否则部分容器里 # 会被当成 URL 片段截断
  return `url("data:image/svg+xml;utf8,${encodeURIComponent(svg)}")`;
};

const PLATES = [grainPlate(3), grainPlate(11), grainPlate(29)];

export type FilmLookProps = {
  frame: number;
  /** 颗粒强度，0 关闭；0.10~0.20 是正常范围 */
  grain?: number;
  /** 暗角强度，0 关闭；0.45~0.7 是正常范围 */
  vignette?: number;
  /** 暗角中心，默认略微偏上（人脸/标题通常在偏上位置） */
  center?: string;
};

/**
 * 胶片感：颗粒 + 暗角。
 * 放在内容之上、最上层，pointerEvents 关掉，不影响任何点击。
 */
export const FilmLook: React.FC<FilmLookProps> = ({
  frame,
  grain = 0.16,
  vignette = 0.55,
  center = "50% 46%",
}) => {
  const plate = PLATES[Math.floor(frame / 2) % PLATES.length];
  const dx = Math.round(flicker(frame, 1) * 200);
  const dy = Math.round(flicker(frame, 2) * 200);

  return (
    <>
      {grain > 0 ? (
        <AbsoluteFill
          style={{
            backgroundImage: plate,
            backgroundSize: "200px 200px",
            backgroundPosition: `${dx}px ${dy}px`,
            opacity: grain,
            mixBlendMode: "overlay",
            pointerEvents: "none",
          }}
        />
      ) : null}
      {vignette > 0 ? (
        <AbsoluteFill
          style={{
            background: `radial-gradient(circle at ${center}, rgba(0,0,0,0) 40%, rgba(0,0,0,${vignette}) 100%)`,
            pointerEvents: "none",
          }}
        />
      ) : null}
    </>
  );
};
