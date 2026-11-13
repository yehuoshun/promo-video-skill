#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""gen_vo.py —— 逐句合成旁白，并把「每句话在第几秒」写回 timing.json。

为什么不用一条整轨：一条 40 秒的旁白轨里，「第 12.4 秒说的是哪句」只能靠
语音识别去猜，猜错一次字幕就整体错位。这里改成每句一个 wav：

    public/vo/hook-01-1.wav   0.00~2.10s
    public/vo/hook-01-2.wav   2.28~4.02s

时间在合成的那一刻就定死了（at 是我们指定的，dur 是量出来的），于是
字幕只要读同一份 voiceLines，就不可能和声音错开。

用法：
    python scripts-win/gen_vo.py                 # 默认处理 template/
    python scripts-win/gen_vo.py -Project demo   # 处理 demo/
    python scripts-win/gen_vo.py -Voice "Microsoft Huihui Desktop" -Rate -1
    python scripts-win/gen_vo.py --dry-run       # 只算不合成

两种音源（--engine）：
    sapi  本机 SAPI 离线合成，任何 Windows 都能跑，音色是 2000 年代的拼接式，偏机械
    edge  微软神经语音（走 edge-tts，需联网），中文接近真人，默认音色 zh-CN-XiaoxiaoNeural

timing.json 里写法（scenes[].voice，多句用 | 隔开）：

    { "id": "hook-01", "voice": "一句话。|第二句话。", ... }

合成后 gen_vo.py 会补上（或覆盖）顶层的 voiceLines：

    "voiceLines": [
      { "id": "hook-01-1", "scene": "hook-01", "at": 0.3, "dur": 2.1,
        "text": "一句话。", "file": "vo/hook-01-1.wav", "sha1": "…" }
    ]

sha1 是文本的指纹：以后只改字幕不改文本、却忘了重合成时，
check_sync.py 靠它认出「字幕和声音不是同一次生成的」。
"""
from __future__ import annotations

import argparse
import hashlib
import json
import subprocess
import sys
import wave
from pathlib import Path

import numpy as np

sys.stdout.reconfigure(encoding="utf-8")

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent

# 句末标点：中文句号、问号、感叹号、分号，以及英文句点
SENT_END = "。！？；!?;"


def sha1(text: str) -> str:
    return hashlib.sha1(text.encode("utf-8")).hexdigest()[:12]


def split_lines(voice: str) -> list[str]:
    """按 | 先切，再按句末标点切。空串丢掉。"""
    out: list[str] = []
    for chunk in voice.split("|"):
        chunk = chunk.strip()
        if not chunk:
            continue
        buf = ""
        for ch in chunk:
            buf += ch
            if ch in SENT_END:
                if buf.strip():
                    out.append(buf.strip())
                buf = ""
        if buf.strip():
            out.append(buf.strip())
    return out


def wav_duration(path: Path) -> float:
    """读 WAV 头拿时长。SAPI 输出 22.05kHz 单声道 16-bit。"""
    with wave.open(str(path), "rb") as w:
        return w.getnframes() / float(w.getframerate())


def trim_silence(path: Path, thresh: float = 0.004, pad: float = 0.05) -> tuple[float, float]:
    """掐掉首尾静音，原地重写。返回 (裁剪前, 裁剪后) 秒数。

    SAPI 会在句尾留将近一秒的空白：不掐掉的话，字幕条比这句话长出三分之一，
    下一句的起点也被推后，节奏整个拖沓下来。阈值 0.004 ≈ -48 dBFS，
    再低会把气口也保留下来；两头各留 50ms，避免把起音和尾音削掉。
    """
    with wave.open(str(path), "rb") as w:
        params = w.getparams()
        raw = w.readframes(w.getnframes())
    x = np.frombuffer(raw, dtype="<i2")
    sr = params.framerate
    before = len(x) / float(sr)

    loud = np.where(np.abs(x.astype(np.int32)) > int(thresh * 32768))[0]
    if loud.size == 0:
        return before, before
    pad_n = int(pad * sr)
    a = max(0, int(loud[0]) - pad_n)
    b = min(len(x), int(loud[-1]) + pad_n)
    trimmed = x[a:b]
    with wave.open(str(path), "wb") as w:
        w.setparams(params)
        w.writeframes(trimmed.tobytes())
    return before, len(trimmed) / float(sr)


def normalize_rms(path: Path, target_db: float = -18.0, ceiling_db: float = -1.5) -> float:
    """把整句拉到目标 RMS，原地重写。返回实际加的增益（dB）。

    SAPI 出来的句子峰值不低、RMS 却只有 -26 dBFS 上下（中文气口多、
    平均能量被拉低）。直接混进片子会有两个问题：整片响度上不去，
    以及「人声只比音乐高 5 dB」——手机上听着就是糊的。
    所以按 RMS 归一，再用 tanh 软限幅把峰值压在 ceiling 以内：
    时长不变（at/dur 不用改），只动电平。
    """
    with wave.open(str(path), "rb") as w:
        params = w.getparams()
        x = np.frombuffer(w.readframes(w.getnframes()), dtype="<i2").astype(np.float64) / 32768.0
    if x.size == 0:
        return 0.0
    rms = float(np.sqrt(np.mean(np.square(x))))
    if rms <= 1e-6:
        return 0.0
    gain = 10 ** ((target_db - 20 * np.log10(rms)) / 20.0)
    ceiling = 10 ** (ceiling_db / 20.0)
    knee = 0.8 * ceiling

    y = x * gain
    if float(np.max(np.abs(y))) > knee:
        mag = np.abs(y)
        y = np.where(mag <= knee, y, np.sign(y) * (knee + (ceiling - knee) * np.tanh((mag - knee) / (ceiling - knee))))

    # 限幅吃掉了一点能量，补回来，但不超过剩余头顶
    rms2 = float(np.sqrt(np.mean(np.square(y))))
    if rms2 > 1e-6:
        headroom = ceiling / max(ceiling, float(np.max(np.abs(y))))
        extra = min(headroom, 10 ** ((target_db - 20 * np.log10(rms2)) / 20.0))
        y = y * extra
        gain *= extra

    out = np.clip(y * 32768.0, -32768, 32767).astype("<i2")
    with wave.open(str(path), "wb") as w:
        w.setparams(params)
        w.writeframes(out.tobytes())
    return float(20 * np.log10(gain))


def find_ffmpeg(proj: Path) -> str:
    """优先用项目里 Remotion 自带的 ffmpeg（本机 PATH 上没有）。"""
    cand = proj / "node_modules" / "@remotion" / "compositor-win32-x64-msvc" / "ffmpeg.exe"
    if cand.exists():
        return str(cand)
    return "ffmpeg"


def synth_edge(text: str, out: Path, voice: str, rate_pct: int) -> None:
    """edge-tts 合成到 mp3，再转成 44.1kHz 单声道 wav（后续步骤都按 wav 处理）。"""
    out.parent.mkdir(parents=True, exist_ok=True)
    mp3 = out.with_suffix(".mp3")
    speed = f"{rate_pct:+d}%"
    r = subprocess.run(
        [sys.executable, "-m", "edge_tts", "--text", text, "--voice", voice,
         "--rate", speed, "--write-media", str(mp3)],
        capture_output=True, text=True, encoding="utf-8", errors="replace",
    )
    if r.returncode != 0 or not mp3.exists():
        tail = (r.stderr or r.stdout or "").strip().splitlines()[-3:]
        raise SystemExit(f"edge-tts 合成失败（exit {r.returncode}）：{text}\n  " + "\n  ".join(tail))
    ff = find_ffmpeg(out.parents[2])
    conv = subprocess.run(
        [ff, "-y", "-loglevel", "error", "-i", str(mp3),
         "-ac", "1", "-ar", "44100", "-c:a", "pcm_s16le", str(out)],
        capture_output=True, text=True, encoding="utf-8", errors="replace",
    )
    mp3.unlink(missing_ok=True)
    if conv.returncode != 0 or not out.exists():
        raise SystemExit(f"mp3 → wav 失败：{out}\n  {(conv.stderr or '').strip()[:300]}")


def synth(text: str, out: Path, voice: str | None, rate: int) -> None:
    out.parent.mkdir(parents=True, exist_ok=True)
    cmd = [
        "powershell.exe", "-NoProfile", "-ExecutionPolicy", "Bypass",
        "-File", str(HERE / "say.ps1"),
        "-Text", text, "-Out", str(out), "-Rate", str(rate),
    ]
    if voice:
        cmd += ["-Voice", voice]
    r = subprocess.run(cmd, capture_output=True, text=True, encoding="utf-8", errors="replace")
    if r.returncode != 0 or not out.exists():
        tail = (r.stderr or r.stdout or "").strip().splitlines()
        tail = tail[-3:] if tail else []
        raise SystemExit(f"合成失败（exit {r.returncode}）：{text}\n  " + "\n  ".join(tail))


def main() -> int:
    ap = argparse.ArgumentParser(description="逐句合成旁白并写回 timing.json")
    ap.add_argument("-Project", "--project", default="template", help="项目目录，默认 template")
    ap.add_argument("--timing", default=None, help="timing.json 路径，默认 <项目>/timing.json")
    ap.add_argument("--engine", choices=["sapi", "edge"], default="sapi",
                    help="合成引擎：sapi（离线、机械）或 edge（联网、接近真人），默认 sapi")
    ap.add_argument("--voice", default=None,
                    help="音色名；edge 引擎默认 zh-CN-XiaoxiaoNeural，sapi 默认自动挑第一个中文音色")
    ap.add_argument("--rate", type=int, default=None,
                    help="语速；sapi 为 -10~10（默认 -1），edge 为百分比（默认 +8%%）")
    ap.add_argument("--lead", type=float, default=0.3, help="每句距场景开头留多少秒，默认 0.3")
    ap.add_argument("--gap", type=float, default=0.18, help="同一个场景内两句之间的空白，默认 0.18")
    ap.add_argument("--dry-run", action="store_true", help="只算时间不合成")
    ap.add_argument("--rms", type=float, default=-18.0, help="旁白归一化目标 RMS（dBFS），默认 -18")
    args = ap.parse_args()

    if args.engine == "edge":
        args.voice = args.voice or "zh-CN-XiaoxiaoNeural"
        if args.rate is None:
            args.rate = 8
    elif args.rate is None:
        args.rate = -1

    proj = (ROOT / args.project).resolve() if not Path(args.project).is_absolute() else Path(args.project)
    tpath = Path(args.timing) if args.timing else proj / "timing.json"
    if not tpath.exists():
        raise SystemExit(f"找不到 {tpath}")
    timing = json.loads(tpath.read_text(encoding="utf-8"))
    fps = timing.get("fps", 30)

    lines: list[dict] = []
    for sc in timing.get("scenes", []):
        voice = (sc.get("voice") or "").strip()
        if not voice:
            continue
        at = float(sc["start"]) + args.lead
        scene_end = float(sc["end"])
        for i, text in enumerate(split_lines(voice), start=1):
            lid = f"{sc['id']}-{i}"
            rel = f"vo/{lid}.wav"
            out = proj / "public" / rel
            if args.dry_run:
                dur = wav_duration(out) if out.exists() else 0.0
            else:
                if args.engine == "edge":
                    synth_edge(text, out, args.voice, args.rate)
                else:
                    synth(text, out, args.voice, args.rate)
                before, dur = trim_silence(out)
                if before - dur > 0.15:
                    print(f"  [掐静音] {lid}: {before:.2f}s → {dur:.2f}s（去掉首尾空白 {before - dur:.2f}s）")
                gain = normalize_rms(out, target_db=args.rms)
                if not args.dry_run:
                    print(f"  [归一] {lid}: {gain:+.1f} dB → RMS {args.rms:.0f} dBFS")
            # 时间对齐到整帧：渲染时 Sequence 的 from 是整数帧
            at = round(round(at * fps) / fps, 3)
            lines.append({
                "id": lid, "scene": sc["id"], "at": at, "dur": round(dur, 3),
                "text": text, "file": rel, "sha1": sha1(text),
                "rate": round(len(text) / dur, 2) if dur else 0.0,
            })
            tail = at + dur
            if tail > scene_end - 0.1:
                print(f"  [超出场景] {lid} 到 {tail:.2f}s，场景 {sc['id']} 在 {scene_end:.2f}s 结束")
            at = tail + args.gap

    timing["voiceLines"] = lines
    if not args.dry_run:
        # newline="\n"：不然 Windows 上会写成 CRLF，被 fix-encoding 挡下来
        tpath.write_text(
            json.dumps(timing, ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8",
            newline="\n",
        )

    total = sum(l["dur"] for l in lines)
    print(f"旁白：{len(lines)} 句，共 {total:.2f}s" + ("（dry-run，未写回）" if args.dry_run else "，已写回 timing.json"))
    for l in lines:
        print(f"  {l['at']:6.2f} +{l['dur']:5.2f}s  {l['rate']:4.2f} 字/秒  {l['id']}  {l['text'][:24]}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
