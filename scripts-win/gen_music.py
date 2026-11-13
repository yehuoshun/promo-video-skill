#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""合成一条与 timing.json 节拍对齐的占位 BGM（纯 numpy，不联网、不下素材）。

为什么自己合成：宣传片里最容易踩版权的是背景音乐。这条先保证「有拍子、
能对画面、能免费商用」，正式交付再换成买过授权的曲子——换的时候只改
timing.json 的 audio.bgm 和 beats.bpm/offset，画面一行都不用动，
因为画面侧的呼吸、砸字都从 beats 读（src/lib/anim.ts 的 beatAt）。

用法：
    python scripts-win/gen_music.py template/timing.json --out template/public/bgm.wav
    python scripts-win/gen_music.py timing.json --bpm 120 --offset 0.2 --out public/bgm.wav

输出：单声道 44.1kHz 16-bit WAV，长度严格等于 timing.duration。
"""

from __future__ import annotations

import argparse
import json
import math
import sys
import wave
from pathlib import Path

import numpy as np

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

SR = 44100
RNG = np.random.default_rng(7)  # 固定种子：每次生成的 wav 逐字节一致

# A 小调，六个小节：Am Am F F C G（每小节 4 拍）
# pad 用 midi 音高，bass 用低八度根音
BARS: list[tuple[list[int], int]] = [
    ([57, 60, 64], 45),
    ([57, 60, 64], 45),
    ([53, 57, 60], 41),
    ([53, 57, 60], 41),
    ([60, 64, 67], 36),
    ([55, 59, 62], 43),
]

MIDI_A4 = 69.0
MIDI_HZ = 440.0


def hz(midi: int) -> float:
    return MIDI_HZ * 2 ** ((midi - MIDI_A4) / 12)


def fade_edges(x: np.ndarray, sr: int, attack: float, release: float) -> np.ndarray:
    n = len(x)
    a = min(int(attack * sr), n)
    r = min(int(release * sr), n)
    env = np.ones(n)
    if a:
        env[:a] = np.linspace(0.0, 1.0, a) ** 1.5
    if r:
        env[n - r :] = np.minimum(env[n - r :], np.linspace(1.0, 0.0, r) ** 1.2)
    return x * env


def lowpass(x: np.ndarray, win: int) -> np.ndarray:
    """移动平均当一阶低通——够用，且不需要 scipy。"""
    if win <= 1:
        return x
    k = np.ones(win) / win
    return np.convolve(x, k, mode="same")


def kick() -> np.ndarray:
    n = int(0.30 * SR)
    t = np.arange(n) / SR
    f = 118.0 * np.exp(-t / 0.032) + 46.0
    body = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / 0.115)
    click = RNG.normal(0, 1, n) * np.exp(-t / 0.004) * 0.30
    return 0.92 * body + click


def hat(open_: bool = False) -> np.ndarray:
    n = int((0.16 if open_ else 0.05) * SR)
    t = np.arange(n) / SR
    noise = RNG.normal(0, 1, n)
    hp = np.diff(noise, prepend=0.0)  # 一阶高通：把低频底噪去掉，只剩「嘶」
    return 0.5 * hp * np.exp(-t / (0.055 if open_ else 0.014))


def bass(midi: int, dur: float) -> np.ndarray:
    n = int(dur * SR)
    t = np.arange(n) / SR
    f = hz(midi)
    w = np.sin(2 * np.pi * f * t) + 0.32 * np.sin(4 * np.pi * f * t)
    w = np.tanh(1.4 * w)  # 轻微饱和，让它在小音箱上也听得见
    return fade_edges(w, SR, 0.006, min(0.25, dur * 0.5)) * 0.9


def pad(midis: list[int], dur: float) -> np.ndarray:
    n = int(dur * SR)
    t = np.arange(n) / SR
    out = np.zeros(n)
    for m in midis:
        for detune in (-0.004, 0.0, 0.004):  # 三个微走音的声部，制造厚度
            f = hz(m) * (1 + detune)
            out += np.sin(2 * np.pi * f * t + RNG.uniform(0, 2 * np.pi))
    out /= max(1, len(midis) * 3)
    out = lowpass(out, 96)
    return fade_edges(out, SR, 0.45, 0.55)


def pluck(midi: int, dur: float = 0.30) -> np.ndarray:
    n = int(dur * SR)
    t = np.arange(n) / SR
    f = hz(midi)
    w = np.zeros(n)
    for k, amp in ((1, 1.0), (3, 0.22), (5, 0.10)):
        w += amp * np.sin(2 * np.pi * f * k * t)
    return w * np.exp(-t / 0.09) * 0.8


def place(buf: np.ndarray, sig: np.ndarray, at: float, gain: float) -> None:
    """把 sig 叠到 buf 的 at 秒处（超出末尾的部分丢掉）。"""
    i = int(round(at * SR))
    if i >= len(buf) or i < 0:
        return
    n = min(len(sig), len(buf) - i)
    buf[i : i + n] += sig[:n] * gain


def render(duration: float, bpm: float, offset: float) -> np.ndarray:
    n = int(round(duration * SR))
    mix = np.zeros(n)
    beat = 60.0 / bpm
    bar = beat * 4

    # ---- 和声与低频：按小节铺 ----
    # 小节起点 = offset + i*bar，必须落在拍网格上，否则「小节线」和「拍点」错开
    # 0.15s，听感上就是整条音乐一直差半口气。
    for i, (chord, root) in enumerate(BARS):
        t0 = offset + i * bar
        if t0 >= duration:
            break
        dur = min(bar + 0.25, duration - t0)
        place(mix, pad(chord, dur), t0, 0.30)
        if i >= 2:  # 前两小节只有 pad，留白
            for k in range(8):  # 八分音符贝斯
                tt = t0 + k * beat / 2
                if tt >= duration:
                    break
                note = root + (12 if k % 4 == 3 else 0)  # 每小节最后一下跳八度
                place(mix, bass(note, beat * 0.42), tt, 0.34)

    # ---- 鼓：第二小节进 kick，八分音符 hat ----
    k = 0
    while True:
        tt = offset + k * beat
        if tt >= duration:
            break
        bar_index = int(max(0.0, tt - offset) // bar)
        if bar_index >= 1:
            heavy = bar_index != 5  # 最后小节（CTA）收着打
            if heavy or k % 2 == 0:
                place(mix, kick(), tt - 0.004, 0.62 if heavy else 0.34)
        k += 1

    k = 0
    while True:
        tt = offset + (k + 0.5) * beat
        if tt >= duration:
            break
        if int(max(0.0, tt - offset) // bar) >= 1:
            place(mix, hat(open_=k % 4 == 3), tt, 0.16)
        k += 1

    # ---- 拨弦：3~5 小节，十六分音符铺一点亮色 ----
    arp = [0, 7, 12, 16, 12, 7]
    for i in (3, 4, 5):
        t0 = offset + i * bar
        if t0 >= duration:
            break
        chord, _ = BARS[i]
        for j, step in enumerate(arp):
            tt = t0 + j * beat / 4
            if tt >= duration or j % 2 and i == 5:
                continue
            place(mix, pluck(chord[j % len(chord)] + 12), tt, 0.10)

    # ---- 收尾：整体淡入淡出，峰值留 3dB 余量给人声 ----
    mix = fade_edges(mix, SR, 0.12, 0.8)
    peak = float(np.max(np.abs(mix))) or 1.0
    return mix / peak * 0.70


def write_wav(path: Path, data: np.ndarray) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    pcm = np.clip(data, -1.0, 1.0)
    pcm = (pcm * 32767).astype("<i2")
    with wave.open(str(path), "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(pcm.tobytes())


def db(x: float) -> str:
    return f"{20 * math.log10(max(x, 1e-9)):.1f} dBFS"


def main() -> int:
    ap = argparse.ArgumentParser(description="合成与 timing.json 对齐的占位 BGM")
    ap.add_argument("timing", nargs="?", default="timing.json", help="timing.json 路径")
    ap.add_argument("--out", default="public/bgm.wav", help="输出 wav 路径")
    ap.add_argument("--bpm", type=float, help="覆盖 timing.json 里的 beats.bpm")
    ap.add_argument("--offset", type=float, help="覆盖 beats.offset（秒）")
    ap.add_argument("--duration", type=float, help="覆盖 length（秒）")
    args = ap.parse_args()

    tpath = Path(args.timing)
    data = json.loads(tpath.read_text(encoding="utf-8")) if tpath.exists() else {}
    beats = data.get("beats") or {}
    bpm = float(args.bpm if args.bpm is not None else beats.get("bpm", 100))
    offset = float(args.offset if args.offset is not None else beats.get("offset", 0))
    duration = float(args.duration if args.duration is not None else data.get("duration", 15))
    if bpm <= 0:
        print("[ERROR] bpm 必须大于 0")
        return 1

    mix = render(duration, bpm, offset)
    out = Path(args.out)
    write_wav(out, mix)

    peak = float(np.max(np.abs(mix)))
    rms = float(np.sqrt(np.mean(mix**2)))
    print(f"输出：{out}  {out.stat().st_size / 1024:.0f} KB")
    print(f"规格：{SR} Hz / 单声道 / 16-bit   时长 {len(mix) / SR:.2f}s")
    print(f"节拍：{bpm:g} BPM，首拍 {offset:.2f}s，一拍 {60 / bpm:.3f}s，一小节 {240 / bpm:.3f}s")
    print(f"电平：峰值 {db(peak)}，RMS {db(rms)}")
    print("下一步：python scripts-win/check_audio.py "
          f"{out} --timing {args.timing}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
