import { ImageResponse } from "next/og";
import type { NextRequest } from "next/server";
import { manropeExtraBold, manropeRegular } from "./fonts";

/**
 * Сборка обложки статьи (Спека 3, стиль А «нижняя плашка»).
 *
 * Модель рисует ТОЛЬКО фон-иллюстрацию; заголовок, логотип и рекламная строка
 * накладываются здесь — детерминированно. Причина: генеративная модель коверкает
 * кириллицу и не воспроизводит логотип кадр-в-кадр, а «почти правильный» логотип
 * для делового медиа — брак (см. packages/voice/visual.md).
 *
 * Движок — `next/og` (Satori + resvg), встроенный в Next 16. Новых зависимостей
 * не требует.
 * ⚠️ Satori НЕ понимает woff2, поэтому шрифт лежит рядом в TTF, а не берётся из
 * `next/font/google` (тот отдаёт woff2).
 * ⚠️ Satori поддерживает только flexbox — grid и float здесь не работают.
 */

// ⚠️ НЕ добавлять `export const runtime` — в этом проекте включён
// `cacheComponents` (next.config.ts), а он несовместим с route segment config
// "runtime": билд падает с «Route segment config "runtime" is not compatible
// with nextConfig.cacheComponents». Рантайм по умолчанию нас устраивает.

/** Кадр 16:9 — размер превью YouTube/Telegram. */
const W = 1280;
const H = 720;

/** Подпись рубрики в кикере. Неизвестная рубрика → без кикера. */
const KICKER: Record<string, string> = {
  news: "НОВОСТИ ИИ",
  cases: "КЕЙС",
  howto: "ОБУЧЕНИЕ",
  tools: "ИНСТРУМЕНТЫ",
  business: "ПРАКТИКА",
  founder: "ОТ ОСНОВАТЕЛЯ",
};

/**
 * Рекламная строка чередуется по рубрике (решение владельца): кейсы и практика
 * ведут на лид, остальное — в контент. Логика намеренно здесь, а не в конвейере:
 * это часть оформления, а не данных статьи.
 */
function ctaFor(category: string): string {
  return category === "cases" || category === "business"
    ? "Обсудить внедрение →"
    : "Разбор в Mini App →";
}

const RED = "#E63946";
const GOLD = "#D4A24C";
const NIGHT = "#0B0B0E";
const PAPER = "#F2F2F2";
const MIST = "#A0A0A8";

export async function GET(req: NextRequest) {
  const { searchParams, origin } = new URL(req.url);

  const bg = searchParams.get("bg") ?? "";
  const headline = (searchParams.get("h") ?? "").slice(0, 60);
  const sub = (searchParams.get("sub") ?? "").slice(0, 90);
  const category = searchParams.get("cat") ?? "news";

  // 🔴 Гард: рендерим только НАШИ фоны. Без него маршрут стал бы открытым
  // генератором картинок с чужим фоном под нашим логотипом (и SSRF-поверхностью).
  const allowedBase = process.env.COVERS_PUBLIC_BASE_URL || `${origin}/covers`;
  if (!bg || !bg.startsWith(allowedBase)) {
    return new Response("bg должен указывать на COVERS_PUBLIC_BASE_URL", { status: 400 });
  }
  if (!headline) {
    return new Response("h (заголовок) обязателен", { status: 400 });
  }

  const kicker = KICKER[category];

  return new ImageResponse(
    <div style={{ display: "flex", width: W, height: H, position: "relative", background: NIGHT }}>
      {/* Фон-иллюстрация. object-position выше центра: композиция промпта держит
          объект в верхних двух третях, низ отдан под плашку. */}
      <img
        src={bg}
        width={W}
        height={H}
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          width: W,
          height: H,
          objectFit: "cover",
          objectPosition: "center 28%",
        }}
        alt=""
      />

      {/* Шторка: прозрачная сверху, сплошная к низу — гарантия читаемости текста
          независимо от того, что нарисовала модель. */}
      <div
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          width: W,
          height: H,
          // ⚠️ Явные width/height обязательны: Satori НЕ понимает шорткат `inset`,
          // и без размеров блок схлопывается — шторка просто не появляется, а
          // заголовок ложится на светлую картинку нечитаемым.
          background: `linear-gradient(180deg, rgba(11,11,14,0) 0%, rgba(11,11,14,0.10) 34%, rgba(11,11,14,0.86) 52%, ${NIGHT} 62%, ${NIGHT} 100%)`,
        }}
      />

      {/* Фирменная красная кромка слева. */}
      <div
        style={{ position: "absolute", left: 0, top: 0, width: 14, height: H, background: RED }}
      />

      {/* Текстовый блок. */}
      <div
        style={{
          position: "absolute",
          left: 72,
          top: 352,
          display: "flex",
          flexDirection: "column",
          width: 1130,
        }}
      >
        {kicker ? (
          <div
            style={{
              fontFamily: "Manrope",
              fontWeight: 800,
              fontSize: 20,
              letterSpacing: 4,
              color: GOLD,
              marginBottom: 14,
            }}
          >
            {kicker}
          </div>
        ) : null}
        <div
          style={{
            fontFamily: "Manrope",
            fontWeight: 800,
            fontSize: 76,
            lineHeight: 1.02,
            letterSpacing: -1.5,
            color: PAPER,
          }}
        >
          {headline}
        </div>
        {sub ? (
          <div
            style={{
              fontFamily: "Manrope",
              fontWeight: 400,
              fontSize: 27,
              color: MIST,
              marginTop: 14,
            }}
          >
            {sub}
          </div>
        ) : null}
      </div>

      {/* Логотип + слоган. */}
      <div
        style={{ position: "absolute", left: 72, top: 600, display: "flex", alignItems: "center" }}
      >
        <div
          style={{
            display: "flex",
            width: 62,
            height: 62,
            borderRadius: 16,
            background: RED,
            alignItems: "center",
            justifyContent: "center",
            fontFamily: "Manrope",
            fontWeight: 800,
            fontSize: 26,
            color: "#fff",
          }}
        >
          PA
        </div>
        <div style={{ display: "flex", flexDirection: "column", marginLeft: 16 }}>
          <div style={{ fontFamily: "Manrope", fontWeight: 800, fontSize: 26, color: PAPER }}>
            ProAgent AI
          </div>
          <div style={{ fontFamily: "Manrope", fontWeight: 400, fontSize: 20, color: GOLD }}>
            ИИ работает на вас
          </div>
        </div>
      </div>

      {/* Рекламная строка. */}
      <div
        style={{
          position: "absolute",
          right: 56,
          top: 598,
          display: "flex",
          background: RED,
          color: "#fff",
          fontFamily: "Manrope",
          fontWeight: 800,
          fontSize: 22,
          padding: "16px 26px",
          borderRadius: 12,
        }}
      >
        {ctaFor(category)}
      </div>
    </div>,
    {
      width: W,
      height: H,
      fonts: [
        { name: "Manrope", data: manropeExtraBold, weight: 800, style: "normal" },
        { name: "Manrope", data: manropeRegular, weight: 400, style: "normal" },
      ],
    },
  );
}
