/* Hand-written Typert host face for dsh-plugin-edit-regenerate.
 * Registered automatically by `@deepseek-ai/dsh-typert-loader` because this
 * package exports `./typert`. Keep this in sync with the service method in
 * `lib/index.js` and the client descriptors in `lib/client.js`. */
import { z } from "zod";

const resolveResultSchema = z.union([
  z.object({ ok: z.literal(true), mode: z.literal("fork"), boundarySeq: z.number() }),
  z.object({ ok: z.literal(true), mode: z.literal("fresh"), workspaceId: z.string() }),
  z.object({ ok: z.literal(false), error: z.string() }),
]);

export const TYPERT = {
  package: "dsh-plugin-edit-regenerate",
  face: "host",
  schemas: [],
  invocations: [
    {
      id: "dsh-plugin-edit-regenerate#editRegenerate/resolve",
      service: "editRegenerate",
      namespace: "editRegenerate",
      method: "resolve",
      invocation: { kind: "direct" },
      parameters: [
        {
          name: "sessionId",
          wire: "sessionId",
          source: "json",
          codec: { mode: "strict", typeSymbol: "string", schema: z.string() },
        },
        {
          name: "seq",
          wire: "seq",
          source: "json",
          codec: { mode: "strict", typeSymbol: "number", schema: z.number() },
        },
      ],
      result: {
        mode: "strict",
        typeSymbol: "dsh-plugin-edit-regenerate#editRegenerate/resolve:result",
        schema: resolveResultSchema,
      },
      sourceLocation: { file: "src/index.ts", line: 1, column: 1 },
    },
  ],
  model: { services: [], events: [], objects: [] },
};
