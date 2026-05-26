import { Inngest } from "inngest";

/**
 * Inngest client (v4) для pipeline worker.
 * - dev (`inngest-cli dev`): ключи не нужны, signature verification отключена через isDev=true
 * - prod: INNGEST_EVENT_KEY + INNGEST_SIGNING_KEY через wrangler secrets;
 *   подцепляются автоматически из process.env / fetch-env (см. SDK docs).
 *
 * Имя клиента — pipeline (отделено от api, который шлёт события).
 */
export function createPipelineInngest(bindings: {
  INNGEST_EVENT_KEY?: string;
  INNGEST_SIGNING_KEY?: string;
  NODE_ENV?: string;
}) {
  return new Inngest({
    id: "x10-pipeline",
    eventKey: bindings.INNGEST_EVENT_KEY,
    signingKey: bindings.INNGEST_SIGNING_KEY,
    isDev: bindings.NODE_ENV !== "production",
  });
}

export type PipelineInngest = ReturnType<typeof createPipelineInngest>;
