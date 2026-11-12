---
name: annotate
description: Use when 用户要在运行中的网页上点选元素并留注释来驱动 UI 修改（类似 Cursor 的 Annotate / Design Mode），提到标注模式、annotate、指哪改哪、在页面上圈出要改的地方，或需要把某个具体页面元素的修改意图精确定位到源码时。
---

# Page Annotate

## Overview

Cursor Annotate 式工作流：向目标页面注入 `scripts/annotate.js`，用户在页面上 hover 高亮、点选元素、填写修改意见，点「完成」后结构化数据落在 `window.__annotations__`，agent 据此定位源码、修改、刷新验证。

前置：chrome-devtools MCP（或任何具备 evaluate_script / click / fill / take_snapshot / take_screenshot 的 CDP 通道）。

## 工作流

1. **开启**：`evaluate_script` 传 `sourcePath: <本 skill 目录>/scripts/annotate.js`、`format: "script"` 注入目标页。注入即开启；重复注入幂等（自动恢复 UI）。注入完成值即状态对象 `{ ok, restored, url, uiPresent, selected }`——同回合即可确认注入成功，无需单独 verify 一轮。
2. **用户标注**：告知操作方式——hover 看高亮预览，点击选中（再点同一元素取消），右下角面板填注释，点「完成」。**等用户说「标好了」，不要轮询页面状态。**
3. **消费**：`evaluate_script` 执行 `"() => JSON.stringify(window.__annotate__.done())"`，一次调用完成导出+读取（`window.__annotations__` 是落底兜底）。导出后面板自动拆除，页面恢复可交互。
4. **修改**：按 selector / outerHTML 在源码中 grep 定位；`note` 是用户意图，注释未提到的属性不改（最小改动）。
5. **回证**：刷新页面 + `take_screenshot` 存档，向用户确认前后对比。

## 坑与边界

- 导出用 `__annotate__.done()` API，不要 CDP 点击「完成」按钮（dispatch 路径可能命中覆盖层）。
- `take_snapshot` 的 uid 包含标注 UI 自身：填注释找 `textbox "要改什么？..."`，点页面元素用页面元素的 uid。
- uid 每次重新生成：每次 click / fill 之后必须重新 `take_snapshot` 再取新 uid，旧 uid 必失效。
- selector 是 `nth-child` 链：页面 DOM 结构变动后会失效，需要重新标注。
- 页面刷新后脚本失效，需重新注入。
- 不穿透 shadow DOM / iframe；无画框模式。
- 自校验：items 的 tag/selector 不应含 `__annotate_ui` 字样（含则 overlay 被误选，数据不可信）。

## 标注数据结构

```json
{ "url": "...", "capturedAt": "...", "items": [{ "n": 1, "note": "用户意图", "tag": "div.card",
  "selector": "main > div:nth-child(1) > div:nth-child(2)", "text": "元素文本前 60 字",
  "rect": { "x": 0, "y": 0, "w": 0, "h": 0 }, "outerHTML": "前 200 字",
  "styles": { "borderRadius": "...", "boxShadow": "...", "...": "..." } }] }
```

## 验证方式（改动脚本后）

本地静态服务器起一个样例页，CDP 模拟用户：注入 → click 两处 → fill 注释 → `done()` → 断言条数、selector 正确、items 无 `__annotate_ui` 污染。模拟点击会被脚本 capture 拦截器接管，不会触发页面原生行为，测试安全。
