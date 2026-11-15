#!/usr/bin/env python
"""分镜时间表校验：结构、时长底线、版式重复、layout 注册、CTA 存在性。0 ERROR 才算过。

用法：
    python scripts-win/check_timing.py timing.json
    python scripts-win/check_timing.py timing.json --allow-duration
    python scripts-win/check_timing.py timing.json --root <工程根目录>
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

# Windows 控制台默认按本地编码输出，中文会乱，这里强制 UTF-8
if sys.platform == "win32":
    for _s in (sys.stdout, sys.stderr):
        try:
            _s.reconfigure(encoding="utf-8")
        except Exception:  # noqa: BLE001
            pass

EPS = 0.011

# 每个 kind 的最短时长（秒），见 references/节奏.md
MIN_DUR = {
    "hook": 1.3,
    "info": 2.0,
    "showcase": 1.3,
    "montage": 0.65,
    "cta": 3.0,
    "transition": 0.0,
}
MAX_DUR = {"transition": 0.6}

KINDS = set(MIN_DUR)

# 屏幕文案里的派生数字，与 template/src/lib/onscreen.ts 的 TOKENS 一一对应
TOKENS = {"@scenes", "@duration", "@frames", "@fps", "@gates"}
# 文案槽位，与 template/src/lib/timing.ts 的 OnscreenMap 一一对应
SLOTS = {"kicker", "lines", "sub", "overline", "title", "url", "caption", "tail", "stats", "stamp"}


def onscreen_texts(on) -> list[str]:
    """把 onscreen 摊平成「真的要出现在屏幕上的字符串」。

    兼容两种写法：
    - 旧格式 string[]：一段摘要，渲染器不读（只在本脚本里当行数启发式）
    - 新格式按槽位的对象：渲染器真读，stats 的 label / hint 也算屏幕上的字
    与 check_sync.py 里的同名函数保持一致。
    """
    if isinstance(on, list):
        return [x for x in on if isinstance(x, str)]
    if not isinstance(on, dict):
        return []
    out: list[str] = []
    for v in on.values():
        if isinstance(v, str):
            out.append(v)
        elif isinstance(v, list):
            for item in v:
                if isinstance(item, str):
                    out.append(item)
                elif isinstance(item, dict):
                    for k in ("label", "hint"):
                        if isinstance(item.get(k), str):
                            out.append(item[k])
    return [x for x in out if x and x.strip()]


def check_onscreen(on, tag: str, errors: list[str], warns: list[str]) -> None:
    """槽位名、@token、** 配对都得对——这些错了以前是渲染时才发现。"""
    if on is None or isinstance(on, list):
        return  # 旧格式放行，渲染器会给出迁移提示
    if not isinstance(on, dict):
        errors.append(f"[{tag}] onscreen 既不是数组也不是对象")
        return

    for k in on:
        if k not in SLOTS:
            errors.append(f"[{tag}] onscreen 里的槽位 '{k}' 不认识，可用：{sorted(SLOTS)}")

    for text in onscreen_texts(on):
        for tok in re.findall(r"@[a-z]+", text):
            if tok not in TOKENS:
                errors.append(f"[{tag}] 文案里的 {tok} 不是可用 token，可用：{sorted(TOKENS)}")
        if text.count("**") % 2:
            warns.append(f"[{tag}] 文案里的 ** 没配对（「{text[:16]}」），强调色会漏到句尾")

    for j, st in enumerate(on.get("stats") or []):
        if not isinstance(st, dict):
            errors.append(f"[{tag}] stats[{j}] 不是对象")
            continue
        for k in ("label", "value"):
            if k not in st:
                errors.append(f"[{tag}] stats[{j}] 缺少 {k}")
        v = st.get("value")
        if isinstance(v, str) and not v.startswith("@"):
            errors.append(f"[{tag}] stats[{j}].value='{v}' 只能是数字或 @token")


# ---- layout 注册表 ----
# timing.json 里把 layout 名写错一个字母，十一道闸门全绿，渲染出来却是一块红底
# 「layout="xxx" 没有对应组件」的 Missing 屏——这是最容易漏的一类错。
# 所以直接读 src/Root.tsx 的 LAYOUTS 键集合来对，而不是维护第二份手抄清单。
LAYOUTS_RE = re.compile(r"const\s+LAYOUTS\b[^=]*=\s*\{(.*?)\n\};", re.S)
IMPORT_RE = re.compile(r"import\s*\{([^}]*)\}\s*from\s*[\"'](\.[^\"']+)[\"']", re.S)


def load_layouts(root: Path) -> tuple[dict[str, str] | None, dict[str, str]]:
    """读 <root>/src/Root.tsx，返回 (layout→组件名, 组件名→组件源码)。

    找不到 Root.tsx（比如 examples/ 下的样例分镜）时返回 (None, {})，
    调用方据此跳过这一项，而不是误报。
    """
    root_file = root / "src" / "Root.tsx"
    if not root_file.exists():
        return None, {}
    try:
        text = root_file.read_text(encoding="utf-8")
    except OSError:
        return None, {}
    m = LAYOUTS_RE.search(text)
    if not m:
        return None, {}

    registered = {
        name: comp
        for name, comp in re.findall(r"[\"']([^\"']+)[\"']\s*:\s*([A-Za-z_$][\w$]*)", m.group(1))
    }

    # 组件名 → 源码：用来查「这个 layout 到底读不读某个槽位」
    sources: dict[str, str] = {}
    for names, rel in IMPORT_RE.findall(text):
        for raw in names.split(","):
            comp = raw.split(" as ")[-1].strip()
            if not comp:
                continue
            base = root / "src" / rel.lstrip("./")
            for cand in (base.with_suffix(".tsx"), base.with_suffix(".ts"), base / "index.tsx"):
                if cand.exists():
                    try:
                        sources[comp] = cand.read_text(encoding="utf-8")
                    except OSError:
                        pass
                    break
    return registered, sources


def check_layout(
    layout,
    on,
    tag: str,
    registered: dict[str, str] | None,
    sources: dict[str, str],
    errors: list[str],
    warns: list[str],
) -> None:
    """layout 得真注册过；onscreen 填了的槽位，这个 layout 得真读。"""
    if registered is None:
        return

    if layout not in registered:
        errors.append(
            f"[{tag}] layout='{layout}' 没在 src/Root.tsx 的 LAYOUTS 里注册，"
            f"渲染出来是一块红底 Missing 屏。可用：{sorted(registered)}"
        )
        return

    if not isinstance(on, dict):
        return
    comp = registered[layout]
    src = sources.get(comp)
    if not src:
        return
    for slot in on:
        if slot not in SLOTS:
            continue  # 槽位名不认识已由 check_onscreen 报 ERROR，别重复报
        if not re.search(rf"\b{re.escape(slot)}\b", src):
            warns.append(
                f"[{tag}] onscreen 填了 '{slot}'，但 layout '{layout}'（{comp}）里没引用这个槽位，"
                f"这段字永远不会出现在画面上"
            )


def main() -> int:
    ap = argparse.ArgumentParser(description="校验 timing.json")
    ap.add_argument("file", nargs="?", default="timing.json")
    ap.add_argument("--allow-duration", action="store_true", help="不检查总时长是否在 45~60 秒")
    ap.add_argument(
        "--root",
        default=None,
        help="工程根目录（含 src/Root.tsx），默认取 timing.json 所在目录",
    )
    args = ap.parse_args()

    path = Path(args.file)
    if not path.exists():
        print(f"[ERROR] 文件不存在：{path}", file=sys.stderr)
        return 2

    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as e:
        print(f"[ERROR] JSON 解析失败：{e}", file=sys.stderr)
        return 2

    errors: list[str] = []
    warns: list[str] = []
    root = Path(args.root) if args.root else path.resolve().parent
    registered, sources = load_layouts(root)

    for key in ("fps", "duration", "scenes"):
        if key not in data:
            errors.append(f"缺少顶层字段：{key}")
    if errors:
        for e in errors:
            print(f"[ERROR] {e}")
        return 1

    fps = data["fps"]
    duration = float(data["duration"])
    scenes = data.get("scenes") or []
    pace = data.get("pace") or {}
    hold = float(pace.get("holdShot", 1.3))

    if not isinstance(scenes, list) or not scenes:
        print("[ERROR] scenes 为空")
        return 1

    # ---- 结构 ----
    ids = set()
    prev_end = None
    for i, sc in enumerate(scenes):
        tag = sc.get("id") or f"#{i}"
        for key in ("id", "start", "end", "kind", "layout"):
            if key not in sc:
                errors.append(f"[{tag}] 缺少字段 {key}")
        if sc.get("id") in ids:
            errors.append(f"[{tag}] id 重复")
        ids.add(sc.get("id"))

        kind = sc.get("kind")
        if kind not in KINDS:
            errors.append(f"[{tag}] kind='{kind}' 不在 {sorted(KINDS)} 里")

        check_onscreen(sc.get("onscreen"), tag, errors, warns)
        check_layout(sc.get("layout"), sc.get("onscreen"), tag, registered, sources, errors, warns)
        n_on = len(onscreen_texts(sc.get("onscreen")))

        try:
            start, end = float(sc["start"]), float(sc["end"])
        except (KeyError, TypeError, ValueError):
            errors.append(f"[{tag}] start/end 不是数字")
            continue

        if end <= start:
            errors.append(f"[{tag}] end({end}) <= start({start})")
        d = end - start
        if kind in MIN_DUR and d + EPS < MIN_DUR[kind]:
            errors.append(f"[{tag}] {kind} 只有 {d:.2f}s，底线 {MIN_DUR[kind]}s")
        if kind == "info" and n_on >= 3 and d + EPS < 3.5:
            errors.append(f"[{tag}] info 有 {n_on} 行字却只有 {d:.2f}s，卡片底线 3.5s")
        if kind == "showcase" and d + EPS < hold:
            errors.append(f"[{tag}] showcase 只有 {d:.2f}s，低于 pace.holdShot={hold}")
        if kind in MAX_DUR and d > MAX_DUR[kind] + EPS:
            warns.append(f"[{tag}] {kind} 长 {d:.2f}s，建议 <= {MAX_DUR[kind]}s（转场是过门不是内容）")

        if prev_end is not None:
            gap = start - prev_end
            if gap > EPS:
                errors.append(f"[{tag}] 与上一个场景之间有 {gap:.2f}s 空白")
            elif gap < -EPS:
                errors.append(f"[{tag}] 与上一个场景重叠 {-gap:.2f}s")
        else:
            if abs(start) > EPS:
                errors.append(f"[{tag}] 首个场景 start={start}，应为 0")
        prev_end = end

        # 帧对齐
        for name, t in (("start", start), ("end", end)):
            frames = t * fps
            if abs(frames - round(frames)) > 0.02:
                warns.append(f"[{tag}] {name}={t}s 不落在整帧上（{frames:.3f} 帧）")

        # beats 必须在场景内部且递增
        beats = sc.get("beats") or []
        last = start
        for b in beats:
            try:
                b = float(b)
            except (TypeError, ValueError):
                errors.append(f"[{tag}] beats 里有非数字：{b!r}")
                continue
            if not (start - EPS <= b <= end + EPS):
                errors.append(f"[{tag}] beat {b}s 落在场景之外")
            if b < last - EPS:
                errors.append(f"[{tag}] beats 不是递增的")
            last = b

        # montage 里的每一张
        for j, shot in enumerate(sc.get("shots") or []):
            try:
                sd = float(shot)
            except (TypeError, ValueError):
                errors.append(f"[{tag}] shots[{j}] 不是数字")
                continue
            if sd + EPS < 0.65:
                errors.append(f"[{tag}] shots[{j}] 只有 {sd:.2f}s，快切底线 0.65s")
        if kind == "montage":
            n = len(sc.get("shots") or [])
            if n and n < 8:
                warns.append(f"[{tag}] 蒙太奇只有 {n} 张，作品快切建议 >= 8 张")

    # ---- 收尾 ----
    if prev_end is not None and abs(prev_end - duration) > 0.05:
        errors.append(f"场景总时长 {prev_end:.2f}s 与 duration {duration:.2f}s 不一致")

    # ---- 注册了却没人用的 layout ----
    if registered is not None:
        used = {sc.get("layout") for sc in scenes}
        for name in sorted(set(registered) - used):
            warns.append(f"src/Root.tsx 注册了 layout '{name}'，但 timing.json 里没有场景用它")

    # ---- 版式连用 ----
    run_layout, run_len = None, 0
    for sc in scenes:
        lay = sc.get("layout")
        if lay == run_layout:
            run_len += 1
            if run_len >= 3:
                warns.append(f"版式 '{lay}' 连续出现 {run_len} 次（上限 2 次），在 {sc.get('id')} 处")
        else:
            run_layout, run_len = lay, 1

    # ---- 开场密度 ----
    early = [sc for sc in scenes if float(sc.get("start", 0)) < 4.0]
    if len(early) > 2:
        errors.append(f"前 4 秒有 {len(early)} 个画面，上限 2 个")

    # ---- CTA ----
    ctas = [sc for sc in scenes if sc.get("kind") == "cta"]
    if not ctas:
        errors.append("没有 kind=cta 的场景，网址/行动号召无处出现")
    else:
        if float(ctas[-1]["start"]) < duration * 0.6:
            warns.append(f"最后一个 CTA 在 {ctas[-1]['start']}s 就结束了，片尾没有落点")
        if abs(float(ctas[-1]["end"]) - duration) > 0.5:
            warns.append("最后一个 CTA 不是片尾，确认这是有意为之")

    # ---- 总时长 ----
    if not args.allow_duration and not (45 - EPS <= duration <= 60 + EPS):
        warns.append(f"总时长 {duration:.1f}s 不在默认的 45~60 秒区间")

    # ---- 输出 ----
    print(f"{path}：{len(scenes)} 个场景，{duration:.1f}s @ {fps}fps\n")
    print(f"{'id':<16}{'kind':<11}{'layout':<18}{'start':>7}{'end':>8}{'时长':>7}")
    for sc in scenes:
        d = float(sc["end"]) - float(sc["start"])
        print(f"{sc.get('id', ''):<16}{sc.get('kind', ''):<11}{sc.get('layout', ''):<18}{float(sc['start']):>7.2f}{float(sc['end']):>8.2f}{d:>7.2f}")
    if registered is None:
        print(f"\n[跳过] 没找到 {root / 'src' / 'Root.tsx'}，layout 注册未校验")

    if warns:
        print(f"\n[WARN] {len(warns)} 条")
        for w in warns:
            print(f"  - {w}")
    if errors:
        print(f"\n[ERROR] {len(errors)} 条")
        for e in errors:
            print(f"  - {e}")
    print(f"\n结果：{len(errors)} ERROR / {len(warns)} WARN")
    return 1 if errors else 0


if __name__ == "__main__":
    sys.exit(main())
