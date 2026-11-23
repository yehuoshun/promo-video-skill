#!/usr/bin/env python
"""检查分镜的 DeepSeek 质量合同：目的、主张、证据和失败回退。"""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

if sys.platform == "win32":
    sys.stdout.reconfigure(encoding="utf-8")
    sys.stderr.reconfigure(encoding="utf-8")

PURPOSES = {"hook", "problem", "solution", "proof", "emotion", "cta"}
URL_RE = re.compile(r"^https?://\S+$", re.I)
NUMBER_RE = re.compile(r"(?:\d+(?:\.\d+)?|\d+\s*[倍万亿%])")


def error(errors: list[str], tag: str, message: str) -> None:
    errors.append(f"[{tag}] {message}")


def check_scene(sc: object, index: int, errors: list[str], warns: list[str]) -> None:
    tag = f"scene[{index}]"
    if not isinstance(sc, dict):
        error(errors, tag, "不是对象")
        return
    tag = str(sc.get("id") or tag)
    for key in ("purpose", "claim", "evidence", "fallback"):
        if key not in sc:
            error(errors, tag, f"缺少质量合同字段 {key}")

    purpose = sc.get("purpose")
    if purpose not in PURPOSES:
        error(errors, tag, f"purpose={purpose!r} 不在 {sorted(PURPOSES)} 中")

    claim = sc.get("claim")
    if not isinstance(claim, str) or not claim.strip():
        error(errors, tag, "claim 必须是非空字符串")
    elif NUMBER_RE.search(claim) and not sc.get("evidence"):
        error(errors, tag, "claim 含数字或比例，但 evidence 为空；不能把未核实事实写进成片")

    evidence = sc.get("evidence")
    if not isinstance(evidence, list):
        error(errors, tag, "evidence 必须是数组")
        evidence = []
    for j, item in enumerate(evidence):
        if not isinstance(item, dict):
            error(errors, tag, f"evidence[{j}] 必须是对象，包含 path/source")
            continue
        path = item.get("path")
        if not isinstance(path, str) or not path.strip():
            error(errors, tag, f"evidence[{j}].path 不能为空")
        source = item.get("source")
        if source is not None and (not isinstance(source, str) or not URL_RE.match(source)):
            error(errors, tag, f"evidence[{j}].source 必须是 http(s) URL")

    if purpose == "proof":
        if not evidence:
            error(errors, tag, "purpose=proof 必须至少提供一条真实 evidence")
        for j, item in enumerate(evidence):
            if isinstance(item, dict) and not URL_RE.match(str(item.get("source", ""))):
                error(errors, tag, f"purpose=proof 的 evidence[{j}] 缺少可访问的 source URL")
    elif evidence and all(isinstance(item, dict) and not item.get("source") for item in evidence):
        warns.append(f"[{tag}] evidence 没有 source URL；若包含外部事实，建议补官方页或原帖")

    fallback = sc.get("fallback")
    if not isinstance(fallback, str) or not fallback.strip():
        error(errors, tag, "fallback 必须写清证据不可用时的处理")


def main() -> int:
    ap = argparse.ArgumentParser(description="检查 timing.json 的 DeepSeek 质量合同")
    ap.add_argument("file", nargs="?", default="timing.json")
    args = ap.parse_args()
    path = Path(args.file)
    if not path.exists():
        print(f"[ERROR] 文件不存在：{path}")
        return 2
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        print(f"[ERROR] JSON 读取失败：{exc}")
        return 2
    if not isinstance(data, dict):
        print("[ERROR] timing.json 顶层必须是对象")
        return 2

    contract = data.get("qualityContract")
    if contract is None:
        print(f"{path}：未启用 qualityContract，跳过 DeepSeek 质量合同")
        return 0
    if not isinstance(contract, dict) or contract.get("version") != 1:
        print("[ERROR] qualityContract.version 必须为 1")
        return 1

    errors: list[str] = []
    warns: list[str] = []
    scenes = data.get("scenes")
    if not isinstance(scenes, list) or not scenes:
        error(errors, "timing", "scenes 必须是非空数组")
    else:
        for index, scene in enumerate(scenes):
            check_scene(scene, index, errors, warns)

    print(f"{path}：{len(scenes) if isinstance(scenes, list) else 0} 个场景，DeepSeek qualityContract v1")
    if warns:
        print(f"\n[WARN] {len(warns)} 条")
        for item in warns:
            print(f"  - {item}")
    if errors:
        print(f"\n[ERROR] {len(errors)} 条")
        for item in errors:
            print(f"  - {item}")
    print(f"\n结果：{len(errors)} ERROR / {len(warns)} WARN")
    return 1 if errors else 0


if __name__ == "__main__":
    sys.exit(main())
