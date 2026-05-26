import { zValidator } from "@hono/zod-validator";
import { sourceRefSchema } from "@x10/agents";
import { Hono } from "hono";
import { Inngest } from "inngest";
import { z } from "zod";
import type { AppEnv } from "../app";
import { getEnv } from "../env";

const TOPIC_INGESTED = "article/topic.ingested" as const;

const runSchema = z.object({
  topic: z.string().min(1),
  context: z.string().min(1),
  sources: z.array(sourceRefSchema).min(1),
  section: z
    .enum(["main", "numbers", "people", "playbook", "weekend", "longread"])
    .optional(),
  authorName: z.string().nullable().optional(),
});

let cachedClient: Inngest | undefined;
function getInngest(env: ReturnType<typeof getEnv>): Inngest {
  if (cachedClient) return cachedClient;
  cachedClient = new Inngest({
    id: "x10-api",
    eventKey: env.INNGEST_EVENT_KEY,
    isDev: env.NODE_ENV !== "production",
  });
  return cachedClient;
}

export const pipelineRoute = new Hono<AppEnv>().post(
  "/run",
  zValidator("json", runSchema),
  async (c) => {
    const env = getEnv(c.env);
    const inngest = getInngest(env);
    const body = c.req.valid("json");

    const { ids } = await inngest.send({
      name: TOPIC_INGESTED,
      data: body,
    });

    return c.json(
      {
        accepted: true,
        eventIds: ids,
        eventName: TOPIC_INGESTED,
        statusHint:
          "Pipeline orchestrate в apps/workers/pipeline. Поллингом /v1/articles/:slug после завершения.",
      },
      202,
    );
  },
);
