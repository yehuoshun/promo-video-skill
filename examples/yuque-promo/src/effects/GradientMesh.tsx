import React from "react";
import { AbsoluteFill } from "remotion";

export type GradientMeshProps = {
  /** 当前帧（场景内的局部帧，不是全片帧） */
  frame: number;
  fps: number;
  /** 底色 + 两个光斑色，必须是 6 位 hex：这里要自己拼透明度 */
  colors?: [string, string, string];
  /** 漂移一个来回多少秒，越大越慢 */
  period?: number;
  opacity?: number;
};

/** 四个光斑的初始位置与漂移速度，改这里就是换构图 */
const BLOBS = [
  { x: 22, y: 26, r: 52, k: 1.0, color: 1 },
  { x: 78, y: 16, r: 44, k: 0.7, color: 2 },
  { x: 64, y: 78, r: 58, k: 1.3, color: 1 },
  { x: 10, y: 84, r: 40, k: 0.9, color: 2 },
];

/**
 * 网格渐变底：四个缓慢漂移的径向光斑叠在深色底上。
 * 这是最便宜的「电影感」——纯 CSS gradient，不用 shader、不用图片、4K 也不糊。
 * 用法：放在场景最底层，上面再叠内容和 FilmLook。
 */
export const GradientMesh: React.FC<GradientMeshProps> = ({
  frame,
  fps,
  colors = ["#07090d", "#123a33", "#1a2b4a"],
  period = 10,
  opacity = 1,
}) => {
  const t = frame / (fps * period);

  const layers = BLOBS.map((b, i) => {
    // 两个不同频率的正弦，避免所有光斑同步呼吸（同步会看出规律）
    const dx = Math.sin((t * b.k + i * 0.31) * Math.PI * 2) * 5.5;
    const dy = Math.cos((t * b.k + i * 0.47) * Math.PI * 2) * 4.5;
    const c = colors[b.color] ?? colors[1];
    return `radial-gradient(circle at ${(b.x + dx).toFixed(2)}% ${(b.y + dy).toFixed(2)}%, ${c}b3 0%, ${c}00 ${b.r}%)`;
  });

  return (
    <AbsoluteFill style={{ background: colors[0] }}>
      <AbsoluteFill
        style={{
          backgroundImage: layers.join(","),
          opacity,
          filter: "saturate(1.08)",
        }}
      />
    </AbsoluteFill>
  );
};
