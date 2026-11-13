# promo-video-skill

把「做一支产品宣传片」拆成 AI 能照着执行的规范，配一套可跑的 Remotion 骨架和会 fail 的校验闸门。

- **谁在执行**：DeepSeek（本机 agent）为主，Cursor / Claude Code 也能跑
- **跑在哪**：Windows 优先（PowerShell），Linux / macOS 兼容
- **现在到哪了**：v0 —— 只有调研和借鉴清单，代码还没开始写

## 为什么有这个项目

看了 [liyupi/ai-promo-video-maker](https://github.com/liyupi/ai-promo-video-maker)：它证明了「整条短片流程可以写成规范让 AI 执行」，但它是给 Cursor + 生图模型 + ElevenLabs 那套工具链写的——Windows 跑不通（脚本里全是 `python3`、`mkdir -p`、`bash -o pipefail`）、要生图、要配音、30KB 规范常驻上下文。

我想要的是同一套方法，在我自己的条件下能跑：没有生图、没有 ElevenLabs、Windows、上下文预算有限。

所以这个项目的定位是：**借它的结构，换它的手脚**。哪些借、怎么改、哪些不借，全部写在 [docs/借鉴清单.md](docs/借鉴清单.md)。

## 一句话原则

> 抄约束，不抄代码。规范里每一条都必须能用「截图 / 脚本输出 / 秒数」判定真假；不能判定的就不是规范，是许愿。

## 目录结构（规划）

```
AGENTS.md              常驻规范，压到 5KB 以内（对方是 30KB）
references/            按需加载的长文档，AI 只在对应阶段读
  需求问询.md           两轮提问清单 + 需求确认模板
  节奏.md               镜头时长底线 + 信息密度
  校验清单.md           自动闸门 / 审图 / 交付前三层
  素材.md               截图规格、版权边界、抓取方式
template/              可复制的 Remotion 工程（React 组件逐帧渲染）
scripts/               Windows 可跑的校验与工具脚本
demo/                  15 秒 3 场景的可跑示例（有它才算能用）
docs/                  给人看的：借鉴清单、踩坑记录
```

## 路线图

| 阶段 | 内容 | 完成标志 |
|---|---|---|
| P0 | 骨架：精简 AGENTS.md + 4 份 references + Windows 脚本 | 空项目能出一张 1920×1080 静帧 |
| P1 | Remotion 骨架 + 15 秒 demo（3 场景） | `npm run render` 出片 |
| P2 | effect kit：网格渐变底 / 颗粒+暗角 / 光扫 / 动态大字 / 等距卡片 / 数字滚动 | 6 个 `(frame, fps, opts) => style` 纯函数组件 |
| P3 | 校验闸门：assets / stills / sheet / video | 坏资产、压扁截图、缺字能自动报错 |
| P4 | 声音（可选） | 先做无旁白 + 大字版，TTS 后置 |

## 授权与致谢

- 本仓库自有代码 MIT。
- 借鉴自 ai-promo-video-maker（MIT）。抄了结构或代码片段的地方在 `docs/借鉴清单.md` 里标了出处；照抄代码需保留原版权声明。
- 不复制对方 `references/` 的原文，只吸收结构与判定标准，文字全部重写。对方的案例复盘和踩坑记录属于它的实战资产，抄不走。
- Remotion 只对 3 人以内公司免费；ElevenLabs 免费套餐产物不可商用。本项目的默认路线不依赖这两者的付费能力。
