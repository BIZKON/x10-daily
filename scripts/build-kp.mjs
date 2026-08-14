/**
 * Сборка партнёрских версий коммерческого предложения (white-label).
 *
 * Персона стоит В КОНЦЕ документа (решение владельца 13.08): первый экран у
 * всех одинаковый, а к тому, от кого предложение, клиент приходит уже прочитав
 * его. Различаются фото, имя, роль и контакты.
 *
 * 🔴 Зачем генератор, а не три файла. Тело КП одно на всех, и различается
 * только персона. Три копии HTML разъехались бы на первой же правке цены:
 * поправил в одной — две ссылки продолжают продавать старое. Здесь правится
 * одно место, пересборка раскладывает изменение по всем партнёрам.
 *
 * Страница получается САМОДОСТАТОЧНОЙ: фото вшивается в HTML как data-URI,
 * ровно как это уже сделано в основном КП. Внешних ссылок на картинки нет —
 * удалили файл на сервере, а документ у клиента всё равно целый.
 *
 * Зависимостей нет: чистый Node плюс системный `sips` (macOS) для обрезки
 * фото. Нет `sips` — фото уходит как есть, сборка не падает.
 *
 * Запуск:  node scripts/build-kp.mjs
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LANDING = path.join(ROOT, "landing");
const TEMPLATE = path.join(LANDING, "kp", "template.html");
const CONFIG = path.join(LANDING, "kp", "partners.json");
const PHOTOS = path.join(LANDING, "partners");
const BASE_URL = "https://app.pro-agent-ai.ru/kp";

/** Размер портрета в странице. Больше не нужно: он рисуется максимум 120px. */
const PHOTO_PX = 400;

const esc = (s) =>
  String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");

/** Инициалы для заглушки: пока фото не прислали, дыры в вёрстке быть не должно. */
function initials(name) {
  return String(name)
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join("");
}

/**
 * Фото партнёра как data-URI.
 *
 * Обрезаем в квадрат по короткой стороне и жмём: снимок с телефона весит
 * мегабайты, а внутри страницы это утроилось бы в base64 — КП открывалось бы
 * на мобильном интернете полминуты.
 */
function photoDataUri(file) {
  const src = path.join(PHOTOS, file);
  if (!fs.existsSync(src)) return null;

  const tmp = path.join(PHOTOS, `.build-${file.replace(/\.[^.]+$/, "")}.jpg`);
  let out = src;
  try {
    execFileSync("sips", [
      "-s", "format", "jpeg",
      "-s", "formatOptions", "72",
      "-Z", String(PHOTO_PX * 2),
      "--cropToHeightWidth", String(PHOTO_PX), String(PHOTO_PX),
      src, "--out", tmp,
    ], { stdio: "ignore" });
    out = tmp;
  } catch {
    console.warn(`  ⚠ sips не отработал на ${file} — вшиваю файл как есть`);
  }

  const b64 = fs.readFileSync(out).toString("base64");
  if (out === tmp) fs.rmSync(tmp, { force: true });
  const kb = Math.round((b64.length * 3) / 4 / 1024);
  return { uri: `data:image/jpeg;base64,${b64}`, kb };
}

const template = fs.readFileSync(TEMPLATE, "utf8");
const { partners } = JSON.parse(fs.readFileSync(CONFIG, "utf8"));

const seen = new Set();
for (const p of partners) {
  // Телефон НЕ обязателен: у партнёра может быть только Telegram, и это
  // нормально — кнопка просто не рисуется. Обязателен способ связи вообще.
  for (const field of ["slug", "name", "role", "tg"]) {
    if (!p[field]) throw new Error(`Партнёр ${p.slug ?? "?"}: не заполнено поле «${field}»`);
  }
  // Одинаковый slug молча затёр бы чужую страницу: два партнёра — один адрес.
  if (seen.has(p.slug)) throw new Error(`Повторяется адрес: ${p.slug}`);
  seen.add(p.slug);

  const photo = p.photo ? photoDataUri(p.photo) : null;
  const page = template
    // 🔴 Портрет заменяется ПЕРВЫМ, до имени: в теге есть alt="{{PERSON_NAME}}",
    // и подстановка имени раньше сломала бы точное совпадение — фото молча не
    // встало бы, а страница выглядела бы целой.
    .replaceAll(
      '<img src="{{PERSON_PHOTO}}" width="400" height="400" alt="{{PERSON_NAME}}" loading="lazy" decoding="async">',
      photo
        ? `<img src="${photo.uri}" width="${PHOTO_PX}" height="${PHOTO_PX}" alt="${esc(p.name)}" loading="lazy" decoding="async">`
        // Заглушка — родная для шаблона `.avatar .ini`: она уже вписана в круг.
        // Своя разметка вылезала за рамку аватара.
        : `<span class="ini" aria-hidden="true">${esc(initials(p.name))}</span>`,
    )
    .replaceAll("{{PERSON_NAME}}", esc(p.name))
    .replaceAll("{{PERSON_ROLE}}", esc(p.role))
    .replaceAll("{{TG_URL}}", esc(p.tg))
    .replaceAll("{{PHONE_LABEL}}", esc(p.phone ?? ""))
    .replaceAll("{{PHONE_HREF}}", esc(String(p.phone ?? "").replace(/[^\d+]/g, "")))
    .replaceAll("{{PAGE_URL}}", `${BASE_URL}/${p.slug}/`);

  // Без телефона кнопку убираем целиком: пустая ссылка «tel:» на телефоне
  // открывает набор пустого номера, а рядом с Telegram висела бы дырка.
  const withPhone = p.phone
    ? page
    : page.replace(/\s*<a class="act[^"]*\btel\b[^"]*"[^>]*>[^<]*<\/a>/g, "");

  // Незаменённый плейсхолдер — это дыра в документе, который уйдёт клиенту.
  // Лучше уронить сборку, чем отправить страницу с «{{...}}» на видном месте.
  const left = withPhone.match(/\{\{[A-Z_]+\}\}/g);
  if (left) throw new Error(`${p.slug}: не подставлено ${[...new Set(left)].join(", ")}`);

  const dir = path.join(LANDING, p.slug);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "index.html"), withPhone);

  const size = Math.round(Buffer.byteLength(withPhone) / 1024);
  const photoNote = photo ? `фото ${photo.kb} КБ` : "без фото (кружок с инициалами)";
  const phoneNote = p.phone ? p.phone : "только Telegram";
  console.log(`✓ /kp/${p.slug}/  — ${p.name}, ${phoneNote}, ${size} КБ, ${photoNote}`);
}

console.log(`\nГотово: ${partners.length} страниц. Выкатить — ./deploy.sh`);
