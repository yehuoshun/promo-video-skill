import React from "react";
import { Audio, Sequence, staticFile } from "remotion";
import { TOTAL_FRAMES, timing, sec } from "./lib/timing";

/**
 * 音轨层：背景音乐（带淡入淡出）+ 若干记音效。
 *
 * 三条规矩，跟画面用的是同一套：
 * 1. 时间只从 timing.json 读——audio.sfx[].at 和 scenes[].start 是同一把尺，
 *    谁都不许在这里写死秒数。
 * 2. 音量包络按帧算（volume 给的是帧回调），没有 CSS、没有 transition，
 *    渲染器抓得到每一帧的状态。
 * 3. 文件读不到就当场抛错。Remotion 的 Audio 默认会静默跳过坏路径，
 *    最后表现为「片子没声」，比报错难查得多。
 */

const dBToLinear = (db: number): number => Math.pow(10, -Math.abs(db) / 20);

export const Soundtrack: React.FC = () => {
  const audio = timing.audio;
  if (!audio || !audio.bgm) return null;

  const base = audio.volume ?? 0.5;
  const gain = audio.duck ? dBToLinear(audio.duck) : 1;
  const fadeInFrames = sec(audio.fadeIn ?? 0.2);
  const fadeOutFrames = sec(audio.fadeOut ?? 0.9);
  const total = TOTAL_FRAMES;

  return (
    <>
      <Audio
        src={staticFile(audio.bgm)}
        volume={(f) => {
          const inGain = fadeInFrames > 0 ? Math.min(1, f / fadeInFrames) : 1;
          const outGain =
            fadeOutFrames > 0 ? Math.min(1, (total - f) / fadeOutFrames) : 1;
          // 两段都夹到 0~1：淡出算到负数没关系，音量不能为负
          return base * gain * Math.max(0, Math.min(inGain, outGain));
        }}
      />

      {audio.voice ? (
        <Sequence from={sec(audio.voiceAt ?? 0)} name="voice">
          <Audio src={staticFile(audio.voice)} />
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
