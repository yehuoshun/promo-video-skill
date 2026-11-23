import React from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from "remotion";
import { enter, ramp, spring, clamp, shake } from "../lib/anim";
import { slots, stats, t } from "../lib/onscreen";
import { C, FONT, MONO, Paper, Ruler, Sheet, Note, ZoomSheet } from "../lib/paper";
import { Rich } from "../lib/rich";
import { BEAT_SEC, DURATION_SEC, TOTAL_FRAMES, timing, type Scene } from "../lib/timing";

/**
 * 五个「施工图」版式。
 *
 * 规矩（需求确认.md 风格要点 + AGENTS.md 红线）：
 * - 屏幕上每一个字都来自 timing.json 的 scenes[].onscreen，这里只负责排版与动效；
 * - 数字一律 @token 派生（@gates / @duration / @frames / @fps / @scenes），不手写；
 * - 入场只用 anim.ts 的角色名（quiet/body/head/stage），有重量的落地才传 feel:"spring"；
 * - 每帧都由 useCurrentFrame() 算出来，不许用 CSS 动画。
 *
 * 版式分横竖两套数字：横版按 1920×1080 摆，竖版按 1080×1920 摆；
 * 竖版是重排（文案、图序不变），不是把横版缩一缩。
 */

const HW = 1920;
const HH = 1080;
const VW = 1080;
const VH = 1920;

type BoardProps = { sc: Scene; vertical?: boolean };
type FrameOf = (sec: number) => number;

const useFps = (): number => useVideoConfig().fps;

/** 每帧都用的公共外壳：纸 + 图框 + 页眉 + 图签 */
const Board: React.FC<{
  vertical: boolean;
  children: React.ReactNode;
}> = ({ vertical, children }) => {
  const frame = useCurrentFrame();
  const w = vertical ? VW : HW;
  const h = vertical ? VH : HH;
  return (
    <AbsoluteFill style={{ fontFamily: FONT, color: C.ink }}>
      <Paper w={w} h={h} drift={frame * 0.35} />
      {children}
    </AbsoluteFill>
  );
};

/* ────────────────────────── 01 反例开场 ────────────────────────── */

export const HookBoard: React.FC<BoardProps> = ({ sc, vertical = false }) => {
  const on = slots(sc);
  const frame = useCurrentFrame();
  const fps = useFps();
  const f: FrameOf = (s) => s * fps;

  // 第 0 帧不能是空图纸：kicker 从负时间起跑，片头第一帧就已经落地
  const kicker = enter(frame, -f(0.5), "quiet", { fps });
  const l0 = enter(frame, f(0.12), "head", { fps });
  const l1 = enter(frame, f(0.42), "head", { fps });
  const sub = enter(frame, f(1.1), "body", { fps });
  const land = shake(frame, 2, 1.6, 3);
  const sheetP = ramp(frame, f(0.25), 16);

  if (vertical) {
    return (
      <Board vertical>
        <div style={{ position: "absolute", left: 76, top: 250, width: 928 }}>
          <div style={{ fontFamily: MONO, fontSize: 18, letterSpacing: "0.3em", color: C.inkFaint, opacity: kicker.opacity }}>
            {t(on.kicker, "kicker")}
          </div>
          <div style={{ marginTop: 34, fontSize: 62, fontWeight: 800, lineHeight: 1.16, letterSpacing: "-0.01em", opacity: l0.opacity, transform: `translateY(${l0.y}px)` }}>
            <Rich text={t(on.lines?.[0], "lines[0]")} accent={C.red} />
          </div>
          <div style={{ fontSize: 62, fontWeight: 800, lineHeight: 1.16, letterSpacing: "-0.01em", opacity: l1.opacity, transform: `translateY(${l1.y}px)` }}>
            <Rich text={t(on.lines?.[1], "lines[1]")} accent={C.red} />
          </div>
          <div style={{ marginTop: 26, fontSize: 25, lineHeight: 1.62, color: C.inkSoft, opacity: sub.opacity, transform: `translateY(${sub.y}px)` }}>
            <Rich text={t(on.sub, "sub")} accent={C.red} />
          </div>
        </div>
        <ZoomSheet
          src="exhibits/exhibit-probe-bad.png"
          x={76}
          y={900}
          w={928}
          h={522}
          // 竖版是主平台（抖音/小红书），推得更近一点，正文才够大
          scale={1 + 0.62 * ramp(frame, f(1.0), f(4.6))}
          ax={0.03}
          ay={0.26}
          p={sheetP}
          code="E-02 / probe.cmd"
        />
      </Board>
    );
  }

  return (
    <Board vertical={false}>
      <div
        style={{
          position: "absolute",
          left: 140,
          top: 270,
          width: 760,
          transform: `translate(${land.x}px, ${land.y}px)`,
        }}
      >
        <div style={{ fontFamily: MONO, fontSize: 18, letterSpacing: "0.3em", color: C.inkFaint, opacity: kicker.opacity }}>
          {t(on.kicker, "kicker")}
        </div>
        <div style={{ marginTop: 40, fontSize: 86, fontWeight: 800, lineHeight: 1.14, letterSpacing: "-0.02em", opacity: l0.opacity, transform: `translateY(${l0.y}px)` }}>
          <Rich text={t(on.lines?.[0], "lines[0]")} accent={C.red} />
        </div>
        <div style={{ fontSize: 86, fontWeight: 800, lineHeight: 1.14, letterSpacing: "-0.02em", opacity: l1.opacity, transform: `translateY(${l1.y}px)` }}>
          <Rich text={t(on.lines?.[1], "lines[1]")} accent={C.red} />
        </div>
        <div style={{ marginTop: 34, fontSize: 27, lineHeight: 1.66, color: C.inkSoft, maxWidth: 720, opacity: sub.opacity, transform: `translateY(${sub.y}px)` }}>
          <Rich text={t(on.sub, "sub")} accent={C.red} />
        </div>
      </div>

      <Sheet
        src="exhibits/exhibit-probe-bad.png"
        x={1000}
        y={210}
        w={760}
        p={sheetP}
        offsetY={Math.sin((frame / fps / 10) * Math.PI * 2) * 14}
        code="E-02 / probe.cmd 真跑"
      />
      <Note text="E-02 / 2 ERROR" x={1000} y={680} dx={0} dy={0} show={ramp(frame, f(1.6), 12)} />
    </Board>
  );
};

/* ────────────────────────── 02 十一道闸门 ────────────────────────── */

export const GatesBoard: React.FC<BoardProps> = ({ sc, vertical = false }) => {
  const on = slots(sc);
  const st = stats(sc);
  const frame = useCurrentFrame();
  const fps = useFps();
  const f: FrameOf = (s) => s * fps;
  const local = (t: number) => (t - sc.start) * fps;

  const over = enter(frame, 0, "quiet", { fps });
  const title = enter(frame, f(0.12), "head", { fps });
  const lineA = enter(frame, local(sc.beats?.[1] ?? sc.start + 1.8), "body", { fps });
  const lineB = enter(frame, local(sc.beats?.[2] ?? sc.start + 2.6), "body", { fps });
  const sheetP = ramp(frame, f(0.3), 18);
  const capP = ramp(frame, local(sc.beats?.[5] ?? sc.start + 5), 14);
  const oneP = spring(frame, local(sc.beats?.[6] ?? sc.start + 6.6), { fps, stiffness: 120, damping: 15 });

  const sweep = clamp((frame - f(1.0)) / (f(11) - f(0)));
  const chipShow = st.map((_, i) => ramp(frame, f(1.2) + i * f(0.45), 12));

  const columnX = vertical ? 76 : 140;
  const columnW = vertical ? 928 : 720;
  const top = vertical ? 250 : 330;

  return (
    <Board vertical>
      <div style={{ position: "absolute", left: columnX, top, width: columnW }}>
        <div style={{ fontFamily: MONO, fontSize: vertical ? 16 : 19, letterSpacing: "0.26em", color: C.inkFaint, opacity: over.opacity }}>
          {t(on.overline, "overline")}
        </div>
        <div style={{ marginTop: vertical ? 22 : 16, fontSize: vertical ? 62 : 78, fontWeight: 800, letterSpacing: "-0.01em", lineHeight: 1.1, opacity: title.opacity, transform: `translateY(${title.y}px)` }}>
          <Rich text={t(on.title, "title")} accent={C.red} />
        </div>
        <div style={{ marginTop: vertical ? 22 : 26, fontSize: vertical ? 24 : 30, lineHeight: 1.7, color: C.inkSoft, opacity: lineA.opacity, transform: `translateY(${lineA.y}px)` }}>
          <Rich text={t(on.lines?.[0], "lines[0]")} accent={C.red} />
        </div>
        <div style={{ marginTop: 6, fontSize: vertical ? 23 : 27, lineHeight: 1.7, color: C.inkFaint, opacity: lineB.opacity, transform: `translateY(${lineB.y}px)` }}>
          <Rich text={t(on.lines?.[1], "lines[1]")} accent={C.red} />
        </div>
      </div>

      <Sheet
        src="exhibits/exhibit-gates.png"
        x={vertical ? 76 : 1000}
        y={vertical ? 660 : 210}
        w={vertical ? 928 : 760}
        p={sheetP}
        offsetY={Math.sin((frame / fps / 10) * Math.PI * 2) * 14}
        code="E-03 / verify.ps1"
      />
      {/* 光扫：红色细线沿闸门清单往下走一遍，配合 11 个拍点 */}
      {sweep < 1 ? (
        <div
          style={{
            position: "absolute",
            left: vertical ? 76 : 1000,
            top: (vertical ? 660 : 210) + 8 + sweep * ((vertical ? 928 : 760) * 0.5625),
            width: vertical ? 928 : 760,
            height: 3,
            background: `linear-gradient(to right, rgba(193,39,45,0), ${C.red}, rgba(193,39,45,0))`,
            opacity: 0.75 * sheetP,
          }}
        />
      ) : null}

      <div style={{ position: "absolute", left: columnX, top: vertical ? 1290 : 640, display: "flex", gap: 16 }}>
        {st.map((s, i) => {
          const inner = (
            <>
              <div style={{ fontFamily: FONT, fontSize: 13, letterSpacing: "0.12em", color: C.inkFaint }}>{s.label}</div>
              <div style={{ fontFamily: MONO, fontSize: vertical ? 40 : 42, fontWeight: 700, lineHeight: 1.12, color: i === 2 ? C.red : C.ink, whiteSpace: "nowrap" }}>
                {s.value}
                {s.unit ? <span style={{ fontSize: 16, marginLeft: 3 }}>{s.unit}</span> : null}
              </div>
              {s.hint ? <div style={{ fontFamily: MONO, fontSize: 11, color: C.inkFaint, whiteSpace: "nowrap" }}>{s.hint}</div> : null}
            </>
          );
          return (
            <div
              key={s.label}
              style={{
                width: vertical ? 190 : 178,
                padding: "13px 13px 10px",
                border: `1.5px solid ${C.rule}`,
                background: C.paperHi,
                opacity: chipShow[i] ?? 1,
                transform: `translateY(${(1 - (chipShow[i] ?? 1)) * 14}px)`,
              }}
            >
              {inner}
            </div>
          );
        })}
      </div>

      {on.caption ? (
        <div
          style={{
            position: "absolute",
            left: vertical ? 76 : 1000,
            top: vertical ? 1470 : 660,
            width: vertical ? 928 : 700,
            fontFamily: FONT,
            fontSize: vertical ? 21 : 21,
            lineHeight: 1.6,
            color: C.red,
            opacity: capP,
          }}
        >
          {t(on.caption, "caption")}
        </div>
      ) : null}

      {/* 高潮：退出码那个 1 砸下来 */}
      <div
        style={{
          position: "absolute",
          right: vertical ? 70 : 150,
          top: vertical ? 1560 : 690,
          fontFamily: MONO,
          fontSize: vertical ? 150 : 200,
          fontWeight: 700,
          lineHeight: 1,
          color: C.red,
          opacity: clamp(oneP * 1.2),
          transform: `translateY(${(1 - oneP) * -60}px)`,
        }}
      >
        {/* 数字来自 scenes[].onscreen.stats[2]（退出码），场景里不写死文案 */}
        {st[2]?.value ?? ""}
      </div>    </Board>
  );
};

/* ────────────────────────── 03 一份时间轴 ────────────────────────── */

export const TimelineBoard: React.FC<BoardProps> = ({ sc, vertical = false }) => {
  const on = slots(sc);
  const st = stats(sc);
  const frame = useCurrentFrame();
  const fps = useFps();
  const f: FrameOf = (s) => s * fps;

  const over = enter(frame, 0, "quiet", { fps });
  const title = enter(frame, f(0.1), "head", { fps });
  const lineA = enter(frame, f(1.0), "body", { fps });
  const lineB = enter(frame, f(1.7), "body", { fps });
  const sheetP = ramp(frame, f(0.3), 18);
  const trackP = ramp(frame, f(2.2), 30);

  const trackX = vertical ? 76 : 1000;
  const trackY = vertical ? 1260 : 700;
  const trackW = vertical ? 928 : 760;
  const playhead = clamp((frame - f(0.3)) / (f(sc.end - sc.start - 0.6)));
  // 全片拍点数：声音轨每拍一格、字幕轨每两拍一句，都按真实 BPM 铺满
  const BEATS_TOTAL = Math.round(DURATION_SEC / BEAT_SEC);

  const chipShow = st.map((_, i) => ramp(frame, f(2.4) + i * f(0.4), 12));

  return (
    <Board vertical>
      <div style={{ position: "absolute", left: vertical ? 76 : 140, top: vertical ? 250 : 300, width: vertical ? 928 : 720 }}>
        <div style={{ fontFamily: MONO, fontSize: vertical ? 16 : 19, letterSpacing: "0.26em", color: C.inkFaint, opacity: over.opacity }}>
          {t(on.overline, "overline")}
        </div>
        <div style={{ marginTop: vertical ? 22 : 16, fontSize: vertical ? 60 : 74, fontWeight: 800, letterSpacing: "-0.01em", lineHeight: 1.12, opacity: title.opacity, transform: `translateY(${title.y}px)` }}>
          <Rich text={t(on.title, "title")} accent={C.red} />
        </div>
        <div style={{ marginTop: vertical ? 22 : 26, fontSize: vertical ? 24 : 30, lineHeight: 1.7, color: C.inkSoft, opacity: lineA.opacity, transform: `translateY(${lineA.y}px)` }}>
          <Rich text={t(on.lines?.[0], "lines[0]")} accent={C.red} />
        </div>
        <div style={{ marginTop: 6, fontSize: vertical ? 23 : 27, lineHeight: 1.7, color: C.inkFaint, opacity: lineB.opacity, transform: `translateY(${lineB.y}px)` }}>
          <Rich text={t(on.lines?.[1], "lines[1]")} accent={C.red} />
        </div>
      </div>

      <Sheet
        src="exhibits/exhibit-timing.png"
        x={vertical ? 76 : 1000}
        y={vertical ? 640 : 180}
        w={vertical ? 928 : 780}
        p={sheetP}
        offsetY={Math.sin((frame / fps / 10) * Math.PI * 2) * 14}
        code="E-04 / timing.json"
      />

      {/* 三轨：画面 / 字幕 / 声音 —— 同一份时间轴切出来的三条带子 */}
      <div style={{ position: "absolute", left: trackX, top: trackY, width: trackW, opacity: sheetP }}>
        {["画面", "字幕", "声音"].map((name, i) => (
          <div key={name} style={{ display: "flex", alignItems: "center", height: 34, marginBottom: 12, opacity: trackP }}>
            <div style={{ width: 84, fontFamily: FONT, fontSize: vertical ? 17 : 18, color: C.inkSoft, letterSpacing: "0.06em" }}>
              {name}
            </div>
            <div
              style={{
                position: "relative",
                height: 34,
                flex: 1,
                border: `1.5px solid ${C.rule}`,
                background: i === 1 ? "rgba(193,39,45,0.10)" : C.fill,
                transform: `scaleX(${trackP})`,
                transformOrigin: "left center",
                overflow: "hidden",
              }}
            >
              {/* 场景分块：带子被五段场景切开，切点就是画面切点 */}
              {timing.scenes.map((s, j) => {
                const left = (s.start / DURATION_SEC) * (trackW - 84);
                const width = ((s.end - s.start) / DURATION_SEC) * (trackW - 84);
                const lvl = i === 0 ? 0.1 : i === 1 ? 0.16 : 0.07;
                return (
                  <div
                    key={s.id}
                    style={{
                      position: "absolute",
                      left,
                      top: 0,
                      width,
                      height: 34,
                      borderRight: `1.5px solid ${C.ink}`,
                      background: j % 2 ? `rgba(20,59,107,${lvl})` : "transparent",
                    }}
                  />
                );
              })}
              {i === 0
                ? timing.scenes.map((s) => (
                    <div
                      key={`n-${s.id}`}
                      style={{
                        position: "absolute",
                        left: (s.start / DURATION_SEC) * (trackW - 84) + 8,
                        top: 6,
                        fontFamily: MONO,
                        fontSize: vertical ? 14 : 13,
                        color: C.inkSoft,
                      }}
                    >
                      {s.id}
                    </div>
                  ))
                : null}
              {/* 字幕/声音：声音每个拍点一格，字幕每两拍一句，铺满整条带子（只画前 13 秒会像半路断了） */}
              {i > 0
                ? Array.from({ length: i === 2 ? BEATS_TOTAL : Math.ceil(BEATS_TOTAL / 2) }).map((_, j) => {
                    const count = i === 2 ? BEATS_TOTAL : Math.ceil(BEATS_TOTAL / 2);
                    const x = ((j * (DURATION_SEC / count)) / DURATION_SEC) * (trackW - 84);
                    return (
                      <div
                        key={`b-${j}`}
                        style={{
                          position: "absolute",
                          left: x,
                          top: i === 2 ? 10 : 8,
                          width: i === 2 ? 3.5 : 8,
                          height: i === 2 ? 14 : 18,
                          background: i === 2 ? C.ink : C.red,
                          opacity: 0.5,
                        }}
                      />
                    );
                  })
                : null}
            </div>
          </div>
        ))}
        <div style={{ position: "absolute", left: 84 + playhead * (trackW - 84) - 3, top: -10, width: 7, height: 138, background: C.red, opacity: 0.9 }} />
        <div style={{ position: "absolute", left: 74 + playhead * (trackW - 84), top: -20, width: 22, height: 22, borderRadius: "50%", background: C.red }} />
      </div>

      <Ruler
        x1={trackX}
        x2={trackX + trackW}
        y={trackY + 186}
        p={trackP}
        label={`${timing.scenes.length} 场景 · ${TOTAL_FRAMES} 帧`}
        ticks={timing.scenes.length * 2}
        scale={vertical ? 1.15 : 1}
      />

      <div style={{ position: "absolute", left: vertical ? 76 : 140, top: vertical ? 1480 : 640, display: "flex", gap: 16 }}>
        {st.map((s, i) => (
          <div
            key={s.label}
            style={{
              width: vertical ? 190 : 178,
              padding: "13px 13px 10px",
              border: `1.5px solid ${C.rule}`,
              background: C.paperHi,
              opacity: chipShow[i] ?? 1,
              transform: `translateY(${(1 - (chipShow[i] ?? 1)) * 14}px)`,
            }}
          >
            <div style={{ fontFamily: FONT, fontSize: 13, letterSpacing: "0.12em", color: C.inkFaint }}>{s.label}</div>
            <div style={{ fontFamily: MONO, fontSize: vertical ? 40 : 42, fontWeight: 700, lineHeight: 1.12, color: C.ink }}>{s.value}</div>
            {s.hint ? <div style={{ fontFamily: MONO, fontSize: 11, color: C.inkFaint, whiteSpace: "nowrap" }}>{s.hint}</div> : null}
          </div>
        ))}
      </div>
    </Board>
  );
};

/* ────────────────────────── 04 声音是算出来的 ────────────────────────── */

export const SoundBoard: React.FC<BoardProps> = ({ sc, vertical = false }) => {
  const on = slots(sc);
  const st = stats(sc);
  const frame = useCurrentFrame();
  const fps = useFps();
  const f: FrameOf = (s) => s * fps;

  const over = enter(frame, 0, "quiet", { fps });
  const title = enter(frame, f(0.1), "head", { fps });
  const lineA = enter(frame, f(1.0), "body", { fps });
  const lineB = enter(frame, f(1.6), "body", { fps });
  const sheetP = ramp(frame, f(0.25), 18);
  const capP = ramp(frame, f(3.4), 14);

  const waveX = vertical ? 76 : 1000;
  const waveY = vertical ? 660 : 210;
  const waveW = vertical ? 928 : 760;

  const bpm = timing.beats?.bpm ?? 100;
  const beatSec = 60 / bpm;
  // 1080p 下 760px 放 88 个拍点会糊成一片，四个拍点画一条
  const step = 4;
  const beats: number[] = [];
  for (let t = 0; t <= DURATION_SEC; t += beatSec * step) beats.push(t);

  const playhead = clamp((frame - f(0.3)) / (f(sc.end - sc.start - 0.6)));
  const chipShow = st.map((_, i) => ramp(frame, f(2.0) + i * f(0.4), 12));

  return (
    <Board vertical>
      <div style={{ position: "absolute", left: vertical ? 76 : 140, top: vertical ? 250 : 300, width: vertical ? 928 : 720 }}>
        <div style={{ fontFamily: MONO, fontSize: vertical ? 16 : 19, letterSpacing: "0.26em", color: C.inkFaint, opacity: over.opacity }}>
          {t(on.overline, "overline")}
        </div>
        <div style={{ marginTop: vertical ? 22 : 16, fontSize: vertical ? 62 : 76, fontWeight: 800, letterSpacing: "-0.01em", lineHeight: 1.12, opacity: title.opacity, transform: `translateY(${title.y}px)` }}>
          <Rich text={t(on.title, "title")} accent={C.red} />
        </div>
        <div style={{ marginTop: vertical ? 22 : 26, fontSize: vertical ? 24 : 30, lineHeight: 1.7, color: C.inkSoft, opacity: lineA.opacity, transform: `translateY(${lineA.y}px)` }}>
          <Rich text={t(on.lines?.[0], "lines[0]")} accent={C.red} />
        </div>
        <div style={{ marginTop: 6, fontSize: vertical ? 23 : 27, lineHeight: 1.7, color: C.inkFaint, opacity: lineB.opacity, transform: `translateY(${lineB.y}px)` }}>
          <Rich text={t(on.lines?.[1], "lines[1]")} accent={C.red} />
        </div>
      </div>

      <Sheet
        src="exhibits/exhibit-bgm-wave.png"
        x={waveX}
        y={waveY}
        w={waveW}
        p={sheetP}
        offsetY={Math.sin((frame / fps / 10) * Math.PI * 2) * 14}
        code="E-06 / bgm.wav"
      />

      {/* 拍点红线 + 播放头，位置全部按 BPM 算，不手点 */}
      <div style={{ position: "absolute", left: waveX + 8, top: waveY + 8 + 8, width: waveW - 16, height: (waveW - 16) * (940 / 2400), opacity: sheetP, overflow: "hidden" }}>
        {beats.map((t, i) => (
          <div key={i} style={{ position: "absolute", left: (t / DURATION_SEC) * (waveW - 16), top: 0, width: 1, height: "100%", background: C.red, opacity: 0.34 }} />
        ))}
        <div
          style={{
            position: "absolute",
            left: playhead * (waveW - 16) - 16,
            top: 0,
            width: 34,
            height: "100%",
            background: "linear-gradient(90deg, transparent, rgba(217,93,69,0.24), transparent)",
          }}
        />
        <div style={{ position: "absolute", left: playhead * (waveW - 16) - 2.5, top: 0, width: 5, height: "100%", background: C.red, opacity: 0.95 }} />
      </div>

      {on.caption ? (
        <div style={{ position: "absolute", left: waveX, top: waveY + (waveW - 16) * (940 / 2400) + 96, width: waveW, fontFamily: FONT, fontSize: vertical ? 21 : 21, lineHeight: 1.6, color: C.red, opacity: capP }}>
          {t(on.caption, "caption")}
        </div>
      ) : null}

      {/* 竖版把数字条收上来，别让画面下半截空着 */}
      <div style={{ position: "absolute", left: vertical ? 76 : 140, top: vertical ? 1240 : 640, display: "flex", gap: 16 }}>
        {st.map((s, i) => (
          <div
            key={s.label}
            style={{
              width: vertical ? 190 : 178,
              padding: "13px 13px 10px",
              border: `1.5px solid ${C.rule}`,
              background: C.paperHi,
              opacity: chipShow[i] ?? 1,
              transform: `translateY(${(1 - (chipShow[i] ?? 1)) * 14}px)`,
            }}
          >
            <div style={{ fontFamily: FONT, fontSize: 13, letterSpacing: "0.12em", color: C.inkFaint }}>{s.label}</div>
            <div style={{ fontFamily: MONO, fontSize: vertical ? 40 : 42, fontWeight: 700, lineHeight: 1.12, color: C.ink, whiteSpace: "nowrap" }}>
              {s.value}
              {s.unit ? <span style={{ fontSize: 16, marginLeft: 3 }}>{s.unit}</span> : null}
            </div>
            {s.hint ? <div style={{ fontFamily: MONO, fontSize: 11, color: C.inkFaint, whiteSpace: "nowrap" }}>{s.hint}</div> : null}
          </div>
        ))}
      </div>
    </Board>
  );
};

/* ────────────────────────── 05 收尾：图签放大 ────────────────────────── */

export const CtaBoard: React.FC<BoardProps> = ({ sc, vertical = false }) => {
  const on = slots(sc);
  const frame = useCurrentFrame();
  const fps = useFps();
  const f: FrameOf = (s) => s * fps;

  const kicker = enter(frame, 0, "quiet", { fps });
  const url = enter(frame, f(0.25), "head", { fps });
  const lineA = enter(frame, f(1.3), "body", { fps });
  const lineB = enter(frame, f(1.8), "body", { fps });

  return (
    <Board vertical={vertical}>
      <div style={{ position: "absolute", left: vertical ? 76 : 140, top: vertical ? 470 : 360, width: vertical ? 928 : 1560 }}>
        <div style={{ fontFamily: MONO, fontSize: vertical ? 18 : 20, letterSpacing: "0.28em", color: C.inkFaint, opacity: kicker.opacity }}>
          {t(on.kicker, "kicker")}
        </div>
        <div
          style={{
            marginTop: vertical ? 30 : 26,
            fontFamily: MONO,
            fontSize: vertical ? 42 : 58,
            fontWeight: 700,
            lineHeight: 1.24,
            letterSpacing: "-0.02em",
            whiteSpace: vertical ? "normal" : "nowrap",
            opacity: url.opacity,
            transform: `translateY(${url.y}px)`,
          }}
        >
          <Rich text={t(on.title, "title")} accent={C.red} />
        </div>
        <div style={{ marginTop: vertical ? 40 : 48, fontSize: vertical ? 26 : 30, lineHeight: 1.72, color: C.inkSoft, opacity: lineA.opacity, transform: `translateY(${lineA.y}px)` }}>
          <Rich text={t(on.lines?.[0], "lines[0]")} accent={C.red} />
        </div>
        <div style={{ marginTop: 4, fontSize: vertical ? 25 : 28, lineHeight: 1.72, color: C.inkFaint, opacity: lineB.opacity, transform: `translateY(${lineB.y}px)` }}>
          <Rich text={t(on.lines?.[1], "lines[1]")} accent={C.red} />
        </div>
      </div>

      {vertical ? (
        <Sheet src="exhibits/exhibit-tree.png" x={230} y={1190} w={620} p={ramp(frame, f(3.2), 18)} code="E-08" rotate={-1.2} />
      ) : (
        <Sheet
          src="exhibits/exhibit-tree.png"
          x={1280}
          y={500}
          w={520}
          p={ramp(frame, f(3.2), 18)}
          offsetY={Math.sin((frame / fps / 10) * Math.PI * 2) * 22}
          code="E-08"
          rotate={-1.2}
        />
      )}
    </Board>
  );
};
