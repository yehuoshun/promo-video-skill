"""生成三个音效（自合成，无版权问题，可复现）。

用法：
    python assets-src/sfx/gen_sfx.py public/sfx

产物（44.1kHz / 单声道 / 16-bit，峰值统一 -6 dBFS）：
    tick.wav     120ms  轻点：小元素落地
    whoosh.wav   450ms  扫风：场景之间平移纸张
    stamp.wav    380ms  盖章：红章砸下来

为什么自己合成：AGENTS.md 的红线要求素材可追溯，音效买曲库要谈授权；
三个声音都是「衰减包络 + 正弦/噪声」的闭式表达式，重跑一次结果完全一样。
"""

import math
import os
import struct
import sys
import wave

sys.stdout.reconfigure(encoding="utf-8")

SR = 44100


def norm(xs, peak_db=-6.0):
    top = max(abs(x) for x in xs) or 1.0
    target = 10 ** (peak_db / 20.0)
    return [x / top * target for x in xs]


def write(path, xs):
    with wave.open(path, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(b"".join(struct.pack("<h", int(max(-1.0, min(1.0, x)) * 32767)) for x in xs))


def tick():
    n = int(0.12 * SR)
    out = []
    for i in range(n):
        t = i / SR
        env = math.exp(-t / 0.018)
        body = math.sin(2 * math.pi * 1600 * t) * 0.7 + math.sin(2 * math.pi * 2400 * t) * 0.3
        out.append(body * env)
    return norm(out)


def whoosh():
    n = int(0.45 * SR)
    out = []
    rnd = 12345
    prev = 0.0
    for i in range(n):
        t = i / SR
        # 线性同余噪声：不用 random，保证可复现
        rnd = (1103515245 * rnd + 12345) % (2**31)
        white = (rnd / (2**31 - 1)) * 2 - 1
        # 一阶低通，截止频率随时间上扫（400Hz → 4kHz）
        cut = 400 + 3600 * (t / 0.45)
        a = math.exp(-2 * math.pi * cut / SR)
        prev = (1 - a) * white + a * prev
        env = math.sin(math.pi * min(1.0, t / 0.45)) ** 1.6
        out.append(prev * env)
    return norm(out)


def stamp():
    n = int(0.38 * SR)
    out = []
    for i in range(n):
        t = i / SR
        env = math.exp(-t / 0.06)
        low = math.sin(2 * math.pi * (70 - 20 * t) * t)
        click = math.exp(-t / 0.006) * 0.5
        out.append((low * 0.9 + click) * env)
    return norm(out)


def main():
    out_dir = sys.argv[1] if len(sys.argv) > 1 else os.path.join("public", "sfx")
    os.makedirs(out_dir, exist_ok=True)
    for name, fn in (("tick", tick), ("whoosh", whoosh), ("stamp", stamp)):
        path = os.path.join(out_dir, name + ".wav")
        write(path, fn())
        print(f"{path}  {os.path.getsize(path)} bytes")


if __name__ == "__main__":
    main()
