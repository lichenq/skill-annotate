# skill-annotate

Cursor Annotate 式的页面标注技能：在**运行中的网页**上 hover 高亮、点选元素、填写修改意见，agent 读取结构化标注数据，精确定位源码并修改，刷新页面截图回证。

解决「怎么告诉 agent 我说的是页面上哪个元素」的定位问题——你指哪，它改哪。

## 安装

```bash
npx skills add lichenq/skill-annotate
```

兼容 OpenCode / Claude Code 等支持 [Agent Skills](https://agentskills.io) 规范的 harness。手动安装则把 `skills/annotate/` 目录拷入对应 skills 目录（如 `~/.config/opencode/skills/`、`~/.claude/skills/`、`~/.agents/skills/`）。

## 前置

agent 必须能控制浏览器（CDP 通道）。以 OpenCode 为例：

```bash
opencode mcp add chrome-devtools --global --command npx chrome-devtools-mcp@latest
```

需要的能力：`evaluate_script` / `click` / `fill` / `take_snapshot` / `take_screenshot`。

## 用法

对话中说「开启标注模式」或「annotate 这个页面」，流程为：

1. agent 向目标页面注入 `skills/annotate/scripts/annotate.js`（注入即开启）
2. 你在页面上操作：hover 看高亮预览 → 点击选中元素（再点取消）→ 右下角面板填注释 → 点「完成」
3. agent 读取 `window.__annotations__`（含 selector / outerHTML / 注释 / 关键样式）
4. 按 selector 在源码中定位并按注释意图修改，刷新页面截图回证

每条标注导出格式：

```json
{
  "n": 1,
  "note": "这个卡片阴影太重，改成 rounded-lg",
  "selector": "main > div:nth-child(1) > div:nth-child(2)",
  "text": "元素文本前 60 字",
  "rect": { "x": 0, "y": 0, "w": 280, "h": 96 },
  "outerHTML": "前 200 字",
  "styles": { "borderRadius": "16px", "boxShadow": "..." }
}
```

## 边界

- 不穿透 shadow DOM / iframe
- 无画框模式（点选已覆盖主要场景）
- selector 为 `nth-child` 链，页面 DOM 结构变动后需重新标注

## License

MIT
