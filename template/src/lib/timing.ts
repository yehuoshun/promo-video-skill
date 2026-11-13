import raw from "../../timing.json";

/** 场景类型，与 scripts-win/check_timing.py 的 MIN_DUR 一一对应 */
export type Kind = "hook" | "info" | "showcase" | "montage" | "cta" | "transition";

/** 一张统计卡。value 可以是数字，也可以是 @token（见 lib/onscreen.ts） */
export type StatSlot = {
  /** 卡片小标题，例如「场景」 */
  label: string;
  /** 数字，或 @scenes / @duration / @frames / @fps / @gates 这类派生值 */
  value: string | number;
  /** 数字后面的单位，例如「个」「s」 */
  unit?: string;
  /** 数字下面的小注，例如「timing.json」 */
  hint?: string;
};

/**
 * 「屏幕上有什么」，按 layout 分槽位。**文案改这里，不要改 TSX。**
 * 字符串里的 `**...**` 会渲染成强调色（见 lib/rich.tsx），
 * `@token` 会算成派生数字（见 lib/onscreen.ts）。
 */
export type OnscreenMap = {
  /** 上方小字，例如 promo-video-skill */
  kicker?: string;
  /** 主体大字，一行一条 */
  lines?: string[];
  /** 大字下面的说明 */
  sub?: string;
  /** 标题上方的小标签 */
  overline?: string;
  /** 主体标题 */
  title?: string;
  /** 地址栏 / 落点网址 */
  url?: string;
  /** 图下方的说明 */
  caption?: string;
  /** 最下面的尾注 */
  tail?: string;
  /** 数据卡片 */
  stats?: StatSlot[];
};

export type Scene = {
  id: string;
  kind: Kind;
  /** 决定用哪个场景组件，见 src/Root.tsx 的 LAYOUTS */
  layout: string;
  start: number;
  end: number;
  /**
   * 屏幕上要出现的字，按 layout 分槽位。
   * 旧的 `string[]` 摘要格式已被 lib/onscreen.ts 拒绝——渲染时直接报错，
   * 免得「文案写在 JSON 里、画面却纹丝不动」这种静默失败再发生一次。
   */
  onscreen?: OnscreenMap | string[];
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
  /**
   * 写不进时间轴的片子级事实，供画面上的 @token 取用。
   * gates = 交付体检的闸门数，改了 scripts-win/verify.ps1 的步数记得同步这里。
   */
  facts?: { gates?: number };
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
  /**
   * 旁白逐句表，由 scripts-win/gen_vo.py 生成——不要手改 at/dur，
   * 改了就和 public/vo/*.wav 对不上（check_sync.py 会报时长不符）。
   */
  voiceLines?: VoiceLine[];
  scenes: Scene[];
};

/**
 * 一句旁白。核心事实：at 是合成时定的、dur 是从 wav 量的，
 * 所以「这句在第几秒说」不需要猜——字幕、音轨、校验读的都是同一份。
 */
export type VoiceLine = {
  /** 场景 id + 句号，例如 hook-01-1 */
  id: string;
  /** 属于哪个场景，用来校验它没有飘出画面 */
  scene: string;
  /** 起始秒数（已对齐到整帧） */
  at: number;
  /** 这句话说多久（秒），等于 wav 实际长度 */
  dur: number;
  /** 字幕文本，同时也是合成用的文本 */
  text: string;
  /** 相对 public/ 的路径，例如 vo/hook-01-1.wav */
  file: string;
  /** 文本指纹，用来发现「字幕改了但没重新合成」 */
  sha1?: string;
  /** 每秒字数，念得太快听不清 */
  rate?: number;
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
