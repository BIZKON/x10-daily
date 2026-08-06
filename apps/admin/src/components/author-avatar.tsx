/**
 * Аватар автора: картинка, если она задана, иначе первая буква имени на
 * фирменной плашке.
 *
 * 🔴 Зачем компонент. Поле `avatarUrl` жило в БД, форме и ответе api, но не
 * рисовалось НИГДЕ — ни в списке авторов, ни на карточке автора. Загрузка файла
 * проходила, URL сохранялся, а на экране оставалась буква в кружке, и это
 * читалось как «ничего не сохранилось».
 */
export function AuthorAvatar({
  name,
  avatarUrl,
  bylineColor,
  size = 48,
}: {
  name: string;
  avatarUrl?: string | null;
  bylineColor?: string | null;
  size?: number;
}) {
  const style = { width: size, height: size };

  if (avatarUrl) {
    return (
      // Обычный <img>: аватары раздаёт Caddy с прод-домена, оптимизатор
      // next/image админке не нужен (внутренний инструмент, трафик мал).
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={avatarUrl}
        alt=""
        style={style}
        className="shrink-0 rounded-full border border-fence object-cover"
        loading="lazy"
      />
    );
  }

  return (
    <span
      style={{
        ...style,
        fontSize: Math.round(size / 3),
        background: bylineColor ?? "linear-gradient(135deg, var(--color-red), var(--color-gold))",
      }}
      className="grid shrink-0 place-items-center rounded-full font-display font-extrabold text-night"
      aria-hidden
    >
      {name.charAt(0)}
    </span>
  );
}
