# dsh-plugin-edit-regenerate

<p align="center">
  <b>English</b> · <a href="README.zh.md"><b>简体中文</b></a>
</p>

A [DSH (DeepSeek Harness)](https://github.com/deepseek-ai/dsh) plugin that lets you **edit a user message** in conversation history: click the "✎ Edit" button under a user bubble, confirm the revision, and the system drops everything after that message and **regenerates** from the revised prompt.

## Demo

The screenshot below demonstrates the core edit-and-regenerate flow: the `✎ 编辑` button on a user bubble (kept alongside the stock `⧉ 复制`), and the revised prompt regenerating the reply.

<p align="center">
  <img src="demo.png" alt="demo" width="800" />
</p>

## Behavior

- **Non-first message**: forks a new child session at the end of the previous turn (`sessions.fork` + prompt + open); the original session is left untouched.
- **First message**: creates a fresh blank session in the same workspace and regenerates with the revised text as the opening prompt.
- Messages with attachments are resent as plain text after revision (attachments are not kept; the UI warns about this).
- The user bubble keeps its original **copy** action: a `⧉ 复制` button now sits right next to `✎ 编辑`, so both actions coexist on every user message (the plugin's renderer shadows the stock one, so it re-implements copy instead of dropping it).
- Session storage is an append-only log and cannot be truncated in place; forking is the platform-native "edit and regenerate".

## Architecture

A single DSH plugin package that declares both halves:

- `dsh.bundle.patch` → `cordis.patch.yml`, assembled into the profile as a bundle;
- `dsh.client` → browser half (`./client`), injected into `window.__DSH_BOOT__` by `dsh-client-modules`;
- `main` → host half entry `lib/index.js`.

### Host (`lib/index.js` + `lib/typert.host.js`)

`EditRegenerateService extends TypertRemoteService` registers the Cordis service `editRegenerate`, exposed to the client through the `./typert` manifest via `@deepseek-ai/dsh-typert-loader`:

- `resolve(sessionId, seq)` — reads the session event log, locates the user message, and computes the preceding `turn/end` as the fork boundary; for the first message it resolves the owning workspace.

### Browser (`lib/client.js`)

- Mounts `TYPERT_REMOTE` and installs `remote.editRegenerate` into the runtime;
- takes over the `conversation.chat.node` slot's `user` key renderer at `priority: -1` (the stock `user` renderer is shadowed; other keys such as `steering` are unaffected), rendering an editable user bubble that keeps the copy action (`⧉ 复制` next to `✎ 编辑`) so no stock functionality is lost.

## Install (persistent)

The plugin is installed per profile — pick the profile that matches how you run DSH:

| Version | Profile | Windows | macOS | Linux |
| --- | --- | --- | --- | --- |
| DSH Desktop app (Electron) | `desktop` | `C:\Users\<user>\.dsh\profiles\desktop` | `/Users/<user>/.dsh/profiles/desktop` | `/home/<user>/.dsh/profiles/desktop` |
| Official launcher / CLI (`dsh web`) | `web` | `C:\Users\<user>\.dsh\profiles\web` | `/Users/<user>/.dsh/profiles/web` | `/home/<user>/.dsh/profiles/web` |

```bash
# DSH Desktop app
dsh plugin --profile desktop add file:./dsh-plugin-edit-regenerate
# Official launcher / CLI
dsh plugin --profile web add file:./dsh-plugin-edit-regenerate
```

Or manually: append `dsh-plugin-edit-regenerate` to `dsh.profile.bundles` and add `"dsh-plugin-edit-regenerate": "file:<absolute path>"` to `dependencies` in that profile's `package.json` (e.g. `C:\Users\<user>\.dsh\profiles\desktop\package.json` on Windows, or `~/.dsh/profiles/desktop/package.json` on macOS/Linux), then run `pnpm install` in the profile directory.

Restart DSH for the changes to take effect. The two profiles are independent — installing into one does not affect the other.

## License

MIT
