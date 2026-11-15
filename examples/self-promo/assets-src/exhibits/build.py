"""把真跑出来的输出排版成「打印件」，供成片当素材用。

为什么不直接截终端：终端截图在浅色图纸上很跳，而且字小、一屏塞不下 11 行。
这里的做法是**把同样的文字重新排版**，文字内容一字不改——所以画面上的每个
数字仍然来自 data/ 下那几个真跑出来的文件，不是手打的。
重跑证据：见 gen 命令写在 data/SOURCES.md。
"""

import sys
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8")

HERE = Path(__file__).resolve().parent
DATA = HERE / "data"

SHEET_INSET = 26
PAPER = "#fbf9f2"
INK = "#1b2430"
BLUE = "#143b6b"
RED = "#c1272d"
AMBER = "#8a5a00"
GREY = "#6b7280"


def read(name: str) -> list[str]:
    p = DATA / name
    return [ln.rstrip() for ln in p.read_text(encoding="utf-8").splitlines()]


def esc(s: str) -> str:
    return s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def paper(code: str, title: str, source: str, rows: list[tuple[str, str]], size: int, width: int = 2400, height: int = 1350) -> str:
    """rows = [(class, text)]，class 取 ok/warn/err/plain/mono"""
    # 逐行绝对定位：不依赖浏览器的 line-height 与字体回退，
    # 行距按行数算出来，保证一屏放得下、且不与页脚撞。
    top, bottom = 186, height - 92
    avail_h = bottom - top
    n = max(1, len(rows))
    line_h = min(int(avail_h / n), int(size * 1.62))
    avail_w = width - 2 * 26 - 2 * 64 - 8
    widest = max((em(t) for _, t in rows), default=1)
    font = int(min(size, line_h * 0.66, avail_w / max(widest, 1)))
    if font < 24:
        print(f"[WARN] {code} 字号被压到 {font}px，考虑删几行", file=sys.stderr)

    lines = []
    for i, (cls, txt) in enumerate(rows):
        y = top - SHEET_INSET + i * line_h
        body_txt = esc(txt) if txt else "&nbsp;"
        lines.append(
            f'    <div class="ln {cls}" style="top:{y}px;font-size:{font}px;line-height:{line_h}px">{body_txt}</div>'
        )
    body = "\n".join(lines)
    return f"""<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><title>{esc(title)}</title>
<style>
  html, body {{ margin:0; padding:0; background:{PAPER}; }}
  body {{ width:{width}px; height:{height}px; position:relative; overflow:hidden;
          font-family: Consolas, "Cascadia Mono", "Microsoft YaHei", monospace; color:{INK}; }}
  .sheet {{ position:absolute; inset:26px; border:3px solid {INK}; box-sizing:border-box; }}
  .hd {{ position:absolute; left:64px; right:64px; top:44px; display:flex; justify-content:space-between;
         align-items:baseline; font-size:26px; letter-spacing:.14em; color:{BLUE};
         border-bottom:2px solid {INK}; padding-bottom:14px; }}
  .hd b {{ font-size:30px; letter-spacing:.06em; }}
  .src {{ color:{GREY}; font-size:22px; letter-spacing:.02em; }}
  .body {{ position:absolute; left:64px; right:64px; top:0; }}
  .ln {{ position:absolute; left:0; right:0; white-space:pre; }}
  .plain {{ color:{INK}; }}
  .ok {{ color:{BLUE}; }}
  .warn {{ color:{AMBER}; }}
  .err {{ color:{RED}; font-weight:bold; }}
  .mono {{ color:{GREY}; }}
  .ft {{ position:absolute; left:64px; right:64px; bottom:30px; display:flex; justify-content:space-between;
        font-size:22px; color:{GREY}; letter-spacing:.06em; }}
</style></head>
<body><div class="sheet">
  <div class="hd"><span><b>打印件 {code}</b>　{esc(title)}</span><span class="src">证据来源：{esc(source)}</span></div>
  <div class="body">
{body}
  </div>
  <div class="ft"><span>promo-video-skill / 施工图</span><span>文字未改动，仅重新排版</span></div>
</div></body></html>
"""


def em(t: str) -> float:
    """粗估一行有多宽（单位 em）：中日韩字符按 1em，其余按 0.55em。"""
    return sum(1.0 if ord(c) > 0x2E80 else 0.55 for c in t)


def pick(lines: list[str], prefix: str) -> list[str]:
    return [ln for ln in lines if ln.startswith(prefix)]


def gate_rows(lines: list[str]) -> list[tuple[str, str]]:
    """只留闸门表格行 + 汇总行，明细不排进来——一屏塞不下，字也会被压到看不清。"""
    import re

    rows: list[tuple[str, str]] = []
    pat = re.compile(r"^\s*\[\s*\d+\]\s+(\S+)\s+(OK|WARN|FAIL|SKIP)\s+(.*)$")
    for ln in lines:
        m = pat.match(ln)
        if m:
            name, status, rest = m.group(1), m.group(2), m.group(3).strip()
            cls = {"OK": "ok", "WARN": "warn", "FAIL": "err", "SKIP": "mono"}[status]
            rows.append((cls, f"[{name}]{' ' * max(1, 8 - len(name) * 2)}{status:<5}{rest}"))
        elif ln.strip().startswith("结果："):
            rows.append(("plain", ""))
            rows.append(("plain", ln.strip()))
    return rows


def build_html() -> list[Path]:
    out: list[Path] = []
    jobs = []

    # E-01 开箱 verify：真实闸门表 + 汇总行
    rows = gate_rows(read("verify-open.txt"))
    jobs.append(("E-01", "开箱第一次跑 verify", "verify.cmd .（真跑）", rows, 34, "exhibit-verify-open"))

    # E-02 probe 对 bad.html
    p = read("probe-bad.txt")
    rows = []
    for ln in p:
        s = ln.strip()
        if not s:
            continue
        if not (s.startswith("[") or s.startswith("-") or s.startswith("结果") or s.startswith("探针")):
            continue
        cls = "plain"
        if s.startswith("[ERROR]"):
            cls = "err"
        elif s.startswith("[WARN]"):
            cls = "warn"
        elif s.startswith("结果"):
            cls = "err"
        text = ("      " + s) if s.startswith("-") else ln.rstrip()
        rows.append((cls, text))
    jobs.append(("E-02", "probe 在真浏览器里量出来的", "probe.cmd examples/bad.html（真跑）", rows, 42, "exhibit-probe-bad"))

    # E-03 十一道闸门
    g = read("gates.txt")
    jobs.append(("E-03", "十一道闸门，一条命令", "verify.ps1 的 Report 调用（原样提取）", [("plain", x) for x in g], 62, "exhibit-gates"))

    # E-04 timing.json 片段
    t = read("timing-snippet.txt")
    jobs.append(("E-04", "唯一的时间真相", "timing.json（本片真实文件前 16 行）", [("plain", x) for x in t], 38, "exhibit-timing"))

    # E-06 工程目录
    tr = read("tree.txt")
    jobs.append(("E-06", "一个工程长这样", "Get-ChildItem（真实列目录）", [("plain", x) for x in tr], 46, "exhibit-tree"))

    # E-07 交付 verify 全绿（渲染后才有，没有就跳过）
    if (DATA / "verify-green.txt").exists():
        jobs.append(("E-07", "交付时再跑一遍", "verify.cmd .（成片前的真跑）", gate_rows(read("verify-green.txt")), 34, "exhibit-verify-green"))

    for code, title, src, rows, size, name in jobs:
        html = paper(code, title, src, rows, size)
        p = HERE / f"{name}.html"
        p.write_text(html, encoding="utf-8")
        out.append(p)
    return out


def build_wave() -> Path:
    """从自己的 bgm.wav 画波形 + 拍点，输出 PNG。数据是真采样，不是示意图。"""
    import json
    import wave

    from PIL import Image, ImageDraw

    root = HERE.parents[1]  # assets-src/exhibits → 工程根
    wav = root / "public" / "bgm.wav"
    timing = json.loads((root / "timing.json").read_text(encoding="utf-8"))

    with wave.open(str(wav), "rb") as w:
        n = w.getnframes()
        sr = w.getframerate()
        raw = w.readframes(n)
    import array

    samples = array.array("h")
    samples.frombytes(raw)
    dur = n / sr

    W, H = 2400, 940
    img = Image.new("RGB", (W, H), PAPER)
    d = ImageDraw.Draw(img)
    padx, pady = 70, 40
    mid = pady + (H - 2 * pady) // 2
    amp = (H - 2 * pady) // 2 - 10

    # 拍点竖线（按 timing.json 的 bpm/offset 算，与画面用的是同一份）
    bpm = timing["beats"]["bpm"]
    off = timing["beats"]["offset"]
    period = 60.0 / bpm
    x0, x1 = padx, W - padx
    t = off
    bar_i = 0
    while t <= dur:
        x = x0 + (t / dur) * (x1 - x0)
        d.line([(x, pady - 12), (x, H - pady + 12)], fill=RED if bar_i % 4 == 0 else "#e3b7b7", width=2 if bar_i % 4 == 0 else 1)
        t += period
        bar_i += 1

    # 波形：按列取峰值
    span = x1 - x0
    per = n // span if span else 1
    for i in range(span):
        chunk = samples[i * per:(i + 1) * per]
        if not chunk:
            break
        peak = max(abs(min(chunk)), abs(max(chunk))) / 32768.0
        h = int(peak * amp)
        d.line([(x0 + i, mid - h), (x0 + i, mid + h)], fill=BLUE, width=1)

    d.line([(x0, mid), (x1, mid)], fill=GREY, width=1)
    img.save(HERE / "exhibit-bgm-wave.png")
    return HERE / "exhibit-bgm-wave.png"


if __name__ == "__main__":
    made = build_html()
    wave_png = build_wave()
    for p in made:
        print(p.name)
    print(wave_png.name)
