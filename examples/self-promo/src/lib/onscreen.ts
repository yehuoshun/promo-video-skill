import {
  DURATION_SEC,
  FPS,
  TOTAL_FRAMES,
  timing,
  type OnscreenMap,
  type Scene,
  type StatSlot,
} from "./timing";

/**
 * 屏幕文案的取数与派生。
 *
 * 存在的理由：画面上曾经印着「场景 14 个 / 总时长 52s / 闸门 4 道」，
 * 而那支 demo 实际是 3 个场景、15 秒、11 道闸门——手写的数字一定会漂。
 * 现在数字写成 @token，真值只有 timing.json 一个来源。
 */

/** token 名 → 取值函数。要加新 token 就在这里加一行，同时在 timing.ts 补字段 */
const TOKENS: Record<string, () => number> = {
  "@scenes": () => timing.scenes.length,
  "@duration": () => DURATION_SEC,
  "@frames": () => TOTAL_FRAMES,
  "@fps": () => FPS,
  "@gates": () => timing.facts?.gates ?? NaN,
};

/** 可用 token 名单，报错文案和文档都用它，避免两处对不上 */
export const TOKEN_NAMES = Object.keys(TOKENS);

const tokenNumber = (name: string): number => {
  const fn = TOKENS[name];
  if (!fn) throw new Error(`不认识的 @token "${name}"，可用：${TOKEN_NAMES.join(" / ")}`);
  const n = fn();
  if (!Number.isFinite(n)) {
    throw new Error(`@token "${name}" 取不到值：timing.json 里缺对应字段（例如 facts.gates）`);
  }
  return n;
};

/**
 * 把一个可能是 @token 的值算成数字。
 * 认不出、或算不出都直接抛错——屏幕上映出一串「@gates」比报错更难查。
 */
export const resolveValue = (v: string | number): number => {
  if (typeof v === "number") return v;
  if (v.startsWith("@")) return tokenNumber(v);
  const n = Number(v);
  if (!Number.isFinite(n)) {
    throw new Error(`统计卡的 value 只能是数字或 @token，收到 "${v}"`);
  }
  return n;
};

/** 文案里的 token 就地替换：`@fps fps` → `30 fps`（hint 这类要带单位的场景用） */
export const fillTokens = (s: string): string => s.replace(/@[a-z]+/g, (m) => String(tokenNumber(m)));

/**
 * 取一条文案并把 @token 换成真数字。
 * 场景里一律用这个，别直接 text()——`@gates` 曾经原样印在屏幕上过。
 */
export const t = (v: string | undefined, where: string): string => fillTokens(text(v, where));

/**
 * 取一个场景的槽位表。
 * 旧的 `string[]` 摘要格式在这里直接抛错——以前那份摘要没有任何渲染器读，
 * 文案改了半天画面不动，是最难查的一类 bug，宁可渲染时红屏。
 */
export const slots = (sc: Scene): OnscreenMap => {
  const on = sc.onscreen;
  if (Array.isArray(on)) {
    throw new Error(
      `场景 ${sc.id} 的 onscreen 还是旧的字符串数组格式。请改成按槽位的对象，` +
        `例如 {"lines": ["第一行", "第二行"]}；` +
        `强调色用 **字** 标，派生数字用 ${TOKEN_NAMES.join(" / ")}。`,
    );
  }
  return on ?? {};
};

/** 统计卡：value 算成数字，hint 里的 token 就地替换，其余原样 */
export const stats = (sc: Scene): Array<StatSlot & { value: number }> =>
  (slots(sc).stats ?? []).map((s) => ({
    ...s,
    value: resolveValue(s.value),
    hint: s.hint === undefined ? undefined : fillTokens(s.hint),
  }));

/**
 * 取一条文案。缺失时给一个显眼的占位，而不是空字符串——
 * 空着会让整屏看起来「设计本来就这样」，占位能让审图的人一眼发现漏了。
 */
export const text = (v: string | undefined, where: string): string =>
  v && v.trim() ? v : `〔缺文案：${where}〕`;
