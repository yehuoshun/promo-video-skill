import raw from "../../timing.json";

/** 场景类型，与 scripts-win/check_timing.py 的 MIN_DUR 一一对应 */
export type Kind = "hook" | "info" | "showcase" | "montage" | "cta" | "transition";

export type Scene = {
  id: string;
  kind: Kind;
  /** 决定用哪个场景组件，见 src/Root.tsx 的 LAYOUTS */
  layout: string;
  start: number;
  end: number;
  onscreen?: string[];
  voice?: string;
  beats?: number[];
  shots?: number[];
  notes?: string;
};

export type Timing = {
  fps: number;
  width: number;
  height: number;
  duration: number;
  title?: string;
  pace?: {
    minShot?: number;
    holdShot?: number;
    cardHold?: number;
    ctaHold?: number;
    stagger?: number;
    transition?: number;
  };
  beats?: { bpm: number; offset: number };
  audio?: AudioCfg;
  scenes: Scene[];
};

/** 一记音效：at 是全局秒数，与 scenes[].start 用同一把尺 */
export type SfxCue = {
  at: number;
  /** 相对 template/public/ 的路径 */
  file: string;
  volume?: number;
};

/**
 * 音轨配置。文件都放在 template/public/ 下，组件里用 staticFile() 取。
 * 三段都可有可无：没有 bgm 就是无声片，没有 voice 就是纯音乐片。
 */
export type AudioCfg = {
  bgm?: string;
  /** 背景音乐音量 0~1，0.5 约等于 -6 dB */
  volume?: number;
  /** 淡入秒数，默认 0.2 */
  fadeIn?: number;
  /** 淡出秒数，默认 0.9——太短会在结尾「啪」一声 */
  fadeOut?: number;
  sfx?: SfxCue[];
  /** 整段旁白（一条轨），相对 public/；分句旁白请先 mix 成一条再放进来 */
  voice?: string;
  voiceAt?: number;
  /** 有旁白时背景音乐压低多少 dB，默认 0（不压）。校验脚本要求人声高出音乐 ≥8 dB */
  duck?: number;
};

export const timing = raw as Timing;

export const FPS = timing.fps;
export const WIDTH = timing.width;
export const HEIGHT = timing.height;
export const DURATION_SEC = timing.duration;
export const TOTAL_FRAMES = Math.round(DURATION_SEC * FPS);

export const BPM = timing.beats?.bpm ?? 100;
export const BEAT_OFFSET = timing.beats?.offset ?? 0;

/** 秒 → 帧（四舍五入，保证与 check_timing.py 的整帧检查一致） */
export const sec = (s: number): number => Math.round(s * FPS);

/** 场景在父时间轴上的位置，直接喂给 <Sequence> */
export const sceneRange = (sc: Scene): { from: number; durationInFrames: number } => ({
  from: sec(sc.start),
  durationInFrames: sec(sc.end) - sec(sc.start),
});

/** 一拍多长（秒） */
export const BEAT_SEC = 60 / BPM;

/**
 * 给定全局秒数，返回当前落在这一拍里的进度 0→1。
 * 用来做「光晕随拍呼吸」这类效果，不需要提前算节拍网格。
 */
export const beatPhase = (t: number, bpm = BPM, offset = BEAT_OFFSET): number => {
  const period = 60 / bpm;
  const x = (t - offset) % period;
  return ((x % period) + period) % period / period;
};

/** 场景内的相对秒数（场景组件的 frame 从 0 开始，用它换算回全局秒） */
export const localToGlobal = (sc: Scene, localFrame: number): number => sc.start + localFrame / FPS;
