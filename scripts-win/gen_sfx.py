#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""合成三个极短音效：转场 whoosh、落点 click、收尾 riser。

和 gen_music.py 同一个理由：宣传片里可用素材多半有版权，而这三个音效
只需要「一耳朵对」——噪声 + 包络 + 一点扫频就能做出来，且逐字节可复现。

用法：
    python scripts-win/gen_sfx.py --out-dir template/public/sfx
    python scripts-win/gen_sfx.py --kind whoosh --out x.wav     # 只出一个
"""

from __future__ import annotations

import argparse
import sys
import wave
from pathlib import Path

import numpy as np

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

SR = 44100
RNG = np.random.default_rng(11)


def one_pole(x: np.ndarray, a: float) -> np.ndarray:
    """y[n] = (1-a)·x[n] + a·y[n-1]，用 lfilter 的等价写法（numpy 版累加）。"""
    y = np.empty_like(x)
    acc = 0.0
    for i, v in enumerate(x):  # 音频只有几十毫秒，纯循环也够快
        acc = (1 - a) * v + a * acc
        y[i] = acc
    return y


def whoosh() -> np.ndarray:
    """0.55s：噪声从暗到亮再到暗，中间夹一条上扬的窄带。"""
    n = int(0.55 * SR)
    t = np.arange(n) / SR
    env = np.sin(np.pi * t / 0.55) ** 1.6
    noise = RNG.normal(0, 1, n)
    dark = one_pole(noise, 0.985)
    bright = noise - one_pole(noise, 0.55)
    sweep = np.sin(2 * np.pi * (220 + 1600 * (t / 0.55) ** 2) * t) * 0.25
    mix = (0.55 * dark + 0.85 * bright) * env + sweep * env
    return mix / np.max(np.abs(mix)) * 0.85


def click() -> np.ndarray:
    """0.09s：一下闷响 + 极短噪声头，用在字砸到位的瞬间。"""
    n = int(0.09 * SR)
    t = np.arange(n) / SR
    thump = np.sin(2 * np.pi * (150 * np.exp(-t / 0.012) + 62) * t) * np.exp(-t / 0.030)
    tick = RNG.normal(0, 1, n) * np.exp(-t / 0.0016)
    mix = 0.9 * thump + 0.4 * tick
    return mix / np.max(np.abs(mix)) * 0.9


def riser() -> np.ndarray:
    """1.2s：噪声越升越亮 + 正弦扫频上扬，收在网址出现那一刻。"""
    n = int(1.2 * SR)
    t = np.arange(n) / SR
    shape = (t / 1.2) ** 2.2
    noise = RNG.normal(0, 1, n)
    band = noise - one_pole(noise, 0.92)
    lift = np.stack([band * (0.25 + 0.75 * s) for s in np.linspace(0, 1, 4)]).mean(axis=0)
    sweep = np.sin(2 * np.pi * (180 + 900 * (t / 1.2) ** 1.6) * t) * 0.45
    mix = (lift + sweep) * shape
    return mix / np.max(np.abs(mix)) * 0.75


KINDS = {"whoosh": whoosh, "click": click, "riser": riser}


def write_wav(path: Path, data: np.ndarray) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with wave.open(str(path), "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes((np.clip(data, -1, 1) * 32767).astype("<i2").tobytes())


def main() -> int:
    ap = argparse.ArgumentParser(description="合成转场音效")
    ap.add_argument("--out-dir", default="public/sfx", help="输出目录")
    ap.add_argument("--kind", choices=sorted(KINDS), help="只生成某一个")
    args = ap.parse_args()

    out_dir = Path(args.out_dir)
    for name in ([args.kind] if args.kind else list(KINDS)):
        data = KINDS[name]()
        path = out_dir / f"{name}.wav"
        write_wav(path, data)
        peak = 20 * np.log10(max(float(np.max(np.abs(data))), 1e-9))
        print(f"输出：{path}  {path.stat().st_size / 1024:.0f} KB  "
              f"{len(data) / SR:.2f}s  峰值 {peak:.1f} dBFS")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
