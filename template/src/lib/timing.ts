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
  scenes: Scene[];
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
