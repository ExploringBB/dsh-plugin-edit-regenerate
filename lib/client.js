window.__ModuleLoader__.load({
  id: "dsh-plugin-edit-regenerate",
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;

    const React = require("react");

    // ---------------------------------------------------------------------
    // Minimal strict codecs. The client Remote mount only needs `mode:
    // "strict"` and a `schema` with `.parse(value)`; hand-rolling these keeps
    // the browser bundle free of a zod dependency.
    // ---------------------------------------------------------------------

    function codec(schema) {
      return { mode: "strict", typeSymbol: "dsh-plugin-edit-regenerate", schema };
    }

    const str = {
      parse(value) {
        if (typeof value !== "string") throw new TypeError("expected string");
        return value;
      },
    };
    const num = {
      parse(value) {
        if (typeof value !== "number" || !Number.isFinite(value)) throw new TypeError("expected number");
        return value;
      },
    };
    const literal = (expected) => ({
      parse(value) {
        if (value !== expected) throw new TypeError(`expected ${String(expected)}`);
        return value;
      },
    });
    const oneOf = (values) => ({
      parse(value) {
        if (!values.includes(value)) throw new TypeError("unexpected value");
        return value;
      },
    });
    function obj(shape) {
      return {
        parse(value) {
          if (typeof value !== "object" || value === null || Array.isArray(value)) {
            throw new TypeError("expected object");
          }
          const out = {};
          for (const key of Object.keys(shape)) {
            if (!Object.hasOwn(value, key)) throw new TypeError(`missing field ${key}`);
            out[key] = shape[key].parse(value[key]);
          }
          return out;
        },
      };
    }
    function unionOf(...variants) {
      return {
        parse(value) {
          for (const variant of variants) {
            try {
              return variant.parse(value);
            } catch {
              // try the next variant
            }
          }
          throw new TypeError("no union variant matched");
        },
      };
    }

    const resolveResult = unionOf(
      obj({ ok: literal(true), mode: oneOf(["fork"]), boundarySeq: num }),
      obj({ ok: literal(true), mode: oneOf(["fresh"]), workspaceId: str }),
      obj({ ok: literal(false), error: str }),
    );

    const TYPERT_REMOTE = {
      package: "dsh-plugin-edit-regenerate",
      descriptors: [
        {
          id: "dsh-plugin-edit-regenerate#editRegenerate/resolve",
          service: "editRegenerate",
          namespace: "editRegenerate",
          method: "resolve",
          invocation: { kind: "direct" },
          parameters: [
            { name: "sessionId", wire: "sessionId", source: "json", codec: codec(str) },
            { name: "seq", wire: "seq", source: "json", codec: codec(num) },
          ],
          result: codec(resolveResult),
        },
      ],
    };

    // ---------------------------------------------------------------------
    // Text helpers.
    // ---------------------------------------------------------------------

    function extractText(content) {
      if (!Array.isArray(content)) return "";
      return content
        .filter((block) => block && block.type === "text" && typeof block.text === "string")
        .map((block) => block.text)
        .join("");
    }

    function hasAttachments(content) {
      return Array.isArray(content) && content.some((block) => block && block.type !== "text");
    }

    // ---------------------------------------------------------------------
    // Clipboard helper: prefers the async Clipboard API and falls back to the
    // legacy execCommand("copy") path (jsdom / insecure contexts), matching
    // the product's own writeClipboard semantics.
    // ---------------------------------------------------------------------

    async function writeClipboard(text) {
      if (typeof navigator !== "undefined" && navigator.clipboard && navigator.clipboard.writeText) {
        try {
          await navigator.clipboard.writeText(text);
          return true;
        } catch {
          return false;
        }
      }
      const exec =
        typeof document !== "undefined" && typeof document.execCommand === "function"
          ? document.execCommand.bind(document)
          : undefined;
      if (exec === undefined) return false;
      const el = document.createElement("textarea");
      el.value = text;
      el.setAttribute("readonly", "");
      el.style.position = "fixed";
      el.style.left = "-9999px";
      document.body.appendChild(el);
      el.select();
      try {
        return exec("copy");
      } catch {
        return false;
      } finally {
        el.remove();
      }
    }

    // ---------------------------------------------------------------------
    // React UI.
    // ---------------------------------------------------------------------

    const style = {
      row: { display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6, minWidth: 0 },
      bubble: {
        maxWidth: "min(560px, 100%)",
        background: "var(--dsw-alias-bg-module-platform, rgba(127,127,127,.13))",
        borderRadius: 14,
        padding: "9px 14px",
        whiteSpace: "pre-wrap",
        wordBreak: "break-word",
        color: "inherit",
        fontSize: 14,
        lineHeight: 1.65,
      },
      attach: { fontSize: 12, lineHeight: "18px", color: "var(--dsw-alias-label-tertiary, rgba(127,127,127,.9))", marginTop: 4 },
      actions: { display: "flex", alignItems: "center", gap: 4, marginTop: 2 },
      btn: {
        appearance: "none",
        border: "1px solid var(--dsw-alias-border-l2, rgba(127,127,127,.35))",
        background: "transparent",
        color: "inherit",
        borderRadius: 8,
        fontSize: 12,
        lineHeight: "20px",
        padding: "1px 10px",
        cursor: "pointer",
        opacity: 0.75,
      },
      editor: {
        width: "min(640px, 100%)",
        display: "flex",
        flexDirection: "column",
        gap: 8,
        border: "1px solid var(--dsw-alias-border-l2, rgba(127,127,127,.4))",
        borderRadius: 14,
        padding: 10,
        background: "var(--dsw-alias-bg-layer-1, rgba(127,127,127,.06))",
      },
      textarea: {
        width: "100%",
        boxSizing: "border-box",
        resize: "vertical",
        minHeight: 64,
        background: "transparent",
        color: "inherit",
        border: "none",
        outline: "none",
        font: "inherit",
        fontSize: 14,
        lineHeight: 1.6,
      },
      editorActions: { display: "flex", gap: 8, justifyContent: "flex-end", alignItems: "center" },
      primary: {
        appearance: "none",
        border: "none",
        borderRadius: 8,
        padding: "5px 14px",
        fontSize: 13,
        cursor: "pointer",
        background: "var(--dsw-alias-brand-primary, #4d6bfe)",
        color: "var(--dsw-alias-label-inverse, #fff)",
      },
      ghost: {
        appearance: "none",
        border: "1px solid var(--dsw-alias-border-l2, rgba(127,127,127,.4))",
        background: "transparent",
        color: "inherit",
        borderRadius: 8,
        padding: "5px 14px",
        fontSize: 13,
        cursor: "pointer",
      },
      busy: { fontSize: 12, color: "var(--dsw-alias-label-tertiary, rgba(127,127,127,.9))" },
      error: { fontSize: 12, color: "var(--dsw-alias-state-error-primary, #e5484d)" },
    };

    function EditUserNode(props) {
      const node = props.node;
      const sessionId = props.sessionId;
      const resolve = props.resolve;
      const sessions = props.sessions;
      const workspaces = props.workspaces;

      const content = node && node.data && node.data.content;
      const text = extractText(content);

      const [editing, setEditing] = React.useState(false);
      const [draft, setDraft] = React.useState(text);
      const [busy, setBusy] = React.useState(false);
      const [error, setError] = React.useState(null);
      const [copied, setCopied] = React.useState(false);
      const mounted = React.useRef(true);
      const copyTimer = React.useRef(null);

      React.useEffect(
        () => () => {
          mounted.current = false;
          if (copyTimer.current !== null) {
            window.clearTimeout(copyTimer.current);
            copyTimer.current = null;
          }
        },
        [],
      );
      React.useEffect(() => { setDraft(text); }, [text]);

      const copy = async () => {
        if (copied || copyTimer.current !== null) return;
        const ok = await writeClipboard(text);
        if (!mounted.current || !ok) return;
        setCopied(true);
        copyTimer.current = window.setTimeout(() => {
          copyTimer.current = null;
          if (mounted.current) setCopied(false);
        }, 1000);
      };

      const begin = () => {
        setError(null);
        setDraft(text);
        setEditing(true);
      };
      const cancel = () => {
        setError(null);
        setEditing(false);
      };

      const confirmEdit = async () => {
        if (busy) return;
        const next = draft;
        if (typeof next !== "string" || next.trim() === "") {
          setError("修订内容不能为空");
          return;
        }
        if (!sessionId || !node || typeof node.anchorSeq !== "number") {
          setError("无法定位该消息的修订位置");
          return;
        }
        if (!resolve) {
          setError("修订服务暂不可用，请稍后重试");
          return;
        }
        setBusy(true);
        setError(null);
        try {
          const resolved = await resolve(node.anchorSeq);
          if (!resolved || resolved.ok !== true || resolved.value === undefined) {
            const detail = resolved && resolved.error;
            throw new Error((detail && (detail.message || detail)) || "无法解析修订位置");
          }
          const outcome = resolved.value;
          if (outcome.ok !== true) {
            throw new Error(outcome.error || "无法解析修订位置");
          }
          let childId;
          if (outcome.mode === "fork") {
            // `sessions.fork` resolves DIRECTLY to the child session id (a
            // string) and rejects on failure — it does not return an
            // `{ ok, value }` envelope. Reading `.ok` off the returned string
            // always failed and surfaced a bogus "分支出错" after the fork had
            // actually succeeded.
            childId = await sessions.fork({ sessionId, atSeq: outcome.boundarySeq, increaseTitle: true });
            if (typeof childId !== "string" || childId === "") throw new Error("分支出错");
          } else if (outcome.mode === "fresh") {
            // `workspaces.connectWorkspace` also resolves to the session id string.
            childId = await workspaces.connectWorkspace(outcome.workspaceId);
            if (typeof childId !== "string" || childId === "") throw new Error("新建会话失败");
          } else {
            throw new Error("未知的修订模式");
          }
          const binding = sessions.binding(childId);
          if (!binding) throw new Error("新会话暂不可用");
          await binding.session.prompt([{ type: "text", text: next }], "queue");
          sessions.open(childId);
        } catch (e) {
          if (mounted.current) setError(String((e && e.message) || e));
        } finally {
          if (mounted.current) setBusy(false);
        }
      };

      const children = [];
      if (editing) {
        children.push(
          React.createElement(
            "div",
            { key: "editor", style: style.editor },
            React.createElement("textarea", {
              style: style.textarea,
              value: draft,
              autoFocus: true,
              onChange: (event) => setDraft(event.currentTarget.value),
              onKeyDown: (event) => {
                if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) confirmEdit();
                if (event.key === "Escape") cancel();
              },
            }),
            hasAttachments(content)
              ? React.createElement("div", { key: "attach", style: style.attach }, "含附件：修订后将以纯文本重新发送，附件不会保留")
              : null,
            error ? React.createElement("div", { key: "error", style: style.error }, error) : null,
            busy ? React.createElement("div", { key: "busy", style: style.busy }, "正在删除后文并以修订后的提示词重新生成…") : null,
            React.createElement(
              "div",
              { key: "actions", style: style.editorActions },
              React.createElement("button", { type: "button", style: style.ghost, disabled: busy, onClick: cancel }, "取消"),
              React.createElement("button", { type: "button", style: style.primary, disabled: busy, onClick: confirmEdit }, busy ? "修订中…" : "确定修订"),
            ),
          ),
        );
      } else {
        children.push(React.createElement("div", { key: "bubble", style: style.bubble }, text));
        if (hasAttachments(content)) {
          children.push(React.createElement("div", { key: "attach", style: style.attach }, "含附件"));
        }
        children.push(
          React.createElement(
            "div",
            { key: "actions", style: style.actions },
            React.createElement(
              "button",
              {
                type: "button",
                style: style.btn,
                title: "复制该条消息内容",
                onClick: copy,
              },
              copied ? "✓ 已复制" : "⧉ 复制",
            ),
            React.createElement(
              "button",
              {
                type: "button",
                style: style.btn,
                title: "编辑该条用户输入；确认后删除其后所有内容，并以修订后的提示词重新生成",
                onClick: begin,
              },
              "✎ 编辑",
            ),
          ),
        );
      }
      return React.createElement("div", { style: style.row }, ...children);
    }

    // ---------------------------------------------------------------------
    // Cordis client plugin.
    // ---------------------------------------------------------------------

    const inject = ["slots", "remote"];

    function apply(ctx) {
      let remote = undefined;
      ctx.effect(async () => {
        const dispose = await ctx.remote.$mount(TYPERT_REMOTE);
        remote = ctx.get("remote.editRegenerate");
        return async () => {
          remote = undefined;
          await dispose();
        };
      }, "edit-regenerate: remote");

      const api = () => {
        if (remote === undefined) throw new Error("editRegenerate remote is not mounted yet");
        return remote;
      };

      ctx.slots.inject(
        "conversation.chat.node",
        () =>
          ctx.slots.register(
            {
              name: "conversation.chat.node",
              key: "user",
              priority: -1,
              inject: (sessionId) => ({
                sessionId,
                resolve: (seq) => api().resolve(sessionId, seq),
                sessions: ctx.get("sessions"),
                workspaces: ctx.get("workspaces"),
              }),
            },
            EditUserNode,
          ),
      );
    }

    exports.apply = apply;
    exports.inject = inject;
    return module.exports;
  },
});
