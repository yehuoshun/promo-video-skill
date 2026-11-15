import React from "react";
import { AbsoluteFill, Img, staticFile } from "remotion";
import { clamp, ramp } from "./anim";
import { resolveValue } from "./onscreen";
import { timing } from "./timing";

/**
 * 「施工图」版式的底子。
 *
 * 风格要点写在 需求确认.md：
 *   底 #eef2f7 ／ 墨线 #143b6b ／ 批注红 #c1272d ／ PASS 绿 #1f7a4d
 *   40px 细网格 + 200px 粗网格，图框四角圆点，图签常驻右下
 *
 * 这里只放「每个场景都要用」的零件：纸、图框、页眉、图签、尺寸线、统计卡、红章、打印件。
 * 场景里不要另写一套网格或另配一套颜色，否则五个场景会看起来像五个人做的。
 */

/** 竖版画布尺寸：版式按它摆，渲染时 zoom 到实际输出宽 */
export const VW = 1080;
export const VH = 1920;

export const C = {
  paper: "#eef2f7",
  paperHi: "#f6f9fc",
  ink: "#143b6b",
  inkSoft: "rgba(20,59,107,0.72)",
  inkFaint: "rgba(20,59,107,0.42)",
  red: "#c1272d",
  green: "#1f7a4d",
  rule: "rgba(20,59,107,0.34)",
  ruleSoft: "rgba(20,59,107,0.16)",
  fill: "rgba(20,59,107,0.055)",
} as const;

export const FONT = '"Microsoft YaHei", "PingFang SC", "Noto Sans SC", sans-serif';
export const MONO = '"Cascadia Mono", "Consolas", ui-monospace, monospace';

/** 纸：细网格 40px、粗网格 200px。drift 让整张纸极慢地平移，避免全静止画面 */
export const Paper: React.FC<{ w: number; h: number; drift?: number }> = ({ w, h, drift = 0 }) => {
  const minor = `linear-gradient(to right, ${C.ruleSoft} 1px, transparent 1px),
    linear-gradient(to bottom, ${C.ruleSoft} 1px, transparent 1px)`;
  const major = `linear-gradient(to right, rgba(20,59,107,0.13) 1px, transparent 1px),
    linear-gradient(to bottom, rgba(20,59,107,0.13) 1px, transparent 1px)`;
  // 网格用 background-position 平移，不要用 transform + 加宽：
  // 加宽的两层会在画布上留下可见接缝（2026-11-15 实测，静态图上有两条深线）。
  return (
    <AbsoluteFill style={{ backgroundColor: C.paper }}>
      <AbsoluteFill
        style={{
          backgroundImage: minor,
          backgroundSize: "40px 40px",
          backgroundPosition: `${-drift}px ${drift * 0.5}px`,
          width: w,
          height: h,
        }}
      />
      <AbsoluteFill
        style={{
          backgroundImage: major,
          backgroundSize: "200px 200px",
          backgroundPosition: `${-drift}px ${drift * 0.5}px`,
          width: w,
          height: h,
        }}
      />
    </AbsoluteFill>
  );
};

/** 图框：内缩一圈墨线 + 四角圆点（施工图的对位点） */
export const Frame: React.FC<{
  w: number;
  h: number;
  inset?: number;
  draw?: number;
  children?: React.ReactNode;
}> = ({ w, h, inset = 26, draw = 1, children }) => {
  const dots = [
    [inset, inset],
    [w - inset, inset],
    [inset, h - inset],
    [w - inset, h - inset],
  ];
  return (
    <>
      <div
        style={{
          position: "absolute",
          left: inset,
          top: inset,
          width: (w - inset * 2) * draw,
          height: h - inset * 2,
          border: `2px solid ${C.rule}`,
          boxSizing: "border-box",
          overflow: "hidden",
        }}
      />
      {dots.map(([x, y], i) => (
        <div
          key={i}
          style={{
            position: "absolute",
            left: x - 4,
            top: y - 4,
            width: 8,
            height: 8,
            borderRadius: "50%",
            background: C.ink,
            opacity: draw,
          }}
        />
      ))}
      {children}
    </>
  );
};

/** 页眉：左「打印件 · 片名」，右一句依据。片名取 timing.json，不另写 */
export const Header: React.FC<{
  w: number;
  right?: string;
  inset?: number;
  scale?: number;
  draw?: number;
}> = ({ w, right, inset = 26, scale = 1, draw = 1 }) => (
  <>
    <div
      style={{
        position: "absolute",
        left: inset + 44 * scale,
        top: inset + 34 * scale,
        width: (w - (inset + 44 * scale) * 2) * draw,
        height: 2,
        background: C.rule,
      }}
    />
    <div
      style={{
        position: "absolute",
        left: inset + 44 * scale,
        top: inset + 60 * scale,
        display: "flex",
        alignItems: "baseline",
        gap: 16 * scale,
        opacity: draw,
        whiteSpace: "nowrap",
      }}
    >
      <span
        style={{
          fontFamily: MONO,
          fontSize: 19 * scale,
          letterSpacing: "0.28em",
          color: C.ink,
          fontWeight: 700,
        }}
      >
        打印件
      </span>
      <span style={{ fontFamily: FONT, fontSize: 17 * scale, color: C.inkSoft }}>
        {timing.title}
      </span>
    </div>
    {right ? (
      <div
        style={{
          position: "absolute",
          right: inset + 44 * scale,
          top: inset + 60 * scale,
          maxWidth: (w - 600 * scale) * 0.9,
          textAlign: "right",
          fontFamily: MONO,
          fontSize: 15 * scale,
          color: C.inkSoft,
          opacity: draw,
          whiteSpace: "nowrap",
        }}
      >
        {right}
      </div>
    ) : null}
  </>
);

/** 图签：右下角那块表格。四行固定为 项目 / 图号 / 依据 / 验收 */
export const SheetPlate: React.FC<{
  w: number;
  h: number;
  inset?: number;
  width?: number;
  scale?: number;
  draw?: number;
  rows?: string[];
}> = ({ w, inset = 26, width = 300, scale = 1, draw = 1, rows }) => {
  const data =
    rows ??
    [
      `项目  ${(timing.title ?? "").split("·")[0].trim()}`,
      "图号  P-001",
      "依据  AGENTS.md",
      "验收  verify.cmd → 0 失败",
    ];
  const pw = width * scale;
  const rowH = 26 * scale;
  const ph = rowH * data.length + 20 * scale;
  return (
    <div
      style={{
        position: "absolute",
        right: inset + 44 * scale,
        bottom: inset + 44 * scale,
        width: pw,
        border: `1.5px solid ${C.rule}`,
        background: C.paperHi,
        opacity: draw,
      }}
    >
      {data.map((line, i) => (
        <div
          key={i}
          style={{
            fontFamily: MONO,
            fontSize: 13 * scale,
            lineHeight: `${rowH}px`,
            paddingLeft: 10 * scale,
            color: i === 0 ? C.ink : C.inkSoft,
            borderTop: i === 0 ? "none" : `1px solid ${C.ruleSoft}`,
            whiteSpace: "nowrap",
            overflow: "hidden",
          }}
        >
          {line}
        </div>
      ))}
      <div style={{ height: 0, width: pw, opacity: 0 }}>{ph}</div>
    </div>
  );
};

/** 尺寸线：从 x1 量到 x2，两端短竖线，中上方挂标签。p 是从左往右「量过去」的进度 */
export const Ruler: React.FC<{
  x1: number;
  x2: number;
  y: number;
  label?: string;
  p?: number;
  scale?: number;
  color?: string;
  ticks?: number;
}> = ({ x1, x2, y, label, p = 1, scale = 1, color = C.red, ticks = 0 }) => {
  const w = (x2 - x1) * clamp(p);
  return (
    <>
      <div style={{ position: "absolute", left: x1, top: y, width: Math.max(w, 1), height: 1.5, background: color }} />
      {[x1, x1 + w].map((x, i) => (
        <div key={i} style={{ position: "absolute", left: x - 0.75, top: y - 9 * scale, width: 1.5, height: 18 * scale, background: color, opacity: x === x1 && w < 2 ? 0 : 1 }} />
      ))}
      {Array.from({ length: ticks }).map((_, i) => {
        const x = x1 + ((x2 - x1) / ticks) * i;
        return x <= x1 + w ? (
          <div key={`t${i}`} style={{ position: "absolute", left: x - 0.5, top: y - 5 * scale, width: 1, height: 10 * scale, background: color, opacity: 0.55 }} />
        ) : null;
      })}
      {label ? (
        <div
          style={{
            position: "absolute",
            left: x1,
            top: y - 30 * scale,
            fontFamily: MONO,
            fontSize: 15 * scale,
            color,
            opacity: clamp(p * 1.6),
            whiteSpace: "nowrap",
          }}
        >
          {label}
        </div>
      ) : null}
    </>
  );
};

/** 统计卡：数字用等宽，数值可以是 @token（渲染时算真值） */
export const StatChip: React.FC<{
  label: string;
  value: string | number;
  unit?: string;
  hint?: string;
  show: number;
  scale?: number;
  accent?: boolean;
}> = ({ label, value, unit, hint, show, scale = 1, accent }) => {
  const v = typeof value === "number" ? value : resolveValue(value);
  return (
    <div
      style={{
        width: 178 * scale,
        padding: `${14 * scale}px ${14 * scale}px ${12 * scale}px`,
        border: `1.5px solid ${C.rule}`,
        background: C.paperHi,
        opacity: show,
        transform: `translateY(${(1 - show) * 14 * scale}px)`,
      }}
    >
      <div style={{ fontFamily: FONT, fontSize: 13 * scale, color: C.inkFaint, letterSpacing: "0.12em" }}>
        {label}
      </div>
      <div
        style={{
          fontFamily: MONO,
          fontSize: 44 * scale,
          lineHeight: 1.16,
          fontWeight: 700,
          color: accent ? C.red : C.ink,
          whiteSpace: "nowrap",
        }}
      >
        {v}
        {unit ? <span style={{ fontSize: 18 * scale, marginLeft: 3 * scale }}>{unit}</span> : null}
      </div>
      {hint ? (
        <div style={{ fontFamily: MONO, fontSize: 11 * scale, color: C.inkFaint, whiteSpace: "nowrap" }}>
          {hint}
        </div>
      ) : null}
    </div>
  );
};

/** 红章：方框 + 字（字来自 timing.json 的文案，不在这里发明） */
export const Seal: React.FC<{
  text: string;
  x: number;
  y: number;
  scale?: number;
  rotate?: number;
  p?: number;
  color?: string;
}> = ({ text, x, y, scale = 1, rotate = -8, p = 1, color = C.red }) => {
  const s = 0.72 + 0.28 * p;
  return (
    <div
      style={{
        position: "absolute",
        left: x,
        top: y,
        transform: `rotate(${rotate}deg) scale(${s})`,
        opacity: clamp(p * 1.4),
      }}
    >
      <div
        style={{
          border: `${5 * scale}px solid ${color}`,
          padding: `${10 * scale}px ${20 * scale}px`,
          fontFamily: FONT,
          fontWeight: 800,
          fontSize: 46 * scale,
          letterSpacing: "0.12em",
          color,
          background: "rgba(255,255,255,0.62)",
        }}
      >
        {text}
      </div>
    </div>
  );
};

/** 打印件：一张真实截图贴在图纸上（白纸 + 细边 + 轻投影），右下标出处编号 */
export const Sheet: React.FC<{
  src: string;
  x: number;
  y: number;
  w: number;
  p?: number;
  scale?: number;
  code?: string;
  rotate?: number;
}> = ({ src, x, y, w, p = 1, scale = 1, code, rotate = 0 }) => {
  return (
    <div
      style={{
        position: "absolute",
        left: x,
        top: y + (1 - p) * 24 * scale,
        width: w,
        opacity: clamp(p * 1.3),
        transform: `rotate(${rotate}deg)`,
      }}
    >
      <div
        style={{
          background: "#fff",
          border: `1.5px solid ${C.rule}`,
          boxShadow: "0 18px 44px rgba(20,59,107,0.18)",
          padding: 8 * scale,
        }}
      >
        <Img src={staticFile(src)} style={{ width: w - 16 * scale, display: "block" }} />
      </div>
      {code ? (
        <div
          style={{
            marginTop: 8 * scale,
            fontFamily: MONO,
            fontSize: 12 * scale,
            color: C.inkFaint,
            textAlign: "right",
          }}
        >
          {code}
        </div>
      ) : null}
    </div>
  );
};

/** 批注：红字 + 一条引线（引线方向由 dx/dy 决定） */
export const Note: React.FC<{
  text: string;
  x: number;
  y: number;
  dx?: number;
  dy?: number;
  show?: number;
  scale?: number;
  maxW?: number;
}> = ({ text, x, y, dx = 0, dy = -40, show = 1, scale = 1, maxW }) => (
  <div style={{ position: "absolute", left: x, top: y, opacity: show }}>
    <svg width={Math.abs(dx) + 4} height={Math.abs(dy) + 4} style={{ position: "absolute", left: 0, top: 0, overflow: "visible" }}>
      <line x1={0} y1={0} x2={dx} y2={dy} stroke={C.red} strokeWidth={1.6} strokeDasharray={show < 0.99 ? "6 6" : "0"} />
      <circle cx={0} cy={0} r={3.4} fill={C.red} />
    </svg>
    <div
      style={{
        position: "absolute",
        left: dx + (dx < 0 ? -0 : 12),
        top: dy - 12 * scale,
        width: maxW,
        fontFamily: FONT,
        fontSize: 20 * scale,
        lineHeight: 1.5,
        color: C.red,
        whiteSpace: maxW ? "normal" : "nowrap",
      }}
    >
      {text}
    </div>
  </div>
);

/** 转场：图纸横向平移（风格要点要求「平移」而不是淡入淡出） */
export const slideIn = (frame: number, fps: number, from: number, dir: 1 | -1 = 1) =>
  ramp(frame, from, Math.round(fps * 0.42), { from: 78 * dir, to: 0 });

/**
 * 会推近的打印件：视口固定，里面的图按 scale 放大并锚在一个点上。
 * 用来解决「整张 2400px 的打印件缩到 780px 后果，字全糊」——
 * 开头看得见全貌，到后段推近到证据那几行，字就真读得清。
 * ax/ay 是锚点在整个图里的相对位置（0~1）。
 */
export const ZoomSheet: React.FC<{
  src: string;
  x: number;
  y: number;
  w: number;
  h: number;
  scale?: number;
  ax?: number;
  ay?: number;
  p?: number;
  code?: string;
  scaleText?: number;
}> = ({ src, x, y, w, h, scale = 1, ax = 0.5, ay = 0.5, p = 1, code, scaleText = 1 }) => {
  const iw = w * scale;
  const ih = h * scale;
  return (
    <div style={{ position: "absolute", left: x, top: y + (1 - p) * 22 * scaleText, width: w, opacity: clamp(p * 1.3) }}>
      <div
        style={{
          // 必须定位：里面的 <Img> 是 absolute，若这一层不是定位祖先，
          // 它会以更外层为准，overflow:hidden 就夹不住它（实测图会溢出画布）
          position: "relative",
          width: w,
          height: h,
          overflow: "hidden",
          background: "#fff",
          border: `1.5px solid ${C.rule}`,
          boxShadow: "0 18px 44px rgba(20,59,107,0.20)",
        }}
      >
        <Img
          src={staticFile(src)}
          style={{
            position: "absolute",
            left: -(iw - w) * ax,
            top: -(ih - h) * ay,
            width: iw,
            display: "block",
          }}
        />
      </div>
      {code ? (
        <div style={{ marginTop: 8 * scaleText, fontFamily: MONO, fontSize: 12 * scaleText, color: C.inkFaint, textAlign: "right" }}>
          {code}
        </div>
      ) : null}
    </div>
  );
};