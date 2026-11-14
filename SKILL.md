---
name: promo-video-skill
version: 1.0
description: 做一支 45~60 秒产品宣传片（4K，Remotion + Windows 脚本）的完整工作流：需求问询 → 预调研 → 建工程 → 素材盘点 → 配乐/旁白 → 分镜 → 静帧审查 → 渲染 → 十一道闸门体检。当用户要求「做一支产品宣传片 / 宣传视频 / promo 视频 / 产品介绍短片 / 出一支 60 秒的片子」，或要复用、维护这套宣传片规范时使用。唯一常驻规范是同目录的 AGENTS.md；长文档按阶段读 references/，不要一次全读。
---

# 宣传片制作（promo-video-skill）

把「做一支产品宣传片」拆成 AI 能照着执行的规范、一套可跑的 Remotion 骨架、一排会 fail 的闸门。

**本文件只是入口。执行时以同目录的 `AGENTS.md` 为准**——十个阶段、四条红线、Windows 约定、命令清单都在那里，这里只写「先读什么」和最容易漏的三件事。

## 按需加载（别一次全读）

| 走到哪 | 读哪份 |
|---|---|
| 开工（必读常驻） | `AGENTS.md` |
| 阶段 1–2 问需求 | `references/需求问询.md` |
| 阶段 5–6 写分镜、定时长 | `references/节奏.md` |
| 阶段 4 找素材、截屏 | `references/素材.md` |
| 阶段 8–9 交付前自查 | `references/校验清单.md` |
| 卡在 Windows 环境上 | `docs/windows-踩坑记录.md` |

## 最容易跳过、也最贵的三件事

1. **阶段 2 必须停下来等人**：需求写成 `需求确认.md`，用户回「开始」才动工程。其余阶段不要因为「不确定好不好看」停工，做四个备选让人挑。
2. **没有审图就没有交付**：每场景截 35% / 85% 两帧拼成对比图逐条看（`npm run stills` → `npm run sheet`），别看代码想象画面。
3. **交付前跑 `scripts-win\verify.cmd <项目>`**：十一道闸门汇总成一张表，有 ERROR 就 exit 1。闸门全绿再交付，别靠肉眼。

## 位置与依赖

- 本文件所在目录即仓库根：脚本 `scripts-win/`、可复制工程 `template/`、按需文档 `references/`、样张 `examples/`。
- 环境体检：`scripts-win\doctor.cmd`（Node / npm / Python / Pillow / Chrome / git / 中文字体 / ffmpeg / 磁盘）。
- 新建项目：`scripts-win\new-project.cmd <项目名>`（复制 `template/`、装依赖，约 2 分钟）。
- 时间与文案的唯一真相是项目里的 `timing.json`，不要在组件里写死秒数或文字。
