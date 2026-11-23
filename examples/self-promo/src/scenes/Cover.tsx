import React from "react";
import { AbsoluteFill } from "remotion";
import { slots, t } from "../lib/onscreen";
import { C, FONT, MONO, Paper, Sheet } from "../lib/paper";
import { Rich } from "../lib/rich";
import { timing } from "../lib/timing";

type Props = { w: number; h: number };

export const Cover: React.FC<Props> = ({ w, h }) => {
  const hook = timing.scenes[0];
  const cta = timing.scenes[timing.scenes.length - 1];
  const on = slots(hook);
  const onCta = slots(cta);
  const portrait = h > w;
  const k = h / 1080;
  const left = w * 0.075;
  const titleTop = h * (portrait ? 0.12 : 0.18);
  const titleWidth = portrait ? w * 0.85 : w * 0.49;
  const titlePx = (portrait ? 76 : 92) * Math.min(k, 1.3);
  const subPx = (portrait ? 27 : 28) * Math.min(k, 1.2);

  return (
    <AbsoluteFill style={{ background: C.paper, fontFamily: FONT, color: C.ink }}>
      <Paper w={w} h={h} />
      <div style={{ position: "absolute", left, top: h * 0.065, fontFamily: MONO, fontSize: 18 * Math.min(k, 1.2), color: C.inkFaint, letterSpacing: "0.1em" }}>
        PROMO VIDEO SKILL <span style={{ color: C.red }}> / REMOTION</span>
      </div>
      <div style={{ position: "absolute", left, top: titleTop, width: titleWidth }}>
        <div style={{ fontSize: titlePx, fontWeight: 800, lineHeight: 1.12 }}>
          <Rich text={t(on.lines?.[0], "lines[0]")} accent={C.red} />
          <br />
          <Rich text={t(on.lines?.[1], "lines[1]")} accent={C.red} />
        </div>
        <div style={{ marginTop: h * 0.035, fontSize: subPx, lineHeight: 1.55, color: C.inkSoft }}>
          {t(on.sub, "sub")}
        </div>
      </div>
      <div style={{ position: "absolute", left, top: h * (portrait ? 0.43 : 0.77), fontFamily: MONO, fontSize: (portrait ? 27 : 34) * Math.min(k, 1.2), fontWeight: 700, whiteSpace: "nowrap" }}>
        <Rich text={t(onCta.title, "title")} accent={C.red} />
      </div>
      <div style={{ position: "absolute", left, top: h * (portrait ? 0.48 : 0.84), fontSize: 17 * Math.min(k, 1.2), color: C.inkFaint }}>
        {`${timing.duration}s  /  ${timing.facts?.gates ?? 11} automated checks`}
      </div>
      <Sheet
        src="exhibits/exhibit-gates.png"
        x={portrait ? w * 0.075 : w * 0.59}
        y={portrait ? h * 0.57 : h * 0.19}
        w={portrait ? w * 0.84 : w * 0.34}
        p={1}
        code="REAL VERIFY OUTPUT"
      />
    </AbsoluteFill>
  );
};
