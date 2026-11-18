import React from "react";
import { theme } from "./theme";

/**
 * 把 `**...**` 之间的字染成强调色。
 *
 * 为什么用这层标记，而不是在 JSON 里写结构化数组：
 * 文案主要在 timing.json 里手写，数组形式要写三倍长、还容易漏 accent 字段；
 * `**能执行**的规范。` 一眼就能看出重点在哪，改字也不容易改坏结构。
 *
 * 渲染上它只是把一个文本节点切成几段，**不额外包一层 div**，
 * 所以把硬编码文案改读 timing.json 时画面逐像素不变。
 */
export const Rich: React.FC<{ text: string; accent?: string }> = ({
  text,
  accent = theme.accent,
}) => (
  <>
    {text.split(/\*\*(.+?)\*\*/g).map((part, i) =>
      i % 2 === 1 ? (
        <span key={i} style={{ color: accent }}>{part}</span>
      ) : (
        <React.Fragment key={i}>{part}</React.Fragment>
      ),
    )}
  </>
);
