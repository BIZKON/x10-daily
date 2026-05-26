import { sourceRefSchema } from "@x10/agents";
import { eventType } from "inngest";
import { z } from "zod";

export const sectionEnum = z.enum([
  "main",
  "numbers",
  "people",
  "playbook",
  "weekend",
  "longread",
]);
export type Section = z.infer<typeof sectionEnum>;
export const DEFAULT_SECTION: Section = "main";

/** Schema без .default() и .transform() — Inngest v4 запрещает transforms на eventType. */
export const topicIngestedDataSchema = z.object({
  topic: z.string().min(1),
  context: z.string().min(1),
  sources: z.array(sourceRefSchema).min(1),
  section: sectionEnum.optional(),
  authorName: z.string().nullable().optional(),
});

export type TopicIngestedData = z.infer<typeof topicIngestedDataSchema>;

/** Inngest v4 event-type: name + StandardSchemaV1 для type-safety + runtime валидации. */
export const topicIngestedEvent = eventType("article/topic.ingested", {
  schema: topicIngestedDataSchema,
});

export const TOPIC_INGESTED = topicIngestedEvent.event;
