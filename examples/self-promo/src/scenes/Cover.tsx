import React from "react";
import { AbsoluteFill } from "remotion";
import { slots, t } from "../lib/onscreen";
import { C, FONT, MONO, Frame, Header, Paper, Ruler, Seal, Sheet, SheetPlate } from "../lib/paper";
import { Rich } from "../lib/rich";
import { TOTAL_FRAMES, timing } from "../lib/timing";

/**
 * 三平台封面（16:9 / 9:16 / 3:4）。
 *
 * 与片子同一套零件（paper.tsx），文案全部来自 timing.json 的 onscreen —— 封面也是屏幕上的字，
 * 不在组件里另写一份。版式按画布高度的比例摆，所以 1080×1920 与 1080×1440 用同一个组件。
 */

type Props = { w: number; h: number };

export const Cover: React.FC<Props> = ({ w, h }) => {
  const hook = timing.scenes[0];
  const cta = timing.scenes[timing.scenes.length - 1];
  const on = slots(hook);
  const onCta = slots(cta);

  const portrait = h > w;
  // 9:16 与 3:4 不是一回事：3:4 矮，按 9:16 的比例摆会把尺寸线压到副标题上
  const tall = h / w > 1.6;
  const topFrac = portrait ? (tall ? 0.15 : 0.09) : 0.24;
  const k = h / 1080; // 1080 高为基准的缩放系数
  const left = portrait ? w * 0.075 : w * 0.073;
  const colW = portrait ? w * 0.85 : w * 0.52;

  const kickerPx = (portrait ? 20 : 22) * Math.min(k, 1.4);
  const titlePx = (portrait ? 74 : 92) * Math.min(k, 1.35);
  const subPx = (portrait ? 26 : 30) * Math.min(k, 1.3);

  return (
    <AbsoluteFill style={{ background: C.paper, fontFamily: FONT, color: C.ink }}>
      <Paper w={w} h={h} drift={0} />
      <Frame w={w} h={h} draw={1} />
      <Header w={w} draw={1} scale={portrait ? 1.15 : 1} right={on.tail !== undefined ? t(on.tail, "tail") : undefined} />

      {/* 主文案 */}
      <div style={{ position: "absolute", left, top: h * topFrac, width: colW }}>
        <div style={{ fontFamily: MONO, fontSize: kickerPx, letterSpacing: "0.3em", color: C.inkFaint }}>
          {t(on.kicker, "kicker")}
        </div>
        <div style={{ marginTop: h * 0.028, fontSize: titlePx, fontWeight: 800, lineHeight: 1.14, letterSpacing: "-0.01em" }}>
          <Rich text={t(on.lines?.[0], "lines[0]")} accent={C.red} />
          <br />
          <Rich text={t(on.lines?.[1], "lines[1]")} accent={C.red} />
        </div>
        <div style={{ marginTop: h * 0.03, fontSize: subPx, lineHeight: 1.6, color: C.inkSoft }}>
          <Rich text={t(on.sub, "sub")} accent={C.red} />
        </div>
      </div>

      {/* 尺寸线 + 三个数：封面也要看得出「这是施工图」 */}
      <div style={{ position: "absolute", left, top: h * (portrait ? (tall ? 0.44 : 0.43) : 0.66) }}>
        <Ruler
          x1={0}
          x2={colW * 0.92}
          y={0}
          p={1}
          label={`${timing.duration} 秒 · ${TOTAL_FRAMES} 帧 · ${timing.facts?.gates ?? 11} 道闸门`}
          scale={portrait ? 1.2 : 1}
          ticks={11}
        />
      </div>

      {/* 地址 */}
      <div style={{ position: "absolute", left, top: h * (portrait ? (tall ? 0.5 : 0.475) : 0.74), width: portrait ? w * 0.86 : w * 0.56 }}>
        <div style={{ fontFamily: MONO, fontSize: (portrait ? 26 : 34) * Math.min(k, 1.3), fontWeight: 700, whiteSpace: "nowrap", letterSpacing: "-0.02em" }}>
          <Rich text={t(onCta.title, "title")} accent={C.red} />
        </div>
      </div>

      <Seal text={t(onCta.stamp, "stamp")} x={w * (portrait ? 0.55 : 0.78)} y={h * (portrait ? (tall ? 0.6 : 0.55) : 0.52)} scale={portrait ? 1.9 : 1.5} p={1} color={C.green} rotate={-6} />

      {/* 右下角：一张真截图（不放大，只当证据贴纸） */}
      {portrait ? (
        <Sheet src="exhibits/exhibit-gates.png" x={w * 0.075} y={h * (tall ? 0.66 : 0.62)} w={w * 0.52} p={1} code="E-03 / verify.cmd" rotate={-1} />
      ) : (
        <Sheet src="exhibits/exhibit-gates.png" x={w * 0.62} y={h * 0.2} w={w * 0.31} p={1} code="E-03 / verify.cmd" rotate={-1} />
      )}

      <SheetPlate
        w={w}
        h={h}
        inset={26}
        width={portrait ? 300 : 300}
        scale={portrait ? 1.3 : 1.15}
        draw={1}
        rows={[
          `项目  ${(timing.title ?? "").split("·")[0].trim()}`,
          "图号  P-001",
          "依据  AGENTS.md",
          `验收  ${timing.facts?.gates ?? 11} 道闸门 · 0 失败`,
        ]}
      />
    </AbsoluteFill>
  );
};
