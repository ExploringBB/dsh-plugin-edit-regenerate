import { TypertRemoteService } from "@deepseek-ai/dsh-typert-protocol";

/**
 * Host half of the edit-and-regenerate feature.
 *
 * A Typert Remote service (`editRegenerate`) that, given a session and the
 * event seq of a user message, resolves how an edit should continue:
 *   - `{ ok: true, mode: "fork", boundarySeq }`  -> fork a child session at
 *     the turn/end that precedes the edited message, then regenerate;
 *   - `{ ok: true, mode: "fresh", workspaceId }` -> the edited message is the
 *     very first message of its session (no completed turn precedes it), so
 *     start a fresh blank session in the same workspace and regenerate;
 *   - `{ ok: false, error }`                     -> the edit cannot be applied.
 *
 * The browser half calls this through the Typert Remote gateway (see
 * `lib/client.js` descriptors and `lib/typert.host.js` wire manifest).
 *
 * @module dsh-plugin-edit-regenerate
 */

/** Cordis service key and wire namespace for the generated Remote. */
const SERVICE_KEY = "editRegenerate";

/** Session event types the resolve logic cares about. */
const TURN_END = "turn/end";
const USER_MESSAGE = "user/message";

export default class EditRegenerateService extends TypertRemoteService {
  constructor(ctx) {
    super(ctx, SERVICE_KEY);
  }

  /**
   * Resolve how an edit of `seq` (user message) should continue.
   * @param sessionId - session holding the edited message.
   * @param seq - event seq of the edited user message (floored defensively).
   * @returns fork / fresh / error resolution (see module doc).
   */
  async resolve(sessionId, seq) {
    try {
      if (typeof sessionId !== "string" || typeof seq !== "number" || !Number.isFinite(seq) || seq < 0) {
        return { ok: false, error: "参数无效" };
      }
      const targetSeq = Math.floor(seq);

      const sessionQuery = this.ctx.get("sessionQuery");
      if (sessionQuery === undefined) return { ok: false, error: "会话查询服务不可用" };

      const snapshot = await sessionQuery.readSession(sessionId);
      const events = snapshot && Array.isArray(snapshot.events) ? snapshot.events : [];

      const target = events.find(
        (event) =>
          event.seq === targetSeq &&
          event.type === USER_MESSAGE &&
          event.data &&
          event.data.source &&
          event.data.source.kind === "user",
      );
      if (target === undefined) return { ok: false, error: "未找到该用户消息（可能已被修订）" };

      // Largest completed turn/end strictly before the edited message: the fork
      // boundary the api-proxy anchors on (first turn/end >= atSeq).
      let boundary = null;
      for (const event of events) {
        if (event.type === TURN_END && event.seq < targetSeq) boundary = event.seq;
      }

      if (boundary === null) {
        // First message of the session: no completed turn precedes it -> start
        // a fresh blank session inside the same workspace.
        const registry = this.ctx.get("workspaceRegistry");
        if (registry !== undefined) {
          const workspace = registry.list().find((w) => w.sessionIds && w.sessionIds.includes(sessionId));
          if (workspace !== undefined) return { ok: true, mode: "fresh", workspaceId: workspace.id };
        }
        return { ok: false, error: "该消息是首条消息，但未能解析工作区以新建会话" };
      }

      return { ok: true, mode: "fork", boundarySeq: boundary };
    } catch (error) {
      return { ok: false, error: String((error && error.message) || error) };
    }
  }
}
