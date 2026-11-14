#!/usr/bin/env python
r"""段尾静止体检：一段动画是不是"前半段在动、后半段定死"。

为什么要这一步：2026-11-14 QA 实测到第 7 段（Lottie）和第 8 段（morph）各有
45 帧（1.5 秒）完全静止——素材 JSON 的末个关键帧只到第 66 帧、而段长 90 帧；
morph 的 fromAt + duration 让变形在段中段就结束。画面没报错、没黑屏、成片
照样出得来，只是那 1.5 秒观众看到的是死画面。`check_stills.py` 每场景只比
35% / 85% 两帧，恰好都落在动的地方，抓不到这种"尾段静止"；`check_video.py`
只看容器。所以单开这一个旁路工具，审图时顺手跑。

口径与 QA 用的 `tmp\qa-tail.py` 是同一套（注释见下）：把两张相邻 PNG 都当
RGB，算逐通道绝对差的平均值（0~255 尺度），可以用 `--region` 裁出中心区域。
跨段边界的那一对不计入任何一段——和 qa-tail 的 `--from/--to` 口径一致。

用法：
    # 样板间（EffectsLab 八段，每段 90 帧）：量第 7、8 段的段尾
    python scripts-win/check_motion.py template/out/fix-tail --segments "Lottie=540-629,Morph=630-719" --region 700,280,1220,800

    # 不知道段边界就按每 90 帧切
    python scripts-win/check_motion.py template/out/fix-tail --seg-frames 90

    # 一般项目的静帧目录（整段当一个区间）
    python scripts-win/check_motion.py out/stills --tail-ratio 0.3

输出：每段「运动段 median/min、尾段 median/min、尾/运动 median 比」，
比值 < --tail-ratio（默认 0.3）判 ERROR；单对相邻帧 diff < --identical
（默认 0.05）判 WARN 并点出帧号；整段所有帧对都低于 --identical 判
ERROR（那就是根本没动）。退出码：有 ERROR 为 1，否则 0。
"""

from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path

from PIL import Image

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

EXTS = {".png", ".jpg", ".jpeg", ".webp", ".bmp"}


def frame_no(p: Path) -> int:
    """从文件名里取帧号（element-540.png / 0000.png / frame_0000.png 都吃）。"""
    nums = re.findall(r"\d+", p.stem)
    return int(nums[-1]) if nums else 10**9


def load_frame(p: Path, box: tuple[int, int, int, int] | None, size: tuple[int, int] | None):
    """读一帧 → 裁区域 → int16 数组。尺寸不一致时按第一张对齐（混了不同 scale 的帧）。"""
    im = Image.open(p).convert("RGB")
    if size and im.size != size:
        im = im.resize(size, Image.LANCZOS)
    if box:
        im = im.crop(box)
    return np.asarray(im, dtype=np.int16)


def parse_segments(spec: str, frames: list[int], seg_frames: int) -> list[tuple[str, int, int]]:
    """返回 [(名字, 起帧, 止帧), ...]。三种来源：--segments 显式给、--seg-frames 均分、整段一个。"""
    if spec:
        out = []
        for item in spec.split(","):
            item = item.strip()
            if not item:
                continue
            name, _, rng = item.partition("=")
            if not rng:
                rng, name = name, ""
            a, _, b = rng.partition("-")
            start, end = int(a), int(b)
            out.append((name.strip() or f"{start}-{end}", start, end))
        return out

    if seg_frames > 0:
        # 按帧号连续性 + 每段帧数切：中间缺帧就当新段开始，免得把两段接成一长段
        out = []
        start = prev = frames[0]
        count = 1
        for n in frames[1:]:
            if n - prev > 1 or count >= seg_frames:
                out.append((f"第{len(out) + 1}段 {start}-{prev}", start, prev))
                start = n
                count = 0
            prev = n
            count += 1
        out.append((f"第{len(out) + 1}段 {start}-{prev}", start, prev))
        return out

    return [("全部", frames[0], frames[-1])]


def main() -> int:
    ap = argparse.ArgumentParser(
        description="段尾静止体检（相邻帧平均像素差；尾段/运动段中位数比 < 阈值判 ERROR）",
    )
    ap.add_argument("root", help="PNG 序列目录（out/fix-tail 这类）或静帧目录（out/stills）")
    ap.add_argument("--segments", default="", help='显式段表，如 "Lottie=540-629,Morph=630-719"（帧号含两端）')
    ap.add_argument("--seg-frames", type=int, default=0, help="不给 --segments 时按每段多少帧均分（如 90）")
    ap.add_argument("--region", default="", help="只量这块区域：x0,y0,x1,y1（左、上、右、下，和 qa-tail 一致）")
    ap.add_argument("--fps", type=float, default=30.0, help="只用于把帧号换算成秒打印（默认 30）")
    ap.add_argument("--tail-frac", type=float, default=0.5, help="每段后百分之多少算尾段（默认 0.5 = 后半段）")
    ap.add_argument("--tail-ratio", type=float, default=0.3, help="尾段/运动段 median 比低于此值判 ERROR（默认 0.3）")
    ap.add_argument("--identical", type=float, default=0.05, help="相邻帧差值低于此值判 WARN（默认 0.05）")
    args = ap.parse_args()

    if np is None:
        print("[ERROR] 缺少 numpy，无法比较像素：pip install numpy", file=sys.stderr)
        return 2

    root = Path(args.root)
    if not root.is_dir():
        print(f"[ERROR] 目录不存在：{root}", file=sys.stderr)
        return 2

    files = [p for p in root.iterdir() if p.is_file() and p.suffix.lower() in EXTS]
    if not files:
        print(f"[ERROR] {root} 里没有图片（支持 {', '.join(sorted(EXTS))}）", file=sys.stderr)
        return 2
    files.sort(key=lambda p: (frame_no(p), p.name))
    nums = [frame_no(p) for p in files]

    box = None
    if args.region:
        try:
            x0, y0, x1, y1 = (int(v) for v in args.region.split(","))
        except ValueError:
            print("[ERROR] --region 要四个整数：x0,y0,x1,y1", file=sys.stderr)
            return 2
        box = (x0, y0, x1, y1)

    segments = parse_segments(args.segments, nums, args.seg_frames)

    print(f"{root}：{len(files)} 帧（{nums[0]}..{nums[-1]}，{args.fps:g}fps ≈ {nums[0] / args.fps:.2f}s..{nums[-1] / args.fps:.2f}s）")
    print(f"区域：{args.region or '全帧'}；尾段定义：每段后 {args.tail_frac:.0%}；阈值：比值 < {args.tail_ratio:g} ERROR，diff < {args.identical:g} WARN")
    gaps = [b - a for a, b in zip(nums, nums[1:]) if b - a > 1]
    print(f"帧号连续性：最大间隔 {max(gaps) if gaps else 1}（1 = 连续；>1 说明中间缺帧，缺帧处不产生帧对）")
    print()

    # 一次只留前一帧：180 帧 1080p 全读进来要 2GB+
    diffs: list[tuple[int, int, float]] = []
    prev = None
    prev_n = None
    for p, n in zip(files, nums):
        cur = load_frame(p, box, None)
        if prev is not None:
            diffs.append((prev_n, n, float(np.abs(cur - prev).mean())))
        prev, prev_n = cur, n

    errors: list[str] = []
    warns: list[str] = []
    print(f"{'段':<22}{'运动段':>28}{'尾段':>30}{'比值':>10}")
    for name, start, end in segments:
        span = end - start + 1
        tail_start = start + max(1, round(span * (1 - args.tail_frac)))
        # 只认段内的帧对（a、b 都落在 [start, end]）：段边界那一对是两个镜头之间的切换，
        # 算进来会把比值抬好看。跨界那一对（end-1 → tail_start）也不计入任何一段，
        # 和 qa-tail 的 --from/--to 口径一致。
        allp = [(a, b, d) for a, b, d in diffs if a >= start and b <= end]
        mine = [(a, b, d) for a, b, d in allp if b < tail_start]
        tail = [(a, b, d) for a, b, d in allp if a >= tail_start]

        def stat(pairs):
            if not pairs:
                return None
            arr = np.array([d for _, _, d in pairs])
            return float(np.median(arr)), float(arr.min()), float(arr.max())

        ms = stat(mine)
        ts = stat(tail)
        m_txt = f"{len(mine):>3} 对 median {ms[0]:.4f} min {ms[1]:.4f}" if ms else "无帧对"
        t_txt = f"{len(tail):>3} 对 median {ts[0]:.4f} min {ts[1]:.4f}" if ts else "无帧对"
        if ms and ts and ms[0] > 1e-9:
            ratio = ts[0] / ms[0]
            r_txt = f"{ratio:.3f}"
        elif ts:
            ratio = None
            r_txt = "n/a"
        else:
            ratio = None
            r_txt = "—"
        print(f"{name:<22}{m_txt:>28}{t_txt:>30}{r_txt:>10}")

        # 整段都没动 → ERROR（最典型的"动画没接上"）
        if allp and max(d for _, _, d in allp) < args.identical:
            pairs_txt = "、".join(f"{a}→{b}" for a, b, _ in allp)
            errors.append(f"{name}：整段 {start}-{end} 没有变化（{len(allp)} 对相邻帧 diff 全 < {args.identical:g}：{pairs_txt}）")
        elif ts and ms and ratio is not None and ratio < args.tail_ratio:
            errors.append(
                f"{name}：尾段 {tail_start}-{end} median {ts[0]:.4f} ÷ 运动段 {start}-{tail_start - 1} median {ms[0]:.4f} "
                f"= {ratio:.3f} < {args.tail_ratio:g} —— 段尾基本静止（约 {(end - tail_start + 1) / args.fps:.2f} 秒）",
            )

        if not ts:
            warns.append(f"{name}：尾段没有可比帧对（帧数太少，或 span 太短），这一段只看了运动段")

        for a, b, d in allp:
            if d < args.identical:
                warns.append(f"{name}：帧 {a} → {b} 基本没动（diff {d:.4f} < {args.identical:g}）")

    print()
    for msg in errors:
        print(f"[ERROR] {msg}")
    for msg in warns:
        print(f"[WARN] {msg}")
    print(f"结果：{len(errors)} ERROR / {len(warns)} WARN")
    if errors:
        print("提示：段尾静止多半是素材关键帧没铺满段长（Lottie 改 op / 末个关键帧），或 morph 的 fromAt+duration 提前结束——见 AGENTS.md「Lottie 素材的动画必须铺满整段」。")
    return 1 if errors else 0


if __name__ == "__main__":
    raise SystemExit(main())
