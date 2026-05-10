# InfiniMind

![InfiniMind 画布](docs/screenshots/optimized/canvas-field.png)

InfiniMind 是一个本地优先的思维画布，用来把零散想法整理成可连接、可缩放、可分组的卡片场。它同时提供桌面端体验、嵌套 organization、可恢复回收站，以及本地 MCP Server，让 AI 客户端可以读取、整理并安全更新同一份工作区。

[English README](README.md)

## 亮点

- **以画布为中心**：把 card set 摆在可缩放的 field 上，连接线索，在总览和细节之间切换。
- **嵌套 organization**：把相关 card set 和子 organization 收进独立作用域，同时保留图结构。
- **多种卡片类型**：同一个 set 里可以混合文字、图片、链接、附件。
- **可恢复编辑**：card、set、organization 先进入 Trash，再执行永久删除。
- **本地桌面存储**：Electron 使用本地 SQLite 保存工作区状态，并管理导入图片。
- **MCP 控制面**：AI 客户端可以列出项目、搜索、校验、创建快照、dry-run 批量操作，并写入结构化更新。

## 截图

![项目列表](docs/screenshots/optimized/project-library.png)

![MCP 设置](docs/screenshots/optimized/mcp-settings.png)

## 快速开始

```sh
npm install
npm run dev
```

打开终端输出的 Vite 地址，通常是：

```text
http://127.0.0.1:5173/
```

运行桌面端：

```sh
npm run desktop
```

构建生产版本：

```sh
npm run build
```

## MCP 配置

InfiniMind 的本地 stdio MCP Server 入口是：

```text
<InfiniMind install path>/mcp/start.cjs
```

最简单的配置方式是在桌面端打开 **Settings -> MCP**，应用会根据当前安装路径生成 JSON 和 Codex TOML 片段。

也可以在命令行输出当前机器的配置：

```sh
npm run mcp:config
```

通用 MCP JSON 结构：

```json
{
  "mcpServers": {
    "infinimind": {
      "command": "<InfiniMind install path>/mcp/start.cjs"
    }
  }
}
```

Codex TOML 结构：

```toml
[mcp_servers.infinimind]
command = "<InfiniMind install path>/mcp/start.cjs"
```

本地开发 MCP：

```sh
npm run -s mcp
npm run mcp:inspect
```

## MCP 能力

Server 提供项目列表、项目导出、搜索、工作区校验、快照等读取工具；写入能力覆盖 project、set、card、connection、organization、图片导入、恢复流程，以及通过 `infinimind_apply_operations` 执行最多 50 步的批量操作。

安全模型：

- 读取工具不会修改数据。
- 写入工具保存前会自动创建 SQLite 快照。
- Trash 和删除操作需要 `confirm: true`。
- 永久删除需要 `confirmText: "DELETE"`。
- 批量操作支持先用 `dryRun: true` 预览结果。

## 常用脚本

```sh
npm run dev          # Vite 开发服务器
npm run build        # 生产构建
npm run desktop      # 构建并启动 Electron 桌面端
npm run mcp          # 通过 stdio 运行 MCP Server
npm run mcp:config   # 输出本机 MCP 配置片段
npm run mcp:inspect  # 检查 MCP Server
npm test             # 运行 node:test 测试
```

## 项目结构

```text
src/                  React 应用和画布 UI
src/lib/              工作区模型、归一化、校验辅助逻辑
electron/             桌面壳、本地 SQLite 状态、图片资源协议
mcp/                  MCP server、tools、resources、prompts、operations
tests/                工作区模型和 MCP 存储测试
assets/               应用图标资源
docs/screenshots/     README 截图素材
```

## 备注

如果希望 MCP Server 指向测试工作区，而不是默认 Electron 用户数据目录，可以设置：

```sh
INFINIMIND_USER_DATA_DIR=/path/to/user-data
```
