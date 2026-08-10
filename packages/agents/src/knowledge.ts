/**
 * Подмешивание базы знаний клиента в промпты агентов.
 *
 * Смысл всей затеи одной фразой: в чате контекст — часть запроса, здесь
 * контекст — часть системы. Клиент один раз рассказал о своём бизнесе, дальше
 * агенты пишут, зная его продукты, цены, возражения и запреты, — и никто не
 * пересказывает это в каждом задании.
 *
 * 🔴 Здесь ТОЛЬКО чистое форматирование, без обращения к базе. Загрузка живёт в
 * воркере (`apps/workers/pipeline/src/lib/knowledge.ts`), потому что пакет
 * агентов не должен знать про Postgres: его же вызывают из тестов и, в будущем,
 * из ручного режима, где источник данных другой.
 */

export type KnowledgeDocument = {
  title: string;
  body: string;
};

export type KnowledgeShelf = {
  title: string;
  documents: KnowledgeDocument[];
};

/**
 * Потолок на блок знаний в знаках.
 *
 * 🔴 Потолок обязателен, а не «на всякий случай». База знаний растёт: клиент
 * положит на полку «Продукты» весь каталог, и однажды блок вытеснит из окна
 * само задание. Без потолка это случится не сразу, а через месяц эксплуатации —
 * то есть тогда, когда никто не будет искать причину здесь.
 *
 * 6000 знаков — это примерно 2000 токенов. На DeepSeek Flash (19 ₽/М входа)
 * добавка к одному прогону выходит около четырёх копеек: за качество текстов,
 * которые перестают быть общими, это ничто.
 */
export const KNOWLEDGE_BUDGET_CHARS = 6000;

/** Пометка обрезки — читатель промпта должен видеть, что текст неполный. */
const CUT_MARK = "… (сокращено)";

/**
 * Собрать блок знаний под заданный бюджет знаков.
 *
 * Бюджет делится между непустыми полками ПОРОВНУ, а не по порядку. Порядок
 * означал бы, что «Продукты» с большим каталогом съедают весь лимит, а
 * «Возражения» и «Правила» не попадают вовсе, — при том что запреты важнее
 * подробностей каталога. Неизрасходованная доля скромных полок достаётся
 * тем, кому не хватило.
 *
 * Возвращает пустую строку, если знаний нет: вызывающий по ней решает, добавлять
 * ли раздел в промпт вообще.
 */
export function formatKnowledge(
  shelves: KnowledgeShelf[],
  budgetChars: number = KNOWLEDGE_BUDGET_CHARS,
): string {
  const filled = shelves
    .map((s) => ({ title: s.title, text: joinDocuments(s.documents) }))
    .filter((s) => s.text.length > 0);

  if (filled.length === 0 || budgetChars <= 0) return "";

  const allowance = shareBudget(
    filled.map((s) => s.text.length),
    budgetChars,
  );

  const parts = filled
    .map((s, i) => {
      const limit = allowance[i] ?? 0;
      if (limit <= 0) return "";
      return `## ${s.title}\n${truncate(s.text, limit)}`;
    })
    .filter(Boolean);

  return parts.join("\n\n");
}

/** Материалы одной полки подряд, каждый со своим названием. */
function joinDocuments(documents: KnowledgeDocument[]): string {
  return documents
    .map((d) => {
      const body = d.body.trim();
      if (!body) return "";
      const title = d.title.trim();
      return title ? `${title}: ${body}` : body;
    })
    .filter(Boolean)
    .join("\n");
}

/**
 * Честное деление бюджета: равные доли, излишек скромных полок раздаётся
 * жадным. Повторяем, пока есть что раздавать, — иначе излишек от второй волны
 * пропал бы впустую.
 */
function shareBudget(needs: number[], budget: number): number[] {
  const given = new Array<number>(needs.length).fill(0);
  let remaining = budget;
  let pending = needs.map((_, i) => i);

  while (pending.length > 0 && remaining > 0) {
    const share = Math.floor(remaining / pending.length);
    // Доли стали меньше единицы — делить дальше нечего.
    if (share <= 0) break;

    const next: number[] = [];
    let spent = 0;
    for (const i of pending) {
      const need = (needs[i] ?? 0) - (given[i] ?? 0);
      if (need <= share) {
        given[i] = (given[i] ?? 0) + need;
        spent += need;
      } else {
        given[i] = (given[i] ?? 0) + share;
        spent += share;
        next.push(i);
      }
    }
    remaining -= spent;
    // Никто ничего не взял — дальше цикл был бы вечным.
    if (spent === 0) break;
    pending = next;
  }

  return given;
}

/**
 * Обрезка по границе строки, а не посреди слова: обрубленное на полуслове
 * предложение модель может достроить сама и выдать выдумку за факт клиента.
 */
function truncate(text: string, limit: number): string {
  if (text.length <= limit) return text;
  const room = limit - CUT_MARK.length;
  if (room <= 0) return CUT_MARK.trim();

  const head = text.slice(0, room);
  const lastBreak = Math.max(head.lastIndexOf("\n"), head.lastIndexOf(". "));
  // Ищем перенос не дальше чем в половине куска, иначе выкинем почти всё.
  const cut = lastBreak > room / 2 ? lastBreak + 1 : room;
  return `${head.slice(0, cut).trimEnd()}${CUT_MARK}`;
}

/**
 * Готовый раздел для промпта — с шапкой и правилами обращения со знанием.
 *
 * Правила здесь, а не в системном промпте каждого агента: они относятся к
 * блоку, и таскать их копиями по агентам значит однажды поправить в одном
 * месте и забыть в трёх.
 */
export function knowledgeSection(block: string): string {
  if (!block) return "";
  return [
    "ЧТО ИЗВЕСТНО О БИЗНЕСЕ КЛИЕНТА",
    "",
    "Это сведения, которые клиент сообщил о себе сам. Опирайся на них:",
    "— называй его продукты и цены так, как здесь написано, и не придумывай тех, которых здесь нет;",
    "— если про что-то здесь не сказано, лучше не писать об этом вовсе, чем предположить;",
    "— соблюдай запреты из раздела правил, даже если тема просит обратного.",
    "",
    block,
  ].join("\n");
}
