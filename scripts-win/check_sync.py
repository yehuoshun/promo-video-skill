#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""check_sync.py —— 音画字三对齐体检：故事讲到哪、字幕显示什么、声音在说哪句。

为什么单独有这道闸门：
    画面看 timing.json 的 scenes，字幕看 voiceLines，声音看 public/vo/*.wav。
    三者一旦不是「同一份事实」，片子就废了，而别的闸门一个都查不到——
    check_timing 只关心场景时长，check_video 只关心有没有音轨，
    probe 只关心 HTML 排版。错位是它们三个中间的缝。

它查三组关系：

    A 音频 ↔ 字幕   每句旁白都有 wav、wav 长度等于声明时长、
                    文本指纹对得上（改字幕忘了重合成，这里能认出来）、
                    语速在能听清的区间
    B 字幕 ↔ 画面   每句话完整落在自己那个场景里、相邻字幕不撞车
                    （两行字同屏 = 观众不知道该看哪行）、
                    场景末尾留了喘息、字幕不跟画面大字一字不差重复
    C 音频 ↔ 画面   场景切换点和 CTA 落地有没有音效、音效与转场是不是踩在拍点上

用法：
    python scripts-win/check_sync.py -Project template
    python scripts-win/check_sync.py -Project template --png docs/img/sync.png

退出码：有 ERROR 就是 1，只有 WARN 是 0。
"""
from __future__ import annotations

import argparse
import hashlib
import json
import sys
import wave
from pathlib import Path

import numpy as np

sys.stdout.reconfigure(encoding="utf-8")

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent

# 与 template/src/Subtitles.tsx 的 SUB_PAD_IN / SUB_PAD_OUT 必须一致
SUB_PAD_IN = 0.10
SUB_PAD_OUT = 0.35

# 语速区间（汉字/秒）。SAPI 中文常见 2.5~3.5；低于 2 像念经，高于 7 听不清
RATE_MIN = 2.0
RATE_MAX = 7.0

# 场景末尾至少留多少秒，不要把最后一个字卡在转场上
TAIL_MIN = 0.10
# 相邻两句之间的最小间隔
GAP_MIN = 0.10
# 音效/转场离拍点的容差
BEAT_TOL = 0.09


def sha1(text: str) -> str:
    return hashlib.sha1(text.encode("utf-8")).hexdigest()[:12]


PUNCT = "。、，！？；：…—·「」『』《》〈〉（）()[]{}<>.,!?;:'\"“”‘’|"


def norm(text: str) -> str:
    """比文本时忽略空白与标点：字幕带句号、画面大字不带，本来就是同一句。"""
    return "".join(ch for ch in text if not ch.isspace() and ch not in PUNCT)


def wav_duration(path: Path) -> float:
    with wave.open(str(path), "rb") as w:
        return w.getnframes() / float(w.getframerate())


def read_wav_mono(path: Path) -> tuple[np.ndarray, int]:
    with wave.open(str(path), "rb") as w:
        sr = w.getframerate()
        ch = w.getnchannels()
        sw = w.getsampwidth()
        raw = w.readframes(w.getnframes())
    if sw == 2:
        x = np.frombuffer(raw, dtype="<i2").astype(np.float32) / 32768.0
    elif sw == 1:
        x = (np.frombuffer(raw, dtype=np.uint8).astype(np.float32) - 128.0) / 128.0
    else:  # 24/32 bit 少见，直接按 4 字节截断会错，这里只支持 16/8 bit
        raise SystemExit(f"{path.name}: 只支持 8/16 bit WAV（实际 {sw * 8} bit）")
    if ch > 1:
        x = x.reshape(-1, ch).mean(axis=1)
    return x, sr


def beat_times(bpm: float | None, offset: float | None, duration: float) -> list[float]:
    if not bpm or bpm <= 0:
        return []
    period = 60.0 / bpm
    out: list[float] = []
    t = float(offset or 0.0)
    while t <= duration + 1e-6:
        out.append(round(t, 4))
        t += period
    return out


def nearest(t: float, xs: list[float]) -> tuple[float, float | None]:
    """返回 (距离, 最近的值)。xs 空时距离为 inf。"""
    if not xs:
        return float("inf"), None
    best = min(xs, key=lambda v: abs(v - t))
    return abs(best - t), best


# ---------------------------------------------------------------- 三组检查


def check_av_text(timing: dict, proj: Path, errors: list[str], warns: list[str]) -> list[dict]:
    """A. 音频 ↔ 字幕：声明、文件、指纹、语速。"""
    lines = timing.get("voiceLines") or []
    scenes = {sc["id"]: sc for sc in timing.get("scenes", [])}

    # 有旁白文本却没合成，是最常见的「忘了跑 gen_vo」
    for sc in timing.get("scenes", []):
        text = (sc.get("voice") or "").strip()
        if not text:
            continue
        mine = [l for l in lines if l.get("scene") == sc["id"]]
        if not mine:
            errors.append(f"场景 {sc['id']} 写了旁白文本，但没有对应的 voiceLines——先跑 python scripts-win/gen_vo.py")
            continue
        if norm("|".join(l["text"] for l in mine)) != norm(text):
            warns.append(
                f"场景 {sc['id']} 的 voice 文本与已合成的 voiceLines 不一致（改过文案没重跑 gen_vo.py）"
            )

    for l in lines:
        lid = l.get("id", "?")
        wav = proj / "public" / l["file"]
        if not wav.exists():
            errors.append(f"{lid} 的音频文件不存在：public/{l['file']}")
            continue
        real = wav_duration(wav)
        if abs(real - float(l["dur"])) > 0.02:
            errors.append(
                f"{lid} 声明 {l['dur']:.2f}s，实际 {real:.2f}s（换了音频没更新 timing.json）"
            )
        if l.get("sha1") and l["sha1"] != sha1(l["text"]):
            errors.append(f"{lid} 字幕文本改过，但音频还是旧的（指纹对不上）——重跑 gen_vo.py")
        rate = len(l["text"]) / real if real > 0 else 0
        if real > 0 and (rate < RATE_MIN or rate > RATE_MAX):
            warns.append(f"{lid} 语速 {rate:.2f} 字/秒（{l['text'][:12]}…），不在 {RATE_MIN}~{RATE_MAX} 之间")
        if l.get("scene") not in scenes:
            errors.append(f"{lid} 挂在不存在的场景 {l.get('scene')} 上")
    return lines


def check_text_picture(timing: dict, lines: list[dict], errors: list[str], warns: list[str]) -> None:
    """B. 字幕 ↔ 画面：落在自己场景里、互不撞车、不跟画面大字重复。"""
    scenes = {sc["id"]: sc for sc in timing.get("scenes", [])}

    for l in lines:
        sc = scenes.get(l.get("scene"))
        if not sc:
            continue
        lid, at, dur = l.get("id", "?"), float(l["at"]), float(l["dur"])
        end = float(sc["end"])
        if at < float(sc["start"]) - 0.01:
            errors.append(f"{lid} 在 {at:.2f}s 就开口了，但场景 {sc['id']} 从 {sc['start']:.2f}s 才开始")
        if at + dur > end + 0.01:
            errors.append(
                f"{lid} 说到 {at + dur:.2f}s，场景 {sc['id']} 在 {end:.2f}s 就切走了——话没说完画面就换了"
            )
        elif end - (at + dur) < TAIL_MIN:
            warns.append(f"{lid} 距场景结束只剩 {end - (at + dur):.2f}s，最后一个字会撞上转场")

    # 相邻字幕（含进出场留白）撞车 = 同屏两行字
    ordered = sorted(lines, key=lambda l: float(l["at"]))
    for a, b in zip(ordered, ordered[1:]):
        a_end = float(a["at"]) + float(a["dur"]) + SUB_PAD_OUT
        b_start = float(b["at"]) - SUB_PAD_IN
        if b_start < a_end - 0.02:
            errors.append(
                f"字幕撞车：{a['id']} 显示到 {a_end:.2f}s，{b['id']} 从 {b_start:.2f}s 就开始显示"
            )
        elif b_start - a_end < GAP_MIN:
            warns.append(f"{a['id']} 与 {b['id']} 之间只隔 {max(0, b_start - a_end):.2f}s，念得太赶")

    # 画面大字和字幕一字不差：观众会以为是 bug
    for l in lines:
        sc = scenes.get(l.get("scene"))
        if not sc:
            continue
        for on in sc.get("onscreen") or []:
            if on and norm(on) == norm(l["text"]):
                warns.append(f"{sc['id']} 的画面大字与字幕完全相同（「{on[:14]}」），删一个")


def check_audio_picture(
    timing: dict, errors: list[str], warns: list[str], sfx_tol: float = 0.12
) -> None:
    """C. 音频 ↔ 画面：转场与 CTA 要有声音，音效要踩拍。"""
    scenes = timing.get("scenes", [])
    cues = [float(c["at"]) for c in ((timing.get("audio") or {}).get("sfx") or [])]
    bpm = (timing.get("beats") or {}).get("bpm")
    offset = (timing.get("beats") or {}).get("offset", 0.0)
    beats = beat_times(bpm, offset, float(timing.get("duration", 0)))

    for sc in scenes[1:]:
        t = float(sc["start"])
        d, near = nearest(t, cues)
        if d > sfx_tol:
            warns.append(
                f"场景切换 {sc['id']} @{t:.2f}s 附近没有音效（最近的音效差 {d:.2f}s），转场会显得平"
            )

    if scenes:
        last = scenes[-1]
        t = float(last["start"])
        d, _ = nearest(t, cues)
        if not any(t - 0.02 <= c <= t + 0.4 for c in cues):
            errors.append(f"结尾 CTA（{last['id']} @{t:.2f}s）落地 0.4 秒内没有任何音效——全片最该有声音的地方是哑的")

    for c in cues:
        if not beats:
            break
        d, near = nearest(c, beats)
        if d > BEAT_TOL:
            warns.append(f"音效 @{c:.2f}s 离最近一拍（{near:.2f}s）差 {d:.2f}s，听着会「抢拍」")

    for sc in scenes[1:]:
        if not beats:
            break
        d, near = nearest(float(sc["start"]), beats)
        if d > 0.12:
            warns.append(f"转场 {sc['id']} @{sc['start']:.2f}s 不在拍点上（差 {d:.2f}s）")


# ------------------------------------------------------------------ 时间轴图


def _font(size: int):
    from PIL import ImageFont

    for name in ("msyh.ttc", "msyhl.ttc", "simhei.ttf", "arial.ttf"):
        p = Path("C:/Windows/Fonts") / name
        if p.exists():
            try:
                return ImageFont.truetype(str(p), size)
            except OSError:
                continue
    return ImageFont.load_default()


def draw_timeline(path: Path, timing: dict, lines: list[dict], proj: Path) -> None:
    """三条泳道：上面是画面（场景），中间是字幕，下面是声音（波形 + 音效 + 拍点）。

    一眼能看出的错位：字幕条没盖住波形（说话时没字）、字幕条跨进了下一格场景
    （画面换了还在念）、橙色音效三角没压在红线上（没踩拍）。
    """
    from PIL import Image, ImageDraw

    W = 1600
    pad_l, pad_r = 96, 40
    head_h = 64
    lane1_y, lane1_h = head_h + 10, 74
    lane2_y, lane2_h = lane1_y + lane1_h + 14, 96
    lane3_y, lane3_h = lane2_y + lane2_h + 14, 168
    H = lane3_y + lane3_h + 34

    dur = float(timing.get("duration", 1)) or 1.0
    span = W - pad_l - pad_r

    def X(t: float) -> float:
        return pad_l + max(0.0, min(1.0, t / dur)) * span

    img = Image.new("RGB", (W, H), (13, 15, 19))
    dr = ImageDraw.Draw(img)
    f_title, f_lbl, f_sub, f_tiny = _font(24), _font(17), _font(19), _font(14)

    bpm = (timing.get("beats") or {}).get("bpm")
    beats = beat_times(bpm, (timing.get("beats") or {}).get("offset", 0.0), dur)

    dr.text((pad_l, 16), "音画字三对齐", font=f_title, fill=(240, 244, 250))
    dr.text(
        (pad_l + 150, 24),
        f"{dur:.2f}s   {timing.get('width')}×{timing.get('height')}   {bpm or '—'} BPM   {len(lines)} 句旁白",
        font=f_tiny,
        fill=(150, 158, 172),
    )

    # 时间刻度
    for i in range(int(dur) + 1):
        x = X(i)
        dr.line([(x, head_h), (x, H - 6)], fill=(255, 255, 255, 20) if False else (34, 38, 46))
        dr.text((x - 6, H - 22), f"{i}s", font=f_tiny, fill=(110, 118, 132))

    # ---- 泳道 1：画面
    dr.text((12, lane1_y + 24), "画面", font=f_lbl, fill=(150, 158, 172))
    for i, sc in enumerate(timing.get("scenes", [])):
        x0, x1 = X(float(sc["start"])), X(float(sc["end"]))
        fill = (34, 46, 60) if i % 2 == 0 else (30, 40, 52)
        dr.rounded_rectangle([x0 + 1, lane1_y, x1 - 1, lane1_y + lane1_h], radius=8, fill=fill,
                             outline=(70, 84, 104))
        dr.text((x0 + 10, lane1_y + 9), sc["id"], font=f_lbl, fill=(214, 222, 236))
        dr.text(
            (x0 + 10, lane1_y + 40),
            f"{sc.get('layout', '')}  {float(sc['start']):.2f}~{float(sc['end']):.2f}s",
            font=f_tiny,
            fill=(140, 150, 166),
        )

    # ---- 泳道 2：字幕（显示窗 = 语音窗 ± 留白）
    dr.text((12, lane2_y + 34), "字幕", font=f_lbl, fill=(150, 158, 172))
    for l in lines:
        x0 = X(float(l["at"]) - SUB_PAD_IN)
        x1 = X(float(l["at"]) + float(l["dur"]) + SUB_PAD_OUT)
        dr.rounded_rectangle([x0, lane2_y, max(x0 + 4, x1), lane2_y + lane2_h], radius=7,
                             fill=(38, 70, 96), outline=(88, 150, 200))
        # 文字只在放得下时写，写进去就按宽度截断
        text = l["text"]
        while text and dr.textlength(text + "…", font=f_sub) > (x1 - x0 - 16):
            text = text[:-1]
        if text != l["text"]:
            text += "…"
        if text:
            dr.text((x0 + 8, lane2_y + 8), text, font=f_sub, fill=(226, 238, 250))
            dr.text((x0 + 8, lane2_y + 40), f"{float(l['at']):.2f}s", font=f_tiny, fill=(150, 190, 220))

    # ---- 泳道 3：声音
    dr.text((12, lane3_y + 70), "声音", font=f_lbl, fill=(150, 158, 172))
    mid = lane3_y + lane3_h * 0.5
    # 三条泳道共用的拍点红线，先画在底层
    for b in beats:
        x = X(b)
        dr.line([(x, lane1_y), (x, lane3_y + lane3_h)], fill=(96, 44, 46))

    for l in lines:
        wav = proj / "public" / l["file"]
        if not wav.exists():
            continue
        x, sr = read_wav_mono(wav)
        t0, t1 = float(l["at"]), float(l["at"]) + float(l["dur"])
        px0, px1 = int(X(t0)), int(max(X(t0) + 2, X(t1)))
        n = max(1, px1 - px0)
        seg = np.abs(x)
        cols = np.array_split(seg, n)
        peak = float(seg.max()) if len(seg) else 0.0
        amp = (lane3_h * 0.42) / max(1e-6, peak)
        for i, c in enumerate(cols):
            h = float(c.max()) * amp if len(c) else 0.0
            dr.line([(px0 + i, mid - h), (px0 + i, mid + h)], fill=(122, 206, 168))
        dr.line([(px0, mid), (px1, mid)], fill=(60, 96, 82))

    # 音效：橙色三角压在底线上
    for c in ((timing.get("audio") or {}).get("sfx") or []):
        x = X(float(c["at"]))
        y = lane3_y + lane3_h - 6
        dr.polygon([(x, y), (x - 7, y + 14), (x + 7, y + 14)], fill=(236, 156, 74))
        dr.text((x + 10, y - 2), c["file"].split("/")[-1].replace(".wav", ""), font=f_tiny,
                fill=(200, 160, 110))

    img.save(path)
    path.parent.mkdir(parents=True, exist_ok=True)


# ---------------------------------------------------------------------- main


def main() -> int:
    ap = argparse.ArgumentParser(description="音画字三对齐体检")
    ap.add_argument("-Project", "--project", default="template", help="项目目录，默认 template")
    ap.add_argument("--timing", default=None, help="timing.json 路径")
    ap.add_argument("--png", default=None, help="输出三轨时间轴图")
    ap.add_argument("--quiet", action="store_true")
    args = ap.parse_args()

    proj = Path(args.project)
    if not proj.is_absolute():
        proj = (ROOT / proj).resolve()
    tpath = Path(args.timing) if args.timing else proj / "timing.json"
    if not tpath.exists():
        print(f"[ERROR] 找不到 {tpath}")
        return 1

    timing = json.loads(tpath.read_text(encoding="utf-8"))
    errors: list[str] = []
    warns: list[str] = []

    lines = check_av_text(timing, proj, errors, warns)
    check_text_picture(timing, lines, errors, warns)
    check_audio_picture(timing, errors, warns)

    if not args.quiet:
        dur = float(timing.get("duration", 0))
        print(f"时间轴：{dur:.2f}s   {len(timing.get('scenes', []))} 个场景   {len(lines)} 句旁白")
        for l in lines:
            print(
                f"  {float(l['at']):6.2f}~{float(l['at']) + float(l['dur']):6.2f}s"
                f"  字幕 {float(l['at']) - SUB_PAD_IN:5.2f}~{float(l['at']) + float(l['dur']) + SUB_PAD_OUT:5.2f}s"
                f"  {l['text'][:18]}"
            )

    if args.png:
        out = Path(args.png)
        if not out.is_absolute():
            out = (ROOT / out).resolve()
        draw_timeline(out, timing, lines, proj)
        if not args.quiet:
            print(f"图：{out}")

    for w in warns:
        print(f"  [WARN] {w}")
    for e in errors:
        print(f"  [ERROR] {e}")
    print(f"\n结果：{len(errors)} ERROR / {len(warns)} WARN")
    return 1 if errors else 0


if __name__ == "__main__":
    raise SystemExit(main())
