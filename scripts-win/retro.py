#!/usr/bin/env python
"""交付后复盘：把能数出来的事实自动填进 复盘.md，人只回答三个问题。

为什么要有它：P7 那支真片的复盘是手写的，写完就没人再写第二份；而它列出的五条改进
（edge-tts、只吃 WAV、loudnorm、字幕 4~5 秒、自动截帧）一条也没进闸门。手写复盘的问题
不是写得不好，是没有入口条件、也没人负责把「闸门撒谎」这类事变成数字。

所以这里的规矩是：
  * 事实区全自动 —— 片长/帧数/成片体积/码率、场景与素材、verify 跑了几轮、哪道闸门
    每轮都 SKIP（等于从没真跑过）。这些都能从 timing.json、out/、out/verify-log.jsonl、
    git 里数出来，不许人回忆、不许编。
  * 判断区只有三个问题 —— 最贵的返工、最后才发现的错、下一部先改哪。答不出来就空着，
    空着比编一句漂亮话有用。
  * 追加一行账本 —— 往工具仓库的 docs/错误清单.md 追加一行（append-only），跨片可查。

用法：
    scripts-win\\retro.cmd -Project .              # 在片子工程里跑，写 ./复盘.md
    scripts-win\\retro.cmd -Project ..\\my-video    # 指定工程
    python scripts-win\\retro.py -Project . --no-ledger   # 只生成文档、不动账本
    python scripts-win\\retro.py -Project . --stdout      # 打到控制台不落盘

退出码：0 正常；2 找不到 timing.json 或参数不对。
"""

from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
from collections import Counter
from datetime import datetime
from pathlib import Path

if sys.platform == "win32":
    for _s in (sys.stdout, sys.stderr):
        try:
            _s.reconfigure(encoding="utf-8")
        except Exception:  # noqa: BLE001
            pass

HERE = Path(__file__).resolve().parent
TOOL_REPO = HERE.parent
IMG_EXT = {".png", ".jpg", ".jpeg", ".webp", ".gif"}
# 样板间 / 试验 / 定帧 / 复现产物不算成片，与 verify.ps1 的排除口径保持一致
JUNK_MP4 = re.compile(r"^(effects|lab-|det-|repro)|-check")
# 提交信息里自陈的返工标记（「补 check_motion 的六类漏判」「修假绿」这类）
REWORK_WORDS = ("修", "补", "漏判", "假绿", "放绿", "误判", "必红", "假红")


def human_size(n: float) -> str:
    """十进制（1 MB = 1,000,000 B）：和 ffprobe 的码率、README 里的体积口径一致。
    别用 1024 进制的 MiB——同一个 40,792,508 B 写成 38.9「MB」，人会以为文件缩水了。"""
    return f"{n / 1_000_000:.1f} MB" if n >= 1_000_000 else f"{n / 1000:.0f} KB"


def read_json(path: Path):
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:  # noqa: BLE001
        return None


# ---------------- 片子事实 ----------------


def film_facts(root: Path) -> dict:
    t = read_json(root / "timing.json") or {}
    scenes = t.get("scenes") or []
    fps = t.get("fps") or 30
    dur = t.get("duration")
    kinds = Counter((s.get("kind") or "?").strip() for s in scenes)
    voice = t.get("voiceLines") or []
    audio = t.get("audio") or {}
    shots = 0
    for s in scenes:
        if (s.get("kind") or "") == "montage":
            shots = max(shots, len(s.get("shots") or []))
    return {
        "duration": dur,
        "fps": fps,
        "frames": int(round(dur * fps)) if isinstance(dur, (int, float)) else None,
        "width": t.get("width"),
        "height": t.get("height"),
        "scenes": len(scenes),
        "kinds": kinds,
        "voice": len(voice),
        "sfx": len(audio.get("sfx") or []),
        "bgm": audio.get("bgm") or "",
        "montage": shots,
        "shot_count": sum(len(s.get("shots") or []) for s in scenes),
    }


def asset_facts(root: Path) -> dict:
    pub = root / "public"
    if not pub.is_dir():
        return {"images": 0, "has_public": False, "bgm": None}
    imgs = [p for p in pub.rglob("*") if p.suffix.lower() in IMG_EXT and "offline" not in p.parts]
    bgm = next((p for p in pub.glob("bgm.*") if p.suffix.lower() in {".wav", ".mp3", ".m4a", ".ogg"}), None)
    off = list((pub / "offline").rglob("*.png")) if (pub / "offline").is_dir() else []
    return {
        "images": len(imgs),
        "has_public": True,
        "bgm": bgm,
        "offline_frames": len(off),
        "small": sum(1 for p in imgs if _img_width(p) and _img_width(p) < 1280),
    }


def _img_width(p: Path):
    try:
        from PIL import Image  # 装不装都行：装了就顺手量一下，没装跳过

        with Image.open(p) as im:
            return im.size[0]
    except Exception:  # noqa: BLE001
        return None


def video_facts(root: Path) -> list[dict]:
    """out/ 下的成片草稿 + 工程根目录的交付件（中文名，交付时才拷出去的）。"""
    out: list[dict] = []
    try:
        sys.path.insert(0, str(HERE))
        import check_video  # 复用同一份 box 解析，别再写一遍
    except Exception:  # noqa: BLE001
        check_video = None
    picked: list[tuple[Path, str]] = []
    outdir = root / "out"
    if outdir.is_dir():
        picked += [(p, "成片") for p in sorted(outdir.glob("*.mp4"))]
    picked += [(p, "交付件") for p in sorted(root.glob("*.mp4"))]
    for p, kind in picked:
        if JUNK_MP4.search(p.name):
            continue
        size = p.stat().st_size
        dur = dims = None
        if check_video:
            try:
                buf = p.read_bytes()
                dur = check_video.read_duration(buf)
                dims = check_video.read_size(buf)
            except Exception:  # noqa: BLE001
                pass
        out.append(
            {
                "name": p.name,
                "kind": kind,
                "size": size,
                "duration": dur,
                "dims": dims,
                "bitrate": (size * 8 / dur / 1_000_000) if dur else None,
            }
        )
    return out


def still_facts(root: Path) -> dict:
    d = root / "out" / "stills"
    n = len(list(d.rglob("*.png"))) if d.is_dir() else 0
    return {"stills": n, "sheet": (root / "out" / "sheet.jpg").exists()}


# ---------------- 闸门历史 ----------------


def gate_facts(root: Path) -> dict:
    p = root / "out" / "verify-log.jsonl"
    runs: list[dict] = []
    if p.is_file():
        for line in p.read_text(encoding="utf-8", errors="replace").splitlines():
            line = line.strip()
            if not line:
                continue
            try:
                e = json.loads(line)
            except Exception:  # noqa: BLE001
                continue
            if isinstance(e.get("gates"), dict):  # 单元素数组被 ConvertTo-Json 降级成对象
                e["gates"] = [e["gates"]]
            runs.append(e)
    # PS 5.1 的 ConvertTo-Json 会把中文写成 \uXXXX，json.loads 已经还原，这里只用不写
    red = Counter()
    skips: dict[str, str] = {}
    names: list[str] = []
    for r in runs:
        for g in r.get("gates") or []:
            n, s = g.get("name", ""), g.get("status", "")
            if n and n not in names:
                names.append(n)
            if s == "ERROR":
                red[n] += 1
            if s == "SKIP" and n not in skips:
                # SKIP 的原因里常带括注（「没有 HTML 样帧可探（用 -Html 指定）」），
                # 嵌进本文件的括号里会变成双层，砍掉括注只留主干
                d = " ".join(str(g.get("detail") or "").split()).split("（")[0].strip(" ，。;")
                skips[n] = d[:40]
    # 「从没真跑过」= 每一轮里都是 SKIP；只要有一轮真跑了就不算
    never = sorted(
        n for n in names
        if all(g.get("status") == "SKIP" for r in runs for g in (r.get("gates") or []) if g.get("name") == n)
    )
    return {"runs": runs, "red": red, "skips": skips, "never": never, "names": names, "path": p}


# ---------------- 施工（git） ----------------


def git_facts(root: Path) -> dict | None:
    gitroot = None
    for p in [root, *root.parents]:
        if (p / ".git").exists():
            gitroot = p
            break
    if not gitroot:
        return None
    try:
        rel = root.relative_to(gitroot).as_posix()
    except ValueError:
        return None
    patharg = "." if rel == "." else rel

    def run(*a):
        try:
            r = subprocess.run(
                ["git", "-C", str(gitroot), *a],
                capture_output=True, text=True, encoding="utf-8", errors="replace", timeout=30,
            )
            return r.stdout if r.returncode == 0 else ""
        except Exception:  # noqa: BLE001
            return ""

    dates = [x for x in run("log", "--format=%cI", "--", patharg).split() if x]
    subs = [x for x in run("log", "--format=%s", "--", patharg).splitlines() if x]
    return {
        "commits": len(dates),
        "first": dates[-1][:10] if dates else "",
        "last": dates[0][:10] if dates else "",
        "rework": sum(1 for s in subs if any(w in s for w in REWORK_WORDS)),
        "repo": gitroot.name,
    }


# ---------------- 渲染 ----------------


def build_md(root: Path) -> tuple[str, dict]:
    f = film_facts(root)
    a = asset_facts(root)
    v = video_facts(root)
    st = still_facts(root)
    g = gate_facts(root)
    git = git_facts(root)
    now = datetime.now().strftime("%Y-%m-%d %H:%M")
    L: list[str] = []
    add = L.append

    add(f"# 复盘：{root.name}")
    add("")
    add(f"> 生成：{now} · `scripts-win\\retro.cmd -Project .`")
    add("> 事实区由脚本从 `timing.json`、`out/`、`out/verify-log.jsonl`、git 里数出来；判断区只有三个问题，答不出来就空着。")
    add("")

    # 一、片子
    add("## 一、片子")
    add("")
    add("| 项 | 值 |")
    add("|---|---|")
    if f["duration"]:
        add(f"| 片长 | {f['duration']:.2f} s（{f['frames']} 帧 @{f['fps']}fps） |")
    if f["width"] and f["height"]:
        add(f"| 画布 | {f['width']}×{f['height']} |")
    add(f"| 场景 | {f['scenes']} 个" + (
        "：" + "、".join(f"{k} {n}" for k, n in f["kinds"].most_common()) if f["kinds"] else "" ) + " |")
    add(f"| 旁白 / 音效 | {f['voice']} 句 / {f['sfx']} 个 |")
    if f["montage"]:
        add(f"| 作品快切 | 最大一段 {f['montage']} 张（全片共 {f['shot_count']} 张） |")
    add(f"| 素材 | public/ 下 {a['images']} 张图" + (
        f"，其中 {a['small']} 张宽 <1280" if a.get("small") else "" ) + (
        f"；离线序列 {a['offline_frames']} 帧" if a.get("offline_frames") else "") + " |")
    add(f"| 配乐 | {'有：' + a['bgm'].name if a.get('bgm') else '无'} |")
    add(f"| 静帧 | out/stills 里 {st['stills']} 张" + ("，out/sheet.jpg 有" if st["sheet"] else "") + " |")
    for x in v:
        bits = [x["name"], human_size(x["size"])]
        if x["duration"]:
            bits.append(f"{x['duration']:.2f}s")
        if x["bitrate"]:
            bits.append(f"{x['bitrate']:.1f} Mbps")
        if x["dims"]:
            bits.append(f"{x['dims'][0]}×{x['dims'][1]}")
        add(f"| {x['kind']} | " + " / ".join(bits) + " |")
    add("")

    # 红线对账：四条红线里能数出来的部分，别让人靠记忆判断
    add("### 红线对账（能数出来的部分）")
    add("")
    add("| 红线 | 要求 | 实际 | 判定 |")
    add("|---|---|---|---|")
    if f["duration"]:
        ok = 45 <= f["duration"] <= 60
        add(f"| 1 片长 | 45~60 s | {f['duration']:.2f} s | {'✓' if ok else '✗ 不在区间'} |")
    ok = a["images"] >= 8
    add(f"| 3 真实素材 | 全片 ≥8 张 | public/ 下 {a['images']} 张图 | {'✓' if ok else '✗ 不够（含装饰图也算，实际更少）'} |")
    if st["stills"]:
        need = f["scenes"] * 2
        ok = st["stills"] >= need
        add(f"| 1 审图 | 每场景 ≥2 帧 | {st['stills']} 张 / {f['scenes']} 场景（≥{need}） | {'✓' if ok else '✗ 有场景没截'} |")
    else:
        add("| 1 审图 | 每场景 ≥2 帧 | out/stills 是空的 | ✗ 没截图 |")
    if f["montage"]:
        ok = f["montage"] >= 8
        add(f"| 3 快切 | 某段 ≥8 张真实作品 | 最大一段 {f['montage']} 张 | {'✓' if ok else '✗ 不够'} |")
    else:
        add("| 3 快切 | 某段 ≥8 张真实作品 | 没有 montage 段 | — 用不上 |")
    add("")

    # 二、施工
    add("## 二、施工")
    add("")
    if git:
        add(f"- 提交：{git['commits']} 条（{git['first']} → {git['last']}），"
            f"其中自述返工（修/补/漏判/假绿…）{git['rework']} 条")
    else:
        add("- 提交：这个工程不在 git 里，跳过了施工统计")
    if g["runs"]:
        first, last = g["runs"][0], g["runs"][-1]
        add(f"- `verify` 跑了 **{len(g['runs'])}** 轮：首轮 "
            f"{first.get('pass', '?')} 通过 / {first.get('warn', '?')} 警告 / "
            f"{first.get('fail', '?')} 失败 / {first.get('skip', '?')} 跳过；"
            f"末轮 {last.get('pass', '?')} 通过 / {last.get('warn', '?')} 警告 / "
            f"{last.get('fail', '?')} 失败 / {last.get('skip', '?')} 跳过")
        if g["red"]:
            add("- 红过的闸门：" + "、".join(f"{n}×{c}" for n, c in g["red"].most_common()))
        else:
            add("- 红过的闸门：无（每轮全绿或全 SKIP）")
        if g["never"]:
            items = [f"{n}（{g['skips'][n]}）" if g["skips"].get(n) else n for n in g["never"]]
            add("- **从没真跑过的闸门**：" + "、".join(items) +
                " —— SKIP 不等于通过：这几道一次都没真跑过，它们本该拦的问题这个项目没人拦")
        else:
            add("- 从没真跑过的闸门：无（每一道至少真跑过一次）")
        if len(g["names"]) < 10:
            add(f"- 日志里只有 {len(g['names'])} 道闸门（当前清单 10 道，`-Self` 时 11 道）—— 这个工程的 verify 可能偏旧")
        add("")
        add("| 轮次 | 时间 | 通过 | 警告 | 失败 | 跳过 | 红的闸门 |")
        add("|---|---|---|---|---|---|---|")
        for i, r in enumerate(g["runs"][-8:], start=max(1, len(g["runs"]) - 7)):
            reds = "、".join(x.get("name", "") for x in (r.get("gates") or []) if x.get("status") == "ERROR") or "—"
            ts = str(r.get("ts", ""))[:16].replace("T", " ")
            add(f"| {i} | {ts} | {r.get('pass', '')} | {r.get('warn', '')} | "
                f"{r.get('fail', '')} | {r.get('skip', '')} | {reds} |")
        if len(g["runs"]) > 8:
            add("")
            add(f"（只列最近 8 轮，全量在 `out/verify-log.jsonl`，共 {len(g['runs'])} 行）")
    else:
        add("- `verify` 历史：没找到 `out/verify-log.jsonl`"
            "（verify 默认会写；这个工程还没跑过，或用过 `-NoLog`）")
    add("")

    # 三、三个问题
    add("## 三、只有人知道的")
    add("")
    add("1. **最贵的一次返工是什么？**（哪个闸门没拦住，或哪条规范没说清）")
    add("   - ")
    add("2. **最后才发现错的是哪一帧、哪句话？**")
    add("   - ")
    add("3. **下一部片开工前先改哪一处？**（改闸门、改规范、还是改素材流程）")
    add("   - ")
    add("")
    add("## 四、账本")
    add("")
    add("三问答完，把「根因 / 已加的闸门」补到 `docs/错误清单.md` 对应那一行；本文件只增不改。")
    add("")

    facts = {"project": root.name, "duration": f["duration"], "runs": len(g["runs"]),
             "never": g["never"], "red": dict(g["red"]), "first": g["runs"][0] if g["runs"] else None}
    return "\n".join(L) + "\n", facts


def append_ledger(facts: dict) -> str:
    ledger = TOOL_REPO / "docs" / "错误清单.md"
    day = datetime.now().strftime("%Y-%m-%d")
    proj = facts["project"]
    head = f"- **{day}** `{proj}`"
    if ledger.is_file() and head in ledger.read_text(encoding="utf-8", errors="replace"):
        return "账本已有今天这条，跳过"
    if not ledger.is_file():
        ledger.parent.mkdir(parents=True, exist_ok=True)
        header = (
            "# 错误清单（append-only）\n\n"
            "每次交付后由 `scripts-win\\retro.cmd` 追加一行；「根因」「已加的闸门」由人答完三问再补。\n"
            "只增不改——这条文件的价值在于「同一个坑第二次出现时能被看见」。\n\n"
        )
        # newline="\n"：文本模式默认会把 \n 换成本机 os.linesep，账本进 git 后满屏 CRLF 噪音
        with ledger.open("w", encoding="utf-8", newline="\n") as fh:
            fh.write(header)
    f = facts["first"] or {}
    bits = []
    if facts.get("duration"):
        bits.append(f"{facts['duration']:.1f}s")
    bits.append(f"verify {facts['runs']} 轮")
    if facts["runs"]:
        bits.append(f"首轮 {f.get('pass', '?')}通过/{f.get('warn', '?')}警告/"
                    f"{f.get('fail', '?')}失败/{f.get('skip', '?')}跳过")
    if facts["red"]:
        bits.append("红过：" + "、".join(facts["red"]))
    if facts["never"]:
        bits.append("从没真跑过：" + "、".join(facts["never"]))
    line = f"{head}：{' · '.join(bits)}　→ 根因：待填；已加的闸门：待填\n"
    with ledger.open("a", encoding="utf-8", newline="\n") as fh:
        fh.write(line)
    return f"账本追加一行：{ledger}"


def main() -> int:
    ap = argparse.ArgumentParser(description="交付后复盘：自动填事实，人只答三个问题")
    ap.add_argument("-Project", "--project", default=".", help="片子工程目录（默认当前目录）")
    ap.add_argument("--out", default="复盘.md", help="输出文件名（默认 复盘.md，写进工程根）")
    ap.add_argument("--no-ledger", action="store_true", help="不往 docs/错误清单.md 追加")
    ap.add_argument("--stdout", action="store_true", help="只打到控制台，不落盘")
    args = ap.parse_args()

    root = Path(args.project).resolve()
    if not root.is_dir():
        print(f"[ERROR] 找不到目录：{root}")
        return 2
    if not (root / "timing.json").is_file():
        print(f"[ERROR] 这不是片子工程：{root} 下没有 timing.json")
        return 2

    md, facts = build_md(root)
    if args.stdout:
        print(md)
        return 0

    out = root / args.out
    out.write_text(md, encoding="utf-8", newline="\n")
    print(f"复盘：{out}")
    print(f"  verify 历史 {facts['runs']} 轮" + (f"，从没真跑过：{'、'.join(facts['never'])}" if facts["never"] else ""))
    if not args.no_ledger:
        print("  " + append_ledger(facts))
    print("  下一步：把第三节三个问题各写一句话（空着比编一句漂亮话有用）。")
    return 0


if __name__ == "__main__":
    sys.exit(main())
