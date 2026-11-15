/**
 * 生成 template/public/lottie/demo-badge.json（自绘 Bodymovin 素材）。
 *
 * 为什么要有这个脚本：task-9 的 F1 —— 第 7 段（`Lottie` 段）末尾 1.5 秒完全静止。
 * 上一版 JSON 的最后一个关键帧在素材第 66 帧（段长 90 帧），第 67 帧起画面定格。
 * 这一版把「波纹」按 15 帧错开、每条活 20 帧，覆盖到第 90 帧，保证任意一帧都有运动。
 *
 * 结构（w=h=512、fr=30、ip=0、op=90）：
 *   check  勾号 + trim path 描边生长（12~44 帧），用底色画「挖空」
 *   disc   强调色圆底（静态）
 *   wave1~6  从圆边缘向外扩的描边环，起点 0/15/30/45/60/75，各活 20 帧（缩放到 170%、透明度 70%→0）
 *
 * 颜色是 src/lib/theme.ts 的 0~1 浮点拷贝：accent #8ef0c8、bg #07090d。
 *
 * 用法（在 template/ 下）：node tools/gen-badge.js —— 直接覆写 public/lottie/demo-badge.json。
 * 改段长、改结构、改主题色之后重跑一遍，别手改 JSON：六条波纹的关键帧是循环展开出来的。
 */

const fs = require("fs");
const path = require("path");

const OUT = path.resolve(__dirname, "../public/lottie/demo-badge.json");

const W = 512;
const H = 512;
const FR = 30;
const OP = 90;

const BG = [0.027451, 0.035294, 0.05098, 1]; // #07090d
const ACCENT = [0.556863, 0.941176, 0.784314, 1]; // #8ef0c8

// 线性：控制点落在对角线上，x(t) === y(t)，等于匀速
const LIN = { o: { x: [0], y: [0] }, i: { x: [1], y: [1] } };
// 缓入缓出：勾号生长用
const EASE = { o: { x: [0.4], y: [0] }, i: { x: [0.6], y: [1] } };

const ksBase = () => ({
  o: { a: 0, k: 100 },
  r: { a: 0, k: 0 },
  p: { a: 0, k: [W / 2, H / 2, 0] },
  a: { a: 0, k: [0, 0, 0] },
  s: { a: 0, k: [100, 100, 100] },
});

const tr = () => ({
  ty: "tr",
  p: { a: 0, k: [0, 0] },
  a: { a: 0, k: [0, 0] },
  s: { a: 0, k: [100, 100] },
  r: { a: 0, k: 0 },
  o: { a: 0, k: 100 },
  sk: { a: 0, k: 0 },
  sa: { a: 0, k: 0 },
  nm: "Transform",
});

const group = (nm, items) => ({
  ty: "gr",
  it: [...items, tr()],
  nm,
  np: items.length,
  cix: 2,
  bm: 0,
  ix: 1,
  mn: "ADBE Vector Group",
  hd: false,
});

const pathShape = (nm, verts) => ({
  ty: "sh",
  d: 1,
  ks: {
    a: 0,
    k: {
      i: verts.map(() => [0, 0]),
      o: verts.map(() => [0, 0]),
      v: verts,
      c: false,
    },
  },
  nm,
  mn: "ADBE Vector Shape - Group",
  hd: false,
});

const ellipse = (size) => ({
  ty: "el",
  d: 1,
  s: { a: 0, k: [size, size] },
  p: { a: 0, k: [0, 0] },
  nm: "Ellipse Path 1",
  mn: "ADBE Vector Shape - Ellipse",
  hd: false,
});

const fill = (color) => ({
  ty: "fl",
  c: { a: 0, k: color },
  o: { a: 0, k: 100 },
  r: 1,
  bm: 0,
  nm: "Fill 1",
  mn: "ADBE Vector Graphic - Fill",
  hd: false,
});

const stroke = (color, w) => ({
  ty: "st",
  c: { a: 0, k: color },
  o: { a: 0, k: 100 },
  w: { a: 0, k: w },
  lc: 2,
  lj: 2,
  bm: 0,
  nm: "Stroke 1",
  mn: "ADBE Vector Graphic - Stroke",
  hd: false,
});

const trim = (endKF) => ({
  ty: "tm",
  s: { a: 0, k: 0 },
  e: endKF,
  o: { a: 0, k: 0 },
  m: 1,
  nm: "Trim Paths 1",
  mn: "ADBE Vector Filter - Trim",
  hd: false,
});

const layer = ({ ind, nm, ip, op, ks, shapes }) => ({
  ddd: 0,
  ind,
  ty: 4,
  nm,
  sr: 1,
  ks,
  ao: 0,
  shapes,
  ip,
  op,
  st: 0,
  bm: 0,
});

// ---------------------------------------------------------------- check（勾号）
const check = layer({
  ind: 1,
  nm: "check",
  ip: 0,
  op: OP,
  ks: ksBase(),
  shapes: [
    group("check", [
      pathShape("Path 1", [
        [-92, 4],
        [-26, 70],
        [94, -60],
      ]),
      // 12 → 44 帧描完，之后保持 100%
      trim({
        a: 1,
        k: [
          { t: 0, s: [0], e: [0], ...LIN },
          { t: 12, s: [0], e: [100], ...EASE },
          { t: 44, s: [100] },
        ],
      }),
      stroke(BG, 34),
    ]),
  ],
});

// ---------------------------------------------------------------- disc（圆底）
const disc = layer({
  ind: 2,
  nm: "disc",
  ip: 0,
  op: OP,
  ks: ksBase(),
  shapes: [group("disc", [ellipse(300), fill(ACCENT)])],
});

// ---------------------------------------------------------------- wave × 6（波纹）
const WAVE_STEP = 15; // 每 15 帧起一条
const WAVE_LIFE = 20; // 每条活 20 帧（>15 → 相邻两条有 5 帧重叠，任意一帧都有波纹在动）
const waves = [];
for (let i = 0; i < 6; i += 1) {
  const start = i * WAVE_STEP;
  const end = start + WAVE_LIFE;
  waves.push(
    layer({
      ind: 3 + i,
      nm: `wave${i + 1}`,
      ip: start,
      op: Math.min(end, OP),
      ks: {
        ...ksBase(),
        s: {
          a: 1,
          k: [
            { t: start, s: [100, 100, 100], e: [170, 170, 100], ...LIN },
            { t: end, s: [170, 170, 100] },
          ],
        },
        o: {
          a: 1,
          k: [
            { t: start, s: [70], e: [0], ...LIN },
            { t: end, s: [0] },
          ],
        },
      },
      shapes: [group(`wave${i + 1} ring`, [ellipse(300), stroke(ACCENT, 4)])],
    }),
  );
}

const payload = {
  v: "5.7.4",
  fr: FR,
  ip: 0,
  op: OP,
  w: W,
  h: H,
  nm: "demo-badge",
  ddd: 0,
  assets: [],
  // layers[0] 在最上面：勾号压着圆底，圆底压着波纹（波纹从圆边缘后面长出来）
  layers: [check, disc, ...waves.reverse()],
  markers: [],
};

fs.writeFileSync(OUT, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
console.log(`wrote ${OUT}`);
console.log(`bytes=${fs.statSync(OUT).size}`);
