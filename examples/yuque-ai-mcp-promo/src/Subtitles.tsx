import React from "react";
import { AbsoluteFill, Sequence, useCurrentFrame, useVideoConfig } from "remotion";
import { theme } from "./lib/theme";
import { sec, timing } from "./lib/timing";

/**
 * 字幕层：一句旁白一条字幕，时间全部来自 timing.json 的 voiceLines。
 *
 * 这是「音画字三对齐」里最容易被做坏的一层：只要字幕的进出时间另写一套
 * （比如在场景组件里自己 setTimeout），改一次 timing.json 就要记得改两处，
 * 迟早错开。所以这里一条死规矩——字幕只读 voiceLines，别的地方不许再写
 * 「第几秒显示哪句话」。
 *
 * 字幕比声音早进 0.1 秒、晚出 0.35 秒：人眼看字比耳朵听音快一点，
 * 卡着声音的起止反而显得滞后；多留 0.35 秒则让人读完最后几个字。
 * 这两个数同时被 scripts-win/check_sync.py 用来判断相邻字幕会不会撞车。
 */

export const SUB_PAD_IN = 0.1;
export const SUB_PAD_OUT = 0.35;

const Line: React.FC<{ text: string; frames: number }> = ({ text, frames }) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const inF = Math.round(0.12 * fps);
  const outF = Math.round(0.18 * fps);

  // 进场：淡入 + 上浮 14px；退场：淡出。都用帧算，渲染器才抓得到。
  const enter = Math.min(1, inF > 0 ? f / inF : 1);
  const leave = Math.min(1, outF > 0 ? (frames - f) / outF : 1);
  const alpha = Math.max(0, Math.min(enter, leave));
  const rise = (1 - enter) * 14;

  return (
    <AbsoluteFill style={{ justifyContent: "flex-end", alignItems: "center" }}>
      <div
        style={{
          marginBottom: 96,
          maxWidth: 1480,
          padding: "18px 36px",
          borderRadius: 18,
          background: "rgba(8, 10, 16, 0.62)",
          border: "1px solid rgba(255,255,255,0.08)",
          backdropFilter: "blur(6px)",
          color: "#f4f6fb",
          fontFamily: theme.font,
          fontSize: 46,
          fontWeight: 600,
          lineHeight: 1.34,
          letterSpacing: "0.01em",
          textAlign: "center",
          textWrap: "balance" as const,
          opacity: alpha,
          transform: `translateY(${rise}px)`,
        }}
      >
        {text}
      </div>
    </AbsoluteFill>
  );
};

export const Subtitles: React.FC = () => {
  const lines = timing.voiceLines ?? [];
  if (!lines.length) return null;

  return (
    <>
      {lines.map((l) => {
        const from = sec(Math.max(0, l.at - SUB_PAD_IN));
        const to = Math.min(timing.duration, l.at + l.dur + SUB_PAD_OUT);
        const frames = Math.max(1, sec(to) - from);
        return (
          <Sequence key={l.id} from={from} durationInFrames={frames} name={`sub:${l.id}`}>
            <Line text={l.text} frames={frames} />
          </Sequence>
        );
      })}
    </>
  );
};
