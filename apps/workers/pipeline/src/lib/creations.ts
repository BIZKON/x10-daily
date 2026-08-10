import { type CreationResult, type Database, creationModes, creations, eq } from "@x10/db";

/**
 * Доступ к заданиям ручного режима (раздел «Создать»).
 *
 * Вынесено из Inngest-функции по той же причине, что и загрузка знаний: в
 * функции остаётся порядок действий, который и есть предмет проверки, а запросы
 * к базе живут отдельно и подменяются в тестах целиком.
 */

/** Задание вместе с режимом, которым его просили сделать. */
export type CreationJob = {
  creation: { id: string; prompt: string };
  mode: {
    slug: string;
    title: string;
    guidance: string;
    /** Полки базы знаний режима. Пусто — все доступные. */
    shelfSlugs: string[];
    /** false — режим показан как «готовится» и работать не должен. */
    available: boolean;
  };
};

/** Задание и его режим одним запросом. `null` — строки нет. */
export async function loadCreationJob(db: Database, id: string): Promise<CreationJob | null> {
  const [row] = await db
    .select({
      id: creations.id,
      prompt: creations.prompt,
      slug: creationModes.slug,
      title: creationModes.title,
      guidance: creationModes.guidance,
      shelfSlugs: creationModes.shelfSlugs,
      available: creationModes.available,
      enabled: creationModes.enabled,
    })
    .from(creations)
    .innerJoin(creationModes, eq(creations.modeId, creationModes.id))
    .where(eq(creations.id, id))
    .limit(1);

  if (!row) return null;

  return {
    creation: { id: row.id, prompt: row.prompt },
    mode: {
      slug: row.slug,
      title: row.title,
      guidance: row.guidance,
      shelfSlugs: row.shelfSlugs,
      // Выключенный режим недоступен так же, как непостроенный: человеку в обоих
      // случаях нельзя отдать материал, сделанный тем, чего он не выбирал.
      available: row.available && row.enabled,
    },
  };
}

export async function markCreationRunning(db: Database, id: string): Promise<void> {
  await db
    .update(creations)
    .set({ status: "running", statusReason: null, updatedAt: new Date() })
    .where(eq(creations.id, id));
}

/** Материал готов: результат, снимок знаний и статус одной записью. */
export async function finishCreation(
  db: Database,
  id: string,
  payload: { result: CreationResult; knowledgeUsed: string },
): Promise<void> {
  await db
    .update(creations)
    .set({
      status: "ready",
      statusReason: null,
      result: payload.result,
      knowledgeUsed: payload.knowledgeUsed,
      updatedAt: new Date(),
    })
    .where(eq(creations.id, id));
}

/**
 * Задание не выполнено. Причина обязательна и пишется по-русски: экран показывает
 * её человеку, и «failed» без объяснения — это ещё один повод написать нам.
 */
export async function failCreation(db: Database, id: string, reason: string): Promise<void> {
  await db
    .update(creations)
    .set({ status: "failed", statusReason: reason, updatedAt: new Date() })
    .where(eq(creations.id, id));
}
