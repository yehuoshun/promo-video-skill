import React from "react";
import { Audio, Sequence, staticFile } from "remotion";
import { FPS, TOTAL_FRAMES, sec, timing } from "./lib/timing";

/**
 * 音轨层：背景音乐（带淡入淡出 + 旁白闪避）+ 逐句旁白 + 若干记音效。
 *
 * 四条规矩，跟画面用的是同一套：
 * 1. 时间只从 timing.json 读——audio.sfx[].at、voiceLines[].at 和 scenes[].start
 *    是同一把尺，谁都不许在这里写死秒数。
 * 2. 音量包络按帧算（volume 给的是帧回调），没有 CSS、没有 transition，
 *    渲染器抓得到每一帧的状态。
 * 3. 文件读不到就当场抛错。Remotion 的 Audio 默认会静默跳过坏路径，
 *    最后表现为「片子没声」，比报错难查得多。
 * 4. 旁白逐句播放，不用一条整轨：每句一个 wav，起止时间就是 timing.json
 *    里写的那两个数，于是字幕（Subtitles.tsx）、音轨、校验脚本读的是同一份事实。
 */

const dBToLinear = (db: number): number => Math.pow(10, -Math.abs(db) / 20);

/** 闪避的上下沿：旁白进来前多少秒开始压低音乐，退出后多少秒恢复 */
const DUCK_RAMP_SEC = 0.25;

export const Soundtrack: React.FC = () => {
  const audio = timing.audio;
  const lines = timing.voiceLines ?? [];
  if (!audio || (!audio.bgm && !audio.voice && !lines.length)) return null;

  const base = audio.volume ?? 0.5;
  /** 旁白在场时背景音乐压低多少 dB；默认 8，与「人声高出音乐 ≥8dB」这条校验对得上 */
  const duckGain = dBToLinear(audio.duck ?? 8);
  const fadeInFrames = sec(audio.fadeIn ?? 0.2);
  const fadeOutFrames = sec(audio.fadeOut ?? 0.9);
  const total = TOTAL_FRAMES;
  const rampFrames = Math.max(1, Math.round(DUCK_RAMP_SEC * FPS));

  const windows = lines.map((l) => [sec(l.at), sec(l.at + l.dur)] as const);

  // 逐帧算闪避：落在任何一句旁白的时间窗（前后各留一段斜坡）就压到 duckGain
  const duckAt = (f: number): number => {
    let gain = 1;
    for (let i = 0; i < windows.length; i++) {
      const [a, b] = windows[i];
      const rampedIn = Math.min(1, Math.max(0, (f - (a - rampFrames)) / rampFrames));
      const rampedOut = Math.min(1, Math.max(0, (b + rampFrames - f) / rampFrames));
      const inside = Math.min(rampedIn, rampedOut);
      gain = Math.min(gain, 1 - (1 - duckGain) * inside);
    }
    return gain;
  };

  return (
    <>
      {audio.bgm ? (
        <Audio
          src={staticFile(audio.bgm)}
          volume={(f) => {
            const inGain = fadeInFrames > 0 ? Math.min(1, f / fadeInFrames) : 1;
            const outGain = fadeOutFrames > 0 ? Math.min(1, (total - f) / fadeOutFrames) : 1;
            // 三段夹到 0~1：淡出算到负数没关系，音量不能为负
            return base * Math.max(0, Math.min(inGain, outGain)) * duckAt(f);
          }}
        />
      ) : null}

      {/* 逐句旁白：at 由 gen_vo.py 写，dur 就是 wav 长度，不需要猜 */}
      {lines.map((l) => (
        <Sequence key={l.id} from={sec(l.at)} name={`vo:${l.id}`}>
          <Audio src={staticFile(l.file)} volume={1} />
        </Sequence>
      ))}

      {/* 兼容老写法：整段旁白一条轨（audio.voice + voiceAt） */}
      {audio.voice ? (
        <Sequence from={sec(audio.voiceAt ?? 0)} name="voice">
          <Audio src={staticFile(audio.voice)} volume={1} />
        </Sequence>
      ) : null}

      {(audio.sfx ?? []).map((cue, i) => (
        <Sequence key={`${cue.file}-${i}`} from={sec(cue.at)} name={`sfx:${cue.file}`}>
          <Audio src={staticFile(cue.file)} volume={cue.volume ?? 0.5} />
        </Sequence>
      ))}
    </>
  );
};
