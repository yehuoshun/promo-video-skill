#!/usr/bin/env python
r"""段尾静止体检：一段动画是不是"前半段在动、后半段定死"，或者"其实一直没动"。

为什么要这一步：2026-11-14 QA 实测到第 7 段（Lottie）和第 8 段（morph）各有
45 帧（1.5 秒）完全静止——素材 JSON 的末个关键帧只到第 66 帧、而段长 90 帧；
morph 的 fromAt + duration 让变形在段中段就结束。画面没报错、没黑屏、成片
照样出得来，只是那 1.5 秒观众看到的是死画面。`check_stills.py` 每场景只比
35% / 85% 两帧，恰好都落在动的地方，抓不到这种"尾段静止"；`check_video.py`
只看容器。所以单开这一个旁路工具，审图时顺手跑。**不接进 verify.ps1 的闸门**。

口径与 QA 用的 `tmp\qa-tail.py` 是同一套：把两张相邻帧都当 RGB，算逐通道
绝对差的平均值（0~255 尺度），可以用 `--region` 裁出中心区域。跨段边界的
那一对不计入任何一段——和 qa-tail 的 `--from/--to` 口径一致。测量算法本身
和 qa-tail 逐位对过（0.1498 / 0.0000 / region 版三组一致），别改。

判据（v2，2026-11-15 按 review-audit 的六类漏判 + 终审修正）：

  1) 覆盖率 —— 给了 `--segments` 就把目录里没被任何段覆盖的帧号算出来，默认 ERROR
     （旧版只看被声明的段，漏掉整段也能绿）。确认是有意只看一部分，加 `--allow-partial`
     降成 WARN，结果行会写明只覆盖了多少帧。
  2) 段内帧数 —— 按模式分档：显式 `--segments` 声明了却只有 1 帧（段边界给错）、或声明的
     区间里有帧号不在目录里（没渲全）→ ERROR，并点名缺哪些帧号；没给段表的用法（静帧目录、
     `--seg-frames` 切出来的余帧）只有 1 帧时只 WARN——那是采样点太少，不是画面坏了。
     段内恰好 2 帧（=1 个帧对）时按这一对判：diff < `--identical` → ERROR「这两帧完全一样」。
     旧版这两种情况一行结论都不打，等于放绿。
  3) 尾段比值 —— 尾段 median ÷ 运动段 median < `--tail-ratio`（默认 0.3）→ ERROR。
     这是最原始的判据，也是唯一"能算就必须算"的判据。
  4) 比值算不出来（运动段 median ≈ 0）—— 只有"且尾段 median < `--identical`"才 ERROR：
     比值算不出来本身不是问题，「比值算不出来 + 尾段确实几乎没动」才是死画面。
     旧版对这种情况打印 n/a 就放绿，90 帧里 88 对相同、只有一对跳变的序列能骗到 exit 0。
  5) 主序列判定（不是白名单）—— 目录里可能混着别的图。按 (命名模式, 像素尺寸) 分组，
     文件最多的那组当主序列；落选的文件 ERROR 点名（名字里带数字的更危险：它本来可能是
     帧，被静默丢掉以后剩下的帧拼成假序列、比值反而更好看）。名字里不带数字的（preview.png
     这种）当"不是帧"WARN 忽略。**不按扩展名/命名白名单过滤**：别的渲染器叫 shot_001.png
     也照收，只是要求它自成多数派。
  5b) 多前缀静帧目录 —— 没给 `--segments` 时，若目录里有多组「同尺寸、各带编号」的文件，
     且每组都是稀疏采样点（没有连续帧段）、各组帧号集合要么相同要么互不相交，就把它们
     当同一批静帧**合并**（`stills.ps1 -Prefix card` 分场景截帧必然长这样），并打印合并信息。
     帧号集合部分重叠（一段序列混进另一段的截断版本，谁是谁说不清）、或出现连续帧段
     （那是序列帧目录，多个前缀就是混进了别的序列）→ 仍按 5) 的主序列判定报 ERROR。
  6) 参数与目录卫生 —— `--region` 四个数都必须是整数、x0<x1、y0<y1、且落在图像范围内，
     否则 exit 2 打中文（2 = 参数错，和"闸门红"的 exit 1 区分，不补黑不猜）。
     缺 Pillow / 缺 numpy 也是中文 + exit 2，不再是裸 traceback。

  信息行（不参与判定）：每段的「静止帧对 N/M」只打印出来给人看——真实素材上片尾定版、
  极缓推镜、交叉淡化都会让 diff 常年落在 0.06~0.12，拿占比当 ERROR 会误报到没人敢开这工具。

三条前提（工具比你想的窄，别拿它当万能的）：

  a) 只盯**段尾**死没死。「前段静止、后段才动」不会被判（判据只看尾段 ÷ 运动段）；
     运动段本身几乎不动时比值天然 ≈1，那种情况看「静止帧对 N/M」那行信息。
  b) 没给 `--segments` 时会合并多前缀静帧目录（见判据 5b）。给了 `--segments` 就是序列帧
     口径：一个目录只许一条主序列，混进来的带编号文件一律 ERROR。
  c) `--seg-frames` 按整数倍切段；帧数不是整数倍时，最后剩的 1 帧凑不出帧对，只 WARN、
     不参与判定（不会凭空造出一个「只有 1 帧的段」）。

参数要点：
  `--region` 是四段整数，负数坐标（图像边缘外扩这类）必须写成 `--region=-1,0,10,10`：
  不加 `=` 时 argparse 会把 `-1,0,10,10` 当选项名吃掉，报「expected one argument」。
  `--identical` 必须 >0、`--tail-ratio` 必须 0<r≤1、`--tail-frac` 必须 0<f<1、`--fps` >0、
  `--seg-frames` ≥0，越界直接 exit 2（否则一条参数就能把全部判据关掉）。

用法：
    # 样板间（EffectsLab 八段，每段 90 帧）：量第 7、8 段的段尾
    python scripts-win/check_motion.py template/out/fix-tail --segments "Lottie=540-629,Morph=630-719" --region 700,280,1220,800

    # 只关心这两段、其余帧确实不想量：显式放行（结果行会写明覆盖了多少帧）
    python scripts-win/check_motion.py template/out/fix-tail --segments "Lottie=540-629" --allow-partial

    # 不知道段边界就按每 90 帧切
    python scripts-win/check_motion.py template/out/fix-tail --seg-frames 90

    # 一般项目的静帧目录（整段当一个区间）
    python scripts-win/check_motion.py out/stills --tail-ratio 0.3

退出码：0 无 ERROR（可以带 WARN / SKIP），1 有 ERROR，2 参数或环境错。
"""

from __future__ import annotations

import argparse
import math
import re
import sys
from pathlib import Path

try:
    from PIL import Image
except ImportError:  # pragma: no cover - 环境问题，统一走 exit 2（D-1）
    Image = None  # type: ignore[assignment]

try:
    import numpy as np
except ImportError:  # pragma: no cover
    np = None

if sys.platform == "win32":
    for _s in (sys.stdout, sys.stderr):
        try:
            _s.reconfigure(encoding="utf-8")
        except Exception:  # noqa: BLE001
            pass

# 认哪些扩展名当"图"。注意这不是帧名白名单：帧名由主序列判定（见 docstring 第 5 条），
# 只要同一组里名字编号规律一致，frame_0000.png / element-540.png / shot_001.png 都收。
IMG_EXTS = {".png", ".jpg", ".jpeg", ".webp", ".bmp"}


def die(msg: str) -> "None":
    """参数/环境错：exit 2（和"有 ERROR 的 exit 1"分开，别让调用方以为画面有问题）。"""
    print(f"[参数错误] {msg}", file=sys.stderr)
    raise SystemExit(2)


def name_key(p: Path) -> str:
    """命名模式：把名字里的数字换成 #。element-540.png → element-#.png。"""
    return re.sub(r"\d+", "#", p.name)


def last_number(p: Path) -> "int | None":
    nums = re.findall(r"\d+", p.stem)
    return int(nums[-1]) if nums else None


def squeeze(nums: list[int], limit: int = 8) -> str:
    """[540,541,542,545] → "540-542,545"；区间太多就截断，免得一行几千字。"""
    spans: list[list[int]] = []
    for n in sorted(nums):
        if spans and n == spans[-1][1] + 1:
            spans[-1][1] = n
        else:
            spans.append([n, n])
    txt = ", ".join(f"{a}" if a == b else f"{a}-{b}" for a, b in spans[:limit])
    if len(spans) > limit:
        txt += f" 等 {len(spans)} 段"
    return txt


def prefix_label(key: str) -> str:
    """name_key（card#.png）→ 前缀（card），只用于合并信息那行人话。"""
    return re.sub(r"#.*$", "", key) or key


def missing_spans(lo: int, hi: int, present: "list[int]", limit: int = 8) -> "tuple[int, str]":
    """[lo,hi] 里不在 present 的帧号，按区间返回（total, "540-999999" 这种文本）。

    present 必须是升序去重后的帧号。**只造区间、不逐号展开**：`--segments "A=540-999999"`
    这种声明跨度上百万，`set(range(...))` 要展开一百万个整数（实测 9.6 秒、几百 MB）。
    """
    spans: "list[list[int]]" = []
    cur = lo
    for n in present:
        if n < lo:
            continue
        if n > hi:
            break
        if n > cur:
            spans.append([cur, n - 1])
        if n + 1 > cur:
            cur = n + 1
    if cur <= hi:
        spans.append([cur, hi])
    total = sum(b - a + 1 for a, b in spans)
    txt = ", ".join(f"{a}" if a == b else f"{a}-{b}" for a, b in spans[:limit])
    if len(spans) > limit:
        txt += f" 等 {len(spans)} 段"
    return total, txt


def parse_region(spec: str, w: int, h: int) -> "tuple[int, int, int, int] | None":
    """--region x0,y0,x1,y1：四个整数、x0<x1、y0<y1、全在图像内，否则 exit 2。"""
    if not spec:
        return None
    parts = [s.strip() for s in spec.split(",")]
    if len(parts) != 4:
        die(f"--region 要四个数：x0,y0,x1,y1（现在是 {spec!r}）")
    try:
        x0, y0, x1, y1 = (int(s) for s in parts)
    except ValueError:
        die(f"--region 四个数都得是整数（现在是 {spec!r}）")
    if not (x0 < x1 and y0 < y1):
        die(f"--region 要 x0<x1 且 y0<y1（现在是 {x0},{y0},{x1},{y1}；注意顺序是 左,上,右,下）")
    if x0 < 0 or y0 < 0 or x1 > w or y1 > h:
        die(f"--region {x0},{y0},{x1},{y1} 超出图像范围 {w}x{h}（越界不补黑，直接说清楚）")
    return (x0, y0, x1, y1)


def parse_segments(spec: str) -> "list[tuple[str, int, int]]":
    """--segments "名字=起-止,名字=起-止"；语法不对 exit 2。"""
    out: list[tuple[str, int, int]] = []
    for item in spec.split(","):
        item = item.strip()
        if not item:
            continue
        name, _, rng = item.partition("=")
        if not rng:
            rng, name = name, ""
        a, sep, b = rng.partition("-")
        try:
            start, end = int(a), int(b)
        except ValueError:
            die(f"--segments 里 {item!r} 看不懂，要写成 名字=起-止（帧号含两端），如 Lottie=540-629")
        if not sep or start > end:
            die(f"--segments 里 {item!r} 的区间要写成 起-止 且起≤止")
        out.append((name.strip() or f"{start}-{end}", start, end))
    if not out:
        die("--segments 没解析出任何段")
    return out


def collect_frames(
    root: Path,
    errors: list[str],
    warns: list[str],
    notes: list[str],
    merge_prefixes: bool,
) -> "list[tuple[int, Path]]":
    """按 (命名模式, 尺寸) 分组 → 最多的那组当主序列 → 其余点名。返回主序列 [(帧号, 路径)]。

    `merge_prefixes`（没给 --segments 时）：多前缀的静帧目录按判据 5b 合并成一批，返回全部帧。
    """
    groups: dict[tuple[str, tuple[int, int]], list[tuple[int | None, Path]]] = {}
    for p in sorted(root.iterdir()):
        if not p.is_file() or p.suffix.lower() not in IMG_EXTS:
            continue
        try:
            with Image.open(p) as im:
                size = im.size
        except Exception as exc:  # noqa: BLE001
            errors.append(f"打不开 {p.name}：{exc}（已跳过）")
            continue
        groups.setdefault((name_key(p), size), []).append((last_number(p), p))

    if not groups:
        print(f"[ERROR] {root} 里没有任何图片（支持 {', '.join(sorted(IMG_EXTS))}）", file=sys.stderr)
        raise SystemExit(1)

    # 主序列只从"有帧号"的组里选：整目录都是 preview.png 这种名字，说明不是帧序列
    numbered = {k: v for k, v in groups.items() if all(n is not None for n, _ in v)}
    if not numbered:
        names = ", ".join(sorted(p.name for v in groups.values() for _, p in v)[:6])
        print(f"[ERROR] {root} 里有 {sum(len(v) for v in groups.values())} 张图，但没有一组名字带序号（{names}）", file=sys.stderr)
        print("结果：1 ERROR / 0 WARN", file=sys.stderr)
        raise SystemExit(1)

    # 判据 5b：多前缀静帧目录合并（只在不给 --segments 时）。四条同时满足才合并：
    #   ① 只有一种像素尺寸（尺寸不同就是两份素材，谁是谁说不清）；
    #   ② 每组都是稀疏采样点——组内没有连续帧号。有连续帧段说明这是序列帧目录，
    #      多出来的前缀是另一条序列，混在一起量没意义（X6 的回归用例 two-groups 就是这种）；
    #   ③ 各组帧号集合要么完全相同（同一次截帧、不同场景前缀）、要么互不相交；
    #      部分重叠 = 一段序列的截断版本混进来，算不清哪个是真帧 → 不合并，交给严格判定报 ERROR；
    #   ④ 至少两组（单前缀本来就不需要合并）。
    merged: "list[tuple[int, Path]] | None" = None
    if merge_prefixes and len(numbered) > 1:
        chains = {key: sorted({n for n, _ in files}) for (key, _), files in numbered.items()}
        same_size = len({size for _, size in numbered}) == 1
        sampled = all(
            not any(b - a == 1 for a, b in zip(ns, ns[1:])) for ns in chains.values()
        )
        keys = list(chains)
        ambiguous = any(
            not (set(chains[keys[i]]) == set(chains[keys[j]]) or set(chains[keys[i]]).isdisjoint(set(chains[keys[j]])))
            for i in range(len(keys))
            for j in range(i + 1, len(keys))
        )
        if same_size and sampled and not ambiguous:
            merged = sorted(
                ((n, p) for files in numbered.values() for n, p in files),  # type: ignore[misc]
                key=lambda t: (t[0], t[1].name),
            )
            parts = " + ".join(
                f"{prefix_label(k)} {len(v)}"
                for (k, _size), v in sorted(numbered.items(), key=lambda kv: (-len(kv[1]), kv[0][0]))
            )
            notes.append(
                f"按 {len(numbered)} 个前缀合并成 {len(merged)} 帧（{parts}）"
                f"—— 静帧目录每次只截几个时间点、前缀是场景名，帧对只在同一前缀内按帧号相邻算",
            )
        elif same_size and not sampled:
            notes.append(
                "没合并多个前缀：目录里有连续帧段（看着是序列帧目录），仍按单条主序列判定，"
                "多出来的带编号文件算 ERROR —— 分场景截的静帧请用稀疏的 35%/85% 采样点",
            )

    def rank(item):
        (key, size), files = item
        return (-len(files), key, -size[0] * size[1])

    if merged is not None:
        frames = merged
        # 合并时非编号组（preview.png 这种）照样只 WARN 忽略
        for (key, size), files in sorted(groups.items()):
            if all(n is not None for n, _ in files):
                continue
            names = ", ".join(f"{p.name}({size[0]}x{size[1]})" for _, p in files[:4])
            more = f" 等 {len(files)} 个" if len(files) > 4 else ""
            warns.append(f"忽略 {len(files)} 个不是帧的文件（{names}{more}）")
        return frames

    main_key, main_files = sorted(numbered.items(), key=rank)[0]
    frames = sorted(((n, p) for n, p in main_files), key=lambda t: (t[0], t[1].name))  # type: ignore[arg-type]

    # 落选组：名字里带数字的当"可能是帧"ERROR（静默丢掉会让比值虚高），不带的当杂图 WARN
    for (key, size), files in sorted(groups.items()):
        if (key, size) == main_key:
            continue
        names = ", ".join(f"{p.name}({size[0]}x{size[1]})" for _, p in files[:4])
        more = f" 等 {len(files)} 个" if len(files) > 4 else ""
        if any(n is not None for n, _ in files):
            reason = (
                "尺寸和主序列不一样" if key == main_key[0] else "名字也像帧，但编号体系不属于主序列"
            )
            errors.append(
                f"目录里混了别的帧：主序列是 {main_key[0]}（{frames[0][0]}..{frames[-1][0]}，{len(frames)} 帧，"
                f"{main_key[1][0]}x{main_key[1][1]}），另有 {len(files)} 个文件不属于它（{names}{more}）"
                f"——{reason}，被静默丢掉以后剩下的帧会拼成假序列，比值反而更好看",
            )
        else:
            warns.append(f"忽略 {len(files)} 个不是帧的文件（{names}{more}）")
    return frames


def main() -> int:
    ap = argparse.ArgumentParser(
        description="段尾静止体检（相邻帧平均像素差；尾段/运动段中位数比 + 段覆盖率 + 主序列判定）",
    )
    ap.add_argument("root", help="帧序列目录（out/fix-tail 这类）或静帧目录（out/stills）")
    ap.add_argument("--segments", default="", help='显式段表，如 "Lottie=540-629,Morph=630-719"（帧号含两端）')
    ap.add_argument("--seg-frames", type=int, default=0,
                    help="不给 --segments 时按每段多少帧均分（如 90）；帧数不是整数倍时，最后剩的那 1 帧不切段、只 WARN")
    ap.add_argument("--region", default="",
                    help="只量这块区域：x0,y0,x1,y1（左、上、右、下，和 qa-tail 一致）；负数坐标要写成 --region=-1,0,10,10")
    ap.add_argument("--fps", type=float, default=30.0, help="只用于把帧号换算成秒打印（默认 30）")
    ap.add_argument("--tail-frac", type=float, default=0.5, help="每段后百分之多少算尾段（默认 0.5 = 后半段）")
    ap.add_argument("--tail-ratio", type=float, default=0.3, help="尾段/运动段 median 比低于此值判 ERROR（默认 0.3）")
    ap.add_argument("--identical", type=float, default=0.05, help="相邻帧差值低于此值算「几乎没动」（默认 0.05）")
    ap.add_argument("--allow-partial", action="store_true", help="只声明了部分段时放行（未被覆盖的帧降成 WARN，不判 ERROR）")
    args = ap.parse_args()

    if Image is None:
        die("缺少 Pillow，读不了帧：pip install pillow")
    if np is None:
        die("缺少 numpy，无法比较像素：pip install numpy")

    # S-1：阈值参数必须落在能判定的区间里。否则一条参数就能把全部判据关掉——
    # `--identical 0` 让 90 帧全同判 0 ERROR，`--tail-ratio nan` 让比值 0.000 也放绿
    # （nan 参与的比较恒为假）。这类是「用错工具」不是「画面有问题」，统一 exit 2。
    if not math.isfinite(args.identical) or args.identical <= 0:
        die(f"--identical 必须是大于 0 的有限数（现在 {args.identical:g}）：设成 0 等于把「几乎没动」这条判据关掉")
    if not math.isfinite(args.tail_ratio) or not (0 < args.tail_ratio <= 1):
        die(f"--tail-ratio 必须满足 0 < r ≤ 1（现在 {args.tail_ratio:g}）：nan / 0 / 负数 / >1 都会让比值判据失效")
    if not math.isfinite(args.tail_frac) or not (0 < args.tail_frac < 1):
        die(f"--tail-frac 必须满足 0 < f < 1（现在 {args.tail_frac:g}）：0 会让尾段为空、1 会把运动段砍没")
    if not math.isfinite(args.fps) or args.fps <= 0:
        die(f"--fps 必须大于 0（现在 {args.fps:g}）：它只影响帧号换算成秒的打印")
    if args.seg_frames < 0:
        die(f"--seg-frames 不能是负数（现在 {args.seg_frames}）：不切段就别传，要切就传 ≥2 的帧数")

    root = Path(args.root)
    if not root.is_dir():
        die(f"目录不存在：{root}")

    errors: list[str] = []
    warns: list[str] = []
    skips: list[str] = []
    notes: list[str] = []

    frames = collect_frames(root, errors, warns, notes, merge_prefixes=not args.segments)
    nums = [n for n, _ in frames]
    W, H = 0, 0
    with Image.open(frames[0][1]) as im:
        W, H = im.size

    # 帧号重复只在「同一前缀」里算：合并模式下 card0035 / intro0035 是同一时间点的两个场景，
    # 本来就该同时在（判据 5b），不算冲突；同一前缀下出现两张同号图才是排序不确定。
    dup: list[int] = []
    seen: set[tuple[str, int]] = set()
    for n, p in frames:
        k = (name_key(p), n)
        if k in seen:
            dup.append(n)
        seen.add(k)
    if dup:
        errors.append(f"帧号重复：{squeeze(sorted(set(dup)))}（同一前缀下同一帧号有多张图，排序结果不确定）")
        counts: dict[tuple[str, int], int] = {}
        for n, p in frames:
            k = (name_key(p), n)
            counts[k] = counts.get(k, 0) + 1
        frames = [(n, p) for n, p in frames if counts[(name_key(p), n)] == 1]
        nums = [n for n, _ in frames]

    box = parse_region(args.region, W, H)

    # ---- 段表 -----------------------------------------------------------------------
    if args.segments:
        segments = parse_segments(args.segments)
        explicit = True
    elif args.seg_frames > 0:
        segments = []
        start = prev = nums[0]
        count = 1
        for n in nums[1:]:
            if n - prev > 1 or count >= args.seg_frames:
                segments.append((f"第{len(segments) + 1}段 {start}-{prev}", start, prev))
                start = n
                count = 0
            prev = n
            count += 1
        # FP-1：尾段至少要有 2 帧才成段。帧数不是 --seg-frames 的整数倍时（91 帧 ÷ 90），
        # 无条件 append 会造出一个「只有 1 帧的段」，再被段内帧数判据打成 ERROR ——
        # 余数不是画面问题，这里只 WARN，不参与判定。
        if prev > start:
            segments.append((f"第{len(segments) + 1}段 {start}-{prev}", start, prev))
        else:
            warns.append(
                f"最后 1 帧（帧号 {start}）凑不出帧对，未参与判定——"
                f"{len(nums)} 帧不是 --seg-frames {args.seg_frames} 的整数倍，余数不切段",
            )
        explicit = False
    else:
        segments = [("全部", nums[0], nums[-1])]
        explicit = False

    # ---- 覆盖率（X1）：--segments 只声明一部分时，剩下的帧根本没被检查 -----------------
    # S-2：按区间判断，不把 [start,end] 展开成 set —— `A=540-999999` 展开一百万个整数
    # 要 9.6 秒、几百 MB，而目录里一共也就几百帧。段数很少，逐个比区间足够快。
    def covered(n: int) -> bool:
        return any(s <= n <= e for _, s, e in segments)

    uncovered = [n for n in nums if not covered(n)]
    if uncovered and explicit:
        msg = f"覆盖面：目录里 {len(uncovered)} 帧没被任何段覆盖（{squeeze(uncovered)}）——这些帧完全没被检查"
        if args.allow_partial:
            warns.append(msg + "（--allow-partial 已放行）")
        else:
            errors.append(msg + "；确认只看这几段就加 --allow-partial")

    print(f"{root}：{len(frames)} 帧（{nums[0]}..{nums[-1]}，{args.fps:g}fps ≈ {nums[0] / args.fps:.2f}s..{nums[-1] / args.fps:.2f}s）")
    covered_n = len(nums) - len(uncovered)
    print(f"覆盖：{covered_n}/{len(frames)} 帧，{len(segments)} 段" + (f"（未覆盖 {len(uncovered)} 帧）" if uncovered else "（全覆盖）"))
    print(f"区域：{args.region or '全帧'}；尾段定义：每段后 {args.tail_frac:.0%}；阈值：比值 < {args.tail_ratio:g} ERROR，diff < {args.identical:g} 算「几乎没动」")
    gaps = []
    for _k in sorted({name_key(p) for _, p in frames}):
        kn = [n for n, p in frames if name_key(p) == _k]
        gaps += [b - a for a, b in zip(kn, kn[1:]) if b - a > 1]
    print(f"帧号连续性：最大间隔 {max(gaps) if gaps else 1}（1 = 连续；>1 说明中间缺帧，缺帧处不产生帧对）")
    print()

    # 一次只留前一帧：720 帧 1080p 全读进内存要 8GB+
    # 帧对只在同一前缀内部算（判据 5b）：合并模式下 card / intro 是两个场景，
    # 跨前缀相减得到的是「两个场景画得差多少」，不是时间上的运动，会把比值稀释成噪音。
    # 每个前缀只留一张前一帧，前缀数很少（≤4），内存和改前一个量级。
    diffs: list[tuple[int, int, float]] = []
    prevs: "dict[str, object]" = {}
    prev_ns: dict[str, int] = {}
    shape_bad = 0
    for n, p in frames:
        key = name_key(p)
        try:
            with Image.open(p) as im:
                im = im.convert("RGB")
                if box:
                    im = im.crop(box)
                cur = np.asarray(im, dtype=np.int16)
        except Exception as exc:  # noqa: BLE001
            errors.append(f"读不了 {p.name}：{exc}（已跳过）")
            prevs.pop(key, None)
            prev_ns.pop(key, None)
            continue
        prev = prevs.get(key)
        if prev is not None:
            if cur.shape != prev.shape:  # type: ignore[attr-defined]
                shape_bad += 1
            else:
                diffs.append((prev_ns[key], n, float(np.abs(cur - prev).mean())))  # type: ignore[operator]
        prevs[key] = cur
        prev_ns[key] = n
    if shape_bad:
        errors.append(f"{shape_bad} 个帧对的像素尺寸和前一帧不同，没法相减（已跳过）")

    # ---- 逐段 -----------------------------------------------------------------------
    for msg in notes:
        print(f"[信息] {msg}")
    if notes:
        print()
    print(f"{'段':<22}{'运动段':>28}{'尾段':>30}{'比值':>10}")
    for name, start, end in segments:
        seg_ns = [n for n in nums if start <= n <= end]
        if explicit:
            # S-2：区间运算，不 set(range(start, end+1))——声明跨度上百万帧时会展开一百万个整数
            miss_n, miss_txt = missing_spans(start, end, seg_ns)
            if miss_n:
                errors.append(
                    f"{name}：声明的 {start}-{end} 里有 {miss_n} 帧不在目录里（{miss_txt}）"
                    f"——没渲全，段尾根本没被量到",
                )
        if len(seg_ns) < 2:
            print(f"{name:<22}{'无帧对':>28}{'无帧对':>30}{'—':>10}")
            if explicit:
                errors.append(
                    f"{name}：段内 {start}-{end} 只有 {len(seg_ns)} 帧，凑不出相邻帧对（目录实际帧号 {nums[0]}..{nums[-1]}）"
                    f"——段边界给错了，或者这段根本没渲",
                )
            else:
                # U-1 的另一半：静帧目录每个场景一般截 2 张，只有 1 张不是画面坏了，
                # 是没截够；WARN 提示补一张，别把整份静帧审查判红。
                warns.append(
                    f"{name}：段内 {start}-{end} 只有 {len(seg_ns)} 帧，凑不出帧对，跳过——"
                    f"静帧目录每个场景至少截两张（35% / 85%）才能比出「有没有动」",
                )
            continue

        span = end - start + 1
        tail_start = start + max(1, round(span * (1 - args.tail_frac)))
        # 只认段内的帧对（a、b 都落在 [start, end]）：段边界那一对是两个镜头之间的切换，
        # 算进来会把比值抬好看。和 qa-tail 的 --from/--to 口径一致。
        pairs = [(a, b, d) for a, b, d in diffs if a >= start and b <= end]
        mine = [(a, b, d) for a, b, d in pairs if b < tail_start]
        tail = [(a, b, d) for a, b, d in pairs if a >= tail_start]

        def stat(pp):
            if not pp:
                return None
            arr = np.array([d for _, _, d in pp])
            return float(np.median(arr)), float(arr.min()), float(arr.max())

        ms = stat(mine)
        ts = stat(tail)
        m_txt = f"{len(mine):>3} 对 median {ms[0]:.4f} min {ms[1]:.4f}" if ms else "无帧对"
        t_txt = f"{len(tail):>3} 对 median {ts[0]:.4f} min {ts[1]:.4f}" if ts else "无帧对"
        ratio = None
        if ms and ts and ms[0] > 1e-9:
            ratio = ts[0] / ms[0]
            r_txt = f"{ratio:.3f}"
        elif ts and ms:
            r_txt = "n/a"
        else:
            r_txt = "—"
        print(f"{name:<22}{m_txt:>28}{t_txt:>30}{r_txt:>10}")

        static_pairs = [1 for _, _, d in pairs if d < args.identical]
        if pairs:
            print(f"    静止帧对（信息，不判定）：{len(static_pairs)}/{len(pairs)}（{len(static_pairs) / len(pairs):.0%}）")

        # U-1：整段只有一对帧时没有 median 可用，那就按这一对判。静帧目录常见每场景 2 张，
        # 「两张完全一样」和「90 帧全同」是同一件事（整段没动），该报还得报；动了就只 WARN。
        if len(pairs) == 1:
            a, b, d = pairs[0]
            if d < args.identical:
                errors.append(
                    f"{name}：段内只有一对帧 {a}→{b}，diff {d:.4f} < {args.identical:g} —— "
                    f"这两帧完全一样，等同于整段没动",
                )
            else:
                warns.append(
                    f"{name}：段内只有一对帧 {a}→{b}（diff {d:.4f} ≥ {args.identical:g}），按这一对判，没做 median",
                )
        # (3)(4) 尾段比值；比值算不出来时，只有在"尾段确实几乎没动"时才判死画面
        elif ts and ms:
            if ratio is not None:
                if ratio < args.tail_ratio:
                    errors.append(
                        f"{name}：尾段 {tail_start}-{end} median {ts[0]:.4f} ÷ 运动段 {start}-{tail_start - 1} median {ms[0]:.4f} "
                        f"= {ratio:.3f} < {args.tail_ratio:g} —— 段尾基本静止（约 {(end - tail_start + 1) / args.fps:.2f} 秒）",
                    )
            elif ts[0] < args.identical:
                errors.append(
                    f"{name}：比值算不出来（运动段 {start}-{tail_start - 1} median {ms[0]:.4f} ≈ 0），"
                    f"而且尾段 {tail_start}-{end} median {ts[0]:.4f} < {args.identical:g} —— 这不是「没有尾段」，是整段都没动",
                )
        elif tail and not mine:
            # U-2：真原因是「帧号稀疏，前半个段一对帧都没有」，不是「段太短」——别让人去改段长
            pg = max(b - a for a, b, _ in pairs)
            skips.append(
                f"{name}：段 {start}-{end} 的运动段 {start}-{tail_start - 1} 里没有帧对"
                f"（帧号太稀疏，段内最大间隔 {pg} 帧），只量到尾段 {tail_start}-{end}，比值跳过",
            )
        elif ms and not tail:
            pg = max(b - a for a, b, _ in pairs)
            skips.append(
                f"{name}：段 {start}-{end} 的尾段 {tail_start}-{end} 里没有帧对"
                f"（帧号太稀疏，段内最大间隔 {pg} 帧），只量了运动段，比值跳过",
            )
        elif pairs:
            # 帧对横跨尾段边界（稀疏采样时 tail_start 常落在两帧中间）：分不进两段，
            # 就退回整段 median——整段都没动仍然判 RED，动了就 SKIP 说明原因。
            med_all = float(np.median(np.array([d for _, _, d in pairs])))
            if med_all < args.identical:
                errors.append(
                    f"{name}：段 {start}-{end} 的帧对都跨在尾段边界 {tail_start} 上，分不进两段，"
                    f"但整段 {len(pairs)} 对 median {med_all:.4f} < {args.identical:g} —— 整段都没动",
                )
            else:
                skips.append(
                    f"{name}：段 {start}-{end} 的帧对都跨在尾段边界 {tail_start} 上，分不进运动段/尾段，"
                    f"比值跳过（整段 median {med_all:.4f}）",
                )

        # 逐对 WARN：正常情况就几条，多了折叠，免得 90 行噪音盖住 ERROR。
        # 段内只有一对时上面已经单独判过（U-1），这里不再重复报同一条。
        quiet = [] if len(pairs) == 1 else [(a, b, d) for a, b, d in pairs if d < args.identical]
        if len(quiet) <= 12:
            for a, b, d in quiet:
                warns.append(f"{name}：帧 {a} → {b} 几乎没动（diff {d:.4f} < {args.identical:g}）")
        else:
            warns.append(
                f"{name}：共 {len(quiet)} 对几乎没动（帧号 {squeeze([a for a, _, _ in quiet])}），逐条省略",
            )

    print()
    for msg in errors:
        print(f"[ERROR] {msg}")
    for msg in warns:
        print(f"[WARN] {msg}")
    for msg in skips:
        print(f"[SKIP] {msg}")
    extra = f" / {len(skips)} SKIP" if skips else ""
    print(f"结果：{len(errors)} ERROR / {len(warns)} WARN{extra}")
    if skips and not errors:
        print("提示：有判定被跳过（SKIP），不算通过——把段边界给准、让每段有足够的帧对（稀疏截帧只够当采样点），或换成连续帧序列。")
    if errors:
        print("提示：段尾静止多半是素材关键帧没铺满段长（Lottie 改 op / 末个关键帧），或 morph 的 fromAt+duration 提前结束——见 AGENTS.md「Lottie 素材的动画必须铺满整段」。")
    return 1 if errors else 0


if __name__ == "__main__":
    raise SystemExit(main())
