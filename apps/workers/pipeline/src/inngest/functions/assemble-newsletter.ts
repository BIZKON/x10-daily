import {
  NewsletterAssembleAgent,
  createMasker,
  type AgentContext,
} from "@x10/agents";
import { loadEnv } from "@x10/config";
import { newsletterAssembleRequestedEvent } from "../../events";
import type { PipelineInngest } from "../client";

/**
 * Собирает daily newsletter из готовых статей. Триггерится:
 * - cron 06:00 МСК (cron-функция отдельно — пока через ручной event)
 * - POST /v1/newsletter/assemble (api → отправляет newsletter.assemble.requested)
 *
 * Этот worker НЕ отправляет email — это делает отдельный newsletter-worker
 * через Resend SDK (см. CLAUDE.md §3 apps/workers/newsletter).
 */
export function createAssembleNewsletterFunction(
  inngest: PipelineInngest,
  bindings: CloudflareBindings,
) {
  return inngest.createFunction(
    {
      id: "assemble-newsletter",
      name: "Assemble daily newsletter via NewsletterAssembleAgent",
      triggers: [{ event: newsletterAssembleRequestedEvent }],
      retries: 2,
      concurrency: { limit: 1 }, // 1 выпуск в момент, дублирование не нужно
    },
    async ({ event, step }) => {
      const env = loadEnv(bindings as unknown as Record<string, string | undefined>);
      if (!env.ANTHROPIC_API_KEY) {
        throw new Error(
          "ANTHROPIC_API_KEY не задан — NewsletterAssembleAgent не запустится.",
        );
      }
      const masker = createMasker(env);
      const ctx: AgentContext = { apiKey: env.ANTHROPIC_API_KEY, masker };

      const assembled = await step.run("assemble", () =>
        NewsletterAssembleAgent.run(
          {
            issueDate: event.data.issueDate,
            articles: event.data.articles,
            editorialNote: event.data.editorialNote,
          },
          ctx,
        ),
      );

      return {
        issueDate: event.data.issueDate,
        subject: assembled.output.subject,
        subjectVariants: assembled.output.subjectVariants,
        preheader: assembled.output.preheader,
        sections: assembled.output.sections,
        closing: assembled.output.closing,
        meta: assembled.output.meta,
        costUsd: assembled.costUsd,
        modelUsed: assembled.modelUsed,
      };
    },
  );
}
