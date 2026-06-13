/**
 * Форматирование дат для UI (П1 — дата+время публикации под постами).
 *
 * ⚠️ ВСЕГДА абсолютное время в МСК (Europe/Moscow), НЕ относительное
 * («2 дня назад»): данные ленты кэшируются («use cache»/PPR 15м), относительная
 * метка устарела бы между рендером и просмотром. Абсолютная дата стабильна в
 * кэше. Сервер контейнера работает в UTC — timeZone обязателен, иначе сдвиг −3ч.
 */

const MSK_DATE = new Intl.DateTimeFormat("ru-RU", {
  day: "numeric",
  month: "long",
  timeZone: "Europe/Moscow",
});

const MSK_TIME = new Intl.DateTimeFormat("ru-RU", {
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
  timeZone: "Europe/Moscow",
});

/**
 * «13 июня, 14:30» (МСК). null → невалидный/отсутствующий ISO (caller скрывает).
 */
export function formatPublishedAt(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return `${MSK_DATE.format(d)}, ${MSK_TIME.format(d)}`;
}
