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

### Updating after pulling new changes

Because pnpm copies `file:` dependencies into each profile's `node_modules` (a shallow copy under the hoisted layout), a `git pull` that updates the source does **not** automatically reach a profile that is already installed. When you pull new changes, first **check whether the target profile still holds a copy** of the plugin in the system:

- Look under the profile's `node_modules` — e.g. `C:\Users\<user>\.dsh\profiles\desktop\node_modules\dsh-plugin-edit-regenerate` (and the same for `web` if you installed it there too).
- Each profile that still has a copy needs its copy refreshed.

Then decide **whether an update + copy is actually necessary**. If the running DSH has not loaded the plugin yet (never started, or you only edit a version that is not currently in use), you can skip the copy and simply run `pnpm install` / restart with the new source. If the profile's copy already exists and the current DSH run depends on it (or you want the pull to take effect), refresh the copy by one of:

```bash
# Copy the whole plugin directory over the profile's copy, excluding VCS metadata:
robocopy "F:\path\to\dsh-plugin-edit-regenerate" "C:\Users\<user>\.dsh\profiles\desktop\node_modules\dsh-plugin-edit-regenerate" /MIR /XD .git
# or force pnpm to refresh/resolve:
# -- in the profile directory --
pnpm install --force
```

Once you have determined that an update is needed, the copy can be carried out automatically (for example by an AI agent performing the copy step as part of the update workflow). After refreshing the copy, restart DSH for the change to take effect.

## Troubleshooting

**A forked conversation fails to reload after restarting DSH** (`SessionFormatUnsupportedError: ... unknown to this harness and not marked ignorable`)

A fork copies the parent session's event log verbatim. If the parent contains events written by other plugins that this harness build does not recognize and that are not marked `ignorable` in their envelope — e.g. the `session/distill-review-request` event written by `@loserfox/distill` before its #5 fix — the forked log refuses to load after a restart (the parent session itself is affected the same way). The plugin releases that wrote those events have since stopped writing them, but logs that already contain them need a one-time migration: mark the offending events `ignorable: true`.

Run the bundled repair script (stop DSH first):

```bash
node scripts/repair-session-logs.mjs
```

It discovers every `session.jsonl.zstd` under `$DSH_HOME/sessions` (default `~/.dsh/sessions`), marks the legacy events ignorable while preserving the rest of the log byte-for-byte, and backs each file up to `<file>.bak`. Pass explicit log paths for a targeted run, or `--dry-run` for a preview of what would change.

## License

MIT
