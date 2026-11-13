#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""声音体检：wav 的电平、静音、削波，以及「音乐真的在 timing.json 这个拍上吗」。

为什么需要它：画面侧的呼吸、砸字、数字滚动都从 beats（bpm / offset）取，
音乐要是比 timing.json 慢 2 BPM 或者迟了 80ms，成片不会报任何错——
只会「看着有点怪」。这个脚本从音频里把节拍反推出来，和声明的比对。

用法：
    python scripts-win/check_audio.py template/public/bgm.wav --timing template/timing.json
    python scripts-win/check_audio.py bgm.wav --expect-duration 15
    python scripts-win/check_audio.py bgm.wav --voice voice.wav --min-lift 8
    python scripts-win/check_audio.py bgm.wav --png out/bgm.png     # 出波形+频谱图，肉眼复核

退出码：有 ERROR 就 1。
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


def read_wav(path: Path) -> tuple[np.ndarray, int]:
    with wave.open(str(path), "rb") as w:
        sr = w.getframerate()
        ch = w.getnchannels()
        width = w.getsampwidth()
        raw = w.readframes(w.getnframes())
    if width != 2:
        raise SystemExit(f"[ERROR] 只支持 16-bit PCM，这个是 {width * 8}-bit：{path}")
    data = np.frombuffer(raw, dtype="<i2").astype(np.float32) / 32768.0
    if ch > 1:
        data = data.reshape(-1, ch).mean(axis=1)
    return data, sr


def db(x: float) -> float:
    return 20 * math.log10(max(float(x), 1e-9))


def onset_envelope(x: np.ndarray, sr: int, hop: float = 0.01, win: float = 0.02):
    """10ms 步长的「起音强度」曲线：短时能量取对数后求正向差分。"""
    n = max(1, int(win * sr))
    h = max(1, int(hop * sr))
    frames = 1 + max(0, (len(x) - n) // h)
    if frames < 2:
        return np.zeros(1), hop
    idx = np.arange(n)[None, :] + h * np.arange(frames)[:, None]
    energy = np.sqrt(np.mean(x[idx] ** 2, axis=1))
    le = np.log(energy + 1e-6)
    d = np.maximum(np.diff(le, prepend=le[0]), 0.0)
    if len(d) >= 3:
        d = np.convolve(d, np.ones(3) / 3, mode="same")
    return d, hop


def bandpass(x: np.ndarray, sr: int, lo: float, hi: float) -> np.ndarray:
    """理想带通（FFT 置零）：只看底鼓那一段，pad 和镲不会干扰拍点检测。"""
    n = len(x)
    if n == 0:
        return x
    spec = np.fft.rfft(x)
    freqs = np.fft.rfftfreq(n, 1.0 / sr)
    spec[(freqs < lo) | (freqs > hi)] = 0.0
    return np.fft.irfft(spec, n)


def detect_grid(env: np.ndarray, hop: float, skip: float = 0.2, pmin: float = 0.35, pmax: float = 1.05):
    """在起音曲线里找等间隔梳状峰：返回 (period, phase, score, 置信度)。

    skip：前这么多秒不参与打分——开头淡入那一下的起音比任何一拍都猛，
    不排除掉就会把相位拽到 0.00s。
    """
    env = env.copy()
    head = int(round(skip / hop))
    if head:
        env[:head] = 0.0
    best = (0.0, 0.0, -1.0, 0.0)
    for period in np.arange(pmin, pmax + 1e-9, 0.002):
        steps = max(2, int(round(period / hop)))
        hit = len(env) // steps
        if hit < 4:
            continue
        totals = np.array([env[p::steps].sum() for p in range(steps)])
        counts = np.array([len(env[p::steps]) for p in range(steps)], dtype=float)
        scores = totals / np.maximum(counts, 1)
        p = int(np.argmax(scores))
        score = float(scores[p])
        if score > best[2]:
            # 置信度：最佳相位比「所有相位的平均值」高多少倍。音频没有明显拍子时这个值接近 1
            conf = score / max(float(scores.mean()), 1e-9)
            best = (steps * hop, p * hop, score, conf)
    return best


def silence_runs(x: np.ndarray, sr: int, thr_db: float = -55.0, min_len: float = 0.25):
    """连续低于阈值超过 min_len 秒的区间。"""
    quiet = np.abs(x) < 10 ** (thr_db / 20)
    runs = []
    start = None
    for i, q in enumerate(quiet):
        if q and start is None:
            start = i
        elif not q and start is not None:
            if (i - start) / sr >= min_len:
                runs.append((start / sr, i / sr))
            start = None
    if start is not None and (len(quiet) - start) / sr >= min_len:
        runs.append((start / sr, len(quiet) / sr))
    return runs


def save_png(path: Path, x: np.ndarray, sr: int, bpm: float | None, offset: float | None) -> None:
    """上：波形包络；下：频谱（对数幅度）。给「是不是真有内容」一个肉眼入口。"""
    from PIL import Image, ImageDraw

    W, H = 1200, 480
    img = Image.new("RGB", (W, H), (14, 16, 20))
    dr = ImageDraw.Draw(img)

    # 波形
    cols = np.array_split(np.abs(x), W)
    for i, c in enumerate(cols):
        hi = float(c.max()) if len(c) else 0.0
        y = int(H * 0.24 * hi / max(1e-6, max(0.001, float(np.abs(x).max()))))
        dr.line([(i, H // 4 - y), (i, H // 4 + y)], fill=(120, 200, 160))

    # 频谱
    n = 2048
    hop = max(1, len(x) // W)
    win = np.hanning(n)
    spec = np.zeros((n // 2, W), dtype=np.float32)
    for i in range(W):
        seg = x[i * hop : i * hop + n]
        if len(seg) < n:
            seg = np.pad(seg, (0, n - len(seg)))
        mag = np.abs(np.fft.rfft(seg * win))[: n // 2]
        spec[:, i] = 20 * np.log10(mag + 1e-6)
    spec = np.clip((spec + 90) / 90, 0, 1)
    top = int(H * 0.45)
    rows = np.linspace(0, spec.shape[0] - 1, H - top).astype(int)[::-1]
    arr = (spec[rows] * 255).astype(np.uint8)
    img.paste(Image.fromarray(arr, mode="L").convert("RGB"), (0, top))

    # 拍点竖线（只画在频谱上，方便看「线是不是落在音头」）
    if bpm and offset is not None and bpm > 0:
        period = 60.0 / bpm
        dur = len(x) / sr
        t = offset
        while t < dur:
            px = int(W * t / dur)
            dr.line([(px, top), (px, H)], fill=(240, 90, 90))
            t += period
    path.parent.mkdir(parents=True, exist_ok=True)
    img.save(path)


def main() -> int:
    ap = argparse.ArgumentParser(description="声音体检")
    ap.add_argument("audio", help="要检查的 wav")
    ap.add_argument("--timing", help="timing.json：核对时长与节拍")
    ap.add_argument("--expect-duration", type=float, help="期望时长（秒），覆盖 timing 里的值")
    ap.add_argument("--tolerance", type=float, default=0.05, help="时长容差，默认 0.05s")
    ap.add_argument("--bpm", type=float, help="声明 BPM（覆盖 timing.json）")
    ap.add_argument("--offset", type=float, help="声明首拍秒数（覆盖 timing.json）")
    ap.add_argument("--narration", action="store_true", help="这段是旁白：允许 1.6s 以内的自然停顿，不查拍子")
    ap.add_argument("--voice", help="人声 wav：检查人声比音乐高多少 dB（给了它也算旁白）")
    ap.add_argument("--min-lift", type=float, default=8.0, help="人声至少高出音乐多少 dB，默认 8")
    ap.add_argument("--png", help="另存一张波形+频谱图")
    ap.add_argument("--quiet", action="store_true")
    args = ap.parse_args()
    narration = bool(args.narration or args.voice)

    path = Path(args.audio)
    if not path.exists():
        print(f"[ERROR] 文件不存在：{path}")
        return 1
    x, sr = read_wav(path)
    dur = len(x) / sr

    errors: list[str] = []
    warns: list[str] = []

    peak = float(np.max(np.abs(x))) if len(x) else 0.0
    rms = float(np.sqrt(np.mean(x**2))) if len(x) else 0.0
    clipped = int(np.sum(np.abs(x) >= 0.999))
    longest = 0
    run_len = 0
    for s in np.abs(x) >= 0.999:
        run_len = run_len + 1 if s else 0
        longest = max(longest, run_len)

    print(f"文件：{path}")
    print(f"大小：{path.stat().st_size / 1024:.0f} KB   采样率 {sr} Hz   时长 {dur:.2f}s")
    print(f"电平：峰值 {db(peak):.1f} dBFS   RMS {db(rms):.1f} dBFS")

    if peak <= 0.0005:
        errors.append("整段是静音：采样值全是 0，渲染出来没有声音")
    if clipped:
        warns.append(f"{clipped} 个采样顶到 0 dBFS（最长连续 {longest} 个）：混音没有余量，加人声会破音")
    if rms > 0 and db(peak) - db(rms) < 6:
        warns.append(f"峰值与 RMS 只差 {db(peak) - db(rms):.1f} dB：压得太死，听着会「糊」")

    sil = silence_runs(x, sr)
    if narration:
        # 旁白：句间停 1 秒是正常的，别拿音乐的尺子量说话。
        # 真正该报的是「半段没人说话」——TTS 没念完、或文件被截断。
        silent_total = sum(b - a for a, b in sil)
        long_sil = [s for s in sil if s[1] - s[0] >= 1.6]
        if long_sil:
            errors.append("旁白里有 {:.1f}s 的空白：{}（TTS 可能漏句或被截断）".format(
                max(s[1] - s[0] for s in long_sil),
                "、".join(f"{a:.2f}~{b:.2f}s" for a, b in long_sil[:3])))
        elif dur > 0 and silent_total / dur > 0.5:
            errors.append("旁白有 {:.0f}% 的时间是静音：文字可能没念完".format(silent_total / dur * 100))
    else:
        long_sil = [s for s in sil if s[1] - s[0] >= 1.0]
        if long_sil:
            errors.append("中间有 {:.1f}s 的无声段：{}".format(
                max(s[1] - s[0] for s in long_sil),
                "、".join(f"{a:.2f}~{b:.2f}s" for a, b in long_sil[:3])))
        elif sil:
            warns.append("有 {} 段短静音（最长 {:.2f}s）".format(len(sil), max(b - a for a, b in sil)))

    # ---- 期望时长 ----
    exp_dur = args.expect_duration
    timing = {}
    if args.timing:
        tp = Path(args.timing)
        if tp.exists():
            timing = json.loads(tp.read_text(encoding="utf-8"))
            if exp_dur is None and "duration" in timing:
                exp_dur = float(timing["duration"])
        else:
            warns.append(f"找不到 {tp}，跳过时长与节拍核对")
    if exp_dur is not None:
        diff = dur - exp_dur
        print(f"时长：期望 {exp_dur:.2f}s，实际 {dur:.2f}s（差 {diff:+.2f}s）")
        if abs(diff) > args.tolerance:
            errors.append(f"时长 {dur:.2f}s 与期望 {exp_dur:.2f}s 差 {diff:+.2f}s，超过 {args.tolerance}s")

    # ---- 节拍核对 ----
    beats = timing.get("beats") or {}
    bpm = args.bpm if args.bpm is not None else beats.get("bpm")
    offset = args.offset if args.offset is not None else beats.get("offset")
    if narration and args.bpm is None:
        # 说话的音频没有拍子可测：默认跳过，硬测只会撞出假报警
        pass
    elif bpm:
        # 只看底鼓频段（40~120 Hz）找拍点：pad、镲、拨弦都在这个频段之外
        env, hop = onset_envelope(bandpass(x, sr, 40.0, 120.0), sr)
        period, phase, score, conf = detect_grid(env, hop)
        if period <= 0 or score <= 0:
            warns.append("节拍：这段音频太安静或没有明显起音，测不出拍子")
        else:
            got_bpm = 60.0 / period
            dbpm = got_bpm - float(bpm)
            # 相位：偏移量对一拍取模后比较
            want = float(offset or 0) % period
            dphase = (phase - want + period / 2) % period - period / 2
            print(f"节拍：声明 {float(bpm):g} BPM / 首拍 {float(offset or 0):.2f}s"
                  f"，实测 {got_bpm:.1f} BPM / 相位 {phase:.2f}s（偏差 {dbpm:+.1f} BPM、{dphase * 1000:+.0f} ms）")
            if abs(dbpm) > 2.0:
                errors.append(f"实测 {got_bpm:.1f} BPM，与 timing.json 的 {float(bpm):g} BPM 差 {dbpm:+.1f}："
                              "画面按 beats 打点会和音乐错开")
            if abs(dphase) > 0.06:
                errors.append(f"首拍相位差 {dphase * 1000:+.0f} ms（超过 60ms）：改 timing.json 的 beats.offset "
                              f"或重做音乐，别在场景里补偏移")
    elif args.timing and not narration:
        warns.append("timing.json 里没有 beats.bpm，跳过节拍核对")

    # ---- 人声与音乐的落差 ----
    if args.voice:
        vp = Path(args.voice)
        if not vp.exists():
            errors.append(f"人声文件不存在：{vp}")
        else:
            v, vsr = read_wav(vp)
            if vsr != sr:
                warns.append(f"人声 {vsr} Hz 与音乐 {sr} Hz 不一致，做了线性重采样")
                v = np.interp(np.linspace(0, len(v) - 1, int(len(v) * sr / vsr)), np.arange(len(v)), v)
            n = min(len(v), len(x))
            v, m = v[:n], x[:n]
            # 只在「有人在说话」的窗口里比，否则比的是音乐自己
            hop = int(0.02 * sr)
            frames = n // hop
            if frames < 5:
                warns.append("人声太短，跳过音量落差检查")
            else:
                ve = np.sqrt(np.mean(v[: frames * hop].reshape(frames, hop) ** 2, axis=1))
                active = ve > 10 ** (-45 / 20)
                if active.mean() < 0.1:
                    warns.append("人声几乎全程安静，跳过音量落差检查")
                else:
                    vr = float(np.sqrt(np.mean(v[: frames * hop].reshape(frames, hop)[active] ** 2)))
                    mr = float(np.sqrt(np.mean(m[: frames * hop].reshape(frames, hop)[active] ** 2)))
                    lift = db(vr) - db(mr)
                    print(f"人声：说话段 {active.mean() * 100:.0f}% 的时长，比音乐高 {lift:.1f} dB")
                    if lift < args.min_lift:
                        errors.append(f"人声只比音乐高 {lift:.1f} dB，低于 {args.min_lift} dB："
                                      "手机上听不清台词，把 bgm 音量降下来或给人声加压缩")

    if args.png:
        bpm_val = float(bpm) if bpm else None
        off_val = float(offset) if offset is not None else None
        save_png(Path(args.png), x, sr, bpm_val, off_val)
        print(f"图：{args.png}（上=波形，下=频谱，红线=按 timing.json 画的拍点）")

    if not args.quiet:
        if warns:
            print(f"\n[WARN] {len(warns)} 条")
            for w in warns:
                print(f"  - {w}")
        if errors:
            print(f"\n[ERROR] {len(errors)} 条")
            for e in errors:
                print(f"  - {e}")
        print(f"\n结果：{len(errors)} ERROR / {len(warns)} WARN")
    else:
        print(f"结果：{len(errors)} ERROR / {len(warns)} WARN")
    return 1 if errors else 0


if __name__ == "__main__":
    raise SystemExit(main())
