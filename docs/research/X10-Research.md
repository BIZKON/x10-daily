# Новостной мини-апп для Игоря Рыбакова и сообщества Х10: исследование, бенчмарк и React-мокапы

## TL;DR
- **Х10 Движение — это не «закрытый клуб миллиардеров», а массовая бесплатная франшиза малых групп («клампов») при Рыбаков Фонде**: ~30 885 участников в 124 городах и 11 странах (счётчик x10movement.ru, 2025–2026), рост идёт через ритуал ежемесячных встреч клампов, форумы «КОД Х10» и контент Рыбакова (~6 млн подписчиков суммарно по всем каналам). Новостной мини-апп должен стать ежедневной точкой контакта между бесплатной массой Х10 и платными монетизируемыми продуктами (Эквиум, форумы, образовательные продукты).
- **Победный продуктовый рецепт — это гибрид «драйва» Morning Brew/Axios (smart brevity, дайджест дня, геймификация) и «премиальности» Stratechery/Hampton/The Information (авторская колонка миллиардера, gated-разделы для Х10, директория участников)**: бесплатный быстрый дайджест + платная аналитическая надстройка + сообществная часть с клампами и событиями.
- **Технологически — Telegram Mini App + MAX Mini App + standalone PWA на Next.js / React + Tailwind + shadcn/ui**, со встроенной AI-персонализацией ленты, голосовыми саммари (для интервью Рыбакова), push-уведомлениями утреннего и вечернего дайджеста, а также социальной механикой «прочитал — обсуди в клампе».

---

# ЧАСТЬ 1. Механика сообщества Х10

## 1.1. Что такое Х10 и откуда оно взялось

Х10 — это **экосистема Игоря Рыбакова и Рыбаков Фонда**, развернувшаяся в три этапа:

| Год | Что произошло |
|---|---|
| 2019 | Основана **X10 Academy** — авторская школа предпринимательских искусств Рыбакова (база — МФТИ) |
| 2020 | Запущена **RYBAKOV Х10 ACADEMY** в формате «мастеринга»: Гранд-мастер (Рыбаков) → Мастера → Премастера → ученики. Целевая «пропускная мощность» ~3 000 учеников |
| 2022 | Сообщество стало **Х10 Движением** — открытым для лидеров из бизнеса, культуры, образования, спорта; ядро — массовый формат «клампов» |

**Манифест** (с x10movement.ru): «Х10 Движение — это сообщество людей, которые хотят улучшить качество своей жизни. Наша миссия — объединять людей для процветания». Идеология «Силы Сообществ» позиционируется как вклад Рыбаков Фонда в Национальные цели развития РФ до 2036 года.

В основе — три «закона силы» Рыбакова: (1) малая группа (кламп), (2) «длить себя в других», (3) основной инстинкт моделирования («чтобы стать сильным, усиливай людей рядом»).

## 1.2. Структура и форматы

**Иерархия ролей:**
- **Грандмастер** — Игорь Рыбаков (1 человек).
- **Президент Движения** — Александр Сила; директор по развитию — Ольга Журавлёва.
- **Совет / Пульсар** — управляющий орган.
- **Региональные лидеры** — представители города, избираются на год.
- **Интеграторы** — амбассадоры смыслов Х10.
- **Кламперы** — лидеры малых групп.
- **Участники клампов** — базовый уровень.

**Кламп** — это 6–10 человек, объединённых общей целью на 3 месяца. Встречи 2 раза в месяц (онлайн или офлайн) по фирменной методологии. Любой может зарегистрировать свой кламп на платформе x10movement.ru.

**Ритуалы и форматы:**
- Региональные бизнес-форумы и **X10 Business Meet Up by Rybakov** (например, апрель 2026 в Москве, Уфа, Иркутск, Томск).
- **Международный форум «КОД Х10»** — главное ежегодное событие, в 2025 проходил в Москве на 7 стран, 50+ городов.
- **Школа Интегративного Лидерства** (ШИЛ) — еженедельные эфиры по вторникам в 20:00.
- **Школа Региональных Лидеров**, **Карьерный центр**, **IPS** (Impact Privilege Score) — система метрик активности.
- **X10Talks** — формат публичных выступлений (запущен в марте 2025 в Ставрополе).
- **Бизнес-игры, разборы, бизнес-завтраки, фестивали** (например, фестиваль с PRO Женщин ко Дню матери).

**Численность и география** (по официальным данным x10movement.ru и Telegram-канала на 2025–2026):
- **30 885 участников** по всему миру (по счётчику на главной).
- **11 стран** (в 2025-м было 7), включая Россию, Беларусь, Казахстан, ОАЭ, Италию и др. По Telegram-каналу сообщества указывается «более 28 000 участников в 30+ странах» — расхождение связано с разной методикой счёта (зарегистрированные на сайте vs. широкая аудитория).
- **124 города**.
- На момент первой годовщины (2023) — 5 698 участников и 982 клампа в 146 городах и 18 странах.

**Тарифы:** прямое участие в Х10 Движении и регистрация клампа — **бесплатные**. Монетизация идёт через смежные платные продукты (см. 1.4).

## 1.3. Контентная воронка и каналы Рыбакова

| Канал | Подписчики (2025–2026) | Формат |
|---|---|---|
| YouTube «Игорь Рыбаков» | ~2,6 млн (Forbes.ru) | Длинные ролики, новости бизнеса, разборы |
| YouTube RYBAKOV MUSIC | отдельный канал | Музыка, синглы 2025: «Давай повторим», «Два сына, две дочки» |
| Instagram @rybakov_igor | ~1 млн | Личное, семья, бизнес |
| TikTok | ~2,1 млн | Короткие видео, вирусные нарезки |
| Telegram | ~150–156 тыс. | Бизнес-комментарии, прямая речь |
| RUTUBE | ~600 видео | Зеркало YouTube |
| **Суммарно** | **~6 млн подписчиков** | На всех платформах (с rybakovigor.com) |

**Ключевые нарративы 2025–2026 (по контенту канала):**
- **Налоги и налоговая реформа** — «Поборы станут удавкой для бизнеса?»
- **Россия 2026: катастрофа или прорыв?**
- **Геополитика и экономика** — Трамп, санкции, рубль, нефть.
- **«Длить себя в других»**, ученики, наставничество.
- **Образование** — Физтех 2050, инициатива на 25 лет совместно с МФТИ (соглашение 25 июля 2024).
- **Семья, дети, не оставлять наследство детям.**

**Команда блога:** редактор, помощник редактора, монтажёр, оператор, пиарщик; бюджет ведения канала $30–50 тыс./мес.

**Тон Рыбакова:** прямой, провокационный, без суфлёра, импровизация. Образ — «свой парень»-миллиардер. Большая часть аудитории — люди с доходом до 70 тыс. руб./мес. («Ведомости.Город»).

## 1.4. Бизнес-модель и связь с экосистемой

Х10 Движение — **некоммерческая часть** экосистемы. Монетизация системы Рыбакова распределена по другим юнитам:

- **Корпорация «Технониколь»** — основной источник состояния ($2,4 млрд по Forbes Real-Time на сентябрь 2025); 56 заводов в 7 странах, выручка >$2 млрд/год.
- **Рыбаков Фонд** (2015) — капитал 1 млрд ₽, экосистема из 10 организаций, охват >300 тыс. человек с 2015.
- **Эквиум** — закрытый платный бизнес-клуб (high-impact entrepreneurs), включает «Чаптер Игоря Рыбакова». Резидентство платное (исторически до 800 тыс. ₽/год — по данным РБК 2017 г.), отделения в Москве, Екатеринбурге, Краснодаре, СПб, Самаре, Новосибирске, Беларуси.
- **Rybakov PlaySchool** / **Университет детства** (выкуплен у Brookes Education в 2024).
- **Глобальный университет Рыбакова** (Rybakov University), Школа Игоря Рыбакова при МФТИ.
- **SOK** — сеть смарт-офисов и коворкингов (~50 000 м²).
- **Prytek**, **Николь Пак**, венчурный фонд **Larix** (совместно с Оскаром Хартманном).
- **Rybakov Music**, книги («Жажда», «Ток», «Отец», «Secret X10»), мерч (rybakov.store).

**Логика воронки:** массовые соцсети (6 млн) → бесплатное Х10 Движение (~30 тыс. активных) → платные продукты (Эквиум, образовательные программы, мероприятия).

**Риски и противоречия:**
- В медиа-пространстве звучит критика «инфоцыганства» — YouTube-видео «Из миллиардера в инфоцыгана: курсы, секта Х10», «Рыбаков: миллиардер или инфоцыган?». Это требует от нового продукта чёткой границы: **новости и аналитика, а не «успешный успех»**.
- **Кейс Аяза Шабутдинова** (Like Центр приговорён к 7 годам колонии 31 октября 2025 по 113 эпизодам мошенничества, ущерб ~57 млн ₽) — мощный фон, после которого инфобизнес в России находится под давлением. Х10 как раз позиционирует себя бесплатным, что снижает риски.
- Иностранный агентский статус ряда смежных филантропических проектов — нужно осторожно проходить регуляторный ландшафт.

## 1.5. Целевая аудитория и психографика

**Социально-демографический портрет:**
- Возраст: 28–50 лет, ядро 32–45.
- География: Россия (от Москвы до Магнитогорска и Иркутска), плюс русскоязычные сообщества Беларуси, Казахстана, ОАЭ, Кипра, Турции.
- Опыт в бизнесе: разнородный — от микропредпринимателей и фрилансеров до владельцев бизнеса на 0,5–1 млрд ₽ выручки. Эквиум отсекает топ-сегмент (high-impact); Х10 — для широкой массы.
- Доход: бóльшая часть аудитории YouTube — до 70 тыс. ₽/мес.

**Психографика и боли:**
- Предпринимательское одиночество, выгорание.
- Желание «масштабироваться», но без понимания «как».
- Стремление к комьюнити «своих», доверию.
- Тревога по поводу налогов, регулирования, релокации, будущего страны.
- Жажда сильных ролевых моделей, мужской/наставнической фигуры.
- Запрос на смысл («длить себя в других», импакт).

**Что они читают:** YouTube-каналы предпринимателей, Telegram-каналы (Forbes, РБК Pro, «Бизнес-секреты» Тинькоффа), подкасты («ПозитивЭкстра», «Подкаст про деньги»), TikTok-нарезки бизнес-блогеров.

## 1.6. Конкурентное поле

| Игрок | Статус | УТП vs Х10 |
|---|---|---|
| **Like Центр / Аяз Шабутдинов** | Аяз приговорён к 7 годам колонии 31.10.2025; выручка упала с 6 млрд (2023) до 1,1 млрд ₽ (2024). Юрлицо банкротят | Х10 бесплатное и неагрессивное → меньше юр.рисков |
| **Synergy / Бизнес-Молодость наследие** | Действующие форумы, нишевые онлайн-курсы | Х10 — про сообщество, а не «продажи курсов» |
| **Олег Тиньков, Пётр Осипов, Михаил Дашкиев** | Локальные блоги, отдельные продукты | Х10 — единая экосистема, а не одиночная фигура |
| **Эквиум** | Закрытый клуб high-impact, платный | Х10 — массовая бесплатная «верхняя воронка» |
| **Атланты, Клуб Первых, Сколково, Noôdome** | Премиум-клубы | Х10 шире по охвату, проще по входу |

**УТП Х10:** масштабная сеть малых групп + бесплатный вход + сильный медийный «голос» Рыбакова + интеграция с премиум-клубом Эквиум.

---

# ЧАСТЬ 2. Бенчмарк мировых нишевых медиа для предпринимателей

## 2.1. Сравнительная таблица

| Медиа | Ниша | Аудитория | Монетизация | Что копировать |
|---|---|---|---|---|
| **Morning Brew** | Daily business newsletter | 4M+ free subs | $75M annual revenue (по словам сооснователя Austin Rief на блоге Hampton, февраль 2025); B2B ~$25M от Pro-бренда в 2024; полностью куплен Axel Springer (февраль 2025) | Утренний дайджест, тон «smart friend», реферальная программа, native ads |
| **The Hustle** | Стартапы, side hustle | 2M+ subs; куплен HubSpot за $27M (2021) | Реклама + Trends.co ($299/yr, 15K+ subscribers) | Развлекательный тон, Trends как премиум-данные |
| **Stratechery** (Ben Thompson) | Стратегия tech | ~40K+ платных | $12/мес или $120/год; ~$5M ARR; Stratechery Plus = Update + Sharp Tech + Sharp China + Dithering | Минималистичный дизайн, авторский голос, gated daily updates |
| **The Information** | Premium tech news | 45 000 paid subscribers as of 2022 (Wikipedia / FT) | $42,25/мес, $399/год, Pro $749/год, $999 Pro, $199 Young Professional | Дорогая подписка, gated с org charts/proprietary data, Slack-community |
| **Sifted (FT)** | European startups | Бесплатная + Pro | Sifted Plus, **Sifted Pro от £999/год** | Deals/Investor/M&A trackers, sector briefings |
| **Lenny's Newsletter** (Substack) | Product/growth | 1.2M+ Substack subs, 377K free + ~4–8% paid | $20/мес или $200/год; >$4M/год; подкаст + Slack | Cross-promo через recommendations, deep deep-dives 10–100ч на пост |
| **Axios** | Политика и бизнес | 30+ newsletters | Реклама + Axios HQ (Smart Brevity SaaS) | Формат «What's new / Why it matters», 17 ms attention rule |
| **Hampton** | Премиум-комьюнити CEOs | 1000+ members | Историч. $8 500/год (2023, Fast Company), теперь по запросу; eligibility $3M revenue или $10M exit | Core groups 8 человек, вето комьюнити, in-person 10×/год |
| **YPO** | Global CEOs | 36,000+ members в 142+ странах (Wikipedia, по данным YPO, 2024) | Global $3 975 + chapter dues $4 380–$5 267 + единоразовая инициация $7 800–$11 475 (YPO Indiana chapter ypolearningyear.com) | YPO Connect+ app, AI-feed, Forum-методология |
| **EO** | Founders ($1M+) | 20 000 leading business founders and owners, representing more than 100 countries and 220+ chapters worldwide (FY24/25 Annual Report, eonetwork.org, июнь 2025): "221 independently operating EO chapters serving entrepreneurs in 61 countries worldwide" | $2 630/год + $3 500 one-time initiation (EO Global Fact Sheet) | MyEO DealExchange, MyEO Groups |

## 2.2. Что цепляет — детально

### Morning Brew
- **Утренний ритуал** — приходит в 6 утра, тон «smart friend».
- **Native ads** в том же стиле, что и редакционка.
- **Referral program** на мерче: 5 рефералов → кружка, 25 → футболка, 100 → доступ к событиям; до 30% новых подписчиков шло отсюда.
- **Кросс-платформенная экосистема** — 60%+ engagement происходит вне email: подкаст Morning Brew Daily (50M+ скачиваний, $5M ARR), YouTube-канал Good Work with Dan Toomey (1,16M подписчиков), Money With Katie.
- **B2B-вертикали** (Marketing Brew, HR Brew, CFO Brew, Emerging Tech Brew, Retail Brew) — диверсификация.
- **Iterable AI** для интент-таргетинга: дал 15K новых подписчиков и $100K экономии в 2025.

### The Hustle / Trends.co / My First Million
- **Hustle Con** — событие как PR-инструмент, потом ушёл из модели в пользу HubSpot INBOUND.
- **Trends.co** — премиум-данные за $299/год для «искателей идей»; 15K+ подписчиков.
- **My First Million** подкаст — 2019 г., вирусный, превратился в часть HubSpot media network.
- **Facebook Group с амбассадорами** — закрытая группа, через которую Sam Parr 18 мес. вручную качал движок.

### Stratechery
- **Один автор = миллионы выручки.** Бен Томпсон 12 лет подряд, ~40K платных подписчиков.
- **Цена $12/мес «специально низкая»** — чтобы быть доступной всем, включая студентов; рассчитана на массу.
- **Stratechery Plus как bundle** — текстовый Update + 4 подкаста (Sharp Tech, Sharp China, Dithering, GOAT). 50% подписчиков слушают, а не читают.
- **Минималистичный дизайн** — белый фон, серый текст Georgia/Helvetica, никакой рекламы, RSS как первоклассный гражданин.
- **Этика как часть бренда** — Томпсон публично декларирует, что не берёт consulting и не держит существенных позиций в акциях.

### The Information
- **Очень дорогая подписка $399/год** + tier-стратегия: $199 для <30 лет на 5 лет, $749 All-Access (гарантированный доступ к ивентам), $999 The Information Pro с charts, proprietary databases, surveys.
- **Gated UX** — paywall, который не пускает даже к headline; превью только превью.
- **Org charts** ведущих tech-компаний как уникальный data-актив.
- **Reddit-like news feed + member directory** (запущено в 2022) — community-механика.
- **Tech Top 10 app за $30/год** — отдельный consumer-продукт для тех, кому $399 много.

### Sifted
- **Sifted Free** (несколько статей в месяц + newsletters + Talks) → **Sifted Plus** → **Sifted Pro** от **£999/год**.
- **Deals Tracker, Market Tracker, Investor Tracker, M&A Tracker** — фильтруемые базы 2 500+ европейских стартапов.
- **Сезонные ProLists** — «15 stealth founders to watch», «20 early-stage hubs»; редакционные ranking-проекты.
- **Sifted Summit** — флагманский ивент в Лондоне.
- **Sifted for Startups** — бесплатно для европейских стартапов <2014 г.

### Lenny's Newsletter
- **Одиночный автор Лен Рачицки** дошёл до 1,2 млн подписчиков на Substack.
- **Подкаст** запущен в 2022 — приносит больше денег, чем сам newsletter.
- **Substack Recommendations engine** — 78% новых подписчиков пришло от рекомендаций других ньюслеттеров (после апреля 2022).
- **Slack-community** для платных подписчиков с тематическими каналами (product, growth, startups, self-promo).
- **«I Can Expense It» tier** ($300) — психологический хак для тех, кто платит из корпоративного кармана.
- **«Living Library»** — кураторские гайды на разные темы.

### Axios + Smart Brevity
Формула из 6 элементов в каждом материале:
1. **Tease** — короткий заголовок-крючок.
2. **Lede** — одна вводящая фраза.
3. **Why it matters** — почему это важно (всегда жирным).
4. **By the numbers / Between the lines / What they're saying** — расшифровка.
5. **The big picture / Yes, but** — контекст и контраргумент.
6. **What's next / Go deeper** — линки.
Средняя длина обновления ~300 слов, время чтения 26 секунд.

### Hampton
- **Core group**: 8 человек, личные встречи 10 раз в год, тренированный модератор Hampton.
- **Chapter events**: до 100+ событий в год по городам, ужины по 10–12 человек на конкретные темы (M&A, hiring execs).
- **Network/Slack**: 1000+ founders, private sub-communities.
- **Вето сообщества** — действующие члены могут заблокировать кандидата.
- Сэм Парр (август 2024, X): вход поднят с $1M до $3M revenue и с $5M до $10M по предыдущему экзиту.

### YPO
- **YPO Connect+** — мобильное приложение с AI-feed, message threads, member directory с гео-поиском, Needs & Leads board.
- **36,000+ участников в 142+ странах** (Wikipedia, 2024).
- **Forum** — конфиденциальная группа 7–10 человек, центральный ритуал.

### EO (Entrepreneurs' Organization)
- **MyEO DealExchange** — закрытая площадка для сделок между членами.
- **MyEO Groups** — 500+ self-formed groups по интересам.
- **Forum** — non-competing peers, no advice giving (только «я сделал X, было Y»).

### On Deck (предостерегающий пример)
- Сильно урезался: уволил 25% (~72 чел.) в мае 2022, ещё треть в августе 2022 (TechCrunch).
- Сейчас работает только **On Deck Founders Fellowship** (ODF, ~$2 990).
- Урок: **broad community без чёткого продукта не масштабируется** — Х10 должен иметь чёткую ценностную сборку.

### South Park Commons
- Основан в 2016 Ручи Сангви (первая женщина-инженер Facebook) и Адитьей Агарвалом (бывший CTO Dropbox).
- Фонд **$150M** (2021), 1000+ членов за 10 лет.
- **Founder Fellowship: $400K за 7% + $600K гарантированно в следующем раунде** = до $1M.
- **Topical Forums** — многонедельные образовательные когорты по фронтирным темам (AI, RL, biotech).
- Урок: gated topical cohorts как мощный retention-механизм.

## 2.3. Тренды UX-2025–2026 для нишевых медиа

- **AI-персонализация лент** (Morning Brew + Iterable; YPO Connect+).
- **Голосовые саммари** статей (Stratechery, NYT — теперь стандарт).
- **Smart Brevity / What's new + Why it matters** (Axios) — формат карточек.
- **Streaks / badges / progress bars** для геймификации чтения (Duolingo-style).
- **Daily digest push 7:00 + evening recap 19:00**.
- **Вертикальное видео внутри ленты** — TikTok-формат уже стандарт у Bloomberg, Quartz, Insider.
- **Подкаст-плеер внутри приложения** — Lenny + Stratechery.
- **Community-feed под статьёй** — реакции, комментарии для подписчиков (как в The Information).
- **Сохранённые / прочитать позже / прогресс чтения** (Pocket, Matter, Readwise).
- **Gated content зоны для платных уровней** (Sifted Pro, The Information Pro).
- **Telegram Mini App full-screen + Stars subscriptions** — новый стандарт для русскоязычных мини-аппов 2026.

## 2.4. Применимость к Х10 (что брать)

| Из чего | Что брать в Х10 |
|---|---|
| Morning Brew | Утренний дайджест Рыбакова + реферальный мерч |
| Axios | Smart Brevity-карточки «Что нового / Почему важно» |
| Stratechery | Авторский голос Рыбакова в премиум-разделе |
| The Information | Платный premium-tier с org charts ключевых компаний |
| Sifted | Filterable trackers — «Налоги», «Господдержка», «Релокация» |
| Lenny | Цикл «Living Library» — кураторские гайды Рыбакова |
| Hampton | Директория с вето сообществом + city-чаптеры (готовые региональные лидеры Х10) |
| YPO Connect+ | AI-feed + гео-поиск участников |
| EO | DealExchange-board для сделок между предпринимателями |
| South Park Commons | Тематические многонедельные форумы внутри Х10 |

---

# ЧАСТЬ 3. Дизайн-код и React-мокапы мини-аппа Х10

## 3.1. Стратегические принципы

**Позиционирование (one-liner):**
> «Х10 — деловой канал миллиардера и сообщества из 30 000 предпринимателей: лента дня, разбор от Рыбакова, события вашего города, чаты клампов».

**Чем отличается от других:**
- Не «новости вообще», а **новости + смыслы + сообщество** в одном.
- Не TV-формат, а **формат миллиардера-блогера** — короткий, дерзкий, мотивирующий.
- Не одиночный сайт, а **мини-апп в Telegram / MAX / standalone** — там, где аудитория уже сидит.

**Tone of voice (по Рыбакову):**
- Прямой, без воды («давайте сразу к делу»).
- Провокационный («Россия 2026: катастрофа или прорыв?»).
- Мотивирующий, без слащавости.
- Цифры, факты, конкретика.
- Дружеский, без академичности.

**Ключевые user jobs (зачем открывают каждый день):**
1. «Я хочу за 5 минут узнать, что важного случилось в бизнесе и экономике России».
2. «Я хочу услышать, что об этом думает Рыбаков».
3. «Я хочу понять, как это влияет на меня лично — налоги, бизнес, деньги».
4. «Я хочу найти людей и события рядом — кламп, бизнес-завтрак, форум».
5. «Я хочу подписываться на конкретные темы — налоги, ИИ, релокация».

**Daily ritual:**
- **07:00** — push «Утренний разбор от Рыбакова» (3 главные новости + 1 вывод от Игоря).
- **13:00** — обед-карусель Smart Brevity (5 коротких карточек).
- **19:00** — «Что сегодня обсуждают в Х10» (3 поста-обсуждения из клампов + 1 короткое видео Рыбакова).
- **Вс 20:00** — длинный «Разбор недели» (лонгрид + 30-мин подкаст).

## 3.2. Дизайн-код

### Цветовая палитра

Под бренд Рыбакова — энергичный, премиальный, мужской, с отсылкой к строительному прошлому (Технониколь) и индустриальной мощи.

| Роль | Hex | Применение |
|---|---|---|
| Background (dark, primary) | `#0B0B0E` | Основной фон тёмной темы |
| Background (light) | `#F7F6F2` | Основной фон светлой темы (бумажный тон) |
| Surface dark | `#16161B` | Карточки в dark |
| Surface light | `#FFFFFF` | Карточки в light |
| Accent — X10 Red | `#E63946` | Основной акцент (CTA, бейджи, «Рыбаков говорит») |
| Accent — Steel | `#1F2937` | Заголовки, чёрный с примесью |
| Accent — Gold | `#D4A24C` | Премиум-уровень, Х10-метки |
| Success | `#3FB950` | Зелёный для метрик |
| Warning | `#F4A261` | Тёплый янтарь |
| Text primary (dark) | `#F2F2F2` | На тёмном фоне |
| Text secondary (dark) | `#A0A0A8` | Подписи |
| Text primary (light) | `#0F0F12` | На светлом фоне |
| Text secondary (light) | `#5B5B66` | Подписи |
| Borders | `#26262C` / `#E5E2DA` | Тонкие линии |

**Принцип:** база — околочёрный фон + кремовый/белый, **акцентный красный** для главных CTA, **золотой** — только для премиум/Х10-маркировки. Никакого синего корпоративного — это отделяет от Тинькофф/Сбера/РБК.

### Типографика

- **Заголовки:** `Manrope` (700/800) — современный геометрический, отлично рендерит кириллицу, мощно смотрится в крупном кегле.
- **Текст:** `Inter` (400/500/600) — стандарт читабельности, отличная поддержка русского.
- **Альтернативы:** `Golos UI` (Яндекс) для светлой темы, `IBM Plex Sans` — для технических разделов («Налоги», «Деньги»).
- **Числа и таблицы:** `JetBrains Mono` — для финансовых показателей и кода.

**Шкала кегля (mobile-first):**
- H1 — 32/36 px (Manrope 800)
- H2 — 24/28 (Manrope 700)
- H3 — 20/24 (Manrope 700)
- Body L — 17/24 (Inter 400)
- Body M — 15/22 (Inter 400)
- Caption — 13/18 (Inter 500, uppercase для рубрик)

### Сетка, отступы, радиусы

- Базовый юнит — **4 px**, ключевые отступы: 8 / 12 / 16 / 24 / 32 / 48.
- Container max-width: 480px (мобильный мини-апп), 1080 для desktop.
- Радиусы: **карточки — 16 px**, кнопки — 12 px, чипсы — 999 px, аватары — 999 px.
- Тени минимально (тёмная тема), light-тема — мягкая `0 8 24 rgba(0,0,0,0.06)`.

### Карточки, кнопки, состояния

- **Карточка новости:** изображение 16:9 → рубрика капсом → заголовок H3 → 1 строка summary → метаданные (время, автор, реакции).
- **Кнопки:**
  - Primary — `bg-x10-red text-white`, hover чуть тёмнее, active — scale 0.98.
  - Secondary — outline 1.5 px по тексту.
  - Ghost — только текст с подчёркиванием при hover.
- **Чипсы-фильтры:** капсула, активный — заливка X10 Red, неактивный — outline.
- **State badges:** «PREMIUM Х10» (gold), «РЫБАКОВ ГОВОРИТ» (red), «Новое» (зелёный мигающий dot).

### Иконография и иллюстрации

- Иконки: `Lucide React` (1.5 px stroke) — стиль соответствует Manrope/Inter.
- Иллюстрации: фотопортреты Рыбакова в дуотоне (red + dark) — в стиле обложек Bloomberg Businessweek.
- Видео-плеер: вертикальные ролики 9:16 в ленте + горизонтальные 16:9 для лонгридов.

### Тёмная и светлая темы

По умолчанию — **тёмная** (премиальность, энергия, ночное чтение). Светлая — для долгого чтения лонгридов утром. Переключатель в профиле + автомат по системе.

## 3.3. Архитектура информации

```
Mini App
├── Главная (лента + дайджест дня)
├── Рубрики
│   ├── Деньги
│   ├── Налоги
│   ├── Бизнес
│   ├── Власть / Регулирование
│   ├── Технологии / ИИ
│   └── Рыбаков говорит (gated premium-ish)
├── Видео и подкасты
│   ├── Утренний разбор
│   ├── Разбор недели (подкаст)
│   ├── Shorts (вертикальные)
│   └── Длинные интервью
├── Сообщество Х10
│   ├── Лента Движения
│   ├── Мой кламп / Найти кламп
│   ├── События в моём городе
│   ├── Региональные лидеры (директория)
│   ├── Школа Интегративного Лидерства
│   └── Х10 чаптеры
├── Профиль
│   ├── Подписки на рубрики и авторов
│   ├── Сохранённое
│   ├── История чтения и стрики
│   ├── Уведомления и расписание дайджестов
│   ├── IPS-прогресс (геймификация)
│   └── Премиум-подписка
└── Поиск (full-text + фильтры)
```

## 3.4. React-мокапы ключевых экранов

Все мокапы — single-file React + Tailwind (готово для shadcn/ui), мобильный приоритет, с моковыми данными. Шрифты подгружаются из Google Fonts (`Manrope`, `Inter`). Каждый экран — отдельный компонент, который можно вставить в Next.js / Vite-проект.

### Общий setup (`tailwind.config.ts`)

```ts
export default {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: { DEFAULT: '#0B0B0E', light: '#F7F6F2' },
        surface: { DEFAULT: '#16161B', light: '#FFFFFF' },
        x10: { red: '#E63946', gold: '#D4A24C', steel: '#1F2937' },
        text: { primary: '#F2F2F2', secondary: '#A0A0A8' },
        border: { DEFAULT: '#26262C', light: '#E5E2DA' }
      },
      fontFamily: {
        head: ['Manrope', 'system-ui', 'sans-serif'],
        body: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace']
      },
      borderRadius: { card: '16px', btn: '12px' }
    }
  }
}
```

### (а) Главная — лента новостей с дайджестом дня

```tsx
// pages/index.tsx
import { Bell, Search, Bookmark, Heart, MessageCircle, Play } from 'lucide-react';

const digest = {
  title: 'Утренний разбор от Рыбакова',
  date: 'Понедельник, 25 мая',
  bullets: [
    'ЦБ оставил ставку 17%. Рыбаков: «Кредитное окно для бизнеса закрыто, время своих денег».',
    'Минфин предложил поднять УСН до 350 млн. Что делать малому бизнесу — внутри.',
    'Wildberries купил три сервиса такси. Передел рынка логистики.'
  ],
  videoMinutes: 8
};

const feed = [
  { id: 1, cat: 'НАЛОГИ', title: 'Новый порог УСН 350 млн: кому грозит, кому выгодно',
    excerpt: 'Разобрали с налоговым адвокатом, что меняется и какие три шага сделать прямо сейчас.',
    img: 'https://images.unsplash.com/photo-1554224155-6726b3ff858f?w=800',
    time: '12 мин', reactions: 142, badge: null },
  { id: 2, cat: 'РЫБАКОВ ГОВОРИТ', title: 'Почему я не верю в стартап-инвестиции в 2026',
    excerpt: 'Игорь Рыбаков: «Хайп-экономика заканчивается. Что покупать вместо стартапов».',
    img: 'https://images.unsplash.com/photo-1556761175-5973dc0f32e7?w=800',
    time: '7 мин', reactions: 891, badge: 'PREMIUM' },
  { id: 3, cat: 'ДЕНЬГИ', title: 'Рубль по 100: три сценария на лето',
    excerpt: 'Что говорят валютные стратеги Сбера, Тинькоффа и независимые аналитики.',
    img: 'https://images.unsplash.com/photo-1633158829585-23ba8f7c8caf?w=800',
    time: '4 мин', reactions: 67, badge: null }
];

export default function Home() {
  return (
    <div className="min-h-screen bg-bg font-body text-text-primary">
      <header className="sticky top-0 z-10 bg-bg/85 backdrop-blur border-b border-border px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-9 h-9 rounded-btn bg-x10-red flex items-center justify-center font-head font-extrabold text-white">X10</div>
          <span className="font-head font-bold text-lg">Х10 Новости</span>
        </div>
        <div className="flex items-center gap-3">
          <Search className="w-5 h-5" />
          <div className="relative">
            <Bell className="w-5 h-5" />
            <span className="absolute -top-1 -right-1 w-2 h-2 bg-x10-red rounded-full" />
          </div>
        </div>
      </header>

      <div className="flex gap-2 px-4 py-3 overflow-x-auto no-scrollbar">
        {['Главное','Деньги','Налоги','Бизнес','Власть','Рыбаков говорит','Х10'].map((c,i) => (
          <button key={c}
            className={`whitespace-nowrap px-4 py-2 rounded-full text-sm font-medium ${i===0?'bg-x10-red text-white':'bg-surface border border-border'}`}>
            {c}
          </button>
        ))}
      </div>

      <section className="mx-4 mb-5 rounded-card bg-gradient-to-br from-x10-red to-[#8E1B26] p-5 text-white">
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs uppercase tracking-wider opacity-80">{digest.date}</span>
          <button className="flex items-center gap-1 text-xs bg-white/15 rounded-full px-3 py-1">
            <Play className="w-3 h-3" /> {digest.videoMinutes} мин
          </button>
        </div>
        <h2 className="font-head font-extrabold text-2xl leading-tight mb-3">{digest.title}</h2>
        <ul className="space-y-2 text-sm leading-relaxed">
          {digest.bullets.map((b,i) => (
            <li key={i} className="flex gap-2">
              <span className="font-mono opacity-70">0{i+1}</span><span>{b}</span>
            </li>
          ))}
        </ul>
        <button className="mt-4 w-full bg-white text-x10-red font-semibold py-2.5 rounded-btn">
          Смотреть полный разбор
        </button>
      </section>

      <section className="px-4 space-y-4 pb-24">
        <h3 className="font-head font-bold text-xl">Лента дня</h3>
        {feed.map(item => (
          <article key={item.id} className="bg-surface rounded-card overflow-hidden border border-border">
            <div className="relative">
              <img src={item.img} alt="" className="w-full h-44 object-cover" />
              {item.badge && (
                <span className="absolute top-3 left-3 bg-x10-gold text-x10-steel text-[10px] font-bold px-2 py-1 rounded uppercase tracking-wider">
                  {item.badge}
                </span>
              )}
            </div>
            <div className="p-4">
              <span className="text-[11px] font-bold tracking-widest text-x10-red">{item.cat}</span>
              <h4 className="font-head font-bold text-lg leading-snug mt-1.5">{item.title}</h4>
              <p className="text-text-secondary text-sm mt-1.5 leading-relaxed">{item.excerpt}</p>
              <div className="flex items-center justify-between mt-3 text-text-secondary text-xs">
                <span>{item.time} чтения</span>
                <div className="flex items-center gap-4">
                  <span className="flex items-center gap-1"><Heart className="w-3.5 h-3.5"/>{item.reactions}</span>
                  <MessageCircle className="w-3.5 h-3.5"/>
                  <Bookmark className="w-3.5 h-3.5"/>
                </div>
              </div>
            </div>
          </article>
        ))}
      </section>

      <nav className="fixed bottom-0 inset-x-0 bg-bg/95 backdrop-blur border-t border-border flex justify-around py-2.5">
        {[['Лента','📰'],['Видео','🎥'],['Х10','🌐'],['Профиль','👤']].map(([l,i],idx) => (
          <button key={l} className={`flex flex-col items-center text-[11px] ${idx===0?'text-x10-red':'text-text-secondary'}`}>
            <span className="text-xl">{i}</span>{l}
          </button>
        ))}
      </nav>
    </div>
  );
}
```

### (б) Карточка лонгрида — статья с видео и типографикой

```tsx
// pages/article/[id].tsx
import { ChevronLeft, Share2, Bookmark, Headphones, Play, Heart } from 'lucide-react';

export default function Article() {
  return (
    <div className="min-h-screen bg-bg font-body text-text-primary">
      <header className="sticky top-0 z-10 bg-bg/90 backdrop-blur px-4 py-3 flex items-center justify-between border-b border-border">
        <ChevronLeft className="w-6 h-6" />
        <div className="flex items-center gap-4">
          <Headphones className="w-5 h-5" />
          <Bookmark className="w-5 h-5" />
          <Share2 className="w-5 h-5" />
        </div>
      </header>

      <div className="relative">
        <img src="https://images.unsplash.com/photo-1554224155-6726b3ff858f?w=1200"
             className="w-full h-64 object-cover" alt="" />
        <button className="absolute inset-0 flex items-center justify-center">
          <span className="w-16 h-16 rounded-full bg-x10-red/90 flex items-center justify-center">
            <Play className="w-7 h-7 text-white fill-white" />
          </span>
        </button>
      </div>

      <article className="px-5 py-6 max-w-prose mx-auto">
        <div className="flex items-center gap-2 mb-3">
          <span className="text-[11px] font-bold tracking-widest text-x10-red">НАЛОГИ</span>
          <span className="text-text-secondary text-xs">· 12 мин чтения</span>
        </div>
        <h1 className="font-head font-extrabold text-3xl leading-[1.15] mb-4">
          Новый порог УСН 350 млн: кому это выгодно, кому это удавка
        </h1>
        <p className="text-text-secondary text-sm leading-relaxed mb-6">
          Минфин предложил поднять порог УСН с 265 до 350 млн ₽. Разобрали с налоговым адвокатом Дмитрием Костальгиным, что это значит для производства, услуг и e-commerce — и три шага, которые нужно сделать на этой неделе.
        </p>

        <div className="bg-surface border-l-4 border-x10-red rounded-card p-4 mb-6">
          <div className="text-[11px] font-bold tracking-widest text-x10-red mb-2">ПОЧЕМУ ЭТО ВАЖНО</div>
          <p className="text-base leading-relaxed">
            <b>250+ тыс. ИП и ООО</b> остались бы на УСН вместо вынужденного перехода на ОСН с НДС 22%. Сэкономили бы суммарно ~120 млрд ₽ за 2026 год.
          </p>
        </div>

        <h2 className="font-head font-bold text-xl mt-8 mb-3">Что меняется по букве закона</h2>
        <p className="text-[17px] leading-[1.65] mb-4">
          В пояснительной записке Минфина предлагается с 1 января 2026 года повысить базовый порог годового дохода для применения УСН с 265 до 350 млн ₽, а максимальный — с 450 до 600 млн ₽…
        </p>

        <blockquote className="my-6 pl-5 border-l-2 border-x10-gold">
          <p className="font-head text-2xl leading-snug italic">
            «350 млн — это не подарок, а возвращение к тому, что было съедено инфляцией».
          </p>
          <footer className="mt-3 text-sm text-text-secondary">— Игорь Рыбаков</footer>
        </blockquote>

        <div className="mt-10 flex items-center justify-between border-t border-border pt-4">
          <div className="flex gap-2">
            {['🔥','💯','🤔','😱'].map(e => (
              <button key={e} className="px-3 py-1.5 bg-surface border border-border rounded-full text-sm">{e}</button>
            ))}
          </div>
          <button className="flex items-center gap-1 text-text-secondary text-sm">
            <Heart className="w-4 h-4" /> 142
          </button>
        </div>

        <div className="mt-8 bg-gradient-to-br from-x10-steel to-bg rounded-card p-5 border border-x10-gold/30">
          <span className="text-x10-gold text-[11px] font-bold tracking-widest">Х10 СООБЩЕСТВО</span>
          <h3 className="font-head font-bold text-lg mt-2">Обсудить в своём клампе</h3>
          <p className="text-text-secondary text-sm mt-1">
            34 клампа уже обсуждают эту тему. Присоединись к разговору.
          </p>
          <button className="mt-3 bg-x10-red text-white px-4 py-2 rounded-btn text-sm font-semibold">
            Открыть в Х10
          </button>
        </div>
      </article>
    </div>
  );
}
```

### (в) Раздел «Налоги» — рубрика с практическими разборами

```tsx
// pages/section/taxes.tsx
import { Filter, BarChart3, TrendingUp, Calendar } from 'lucide-react';

const items = [
  { tag: 'РАЗБОР', title: 'УСН 350 млн: 3 шага на этой неделе', mins: 8, hot: true },
  { tag: 'ИНСТРУКЦИЯ', title: 'Как платить меньше дивидендного НДФЛ в 2026', mins: 12, hot: false },
  { tag: 'НОВОСТЬ', title: 'ФНС начала рассылать требования о пояснениях по самозанятым', mins: 4, hot: false },
  { tag: 'КЕЙС', title: 'Производство в Беларуси: реальные цифры после переезда', mins: 15, hot: true }
];

export default function Taxes() {
  return (
    <div className="min-h-screen bg-bg font-body text-text-primary pb-24">
      <section className="relative px-5 pt-6 pb-8 bg-gradient-to-br from-[#1A0B0C] via-bg to-bg border-b border-border">
        <span className="text-[11px] font-bold tracking-widest text-x10-red">РУБРИКА</span>
        <h1 className="font-head font-extrabold text-4xl mt-2">Налоги</h1>
        <p className="text-text-secondary text-sm mt-2 max-w-md">
          Что нового в НК РФ, как платить меньше легально, как разговаривать с ФНС.
        </p>

        <div className="grid grid-cols-3 gap-3 mt-5">
          {[
            { icon: <BarChart3 className="w-4 h-4"/>, k: '247', v: 'материалов' },
            { icon: <TrendingUp className="w-4 h-4"/>, k: '+18%', v: 'охват за месяц' },
            { icon: <Calendar className="w-4 h-4"/>, k: '2/нед', v: 'новых разборов' }
          ].map((m,i) => (
            <div key={i} className="bg-surface rounded-card p-3 border border-border">
              <div className="text-x10-gold mb-1">{m.icon}</div>
              <div className="font-mono font-bold text-lg">{m.k}</div>
              <div className="text-text-secondary text-[11px]">{m.v}</div>
            </div>
          ))}
        </div>
      </section>

      <div className="px-5 py-4 flex gap-2 overflow-x-auto no-scrollbar">
        <button className="flex items-center gap-1 px-3 py-1.5 bg-surface border border-border rounded-full text-xs">
          <Filter className="w-3.5 h-3.5"/> Фильтры
        </button>
        {['Все','УСН','НДС','НДФЛ','Самозанятые','Релокация'].map((t,i) => (
          <button key={t}
            className={`whitespace-nowrap px-3 py-1.5 rounded-full text-xs ${i===0?'bg-x10-red text-white':'bg-surface border border-border'}`}>
            {t}
          </button>
        ))}
      </div>

      <section className="mx-5 mb-5 rounded-card border border-x10-gold/40 bg-gradient-to-br from-x10-gold/10 to-transparent p-5">
        <span className="text-[10px] font-bold tracking-widest text-x10-gold">ГИД Х10</span>
        <h3 className="font-head font-bold text-xl mt-2 leading-tight">
          Налоговый календарь 2026: 18 ключевых дат для предпринимателя
        </h3>
        <p className="text-text-secondary text-sm mt-2">PDF + интерактивная версия. Обновляется каждый квартал.</p>
        <button className="mt-3 bg-x10-gold text-x10-steel font-semibold px-4 py-2 rounded-btn text-sm">
          Открыть гид
        </button>
      </section>

      <ul className="px-5 space-y-3">
        {items.map((it,i) => (
          <li key={i} className="flex gap-3 p-3 bg-surface rounded-card border border-border">
            <div className="w-1 rounded-full bg-x10-red" />
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-bold tracking-widest text-x10-red">{it.tag}</span>
                {it.hot && <span className="text-[10px] font-bold text-x10-gold">🔥 HOT</span>}
              </div>
              <h4 className="font-head font-bold text-base leading-snug mt-1">{it.title}</h4>
              <span className="text-text-secondary text-xs mt-1 block">{it.mins} мин</span>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
```

### (г) Сообщество Х10 — события, клампы, нетворкинг

```tsx
// pages/community.tsx
import { MapPin, Calendar, Users, MessageSquare, ChevronRight } from 'lucide-react';

const events = [
  { city: 'Москва', date: '4–5 апр', title: 'X10 Business Meet Up by Rybakov', attendees: 420 },
  { city: 'Уфа', date: '12 апр', title: 'X10Talks: 7 историй о выходе из тени', attendees: 120 },
  { city: 'Иркутск', date: '18 апр', title: 'Кламперский завтрак', attendees: 28 }
];

const myClamp = {
  name: 'Кламп «Цифровой прорыв»',
  members: 8, nextMeeting: 'Завтра, 19:00',
  goal: 'Запустить совместный AI-сервис за 90 дней',
  progress: 67
};

export default function Community() {
  return (
    <div className="min-h-screen bg-bg font-body text-text-primary pb-24">
      <section className="px-5 pt-6 pb-4">
        <div className="flex items-center justify-between">
          <div>
            <span className="text-[11px] font-bold tracking-widest text-x10-gold">СООБЩЕСТВО</span>
            <h1 className="font-head font-extrabold text-3xl mt-1">Х10</h1>
          </div>
          <div className="text-right">
            <div className="font-mono font-bold text-xl">30 885</div>
            <div className="text-text-secondary text-[11px]">в 124 городах</div>
          </div>
        </div>
      </section>

      <section className="mx-5 mb-5 rounded-card bg-surface border border-x10-red/40 p-5">
        <span className="text-[10px] font-bold tracking-widest text-x10-red">МОЙ КЛАМП</span>
        <h2 className="font-head font-bold text-xl mt-2">{myClamp.name}</h2>
        <p className="text-text-secondary text-sm mt-1">{myClamp.goal}</p>

        <div className="flex items-center gap-4 mt-4">
          <div className="flex -space-x-2">
            {[1,2,3,4,5].map(n => (
              <div key={n} className="w-8 h-8 rounded-full bg-gradient-to-br from-x10-red to-x10-gold border-2 border-bg" />
            ))}
          </div>
          <span className="text-text-secondary text-sm">+{myClamp.members - 5} участников</span>
        </div>

        <div className="mt-4">
          <div className="flex justify-between text-xs text-text-secondary mb-1">
            <span>Прогресс цели</span><span className="font-mono">{myClamp.progress}%</span>
          </div>
          <div className="h-1.5 bg-border rounded-full overflow-hidden">
            <div className="h-full bg-gradient-to-r from-x10-red to-x10-gold" style={{width:`${myClamp.progress}%`}} />
          </div>
        </div>

        <button className="w-full mt-4 bg-x10-red text-white font-semibold py-2.5 rounded-btn text-sm flex items-center justify-center gap-2">
          <MessageSquare className="w-4 h-4"/> Открыть чат клампа ({myClamp.nextMeeting})
        </button>
      </section>

      <section className="px-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-head font-bold text-xl">События рядом</h3>
          <span className="flex items-center text-text-secondary text-xs gap-1">
            <MapPin className="w-3.5 h-3.5"/> Москва
          </span>
        </div>
        <div className="space-y-3">
          {events.map((e,i) => (
            <div key={i} className="bg-surface rounded-card border border-border p-4 flex items-center gap-4">
              <div className="w-14 h-14 rounded-card bg-gradient-to-br from-x10-red to-x10-steel flex flex-col items-center justify-center text-white">
                <Calendar className="w-4 h-4 opacity-70"/>
                <span className="font-mono font-bold text-[11px] mt-0.5">{e.date.split(' ')[0]}</span>
              </div>
              <div className="flex-1">
                <div className="text-[11px] font-bold tracking-widest text-x10-gold">{e.city.toUpperCase()}</div>
                <h4 className="font-head font-bold text-base leading-tight mt-0.5">{e.title}</h4>
                <span className="text-text-secondary text-xs flex items-center gap-1 mt-1">
                  <Users className="w-3 h-3"/>{e.attendees} участников
                </span>
              </div>
              <ChevronRight className="w-5 h-5 text-text-secondary"/>
            </div>
          ))}
        </div>
      </section>

      <section className="px-5 mt-8">
        <h3 className="font-head font-bold text-xl mb-3">Найти кламп</h3>
        <div className="grid grid-cols-2 gap-3">
          {['Создать свой кламп','Присоединиться к клампу','Стать кламперам','Стать рег.лидером'].map((t,i) => (
            <button key={t} className="bg-surface border border-border rounded-card p-4 text-left">
              <div className="w-8 h-8 rounded-full bg-x10-red/15 flex items-center justify-center text-x10-red font-head font-bold mb-2">
                {i+1}
              </div>
              <span className="font-head font-bold text-sm">{t}</span>
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}
```

### (д) Профиль — подписки, сохранённое, прогресс

```tsx
// pages/profile.tsx
import { Settings, Crown, Bookmark, Bell, Flame, BookOpen, ChevronRight } from 'lucide-react';

const me = {
  name: 'Алексей Петров', city: 'Краснодар',
  role: 'Клампер',
  ips: 1240, streak: 23, saved: 47, read: 312
};

const subs = ['Налоги','Деньги','Рыбаков говорит','Х10 Краснодар','Подкаст: Разбор недели'];

export default function Profile() {
  return (
    <div className="min-h-screen bg-bg font-body text-text-primary pb-24">
      <header className="px-5 pt-6 flex items-center justify-between">
        <h1 className="font-head font-extrabold text-2xl">Профиль</h1>
        <Settings className="w-6 h-6"/>
      </header>

      <section className="mx-5 mt-4 rounded-card bg-gradient-to-br from-x10-steel to-bg p-5 border border-border">
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 rounded-full bg-gradient-to-br from-x10-red to-x10-gold flex items-center justify-center font-head font-extrabold text-2xl">
            {me.name[0]}
          </div>
          <div>
            <h2 className="font-head font-bold text-xl">{me.name}</h2>
            <p className="text-text-secondary text-sm">{me.role} · {me.city}</p>
          </div>
        </div>

        <button className="mt-4 w-full bg-x10-gold/15 border border-x10-gold/40 text-x10-gold font-semibold py-2.5 rounded-btn text-sm flex items-center justify-center gap-2">
          <Crown className="w-4 h-4"/> Активировать Х10 Premium
        </button>
      </section>

      <section className="px-5 mt-5 grid grid-cols-4 gap-2">
        {[
          { i: <Flame className="w-4 h-4"/>, k: me.streak, v: 'дней стрик' },
          { i: <BookOpen className="w-4 h-4"/>, k: me.read, v: 'прочитано' },
          { i: <Bookmark className="w-4 h-4"/>, k: me.saved, v: 'сохранено' },
          { i: <Crown className="w-4 h-4"/>, k: me.ips, v: 'IPS' }
        ].map((s,i) => (
          <div key={i} className="bg-surface rounded-card p-3 border border-border text-center">
            <div className="text-x10-gold flex justify-center mb-1">{s.i}</div>
            <div className="font-mono font-bold text-base">{s.k}</div>
            <div className="text-text-secondary text-[10px]">{s.v}</div>
          </div>
        ))}
      </section>

      <section className="px-5 mt-7">
        <h3 className="font-head font-bold text-lg mb-3">Мои подписки</h3>
        <div className="space-y-2">
          {subs.map(s => (
            <div key={s} className="flex items-center justify-between bg-surface border border-border rounded-card px-4 py-3">
              <span className="text-sm">{s}</span>
              <div className="w-10 h-6 bg-x10-red rounded-full relative">
                <span className="absolute right-0.5 top-0.5 w-5 h-5 bg-white rounded-full" />
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="px-5 mt-7">
        <h3 className="font-head font-bold text-lg mb-3 flex items-center gap-2">
          <Bell className="w-4 h-4"/> Дайджест-расписание
        </h3>
        <div className="bg-surface rounded-card border border-border divide-y divide-border">
          {[
            { t: '07:00', n: 'Утренний разбор Рыбакова', on: true },
            { t: '13:00', n: 'Smart-карусель за обедом', on: true },
            { t: '19:00', n: 'Что обсуждают в Х10', on: false }
          ].map((r,i) => (
            <div key={i} className="flex items-center justify-between px-4 py-3">
              <div>
                <span className="font-mono text-x10-gold text-sm">{r.t}</span>
                <span className="ml-3 text-sm">{r.n}</span>
              </div>
              <div className={`w-10 h-6 rounded-full relative ${r.on?'bg-x10-red':'bg-border'}`}>
                <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full transition-all ${r.on?'right-0.5':'left-0.5'}`} />
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="px-5 mt-7 space-y-2">
        {['Сохранённое','История чтения','Скачанные подкасты','Х10 Premium','Помощь и обратная связь'].map(t => (
          <button key={t} className="w-full flex items-center justify-between bg-surface border border-border rounded-card px-4 py-3 text-sm">
            <span>{t}</span><ChevronRight className="w-4 h-4 text-text-secondary"/>
          </button>
        ))}
      </section>
    </div>
  );
}
```

## 3.5. Технологический стек и рекомендации

| Слой | Технология | Почему |
|---|---|---|
| Framework | **Next.js 15** (App Router) | SSR/ISR для SEO лонгридов, edge-runtime для быстрого старта мини-аппа |
| Альтернатива | **Vite + React 19** | Если нужен чистый SPA внутри Telegram WebView |
| Стилизация | **Tailwind CSS 4 + shadcn/ui** | Скорость кастомизации + готовые primitives |
| Анимации | **Framer Motion** | Слайды дайджеста, переходы между табами |
| Иконки | **Lucide React** | 1,5 px stroke совпадает с Manrope |
| Видео | **Mux Player** или **video.js** | Адаптивный плейер для вертикали и горизонтали |
| Подкасты | **Plyr** / `<audio>` + WaveSurfer.js | Воспроизведение + волновая дорожка |
| State | **TanStack Query** + **Zustand** | Кеш ленты + локальные состояния (theme, push) |
| Telegram | **@telegram-apps/sdk-react** + UI Kit `@telegram-apps/telegram-ui` | Официальные хуки, init data validation |
| MAX (VK мессенджер) | MAX Mini App SDK | Аналогично Telegram, аудитория-Б |
| Backend / API | **Hono + Cloudflare Workers** или **Bun + Elysia** | Низкая латентность для глобальной аудитории; Edge-кеш |
| База | **PostgreSQL (Neon)** + **Redis (Upstash)** | Контент + сессии + счётчики |
| Поиск | **Meilisearch** или **Typesense** | Быстрый full-text по русскому |
| AI-персонализация | **OpenAI / YandexGPT / GigaChat** + **pgvector** | Embedding-лента, голосовые саммари (Whisper / SaluteSpeech) |
| Аналитика | **PostHog** или **Amplitude** | Воронки, retention, A/B-эксперименты |
| Push | Telegram Bot API + WebPush + **OneSignal** для PWA | Утренний/вечерний дайджест |
| Аутентификация | **Telegram initData** + **MAX OAuth** + email magic link | Бесшовный вход внутри мессенджера |
| Платежи | **Telegram Stars** для подписки Х10 Premium, **YooKassa/CloudPayments** для standalone | Соответствие требованиям TG (digital goods через Stars) |
| Деплой | **Vercel** / **Cloudflare Pages** | CI/CD, edge-сеть |

**Дополнительные рекомендации:**
- **Темизация под Telegram**: использовать `themeParams` из Telegram WebApp API, чтобы мини-апп подстраивался под темную/светлую тему пользователя.
- **Safe-area и edge-swipe**: следить за горизонтальными свайпами (особенно в карусели дайджеста) — на iOS они конфликтуют с системным «back», нужны safe-margins.
- **Закрывающее подтверждение** (ClosingConfirmation API) — только в платных потоках (оформление Premium), не везде.
- **Минимизация JS** — мини-апп должен открываться <1,5 с. Использовать React Server Components, lazy-load для видео-плеера.
- **Контекстные push** — не просить разрешения сразу, а после первого ценного действия («Хочешь получать утренний разбор?»).
- **Offline-режим** для подкастов и сохранённых статей.
- **AI-агенты**: персонализированная лента (vector similarity по истории чтения), голосовое саммари длинных лонгридов, чат-ассистент «Спроси Х10» с RAG по контенту Рыбакова.

---

# Recommendations (что делать дальше — поэтапно)

1. **Месяц 0–1: концепт-валидация.**
   - Провести 25–40 интервью с участниками Х10 из разных городов (через региональных лидеров).
   - Валидировать гипотезу «утренний разбор от Рыбакова + лента + сообщество».
   - Зафиксировать MVP-scope: 5 экранов из мокапов выше.
2. **Месяц 1–3: MVP в Telegram Mini App.**
   - Реализовать описанные React-мокапы как production-приложение (Next.js + Tailwind + shadcn).
   - Контент: 3 дайджеста/день + 5 лонгридов/неделю + 1 видео-разбор Рыбакова/неделю.
   - Запуск на ~30 000 действующих участников Х10 как закрытая бета.
   - **KPI**: DAU/MAU ≥ 25%, 4-week retention ≥ 40%, среднее время в сессии ≥ 5 мин.
3. **Месяц 3–6: монетизация и расширение.**
   - Запустить **Х10 Premium** ($15–20/мес или 1500 ₽) с эксклюзивной аналитикой Рыбакова, gated-разделом «Налоги Pro», доступом к директории региональных лидеров.
   - Параллельная публикация в MAX Mini App.
   - Реферальная программа (как Morning Brew): 5 рефералов → мерч Х10, 25 → доступ к закрытому ивенту, 100 → личный звонок региональному лидеру.
   - **KPI**: 3% paid conversion от активной базы → ~900 платных при 30 тыс активных = 13–18 млн ₽/год recurring.
4. **Месяц 6–12: масштабирование.**
   - Добавить DealExchange-board (как у EO MyEO DealExchange) — площадку для сделок между участниками.
   - Запустить AI-функции: голосовые саммари, чат «Спроси Х10», персонализированная лента.
   - Кросс-промо со внешними бизнес-каналами через Substack-подобную систему рекомендаций.
   - Подкаст внутри приложения — «Разбор недели» как драйвер вечернего удержания.
5. **Месяц 12+: standalone-приложение + B2B.**
   - Native iOS/Android поверх той же React Native кодовой базы.
   - B2B-выпуски (как Morning Brew с CFO Brew, HR Brew) для конкретных отраслей внутри Х10.

**Бенчмарки/триггеры для смены стратегии:**
- Если конверсия в paid <1% за 6 месяцев — снижать цену вдвое и пересобирать ценностное предложение премиум-уровня (взять модель Stratechery — простой $12/мес без tier-сегрегации).
- Если 4-week retention <25% — пересобирать утренний дайджест, тестировать audio-first формат (как Sharp Tech у Stratechery).
- Если CAC через рефералку >1000 ₽ — переключаться на ads в Telegram Ads и посевы в smaller-каналах.

---

# Caveats

- **Численность Х10 расходится между источниками**: сайт x10movement.ru показывает 30 885 участников, Telegram-канал — «более 26 000–28 000 в 30+ странах». В отчёте использован ~30 тыс как актуальный максимум.
- **Состояние Рыбакова**: на сентябрь 2025 — $2,4 млрд (Forbes Real-Time), на декабрь 2025 — $1,3 млрд (другие источники). Колебания связаны с волатильностью оценок Технониколь.
- **Подписчики Telegram Рыбакова**: разные источники называют 150–283 тыс. Я взял диапазон 150–156 тыс из Forbes и YouTube-описаний — это консервативный показатель.
- **Hampton-прайс** в 2025–2026 на сайте больше не публикуется; $8 500 — оценка по релизам 2023 года, в продукте сейчас «annual investment + 60-day money-back».
- **Sifted Pro прайс** даётся как «от £999/год» — точная сумма зависит от размера команды.
- **YPO и EO дюзы**: YPO Indiana chapter (ypolearningyear.com/membership/) указывает: «Global: $3,975 annual dues, $3,975 Initiation. Chapter: $4,380 annual dues, $1,500 initiation». EO Global Fact Sheet: «EO annual dues are US Dollar 2630.00 … New members pay a one-time initiation fee of US Dollar 3500.00».
- **Подписчики The Information**: 45 000 paid subscribers as of 2022 (Wikipedia / FT) — это «paid», а не общая аудитория с newsletter sign-ups.
- **Morning Brew revenue**: $75M annual revenue по словам Austin Rief на блоге Hampton, февраль 2025 — это последняя публичная цифра до выхода Rief из CEO-роли.
- **Регуляторный риск**: Рыбаков Фонд частично проходит через статус иностранного агента; нужно очень аккуратно с информационной маркировкой в мини-аппе.
- **Контент-риск «инфоцыганства»**: продукту нужно отличаться от Like Центра и подобных — упор на новости и аналитику, а не на «успешный успех». Кейс Шабутдинова (приговор 7 лет 31.10.2025) делает осторожность критичной.
- **Видеомокапы**: предложенные React-мокапы — UI-каркасы; для production-grade нужна доработка accessibility (aria-метки), i18n (как минимум RU/EN), оптимизация под Telegram Mini App SDK 7.x.
- **2026 контекст**: налоговая реформа в России (УСН — реальный сценарий, обсуждается Минфином) делает рубрику «Налоги» горячей точкой контакта на ближайшие 6–12 месяцев. Это окно стоит ловить продуктом.