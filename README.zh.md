# dsh-plugin-edit-regenerate

<p align="center">
  <a href="README.md"><b>English</b></a> · <b>简体中文</b>
</p>

在对话历史中**编辑用户输入**：点击用户气泡下的「✎ 编辑」修改内容，确认「确定修订」后，系统删除该消息之后的所有内容，并以修订后的提示词**重新生成**。

## 演示

下面的截图展示了核心的「编辑并重新生成」流程：用户气泡上的「✎ 编辑」按钮（与官方「⧉ 复制」并排保留），以及以修订提示词重新生成的回复。

<p align="center">
  <img src="demo.png" alt="demo" width="800" />
</p>

## 行为语义

- **非首条消息**：在原会话的上一轮次结束处**分支出一个新会话**（`sessions.fork` + `prompt` + 打开），原会话保持不变；
- **首条消息**：在同一工作区**新建空白会话**，以修订文本作为开场重新生成；
- 含图片等附件的消息修订后以纯文本重新发送（附件不保留，界面会提示）；
- 用户气泡保留原有的**复制**操作：`⧉ 复制` 按钮与 `✎ 编辑` 按钮并排共存（插件渲染器遮蔽了官方渲染器，因此自行实现了复制而不是丢弃它）；
- 会话存储为 append-only 日志，不支持原地截断，分支即平台原生的「编辑并重新生成」。

## 架构

一个 DSH 插件包同时声明：

- `dsh.bundle.patch` —— 指向 `cordis.patch.yml`，作为 bundle 被 profile 组装；
- `dsh.client` —— 声明浏览器侧模块（`./client`），由 `dsh-client-modules` 注入 `window.__DSH_BOOT__`；
- `main` —— 主机侧入口 `lib/index.js`。

### 主机侧（Host，`lib/index.js` + `lib/typert.host.js`）

`EditRegenerateService extends TypertRemoteService` 注册 Cordis 服务 `editRegenerate`，通过 `./typert` 的 `TYPERT` 清单由 `@deepseek-ai/dsh-typert-loader` 自动注册为可被客户端调用的 Remote：

- `resolve(sessionId, seq)` —— 读取会话事件日志，定位用户消息，计算前一个 `turn/end` 作为 fork 边界；首条消息则解析所属工作区。

### 浏览器侧（Client，`lib/client.js`）

- 挂载 `TYPERT_REMOTE`，把 `remote.editRegenerate` 装进运行时；
- 以 `priority: -1` 接管 `conversation.chat.node` 槽位的 `user` 键渲染器（官方 `user` 渲染器被遮蔽，`steering` 等其它键不受影响），渲染可编辑的用户气泡，并保留复制操作（`⧉ 复制` 与 `✎ 编辑` 并排），不丢失任何官方功能。

## 安装（持久化）

插件按 profile 安装，先确定你用的是哪个版本：

| 版本 | Profile | Windows | macOS | Linux |
| --- | --- | --- | --- | --- |
| DSH Desktop 桌面版 | `desktop` | `C:\Users\<user>\.dsh\profiles\desktop` | `/Users/<user>/.dsh/profiles/desktop` | `/home/<user>/.dsh/profiles/desktop` |
| 官方原版启动版（命令行 `dsh web`） | `web` | `C:\Users\<user>\.dsh\profiles\web` | `/Users/<user>/.dsh/profiles/web` | `/home/<user>/.dsh/profiles/web` |

```bash
# DSH Desktop 桌面版
dsh plugin --profile desktop add file:./dsh-plugin-edit-regenerate
# 官方原版启动版（命令行）
dsh plugin --profile web add file:./dsh-plugin-edit-regenerate
```

或手动安装：在对应 profile 的 `package.json`（如 Windows 的
`C:\Users\<user>\.dsh\profiles\desktop\package.json`，或 macOS/Linux 的
`~/.dsh/profiles/desktop/package.json`）的 `dsh.profile.bundles`
追加 `dsh-plugin-edit-regenerate`、在 `dependencies` 追加
`"dsh-plugin-edit-regenerate": "file:<绝对路径>"`，然后在该 profile 目录执行 `pnpm install`。

重启 DSH 后生效。两个 profile 相互独立——装到其中一个不会影响另一个。

### 拉取更新后的更新流程

由于 pnpm 会把 `file:` 依赖**拷贝**到每个 profile 的 `node_modules`（hoisted 布局下是浅拷贝），执行 `git pull` 更新源码后，**不会**自动同步到已安装的 profile。当你拉取到新变更时，先**检查目标 profile 在系统中是否还保存着该插件的副本**：

- 查看该 profile 的 `node_modules`，例如 `C:\Users\<user>\.dsh\profiles\desktop\node_modules\dsh-plugin-edit-regenerate`（如果 `web` 也装了，同样的路径再查一份）；
- 只要某个 profile 还留有副本，它的副本就需要刷新。

然后**判断是否确实需要更新并拷贝**。如果当前运行的 DSH 还没有加载该插件（例如从未启动，或你改动的是一个当前未使用的版本），可以跳过拷贝，直接用新源码 `pnpm install` / 重启即可；如果该 profile 已存在副本、且当前 DSH 运行依赖它（或你希望本次 pull 立即生效），则按以下任一种方式刷新副本：

```bash
# 把整个插件目录镜像覆盖到目标 profile 的副本（排除 VCS 元数据）：
robocopy "F:\路径\dsh-plugin-edit-regenerate" "C:\Users\<user>\.dsh\profiles\desktop\node_modules\dsh-plugin-edit-regenerate" /MIR /XD .git
# 或强制 pnpm 刷新 / 重新解析（在 profile 目录下执行）：
# pnpm install --force
```

一旦判定确实需要更新，拷贝步骤可交由工具自动执行（例如由 AI 在更新流程中自动完成拷贝）。刷新副本后，重启 DSH 使变更生效。

## 故障排查

**分叉会话在重启 DSH 后无法重新加载**（`SessionFormatUnsupportedError: ... unknown to this harness and not marked ignorable`）

分叉会原样复制父会话的事件日志。如果父会话含有本 harness 构建不认识、且事件信封未标记 `ignorable` 的其他插件事件——例如 `@loserfox/distill` 在 #5 修复之前写入的 `session/distill-review-request` 事件——分叉日志在重启后会被拒绝加载（父会话本身同样受影响）。写入这些事件的插件版本已停止写入，但已经含有这些事件的日志仍需要一次性迁移：为相关事件补上 `ignorable: true`。

运行仓库自带的修复脚本（请先停止 DSH）：

```bash
node scripts/repair-session-logs.mjs
```

该脚本扫描 `$DSH_HOME/sessions`（默认为 `~/.dsh/sessions`）下的所有 `session.jsonl.zstd`，在逐字节保留日志其余部分的同时为遗留事件补上 `ignorable` 标记，并把每个文件备份为 `<file>.bak`。可传入具体日志路径进行定向修复，或用 `--dry-run` 预览将要修改的内容。
