// Сборка PDF-версии КП Даниловой из index.html.
// Зачем: клиент в Латвии не всегда может открыть ссылку — PDF уходит файлом
// в мессенджер. index.html остаётся единственным источником текста; этот
// скрипт на лету заменяет интерактивный конструктор цен статичной таблицей
// (в PDF галочки мертвы), снимает анимации и режет документ на страницы A4.
//
// Запуск:  node landing/danilova/make-pdf.mjs
// Выход:   landing/danilova/dist/kp-print.html + dist/*.pdf (dist в gitignore)
// Требует: установленный Google Chrome (рендер через headless print-to-pdf).

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(here, 'index.html'), 'utf8');

// Числа рассрочки повторяют формулу конструктора: первый платёж 2 000 €,
// остаток равными долями, хвост округления забирает последний платёж.
const BUNDLE = 15000;
const FIRST = 2000;
const plan = (months) => {
  const rest = BUNDLE - FIRST;
  const base = Math.floor(rest / months);
  const last = rest - base * (months - 1);
  return { base, last };
};
const fmt = (n) => n.toLocaleString('ru-RU').replace(/ /g, ' ') + ' €';
const m6 = plan(6);
const m12 = plan(12);

// ── 1. Интерактивный конструктор → статичный блок цен ──
const calcStart = src.indexOf('<div class="calc" id="calc">');
const bandAfter = src.indexOf('<div class="band">', calcStart);
if (calcStart < 0 || bandAfter < 0) {
  throw new Error('якоря конструктора в index.html не найдены — сверь разметку');
}

const staticBlock = `<div class="calc" style="break-inside:avoid;">
      <div class="head" style="padding-bottom:26px;">
        <div class="total-was">по отдельности — 19 000 €</div>
        <div class="total">15 000 €</div>
        <div class="total-sub">полный комплект под ключ · экономия 4 000 € · наставники, обновление сайта и полный пакет GDPR-документов — только в комплекте</div>
      </div>
    </div>

    <h4>Состав и цены — если собирать по отдельности</h4>
    <div class="mx">
      <div class="row"><div class="n">Мобильное приложение центра</div><span class="pill set">8 000 €</span><div class="w">Собственное приложение в App Store и Google Play: запись, история посещений, push-напоминания, оплата. Вариант дешевле: одна платформа — 5 000 €.</div></div>
      <div class="row"><div class="n">Контент-завод</div><span class="pill set">4 000 €</span><div class="w">Посты, обложки и статьи на русском и латышском — ни одна публикация без вашего «да». Вариант дешевле: лайт, 8 публикаций в месяц — 2 500 €.</div></div>
      <div class="row"><div class="n">Голосовой агент на телефоне</div><span class="pill set">3 000 €</span><div class="w">Приём звонков 24/7: запись, перенос, напоминания, ответы на частые вопросы. Представляется помощником клиники, по просьбе переводит на человека.</div></div>
      <div class="row"><div class="n">Боты записи в соцсетях</div><span class="pill set">3 000 €</span><div class="w">Telegram и Instagram: свободные окна, запись в два касания и оплата прямо в чате (Stripe / Klix by Citadele). Вариант дешевле: только Telegram — 2 000 €.</div></div>
      <div class="row"><div class="n">Агенты записи и контроля</div><span class="pill set">1 000 €</span><div class="w">Расписание врачей, контроль неявок и напоминания, еженедельные разборы потока пациентов и выручки — к утру понедельника.</div></div>
      <div class="row is-set"><div class="n">Итого по отдельности</div><span class="pill warn">19 000 €</span><div class="w"><b>Под ключ — 15 000 €:</b> всё из таблицы, плюс наставники дважды в неделю, обновление сайта и полный пакет GDPR-документов — отдельно они не продаются.</div></div>
    </div>

    <div class="note" style="break-inside:avoid;">
      <b>Ядро — цифровой администратор</b> (база знаний клиники, единый тон, журнал разговоров) входит в любой набор: без него сервисы не работают. Рассрочка действует для наборов от 4 000 €; меньшие наборы оплачиваются 50/50 — старт и сдача.
    </div>

    <h4>Рассрочка на комплект «под ключ» — без процентов и без банка</h4>
    <div class="cols">
      <div class="col a">
        <div class="cap">6 месяцев · сбалансированно</div>
        <h5>2 000 € + 6 × ${fmt(m6.base)}</h5>
        <p>Первый платёж 2 000 € при подписании запускает работы. Дальше — шесть месячных платежей по ${fmt(m6.base)} (последний — ${fmt(m6.last)}). Итого 15 000 €.</p>
      </div>
      <div class="col b">
        <div class="cap">12 месяцев · легче для кассы</div>
        <h5>2 000 € + 12 × ${fmt(m12.base)}</h5>
        <p>Первый платёж 2 000 € при подписании запускает работы. Дальше — двенадцать месячных платежей по ${fmt(m12.base)} (последний — ${fmt(m12.last)}). Итого 15 000 €.</p>
      </div>
    </div>

    `;

let html = src.slice(0, calcStart) + staticBlock + src.slice(bandAfter);

// ── 2. Лид секции цен: убрать упоминание галочек ──
const ledeWas = 'снимите галочку: конструктор пересчитает стоимость и график платежей';
const ledeNow = 'можно собрать набор поштучно — цены каждой услуги в таблице ниже';
if (!html.includes(ledeWas)) {
  throw new Error('фраза лида про конструктор не найдена — сверь index.html');
}
html = html.replace(ledeWas, ledeNow);

// ── 3. Скрипты не нужны: конструктора нет, появление задаёт печатный CSS ──
html = html.replace(/<script>[\s\S]*?<\/script>/g, '');

// ── 4. Ссылка на онлайн-версию в подвале ──
html = html.replace(
  'юридическое сопровождение сделки ведёт лицензированный юрист.',
  'юридическое сопровождение сделки ведёт лицензированный юрист. Онлайн-версия предложения: <a href="https://danilova-kp.website.twcstorage.ru" style="color:inherit;">danilova-kp.website.twcstorage.ru</a>.'
);

// ── 4б. Градиентные заголовки → посимвольные сплошные цвета ──
// Chrome при печати рисует волосяную рамку вокруг background-clip:text
// (лечению не поддаётся: зависит от субпиксельного положения бокса).
// Поэтому в PDF градиент собирается из букв сплошного цвета — интерполяция
// тех же стопов (#7C3AED → #EC4899 52% → #F59E0B), на глаз неотличимо.
const stops = [
  [0x7c, 0x3a, 0xed],
  [0xec, 0x48, 0x99],
  [0xf5, 0x9e, 0x0b],
];
const gradColor = (t) => {
  const [a, b, t2] =
    t <= 0.52
      ? [stops[0], stops[1], t / 0.52]
      : [stops[1], stops[2], (t - 0.52) / 0.48];
  return (
    '#' +
    a
      .map((v, i) => Math.round(v + (b[i] - v) * t2).toString(16).padStart(2, '0'))
      .join('')
  );
};
html = html.replace(/<span class="grad">([^<&]+)<\/span>/g, (_m, text) => {
  const chars = [...text];
  const n = chars.length;
  const colored = chars
    .map((ch, i) =>
      /\s/.test(ch) ? ch : `<span style="color:${gradColor((i + 0.5) / n)}">${ch}</span>`
    )
    .join('');
  return `<span class="grad-print">${colored}</span>`;
});
if (html.includes('class="grad"')) {
  throw new Error('остались .grad с разметкой или сущностями внутри — расширь трансформацию');
}

// ── 4в. Печатная типографика: «€» не отрывается от числа ──
// Вычитка PDF нашла переносы «15–21 тыс. / €» и «До 10 млн / €» —
// связываем валюту и множители неразрывными пробелами (только в PDF).
html = html
  .replace(/ €/g, ' €')
  .replace(/(\d) (тыс|млн|млрд)/g, '$1 $2');

// ── 5. Блок цен начинается с новой страницы ──
const priceAnchor = '<section class="slide">\n    <div class="slide-no">сколько это стоит</div>';
if (!html.includes(priceAnchor)) {
  throw new Error('якорь секции цен не найден — сверь index.html');
}
html = html.replace(
  priceAnchor,
  '<section class="slide" id="pricing">\n    <div class="slide-no">сколько это стоит</div>'
);

// ── 6. Печатные стили: A4, поток без пустот, карточки не рвутся ──
// Грабли, найденные при отладке рендера (Chrome 139 headless):
//  · печатный вьюпорт ~725px < 760px → срабатывает мобильный медиазапрос и
//    в PDF попадает ВЕРТИКАЛЬНАЯ схема выше страницы — форсим горизонтальную;
//  · background-clip:text печатает волосяную рамку вокруг градиентного
//    текста — поэтому заголовки пересобраны посимвольно (шаг 4б);
//  · break-after:avoid на лиде заставляет движок рвать САМ лид посередине
//    с пустотой в полстраницы — на лид не вешать;
//  · «каждая секция с новой страницы» даёт полупустые листы — секции текут
//    свободно (zoom 0.85 уплотняет), с новой страницы только обложка и цены.
const printCss = `<style>
  /* печатная версия — собирается make-pdf.mjs, в браузерную не попадает */
  @page{size:A4;margin:10mm 9mm 12mm;}
  *{-webkit-print-color-adjust:exact !important;print-color-adjust:exact !important;}
  body{background:#fff;}
  .wrap{max-width:none;padding:0;}
  .rise{opacity:1 !important;transform:none !important;transition:none !important;}
  .blob{animation:none !important;}
  .dock{display:none !important;}
  header.hero{margin:0;min-height:252mm;display:flex;align-items:center;break-after:page;}
  section.slide,footer{zoom:0.85;}
  #pricing{break-before:page;}
  figure.line .line-wide{display:block !important;}
  figure.line .line-tall{display:none !important;}
  .cols{grid-template-columns:repeat(2,minmax(0,1fr));}
  .col,.p,.row,.fig,.st,.mode,.shot,.band,.note,.cbox,figure.line,.calc{break-inside:avoid;}
  .slide-no,h3,h4{break-inside:avoid;break-after:avoid;}
</style>
`;
html = html.replace('</head>', printCss + '</head>');

// ── 7. Записать и отрендерить ──
const outDir = join(here, 'dist');
mkdirSync(outDir, { recursive: true });
const printHtml = join(outDir, 'kp-print.html');
writeFileSync(printHtml, html);

const pdfPath = join(outDir, 'Цифровой центр клиники Даниловой.pdf');
execFileSync(
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  [
    '--headless',
    '--disable-gpu',
    '--no-pdf-header-footer',
    `--print-to-pdf=${pdfPath}`,
    'file://' + printHtml,
  ],
  { stdio: 'inherit' }
);
console.log('Готово →', pdfPath);
