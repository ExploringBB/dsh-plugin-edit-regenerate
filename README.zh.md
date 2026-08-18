# dsh-plugin-edit-regenerate

<p align="center">
  <a href="README.md"><b>English</b></a> · <b>简体中文</b>
</p>

在对话历史中**编辑用户输入**：点击用户气泡下的「✎ 编辑」修改内容，确认「确定修订」后，系统删除该消息之后的所有内容，并以修订后的提示词**重新生成**。

## 行为语义

- **非首条消息**：在原会话的上一轮次结束处**分支出一个新会话**（`sessions.fork` + `prompt` + 打开），原会话保持不变；
- **首条消息**：在同一工作区**新建空白会话**，以修订文本作为开场重新生成；
- 含图片等附件的消息修订后以纯文本重新发送（附件不保留，界面会提示）；
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
- 以 `priority: -1` 接管 `conversation.chat.node` 槽位的 `user` 键渲染器（官方 `user` 渲染器被遮蔽，`steering` 等其它键不受影响），渲染可编辑的用户气泡。

## 安装（持久化）

插件按 profile 安装，先确定你用的是哪个版本：

| 版本 | Profile | 目录 |
| --- | --- | --- |
| DSH Desktop 桌面版 | `desktop` | `C:\Users\<user>\.dsh\profiles\desktop` |
| 官方原版启动版（命令行 `dsh web`） | `web` | `C:\Users\<user>\.dsh\profiles\web` |

```bash
# DSH Desktop 桌面版
dsh plugin --profile desktop add file:./dsh-plugin-edit-regenerate
# 官方原版启动版（命令行）
dsh plugin --profile web add file:./dsh-plugin-edit-regenerate
```

或手动安装：在对应 profile 的 `package.json`（如
`C:\Users\<user>\.dsh\profiles\desktop\package.json`）的 `dsh.profile.bundles`
追加 `dsh-plugin-edit-regenerate`、在 `dependencies` 追加
`"dsh-plugin-edit-regenerate": "file:<绝对路径>"`，然后在该 profile 目录执行 `pnpm install`。

重启 DSH 后生效。两个 profile 相互独立——装到其中一个不会影响另一个。
