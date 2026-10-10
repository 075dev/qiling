# Vendored 第三方组件许可

本目录与 `ui/src/` 下的 vendored 文件随器灵插件分发,均MIT 许可,不改源码只做改名/打包。

| 文件 | 组件 | 版本 | 来源 | 许可 |
|------|------|------|------|------|
| `mcp/vendor/js-yaml.min.cjs` | js-yaml | 4.1.0 | https://github.com/nodeca/js-yaml(dist/js-yaml.min.js 改名 .cjs 供 Node ESM require) | MIT |
| `ui/src/mermaid.min.js` | mermaid | 11.12.0 | https://github.com/mermaid-js/mermaid(dist/mermaid.min.js,IIFE 全量包,自带 `globalThis.mermaid` 导出) | MIT |

用途:

- js-yaml:MCP 服务端(`mcp/server.mjs`)解析项目 `.qiling/planning/context/openapi.yaml`。
- mermaid:面板页面(`ui/panel.html`,构建产物)在宿主内渲染事件流程图。

更新方式:从上游发布产物替换对应文件,核对版本与本表一致;禁止引入其他运行时依赖。
