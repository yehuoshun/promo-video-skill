#!/usr/bin/env python
"""离线渲染素材体检（第 11 道闸门）：外部渲染器出的 PNG 序列 + meta.json。

为什么要单独一道闸门：`render-offline` 把 Manim/Blender 这类外部渲染器的产物
统一成 `public/offline/<name>/frame_0000.png…`，这块素材有几个别的闸门查不到的坑：

  - `meta.json` 缺字段、`license` 空 → 素材来源与授权不明（方案第 7 节的核心风险，
    第三方 AE 模板常常禁止商用，写不清就是隐患）；
  - 帧号断号 → Remotion 侧按 `frame_%04d` 拼路径，断在哪一帧画面就凭空缺一块；
  - 图片实际像素 ≠ meta 里的 width/height → 布局定位/缩放全按 meta 的数字算，
    说一套做一套就是跳帧或拉伸（手改 meta 想骗过尺寸检查，这里当场按住）；
  - 出图宽/高 < `display_width`/`display_height` × 2 → 4K 是 1x 布局 zoom 2 倍，宽、高
    哪个方向不够都会糊（方案 4.3）；只盯宽度的话，900×500 显示配 1800×100 出图能混过去；
  - `meta.alpha` 说「带透明」而 PNG 实际没有 alpha 通道 → 合成时露出渲染器底色（黑/白）；
  - `public/offline/` 根上直接堆着帧 → 没有 meta、没有 license，闸门连片段都认不出来；
  - 单目录体积超限 → 仓库和渲染内存都吃不消（4K RGBA 单帧 4~8MB，2 秒就是 240~480MB）。

`display_width` / `display_height` 是**必填**字段：它写的是这块素材在 1x 布局里的显示像素，
只有场景作者知道（Remotion 侧 `<Img width={display_width}>` 就按它排）。缺了就 ERROR ——
这道闸门不准自己回填、也不准跳过：「宽 ≥ 显示宽×2」全指着这两个数，缺了它这条检查
就退化成「自己跟自己比」，等于恒真，4K 不糊的唯一机械保障就没了。

`check_assets.py` 会把 `public/offline/**` 整体跳过（那是序列帧，不是单张素材，
几百张会被当素材计数、按文件名和宽度刷屏），所以这些规则全部由这一道负责。

用法：
    python scripts-win/check_offline.py public/offline
    python scripts-win/check_offline.py .                    # 传项目根也行，自动下探 public/offline
    python scripts-win/check_offline.py public/offline --min-width-ratio 2
    python scripts-win/check_offline.py public/offline --max-total-mb 600 --max-frame-mb 12
    python scripts-win/check_offline.py public/offline --json

没有 `public/offline/` 目录时是 SKIP（0 ERROR / 0 WARN、退出码 0）：没走外部渲染器
的老项目不该因为多了这道闸门就变红。

尺寸只读 PNG 的 IHDR（前 26 字节），不解码整帧——几百张 4K PNG 用 PIL 全解码要几十秒，
闸门不该这么慢；顺带也不给这道闸门添 PIL 这条依赖。IHDR 里还写着位深和颜色类型，
`meta.alpha` 是不是真话（PNG 到底有没有 alpha 通道）就从这儿看。
"""

from __future__ import annotations

import argparse
import json
import math
import re
import struct
import sys
from pathlib import Path

# Windows 控制台默认按本地编码输出，中文会乱，这里强制 UTF-8
if sys.platform == "win32":
    for _s in (sys.stdout, sys.stderr):
        try:
            _s.reconfigure(encoding="utf-8")
        except Exception:  # noqa: BLE001
            pass

# 帧名契约：frame_ 前缀 + 4 位补零 + .png（Remotion 侧 staticFile 直接按这个拼）
FRAME_RE = re.compile(r"^frame_(\d{4})\.png$")
PNG_SIG = b"\x89PNG\r\n\x1a\n"

# meta.json 必须有的字段：render-offline 的写出口径，缺一个就算不合格。
# display_width/display_height 是 1x 布局里的显示像素，只能由场景作者给出 ——
# 没有它，「宽 ≥ 显示宽×2」这条就等于自己跟自己比（恒真），所以缺了直接 ERROR。
REQUIRED = (
    "name",
    "frames",
    "fps",
    "width",
    "height",
    "display_width",
    "display_height",
    "alpha",
    "renderer",
    "license",
    "source",
    "createdAt",
    "generatedBy",
)

# 方案 4.3 原始字段表里的这个，老产物可能没有：缺了只提示（WARN），不至于让闸门红。
# （alpha 不在此列：它说「带不带透明」，说错了合成时就露陷，必须真查、必填。）
DOC_HINT = ("command",)

# PNG 颜色类型（IHDR 第 25 字节）：4 = 灰度+alpha，6 = RGBA，只有这两种真带 alpha 通道。
CT_ALPHA = (4, 6)
CT_NAMES = {0: "灰度", 2: "RGB", 3: "调色板", 4: "灰度+透明", 6: "RGBA"}


def png_info(p: Path) -> tuple[int, int, int, int]:
    """读 PNG 的 IHDR：宽、高、位深、颜色类型（4/6 = 带 alpha）。不解整帧。"""
    with p.open("rb") as f:
        head = f.read(26)
    if len(head) < 26:
        raise ValueError(f"文件太短，只有 {len(head)} 字节")
    if not head.startswith(PNG_SIG):
        raise ValueError("不是 PNG（文件头不对）")
    if head[12:16] != b"IHDR":
        raise ValueError("第一个数据块不是 IHDR")
    w, h = struct.unpack(">II", head[16:24])
    return w, h, head[24], head[25]


def as_int(v, default=None):
    try:
        return int(v)
    except (TypeError, ValueError):
        return default


def as_float(v, default=None):
    try:
        return float(v)
    except (TypeError, ValueError):
        return default


def mb(n: float) -> float:
    return n / (1024 * 1024)


def find_root(arg: str) -> Path:
    """把用户给的路径收敛到「装着若干片段目录」的那一层。

    三种写法都认：`public/offline`、项目根（自动下探 `public/offline`）、片段目录本身（退回上一层）。
    都找不到就返回那个不存在的路径，交给调用方按 SKIP 处理——不能把 src/、out/
    当片段目录刷一屏 ERROR，那是路径给错了，不是素材有问题。
    """
    p = Path(arg)
    # 「名字叫 offline 的那层」直接认成根，哪怕里面躺着 meta.json —— 根上摊着 meta.json /
    # 帧本身就是这道闸门要报的错，不能因为瞥见 meta.json 就当它是「某个片段」再往上层退一步
    # （那样会拿 public/ 当根，把 offline 当片段，报一堆驴唇不对马嘴的缺字段）。
    if p.name.lower() != "offline" and (p / "meta.json").is_file():
        return p.parent
    if p.is_dir() and p.name.lower() != "offline":
        cand = p / "public" / "offline"
        if cand.is_dir():
            return cand
        # 项目根但没建 offline；再看是不是「片段目录们」直接堆在这一层（自定义目录）
        if not any((c / "meta.json").is_file() for c in p.iterdir() if c.is_dir()):
            return cand
    return p


def check_segment(d: Path, args, errors: list[str], warns: list[str], notes: list[str]) -> dict:
    """查一个片段目录，往 errors/warns 里追加（都带 `<片段名>：` 前缀），返回表格行。"""
    before_err = len(errors)
    row = {"name": d.name, "frames": 0, "size": "", "mb": 0.0, "verdict": "OK"}

    meta_p = d / "meta.json"
    if not meta_p.is_file():
        errors.append(f"{d.name}：缺 meta.json —— 这个目录不是 render-offline 产的，删掉重渲：scripts-win\\render-offline.cmd")
        row["verdict"] = "失败"
        return row

    # utf-8-sig：手改过的 meta.json 常带 BOM，读不了会报一句离原因很远的 JSON 错误
    try:
        meta = json.loads(meta_p.read_text(encoding="utf-8-sig"))
    except Exception as e:  # noqa: BLE001
        errors.append(f"{d.name}：meta.json 读不了 —— {e}")
        row["verdict"] = "失败"
        return row
    if not isinstance(meta, dict):
        errors.append(f"{d.name}：meta.json 顶层不是对象（现在是个 {type(meta).__name__}）")
        row["verdict"] = "失败"
        return row

    # ---- 字段齐不齐 ----
    keys = [k for k in REQUIRED if k not in meta]
    if keys:
        errors.append(f"{d.name}：meta.json 缺字段 {'、'.join(keys)}（用 render-offline 重渲一遍，别手拼）")
    empty = [k for k in REQUIRED if k in meta and not str(meta[k]).strip()]
    if empty:
        why = ""
        if "license" in empty or "source" in empty:
            why = " —— 外渲素材必须写清来源与授权，第三方模板/模型常禁止商用"
        errors.append(f"{d.name}：meta.json 字段为空：{'、'.join(empty)}{why}")
    lost = [k for k in DOC_HINT if k not in meta]
    if lost:
        warns.append(f"{d.name}：meta.json 没有 {'、'.join(lost)}（方案 4.3 的字段表里有，复现时少了线索）")

    # ---- 数值字段 ----
    frames = as_int(meta.get("frames"))
    fps = as_float(meta.get("fps"))
    width = as_int(meta.get("width"))
    height = as_int(meta.get("height"))
    if frames is None or frames <= 0:
        errors.append(f"{d.name}：meta.frames 不是正整数：{meta.get('frames')!r}")
        frames = None
    if fps is None or fps <= 0:
        errors.append(f"{d.name}：meta.fps 不是正数：{meta.get('fps')!r}")
    if width is None or width <= 0:
        errors.append(f"{d.name}：meta.width 不是正整数：{meta.get('width')!r}")
        width = None
    if height is None or height <= 0:
        errors.append(f"{d.name}：meta.height 不是正整数：{meta.get('height')!r}")
        height = None
    if str(meta.get("name", "")).strip() and str(meta["name"]) != d.name:
        warns.append(f"{d.name}：meta.name 是 {meta['name']!r}，和目录名不一致（改名没同步？）")

    # ---- 显示尺寸（必填，绝不回填） ----
    disp_w = as_int(meta.get("display_width"))
    disp_h = as_int(meta.get("display_height"))
    # 字段整个缺失时上面「缺字段」已经报过了，这里只在「写了但不合法」时补一刀
    if "display_width" in meta and (disp_w is None or disp_w <= 0):
        errors.append(f"{d.name}：meta.display_width 不是正整数：{meta.get('display_width')!r}（1x 布局里的显示像素）")
        disp_w = None
    if "display_height" in meta and (disp_h is None or disp_h <= 0):
        errors.append(f"{d.name}：meta.display_height 不是正整数：{meta.get('display_height')!r}（1x 布局里的显示像素）")
        disp_h = None

    # ---- alpha 声明（必填）：说带透明，PNG 就得真有 alpha 通道 ----
    # 不是布尔就直接报：写 "true"（字符串）在 JSON 里是合理的失误，但这道闸门不猜。
    alpha = meta.get("alpha")
    # 字段整个缺失时上面「缺字段 alpha」已经报过，这里只抓「写了但不是布尔」
    if "alpha" in meta and not isinstance(alpha, bool):
        errors.append(f"{d.name}：meta.alpha 不是布尔值：{alpha!r}（写 true / false —— 它决定 Remotion 合成时按不按透明通道处理）")
        alpha = None

    # ---- 帧文件 ----
    pngs = [p for p in d.iterdir() if p.is_file() and p.suffix.lower() == ".png"]
    nums: dict[int, Path] = {}
    odd: list[str] = []
    for p in pngs:
        m = FRAME_RE.match(p.name)
        if m:
            nums[int(m.group(1))] = p
        else:
            odd.append(p.name)
    if odd:
        more = f" 等 {len(odd)} 个" if len(odd) > 3 else ""
        warns.append(f"{d.name}：文件名不是 frame_####.png，Remotion 按格式拼路径读不到：{'、'.join(sorted(odd)[:3])}{more}")
    stray = [p.name for p in d.iterdir() if p.is_file() and p.suffix.lower() != ".png" and p.name != "meta.json"]
    if stray:
        more = f" 等 {len(stray)} 个" if len(stray) > 3 else ""
        warns.append(f"{d.name}：目录里有非帧文件：{'、'.join(sorted(stray)[:3])}{more}")
    subdirs = sorted(p.name for p in d.iterdir() if p.is_dir())
    if subdirs:
        more = f" 等 {len(subdirs)} 个" if len(subdirs) > 3 else ""
        # 只提示不改判定：真嵌套（比如 manim 的 media/ 没清干净）时下面的帧数/断号会自己报出来，
        # 这里提前点一句「闸门只看本层」，省得有人把帧塞进子目录还以为查过了。
        notes.append(f"{d.name}：目录里还有子目录：{'、'.join(subdirs[:3])}{more} —— 闸门只看本层的 frame_####.png，套在子目录里的帧查不到")
    row["frames"] = len(nums)
    if not nums:
        errors.append(f"{d.name}：目录里一帧 frame_####.png 都没有（render-offline 没跑完？）")
        row["verdict"] = "失败"
        return row

    if frames is not None:
        want = set(range(frames))
        have = set(nums)
        miss = sorted(want - have)
        extra = sorted(have - want)
        if miss:
            shown = "、".join(f"frame_{n:04d}.png" for n in miss[:5])
            tail = f"（共缺 {len(miss)} 帧）" if len(miss) > 5 else ""
            errors.append(f"{d.name}：帧号不连续，缺 {shown}{tail} —— 序列帧一断，Remotion 渲到那一帧就是空白")
        if extra:
            shown = "、".join(f"frame_{n:04d}.png" for n in extra[:5])
            tail = f"（共多 {len(extra)} 帧）" if len(extra) > 5 else ""
            errors.append(f"{d.name}：帧号超出 meta.frames={frames}：{shown}{tail} —— 上一版的旧帧没清干净？")

    # ---- 尺寸一致 + alpha 是不是真话 ----
    got: list[tuple[int, int, int, int, int]] = []
    bad_read: list[str] = []
    for n in sorted(nums):
        try:
            got.append((n, *png_info(nums[n])))
        except Exception as e:  # noqa: BLE001
            bad_read.append(f"{nums[n].name}（{e}）")
    if bad_read:
        errors.append(f"{d.name}：{len(bad_read)} 帧读不出尺寸：{'、'.join(bad_read[:3])}")

    # 尺寸只认 meta：PNG 实际像素必须严格等于 meta.width×height —— 手改 meta 想把
    # 48×48 的坏帧说成 32×32 骗过检查，这里当场按住。meta 宽高本身不合法时上面已经报过，
    # 这里不拿首帧「兜底」：兜底等于放行，闸门的结论就不可信了。
    if width and height and got:
        off = [(n, w, h) for (n, w, h, _dp, _ct) in got if (w, h) != (width, height)]
        if off:
            shown = "、".join(f"frame_{n:04d}.png 是 {w}×{h}" for (n, w, h) in off[:3])
            tail = f" 等 {len(off)} 帧" if len(off) > 3 else ""
            errors.append(
                f"{d.name}：{len(off)} 帧实际尺寸 ≠ meta.width×height {width}×{height}：{shown}{tail}"
                f" —— 布局按 meta 定位，说一套做一套就是跳帧/拉伸（尺寸不对就整段重渲，别改 meta 凑数）"
            )
    if got:
        row["size"] = f"{got[0][1]}×{got[0][2]}"
        # 位深/颜色类型顺手报出来：16bit、调色板、没 alpha 这些坑看这一行就能认出来
        depth, ctype = got[0][3], got[0][4]
        cname = CT_NAMES.get(ctype, f"未知({ctype})")
        notes.append(f"{d.name}：PNG 位深 {depth}、颜色类型 {ctype}（{cname}）")
        if depth and depth > 8:
            warns.append(
                f"{d.name}：PNG 位深 {depth}（>8），体积约为同尺寸 8bit 的两倍"
                f" —— 片子是 8bit 的话这份精度白付（确认渲染器没开 16bit）"
            )
        if alpha is True and ctype not in CT_ALPHA:
            errors.append(
                f"{d.name}：meta.alpha=true，但 PNG 是 colorType={ctype}（{cname}，没有 alpha 通道）"
                f" —— 说带透明却没有，合成到片子上会露出渲染器的底色（通常是黑或白）"
            )
        elif alpha is False and ctype in CT_ALPHA:
            warns.append(
                f"{d.name}：meta.alpha=false，但 PNG 是 colorType={ctype}（{cname}，带 alpha）"
                f" —— 透明通道白占体积（4K 每帧多约 25%），确认不用就渲成 RGB"
            )

    # ---- 出图尺寸 ≥ 显示尺寸 × ratio（宽、高都要查） ----
    # 只查宽度是漏的：显示 900×500、出图 1800×100，宽度刚好 2 倍，高度只剩五分之一，照样糊。
    # 4K 渲染是 1x 布局 zoom 2 倍，宽高两个方向都得按同一个倍数放大。
    if got and (disp_w or disp_h):
        need_w = int(math.ceil(disp_w * args.min_width_ratio)) if disp_w else 0
        need_h = int(math.ceil(disp_h * args.min_width_ratio)) if disp_h else 0
        short = [(n, w, h) for (n, w, h, _dp, _ct) in got
                 if (need_w and w < need_w) or (need_h and h < need_h)]
        if short:
            parts = []
            if need_w:
                parts.append(f"宽 ≥ {need_w}")
            if need_h:
                parts.append(f"高 ≥ {need_h}")
            need_txt = "、".join(parts)
            shown = "、".join(f"frame_{n:04d}.png 是 {w}×{h}" for (n, w, h) in short[:3])
            tail = f" 等 {len(short)} 帧" if len(short) > 3 else ""
            errors.append(
                f"{d.name}：{len(short)} 帧出图尺寸不到显示尺寸的 {args.min_width_ratio:g} 倍"
                f"（显示 {disp_w or '-'}×{disp_h or '-'}，要 {need_txt}）：{shown}{tail}"
                f" —— 4K 是 1x 布局 zoom 2 倍，宽、高哪个方向不够都会糊"
                f"（方案 4.3：按显示尺寸 2 倍出图；用 render-offline 的 -Width/-Height 重渲，别改 meta 凑数）"
            )

    # ---- 体积 ----
    biggest = 0
    biggest_name = ""
    for n in sorted(nums):
        sz = nums[n].stat().st_size
        if sz > biggest:
            biggest, biggest_name = sz, nums[n].name
    # 单帧只 WARN：4K RGBA 单帧 4~8MB 属于正常，偶尔一帧特别大通常是噪点/渐变，
    # 不值得为它把整段离线素材判死；真正会撑爆仓库的是目录总量，那条才 ERROR。
    if biggest and mb(biggest) > args.max_frame_mb:
        warns.append(
            f"{d.name}：单帧 {mb(biggest):.1f}MB 超过 {args.max_frame_mb:g}MB：{biggest_name}"
            f"（4K RGBA 单帧 4~8MB 正常，超了查是不是 16bit/未压缩；确实要就调 --max-frame-mb）"
        )
    total = sum(p.stat().st_size for p in d.rglob("*") if p.is_file())
    row["mb"] = mb(total)
    if row["mb"] > args.max_total_mb:
        errors.append(
            f"{d.name}：目录 {row['mb']:.0f}MB 超上限 {args.max_total_mb:g}MB"
            f"（方案 4.3：离线只做局部元素，全屏镜头别走离线；确实要就调 --max-total-mb）"
        )

    if len(errors) > before_err:
        row["verdict"] = "失败"
    return row


def main() -> int:
    ap = argparse.ArgumentParser(description="离线渲染素材体检（第 11 道闸门）")
    ap.add_argument("root", help="离线素材目录（public/offline），也可传项目根或单个片段目录")
    ap.add_argument("--min-width-ratio", type=float, default=2.0, help="出图宽、高至少是 meta.display_width/display_height 的几倍（默认 2）")
    ap.add_argument("--max-frame-mb", type=float, default=12.0, help="单帧体积提示线 MB（超了只 WARN，默认 12）")
    ap.add_argument(
        "--max-total-mb", type=float, default=600.0,
        help="单片段目录体积上限 MB（超了 ERROR，默认 600；4K RGBA 两秒实测 240~480MB，留一倍余量）",
    )
    ap.add_argument("--json", action="store_true", help="输出 JSON")
    args = ap.parse_args()

    root = find_root(args.root)
    if not root.is_dir():
        # 铁律：没有 offline 通道的项目不该变红 —— SKIP，不是一个 ERROR
        print(f"目录：{args.root}")
        print(f"[SKIP] 没有 public/offline/ 目录（{root}）—— 没走外部渲染器的项目不需要这道闸门")
        print("")
        print("结果：0 ERROR / 0 WARN")
        return 0

    segs = sorted((p for p in root.iterdir() if p.is_dir() and not p.name.startswith(".")), key=lambda p: p.name.lower())

    errors: list[str] = []
    warns: list[str] = []
    notes: list[str] = []
    rows: list[dict] = []

    # 根上直接摊着文件：手抄进来的帧没有 meta、没有 license，下面按片段遍历时它们根本不进循环，
    # 一帧都不会被查 —— 这不是「不影响」而是「假装查过了」，必须 ERROR。
    flat = sorted((p for p in root.iterdir() if p.is_file() and not p.name.startswith(".")), key=lambda p: p.name.lower())
    if flat:
        shown = "、".join(p.name for p in flat[:5])
        tail = f" 等 {len(flat)} 个" if len(flat) > 5 else ""
        errors.append(
            f"public/offline/ 根上直接放着文件：{shown}{tail}"
            f" —— 片段必须一个子目录一个（public/offline/<name>/frame_0000.png + meta.json）；"
            f"摊在根上的帧没有 meta 也没有 license，闸门连片段都认不出来"
        )
        if any(p.name.lower() == "meta.json" for p in flat):
            errors.append(
                "public/offline/meta.json 不属于任何片段 —— meta 必须和帧一起放进 public/offline/<name>/，"
                "根上这份没有任何代码会读到（Remotion 拼的是 offline/<name>/frame_0000.png）"
            )
    for d in segs:
        rows.append(check_segment(d, args, errors, warns, notes))

    if not segs:
        # 只建了目录却没出图：Remotion 里 staticFile('offline/...') 会直接 404，
        # 但这不算「素材坏了」，报 WARN 让人自己看一眼就够。
        warns.append("目录下没有任何片段目录 —— 只建了 public/offline/ 却没出图？Remotion 里 staticFile('offline/…') 会直接 404")

    if args.json:
        print(json.dumps(
            {"dir": str(root), "segments": rows, "errors": errors, "warnings": warns, "notes": notes},
            ensure_ascii=False, indent=2,
        ))
        return 1 if errors else 0

    total_frames = sum(r["frames"] for r in rows)
    print(f"目录：{root}    片段：{len(rows)} 段 / {total_frames} 帧")
    print(
        f"规则：帧号 0..N-1 连续、实际像素严格等于 meta.width×height、"
        f"出图宽 ≥ display_width×{args.min_width_ratio:g} 且高 ≥ display_height×{args.min_width_ratio:g}、"
        f"meta.alpha 与 PNG 颜色类型一致、"
        f"单帧 > {args.max_frame_mb:g}MB 只 WARN、单目录 ≤ {args.max_total_mb:g}MB"
    )
    print("")
    if rows:
        print(f"{'片段':<16}{'帧数':>6}  {'尺寸':<13}{'体积':>8}  判定")
        for r in rows:
            print(f"{r['name']:<16}{r['frames']:>6}  {r['size'] or '-':<13}{r['mb']:>7.1f}MB  {r['verdict']}")
        print("")

    for n in notes:
        print(f"[提示] {n}")
    if warns:
        print(f"\n[WARN] {len(warns)} 条")
        for w in warns:
            print(f"  - {w}")
    if errors:
        print(f"\n[ERROR] {len(errors)} 条")
        for e in errors:
            print(f"  - {e}")
    print(f"\n结果：{len(errors)} ERROR / {len(warns)} WARN")
    return 1 if errors else 0


if __name__ == "__main__":
    sys.exit(main())
