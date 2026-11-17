#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""check_publish.py —— 发布物料体检：三平台标题 / 简介 / tag 与片子、封面是不是同一份事实。

为什么单独有这一道：
    片子渲完、闸门全绿，最后一步是「发出去」。而这步最容易出错的不是画面，
    是文案：标题超字数被平台截断、tag 数量不够、简介里写着上一版的时长、
    封面拿错比例（B站 16:9 的图传成 9:16，两边留黑边）、仓库地址写错一个字母。
    verify 的十一道闸门一条都查不到这些——它们只管片子里的事。

    所以把发布物料也变成可校验的「唯一真相」：`publish.json` 存三套文案，
    `发布物料.md` 由它生成（给人复制粘贴）。检查器读 json，
    和 `timing.json` / 封面 PNG / 成片 mp4 对账，错一个字就 ERROR。

它查六组：

    A 结构       三个平台都在、必填字段非空、没有多余平台
    B 平台限制   标题字数、tag 数量、封面与视频的比例是否符合该平台
    C 事实一致   文案里的秒数 / 帧数 / 闸门数 / BPM 与 timing.json 对得上
    D 文件到位   视频与封面真实存在（项目根优先，其次 out/），且尺寸量得出来
    E 地址一致   文案里出现的 github 地址必须就是 publish.json 的 repo
    F 发布回填   写了 published 就核对：链接像不像该平台、时刻是不是带时区的 ISO

用法：
    python scripts-win/check_publish.py -Project examples/self-promo
    python scripts-win/check_publish.py -Project . --write    # 重新生成 发布物料.md
    python scripts-win/check_publish.py -Project template     # 空模板：只报结构

退出码：有 ERROR 就是 1，只有 WARN 是 0。
"""
from __future__ import annotations

import argparse
import json
import re
import struct
import sys
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8")

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent

# 平台参数：标题字数上限、tag 数量区间、视频/封面的期望比例（宽/高）
# 数字来自各平台 2026-11 的上传页限制，改之前先看一眼页面上写的上限。
SPEC = {
    "bilibili": dict(
        name="B站", title_max=80, tags=(3, 10), video_ratio=16 / 9,
        cover_ratio=(16 / 9,), hashtag=False,
        # 发出去之后回填 published.url 时要对得上的域名（b23.tv 是短链）
        url_domains=("bilibili.com", "b23.tv"),
    ),
    "douyin": dict(
        name="抖音", title_max=55, tags=(3, 5), video_ratio=9 / 16,
        cover_ratio=(9 / 16,), hashtag=True,
        url_domains=("douyin.com", "iesdouyin.com"),
    ),
    "xiaohongshu": dict(
        name="小红书", title_max=20, tags=(5, 10), video_ratio=9 / 16,
        # 小红书首图常规是 3:4，竖屏 9:16 也吃
        cover_ratio=(3 / 4, 9 / 16), hashtag=True,
        url_domains=("xiaohongshu.com", "xhslink.com"),
    ),
}

# 文案里能用的派生数字，渲染时换成真值（与 onscreen 的 token 同一套思路）
TOKENS = ("@duration", "@frames", "@fps", "@gates", "@scenes", "@bpm")

# 比例容差：裁切/编码会让实际尺寸差几个像素
RATIO_TOL = 0.02

# 发布时刻的形态：带时区的 ISO 8601（2026-01-01T12:00:00+08:00）。
# 不带时区的时间戳换台机器就对不上账，所以这里要求写死偏移。
ISO_AT = re.compile(r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:[+-]\d{2}:\d{2}|Z)$")


class Report:
    def __init__(self) -> None:
        self.items: list[tuple[str, str]] = []

    def error(self, msg: str) -> None:
        self.items.append(("ERROR", msg))

    def warn(self, msg: str) -> None:
        self.items.append(("WARN", msg))

    def count(self, sev: str) -> int:
        return sum(1 for s, _ in self.items if s == sev)

    def dump(self) -> None:
        for sev in ("ERROR", "WARN"):
            for s, m in self.items:
                if s == sev:
                    print(f"  [{sev}] {m}")


def png_size(path: Path) -> tuple[int, int] | None:
    """读 PNG 的 IHDR 拿宽高，不装 Pillow。"""
    try:
        with path.open("rb") as f:
            head = f.read(24)
    except OSError:
        return None
    if len(head) < 24 or head[:8] != b"\x89PNG\r\n\x1a\n" or head[12:16] != b"IHDR":
        return None
    w, h = struct.unpack(">II", head[16:24])
    return w, h


def mp4_size(path: Path) -> tuple[int, int] | None:
    """扫 mp4 的 tkhd 拿视频轨道宽高（fixed 16.16），不装 ffprobe。"""
    try:
        data = path.read_bytes()
    except OSError:
        return None
    i = data.find(b"tkhd")
    while i != -1:
        base = i + 4          # tkhd 类型字段之后就是 version/flags
        if base + 4 <= len(data):
            ver = data[base]
            # version 0: 4+4+4+4+4+8+2+2+2+2+36 = 76 字节后是 width
            # version 1: creation/modification/duration 各多 4 字节 = 88
            off = base + (92 if ver == 1 else 80) - 4
            if off + 8 <= len(data):
                w = struct.unpack(">I", data[off:off + 4])[0] >> 16
                h = struct.unpack(">I", data[off + 4:off + 8])[0] >> 16
                if w and h:
                    return w, h
        i = data.find(b"tkhd", i + 4)
    return None


def load_timing(proj: Path) -> dict:
    """只取发布文案会用到的几个真值。"""
    p = proj / "timing.json"
    if not p.exists():
        return {}
    raw = json.loads(p.read_text(encoding="utf-8"))
    return {
        "duration": float(raw.get("duration", 0)),
        "fps": int(raw.get("fps", 0)),
        "scenes": len(raw.get("scenes", [])),
        "gates": int((raw.get("facts") or {}).get("gates", 0)),
        "bpm": int((raw.get("beats") or {}).get("bpm", 0)),
    }


def facts_map(f: dict) -> dict[str, str]:
    return {
        "@duration": f"{f['duration']:.1f}".rstrip("0").rstrip("."),
        "@frames": str(int(round(f["duration"] * f["fps"]))),
        "@fps": str(f["fps"]),
        "@gates": str(f["gates"]),
        "@scenes": str(f["scenes"]),
        "@bpm": str(f["bpm"]),
    }


def fill(text: str, tok: dict[str, str], rep: Report, where: str) -> str:
    for k, v in tok.items():
        text = text.replace(k, v)
    left = re.findall(r"@[a-z]+", text)
    if left:
        rep.error(f"{where} 里有解析不了的 token：{'、'.join(sorted(set(left)))}")
    return text


def clean(text: str) -> str:
    """标题字数按去掉 markdown 强调符后的可见字符算。"""
    return text.replace("**", "").strip()


def check_facts(proj: Path, items: list[tuple[str, str]], rep: Report) -> None:
    """文案里写死的数字必须跟 timing.json 一样——这是「不许编」的落地。"""
    f = load_timing(proj)
    if not f:
        rep.warn("没有 timing.json，跳过事实对账")
        return
    dur, frames, gates, bpm, scenes = f["duration"], int(round(f["duration"] * f["fps"])), f["gates"], f["bpm"], f["scenes"]

    for where, text in items:
        for m in re.finditer(r"(\d+(?:\.\d+)?)\s*秒", text):
            d = float(m.group(1))
            ok = abs(d - dur) <= 0.6 or d in (float(int(dur)), float(round(dur)), float(-(-int(dur) // 1)))
            if not ok:
                rep.error(f"{where}：写着 {m.group(1)} 秒，timing.json 是 {dur} 秒")
        for m in re.finditer(r"(\d+)\s*帧", text):
            if int(m.group(1)) != frames:
                rep.error(f"{where}：写着 {m.group(1)} 帧，按 duration×fps 应是 {frames} 帧")
        for pat, label, truth in (
            (r"(\d+)\s*道闸门", "道闸门", gates),
            (r"(\d+)\s*个闸门", "个闸门", gates),
            (r"(\d+)\s*个场景", "个场景", scenes),
            (r"(\d+)\s*BPM", "BPM", bpm),
        ):
            for m in re.finditer(pat, text):
                if int(m.group(1)) != truth:
                    rep.error(f"{where}：写着 {m.group(1)} {label}，timing.json 是 {truth}")
    return None


def check_repo(texts: list[tuple[str, str]], repo: str, rep: Report) -> None:
    """地址写错一个字母，观众就找到别处去了。"""
    if not repo:
        rep.warn("publish.json 没写 repo，跳过地址检查")
        return
    want = repo.replace("https://", "").replace("http://", "").strip("/").lower()
    found = False
    for where, text in texts:
        for m in re.finditer(r"(?:https?://)?((?:[\w-]+\.)+[a-z]{2,}/[\w./-]+)", text, re.I):
            got = m.group(1).strip("/").lower()
            found = True
            if got != want and not got.startswith(want + "/"):
                rep.error(f"{where}：地址 {m.group(1)} 与 publish.json 的 repo（{want}）不一致")
    if not found:
        rep.warn(f"三个平台都没写仓库地址（期望出现 {want}）")


def render_md(pub: dict, proj: Path, facts: dict) -> str:
    tok = facts_map(facts) if facts else {}
    repo = pub.get("repo", "")
    out: list[str] = []
    out.append("# 发布物料（B站 / 抖音 / 小红书）")
    out.append("")
    out.append("> 这份文件由 `scripts-win\\check_publish.py -Project . --write` 从 `publish.json` 生成，**不要手改**：")
    out.append("> 改文案就改 `publish.json`，再跑一次；检查器对的是 json，不是这份 md。")
    out.append("")
    out.append("## 文件")
    out.append("")
    out.append("| 平台 | 视频 | 封面 | 实际规格 |")
    out.append("|---|---|---|---|")
    for pid in SPEC:
        item = (pub.get("platforms") or {}).get(pid) or {}
        vp, cp = find_file(proj, item.get("video", "")), find_file(proj, item.get("cover", ""))
        vs = mp4_size(vp) if vp else None
        cs = png_size(cp) if cp else None
        spec = []
        spec.append(f"视频 {vs[0]}×{vs[1]}" if vs else "视频 缺失")
        spec.append(f"封面 {cs[0]}×{cs[1]}" if cs else "封面 缺失")
        out.append(f"| {SPEC[pid]['name']} | `{item.get('video','—')}` | `{item.get('cover','—')}` | {' · '.join(spec)} |")
    out.append("")
    for pid in SPEC:
        spec = SPEC[pid]
        item = (pub.get("platforms") or {}).get(pid) or {}
        title = fill(clean(item.get("title", "")), tok, Report(), "标题")
        body = [fill(clean(x), tok, Report(), "正文") for x in (item.get("body") or [])]
        tags = [fill(clean(t), tok, Report(), "tag") for t in (item.get("tags") or [])]
        out.append(f"## {spec['name']}")
        out.append("")
        out.append(f"**标题**（{len(title)} 字 / 上限 {spec['title_max']}）")
        out.append("")
        out.append("```")
        out.append(title)
        out.append("```")
        out.append("")
        out.append("**简介**" if pid == "bilibili" else "**正文**")
        out.append("")
        out.append("```")
        for i, para in enumerate(body):
            if i:
                out.append("")
            out.append(para)
        out.append("```")
        out.append("")
        label = "话题" if spec["hashtag"] else "标签"
        out.append(f"**{label}**（{len(tags)} 个 / 上限 {spec['tags'][1]}）")
        out.append("")
        out.append("```")
        if spec["hashtag"]:
            out.append(" ".join("#" + t for t in tags))
        else:
            out.append("   ".join(tags))
        out.append("```")
        out.append("")
        if item.get("note"):
            out.append(f"**其他**：{fill(clean(item['note']), tok, Report(), '其他')}")
            out.append("")
    out.append("## 已发布")
    out.append("")
    rows = []
    for pid in SPEC:
        item = (pub.get("platforms") or {}).get(pid) or {}
        done = item.get("published")
        if isinstance(done, dict) and done.get("url"):
            # 链接、时刻、备注（合集名之类）都是个人数据：这个 md 会进公开仓库，
            # 所以只写「哪家平台已发布」，细节留在本机 publish.local.json，终端里打出来。
            rows.append(f"| {SPEC[pid]['name']} | 已发布 |")
    if rows:
        out.append("| 平台 | 状态 |")
        out.append("|---|---|")
        out.extend(rows)
        out.append("")
        out.append("> 链接、发布时刻、备注只存本机 `publish.local.json`（不进仓库）；"
                   "`check_publish.cmd` 会在终端把它们打出来。")
    else:
        out.append("还没发。发完在本机 `publish.local.json` 里补一段，再跑一次 `--write`：")
        out.append("")
        out.append("```json")
        out.append('{ "platforms": { "bilibili": { "published": {')
        out.append('    "url": "https://www.bilibili.com/video/BVxxxxxxxxxx/",')
        out.append('    "at": "2026-01-01T12:00:00+08:00",')
        out.append('    "note": "合集名 第 2 集" } } } }')
        out.append("```")
    out.append("")
    out.append("---")
    out.append("")
    out.append("## 发布前自检（由 publish.json 与 timing.json 自动对账）")
    out.append("")
    if facts:
        out.append(f"1. 数字对得上：{tok.get('@duration')} 秒 · {tok.get('@frames')} 帧 · {tok.get('@gates')} 道闸门 · {tok.get('@bpm')} BPM · {tok.get('@scenes')} 个场景（与 `timing.json` 同源）。")
    out.append(f"2. 三条视频/封面的文件名与上表一致，封面比例符合各平台要求（检查器已逐个量过像素）。")
    if repo:
        out.append(f"3. 地址三处统一：`{repo.replace('https://','')}`（片尾、B站简介、小红书正文同一串）。")
    out.append("")
    return "\n".join(out)


def merge_local(pub: dict, proj: Path) -> tuple[dict, dict]:
    """把本机的 publish.local.json 叠加到 publish.json 上，返回 (合并结果, 覆盖层)。

    为什么要分两个文件：链接、发布时刻、账号、播放数是个人数据，而这个仓库是公开的。
    publish.local.json 被 .gitignore 挡住（永远不进 git），检查器照旧能核对它。
    """
    path = proj / "publish.local.json"
    if not path.is_file():
        return pub, {}
    try:
        overlay = json.loads(path.read_text(encoding="utf-8-sig"))
    except json.JSONDecodeError as e:
        print(f"  [WARN] publish.local.json 不是合法 JSON，忽略：{e}")
        return pub, {}
    if not isinstance(overlay, dict):
        return pub, {}
    plats = dict(pub.get("platforms") or {})
    for pid, item in (overlay.get("platforms") or {}).items():
        if not isinstance(item, dict):
            continue
        if isinstance(plats.get(pid), dict):
            merged = dict(plats[pid])
            merged.update(item)
            plats[pid] = merged
        else:
            plats[pid] = item
    out = dict(pub)
    out["platforms"] = plats
    return out, overlay


def check_published(plat: dict, rep: Report) -> None:
    """F 发布回填：发出去之后在平台里补 published{url, at, note}，把「发了」变成可核对的字段。

    为什么要有：片子在平台上是真发出去了，还是只躺在本地 out/ 里，差别只有外部链接能证明。
    回填之后 发布物料.md 会多一节「已发布」，复盘时能直接对上平台、链接、发布时间，
    不用再翻聊天记录问「那天几点发的」。这一节是可选的：还没发就不写，不报错。
    """
    for pid, spec in SPEC.items():
        item = plat.get(pid)
        if not isinstance(item, dict):
            continue
        pub = item.get("published")
        if pub is None:
            continue
        name = spec["name"]
        if not isinstance(pub, dict):
            rep.error(f"{name}：published 要写成对象（url / at / note 三个键）")
            continue
        url = str(pub.get("url") or "").strip()
        at = str(pub.get("at") or "").strip()
        if not url:
            rep.error(f"{name}：published 缺 url")
        elif not url.startswith("https://"):
            rep.warn(f"{name}：published.url 不是 https 开头：{url}")
        elif not any(d in url.lower() for d in spec["url_domains"]):
            rep.error(f"{name}：published.url 不像该平台的链接（域名要含 "
                      f"{' / '.join(spec['url_domains'])}）：{url}")
        if not at:
            rep.error(f"{name}：published 缺 at（发布时刻，写成 2026-01-01T12:00:00+08:00）")
        elif not ISO_AT.match(at):
            rep.error(f"{name}：published.at 形态不对：{at}"
                      "（要 2026-01-01T12:00:00+08:00 这种带时区的 ISO 时刻，方便跨机器对账）")
        note = pub.get("note")
        if note is not None and not str(note).strip():
            rep.warn(f"{name}：published.note 是空串，删掉这个键比留空更清楚")


def find_file(proj: Path, name: str) -> Path | None:
    """视频/封面可能放在项目根（要上传的那份），也可能还在 out/。"""
    if not name:
        return None
    for cand in (proj / name, proj / "out" / name):
        if cand.exists():
            return cand
    return None


def check(proj: Path, pub: dict, rep: Report) -> None:
    plat = pub.get("platforms") or {}
    missing = [SPEC[p]["name"] for p in SPEC if p not in plat]
    if missing:
        rep.error("缺少平台：" + "、".join(missing))
    extra = [p for p in plat if p not in SPEC]
    if extra:
        rep.warn("多余的平台（检查器不认，可能是拼错了）：" + "、".join(extra))

    facts = load_timing(proj)
    tok = facts_map(facts) if facts else {}
    texts: list[tuple[str, str]] = []

    for pid, spec in SPEC.items():
        item = plat.get(pid)
        if not isinstance(item, dict):
            continue
        name = spec["name"]
        for key in ("video", "cover", "title", "body", "tags"):
            if not item.get(key):
                rep.error(f"{name}：缺 {key}")
        title = fill(clean(str(item.get("title", ""))), tok, rep, f"{name} 标题")
        if title:
            if len(title) > spec["title_max"]:
                rep.error(f"{name}：标题 {len(title)} 字，超过 {spec['title_max']} 字上限")
            elif len(title) < 6:
                rep.warn(f"{name}：标题只有 {len(title)} 字，信息量可能不够")
            texts.append((f"{name} 标题", title))

        body = item.get("body") or []
        if isinstance(body, str):
            body = [body]
        body = [fill(clean(str(x)), tok, rep, f"{name} 正文") for x in body]
        body_text = "\n".join(body)
        texts.append((f"{name} 正文", body_text))
        if len(body_text) < 40:
            rep.warn(f"{name}：正文只有 {len(body_text)} 字")

        tags = item.get("tags") or []
        lo, hi = spec["tags"]
        if len(tags) < lo:
            rep.error(f"{name}：tag 只有 {len(tags)} 个，该平台至少 {lo} 个")
        elif len(tags) > hi:
            rep.error(f"{name}：tag {len(tags)} 个，超过 {hi} 个上限")
        for t in tags:
            t = str(t)
            if t.startswith("#"):
                rep.warn(f"{name}：tag「{t}」不用带 #（生成 md 时会自动加）")
            if re.search(r"\s", t):
                rep.warn(f"{name}：tag「{t}」里有空格，平台会当成两个")
            if len(t) > 12:
                rep.warn(f"{name}：tag「{t}」偏长（{len(t)} 字），搜索时基本命不中")

        # 文件与比例
        vp, cp = find_file(proj, str(item.get("video", ""))), find_file(proj, str(item.get("cover", "")))
        if item.get("video"):
            if not vp:
                rep.error(f"{name}：找不到视频 {item['video']}（项目根和 out/ 都没有）")
            else:
                vs = mp4_size(vp)
                if not vs:
                    rep.warn(f"{name}：视频 {vp.name} 的宽高读不出来，比例没法核对")
                else:
                    r = vs[0] / vs[1]
                    if abs(r - spec["video_ratio"]) / spec["video_ratio"] > RATIO_TOL:
                        rep.error(f"{name}：视频 {vs[0]}×{vs[1]}，该平台期望 {ratio_name(spec['video_ratio'])}")
        if item.get("cover"):
            if not cp:
                rep.error(f"{name}：找不到封面 {item['cover']}")
            else:
                cs = png_size(cp)
                if not cs:
                    rep.warn(f"{name}：封面 {cp.name} 不是 PNG 或宽高读不出来")
                else:
                    r = cs[0] / cs[1]
                    if not any(abs(r - want) / want <= RATIO_TOL for want in spec["cover_ratio"]):
                        wanted = " 或 ".join(ratio_name(x) for x in spec["cover_ratio"])
                        rep.error(f"{name}：封面 {cs[0]}×{cs[1]}（{ratio_name(r)}），该平台要 {wanted}")

    check_facts(proj, texts, rep)
    check_repo(texts, str(pub.get("repo", "")), rep)
    check_published(plat, rep)


def pad(text: str, width: int = 8) -> str:
    """中文按两列算，控制台里才不会一个平台一行对齐、下一个平台歪一格。"""
    w = sum(2 if ord(c) > 127 else 1 for c in text)
    return text + " " * max(0, width - w)


def ratio_name(r: float) -> str:
    for w, h in ((16, 9), (9, 16), (3, 4), (4, 3), (1, 1), (4, 5), (2, 3), (3, 2)):
        if abs(r - w / h) / (w / h) <= 0.02:
            return f"{w}:{h}"
    return f"{r:.2f}:1"


def main() -> int:
    ap = argparse.ArgumentParser(description="发布物料体检（三平台标题/简介/tag 与片子对账）")
    ap.add_argument("-Project", "--project", default=".", help="项目目录（默认当前目录）")
    ap.add_argument("--write", action="store_true", help="按 publish.json 重新生成 发布物料.md")
    args = ap.parse_args()

    proj = Path(args.project).resolve()
    pub_path = proj / "publish.json"
    rep = Report()

    if not pub_path.exists():
        print(f"SKIP  没有 publish.json（{pub_path}）：还没有做发布包装")
        return 0

    try:
        pub = json.loads(pub_path.read_text(encoding="utf-8-sig"))
    except json.JSONDecodeError as e:
        print(f"[ERROR] publish.json 不是合法 JSON：{e}")
        return 1

    pub, overlay = merge_local(pub, proj)

    print(f"发布物料：{pub_path}")
    if overlay:
        print("  本机覆盖：publish.local.json（链接/时刻只在本机，不写进 发布物料.md）")
    check(proj, pub, rep)
    for pid, item in (pub.get("platforms") or {}).items():
        done = item.get("published") if isinstance(item, dict) else None
        if isinstance(done, dict) and done.get("url"):
            print(f"  已发布：{SPEC.get(pid, {}).get('name', pid)} {done.get('at') or '—'} {done['url']}")

    facts = load_timing(proj)
    md = render_md(pub, proj, facts)
    md_path = proj / "发布物料.md"
    if args.write:
        md_path.write_text(md, encoding="utf-8", newline="\n")
        print(f"  已生成 {md_path.name}（{len(md)} 字符）")
    elif md_path.exists():
        if md_path.read_text(encoding="utf-8").replace("\r\n", "\n").strip() != md.strip():
            rep.warn("发布物料.md 与 publish.json 不一致，跑一次 --write 重新生成")
    else:
        rep.warn("没有 发布物料.md，跑一次 --write 生成（给平台复制粘贴用的那份）")

    for pid, spec in SPEC.items():
        item = (pub.get("platforms") or {}).get(pid) or {}
        title = clean(str(item.get("title", "")))
        tags = item.get("tags") or []
        print(f"  {pad(spec['name'])} 标题 {len(title):>2}/{spec['title_max']} 字 · 标签 {len(tags):>2} 个"
              f" · 视频 {item.get('video', '—')}")

    rep.dump()
    print(f"{rep.count('ERROR')} ERROR / {rep.count('WARN')} WARN")
    return 1 if rep.count("ERROR") else 0


if __name__ == "__main__":
    raise SystemExit(main())
