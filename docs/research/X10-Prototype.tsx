import React, { useState, useEffect } from 'react';
import {
  Bell, Search, Bookmark, Heart, MessageCircle, Play, Newspaper, Video,
  Globe2, User, ChevronLeft, Share2, Headphones, Filter, BarChart3,
  TrendingUp, Calendar, MapPin, Users, MessageSquare, ChevronRight,
  Settings, Crown, Flame, BookOpen, Sparkles, Pause, Volume2, X, Zap
} from 'lucide-react';

// ========= DESIGN TOKENS =========
const C = {
  bg: '#0B0B0E',
  surface: '#16161B',
  surface2: '#1C1C22',
  red: '#E63946',
  redDark: '#8E1B26',
  gold: '#D4A24C',
  steel: '#1F2937',
  textPrimary: '#F2F2F2',
  textSecondary: '#A0A0A8',
  textMuted: '#6B6B73',
  border: '#26262C',
  success: '#3FB950',
};

// ========= MOCK DATA =========
const digestToday = {
  date: 'Понедельник, 25 мая',
  title: 'Утренний разбор от Рыбакова',
  videoMin: 8,
  bullets: [
    { n: '01', text: 'ЦБ оставил ставку 17%. Рыбаков: «Кредитное окно для бизнеса закрыто, время своих денег».' },
    { n: '02', text: 'Минфин предложил поднять порог УСН до 350 млн. Что делать малому бизнесу — внутри.' },
    { n: '03', text: 'Wildberries купил три сервиса такси. Передел рынка логистики начался.' },
  ],
};

const feed = [
  {
    id: 1, cat: 'НАЛОГИ', title: 'Новый порог УСН 350 млн: кому грозит, кому выгодно',
    excerpt: 'Разобрали с налоговым адвокатом, что меняется и какие три шага сделать прямо сейчас.',
    img: 'https://images.unsplash.com/photo-1554224155-6726b3ff858f?w=800&q=80',
    time: '12 мин', reactions: 142, comments: 38, badge: null, hot: true,
  },
  {
    id: 2, cat: 'РЫБАКОВ ГОВОРИТ', title: 'Почему я не верю в стартап-инвестиции в 2026',
    excerpt: 'Игорь Рыбаков: «Хайп-экономика заканчивается. Что покупать вместо стартапов».',
    img: 'https://images.unsplash.com/photo-1556761175-5973dc0f32e7?w=800&q=80',
    time: '7 мин', reactions: 891, comments: 214, badge: 'PREMIUM', hot: false,
  },
  {
    id: 3, cat: 'ДЕНЬГИ', title: 'Рубль по 100: три сценария на лето',
    excerpt: 'Что говорят валютные стратеги Сбера, Тинькоффа и независимые аналитики о рубле.',
    img: 'https://images.unsplash.com/photo-1633158829585-23ba8f7c8caf?w=800&q=80',
    time: '4 мин', reactions: 67, comments: 12, badge: null, hot: false,
  },
  {
    id: 4, cat: 'БИЗНЕС', title: 'Wildberries купил три такси-сервиса. Что это значит',
    excerpt: 'Маркетплейс собирает логистическую империю. Разбираем сделку и последствия.',
    img: 'https://images.unsplash.com/photo-1551434678-e076c223a692?w=800&q=80',
    time: '6 мин', reactions: 234, comments: 56, badge: null, hot: false,
  },
];

const taxesItems = [
  { tag: 'РАЗБОР', title: 'УСН 350 млн: 3 шага на этой неделе', mins: 8, hot: true },
  { tag: 'ИНСТРУКЦИЯ', title: 'Как платить меньше дивидендного НДФЛ в 2026', mins: 12, hot: false },
  { tag: 'НОВОСТЬ', title: 'ФНС начала рассылать требования по самозанятым', mins: 4, hot: false },
  { tag: 'КЕЙС', title: 'Производство в Беларуси: реальные цифры после переезда', mins: 15, hot: true },
  { tag: 'ГИД', title: 'Налоговый календарь 2026: 18 ключевых дат', mins: 6, hot: false },
];

const events = [
  { city: 'МОСКВА', date: '4', month: 'апр', title: 'X10 Business Meet Up by Rybakov', attendees: 420, gradient: 'from-[#E63946] to-[#8E1B26]' },
  { city: 'УФА', date: '12', month: 'апр', title: 'X10Talks: 7 историй о выходе из тени', attendees: 120, gradient: 'from-[#D4A24C] to-[#8E5E1B]' },
  { city: 'ИРКУТСК', date: '18', month: 'апр', title: 'Кламперский бизнес-завтрак', attendees: 28, gradient: 'from-[#1F2937] to-[#0B0B0E]' },
];

const myClamp = {
  name: 'Кламп «Цифровой прорыв»', members: 8,
  nextMeeting: 'Завтра, 19:00',
  goal: 'Запустить совместный AI-сервис за 90 дней',
  progress: 67,
};

const me = {
  name: 'Алексей Петров', city: 'Краснодар', role: 'Клампер',
  ips: 1240, streak: 23, saved: 47, read: 312,
};

const subs = ['Налоги', 'Деньги', 'Рыбаков говорит', 'Х10 Краснодар', 'Подкаст: Разбор недели'];

// ========= SHARED COMPONENTS =========
const TopBar = ({ title, showSearch = true, onBack = null }) => (
  <header
    className="sticky top-0 z-20 px-4 py-3 flex items-center justify-between border-b"
    style={{ background: `${C.bg}E6`, backdropFilter: 'blur(12px)', borderColor: C.border }}
  >
    <div className="flex items-center gap-2.5">
      {onBack ? (
        <button onClick={onBack} className="active:scale-95 transition"><ChevronLeft className="w-6 h-6" /></button>
      ) : (
        <div
          className="w-9 h-9 rounded-xl flex items-center justify-center font-extrabold text-white text-sm"
          style={{ background: C.red, fontFamily: 'Manrope, system-ui' }}
        >
          X10
        </div>
      )}
      <span className="font-extrabold text-[17px]" style={{ fontFamily: 'Manrope, system-ui' }}>{title}</span>
    </div>
    <div className="flex items-center gap-4">
      {showSearch && <Search className="w-5 h-5" style={{ color: C.textSecondary }} />}
      <div className="relative">
        <Bell className="w-5 h-5" style={{ color: C.textSecondary }} />
        <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full" style={{ background: C.red }} />
      </div>
    </div>
  </header>
);

const BottomNav = ({ tab, setTab }) => {
  const items = [
    { id: 'home', label: 'Лента', icon: Newspaper },
    { id: 'taxes', label: 'Налоги', icon: TrendingUp },
    { id: 'video', label: 'Видео', icon: Video },
    { id: 'community', label: 'Х10', icon: Globe2 },
    { id: 'profile', label: 'Я', icon: User },
  ];
  return (
    <nav
      className="fixed bottom-0 inset-x-0 max-w-[440px] mx-auto flex justify-around py-2 border-t z-30"
      style={{ background: `${C.bg}F2`, backdropFilter: 'blur(12px)', borderColor: C.border }}
    >
      {items.map((it) => {
        const Icon = it.icon;
        const active = tab === it.id;
        return (
          <button
            key={it.id}
            onClick={() => setTab(it.id)}
            className="flex flex-col items-center gap-1 px-3 py-1.5 transition active:scale-95"
          >
            <Icon className="w-[22px] h-[22px]" style={{ color: active ? C.red : C.textMuted }} strokeWidth={active ? 2.2 : 1.8} />
            <span className="text-[10px] font-semibold" style={{ color: active ? C.textPrimary : C.textMuted }}>
              {it.label}
            </span>
          </button>
        );
      })}
    </nav>
  );
};

// ========= SCREEN: HOME =========
const HomeScreen = ({ onOpenArticle }) => {
  const [activeCat, setActiveCat] = useState(0);
  const cats = ['Главное', 'Деньги', 'Налоги', 'Бизнес', 'Власть', 'Рыбаков говорит', 'Х10'];

  return (
    <>
      <TopBar title="Х10 Новости" />

      {/* Category chips */}
      <div className="flex gap-2 px-4 py-3 overflow-x-auto" style={{ scrollbarWidth: 'none' }}>
        {cats.map((c, i) => (
          <button
            key={c}
            onClick={() => setActiveCat(i)}
            className="whitespace-nowrap px-4 py-2 rounded-full text-[13px] font-semibold transition active:scale-95"
            style={{
              background: activeCat === i ? C.red : C.surface,
              color: activeCat === i ? '#fff' : C.textSecondary,
              border: activeCat === i ? 'none' : `1px solid ${C.border}`,
            }}
          >
            {c}
          </button>
        ))}
      </div>

      {/* Hero digest */}
      <section
        className="mx-4 mb-5 rounded-2xl p-5 text-white relative overflow-hidden"
        style={{ background: `linear-gradient(135deg, ${C.red} 0%, ${C.redDark} 100%)` }}
      >
        <div className="absolute -right-8 -top-8 w-40 h-40 rounded-full" style={{ background: 'rgba(255,255,255,0.06)' }} />
        <div className="absolute -right-16 -bottom-16 w-48 h-48 rounded-full" style={{ background: 'rgba(255,255,255,0.04)' }} />

        <div className="relative flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Sparkles className="w-3.5 h-3.5" />
            <span className="text-[10px] uppercase tracking-[0.15em] opacity-90 font-semibold">
              {digestToday.date}
            </span>
          </div>
          <button className="flex items-center gap-1.5 text-[11px] bg-white/15 rounded-full px-3 py-1.5 font-medium backdrop-blur">
            <Play className="w-3 h-3 fill-white" /> {digestToday.videoMin} мин
          </button>
        </div>

        <h2 className="font-extrabold text-[26px] leading-[1.1] mb-4 relative" style={{ fontFamily: 'Manrope, system-ui' }}>
          {digestToday.title}
        </h2>

        <ul className="space-y-3 relative">
          {digestToday.bullets.map((b) => (
            <li key={b.n} className="flex gap-3 text-[13px] leading-[1.5]">
              <span className="font-bold opacity-60 tabular-nums" style={{ fontFamily: 'JetBrains Mono, monospace' }}>{b.n}</span>
              <span className="opacity-95">{b.text}</span>
            </li>
          ))}
        </ul>

        <button
          className="mt-5 w-full bg-white font-semibold py-3 rounded-xl text-[14px] active:scale-[0.98] transition"
          style={{ color: C.red, fontFamily: 'Manrope, system-ui' }}
        >
          Смотреть полный разбор →
        </button>
      </section>

      {/* Feed */}
      <section className="px-4 space-y-3.5">
        <div className="flex items-center justify-between">
          <h3 className="font-extrabold text-[20px]" style={{ fontFamily: 'Manrope, system-ui' }}>Лента дня</h3>
          <span className="text-[11px] font-semibold" style={{ color: C.textMuted }}>обновлено 2 мин назад</span>
        </div>

        {feed.map((item) => (
          <article
            key={item.id}
            onClick={() => onOpenArticle(item)}
            className="rounded-2xl overflow-hidden border cursor-pointer active:scale-[0.99] transition"
            style={{ background: C.surface, borderColor: C.border }}
          >
            <div className="relative">
              <img src={item.img} alt="" className="w-full h-44 object-cover" />
              <div
                className="absolute inset-0"
                style={{ background: 'linear-gradient(to top, rgba(11,11,14,0.5) 0%, transparent 50%)' }}
              />
              {item.badge && (
                <span
                  className="absolute top-3 left-3 text-[10px] font-extrabold px-2.5 py-1 rounded uppercase tracking-[0.1em]"
                  style={{ background: C.gold, color: C.steel, fontFamily: 'Manrope, system-ui' }}
                >
                  ✦ {item.badge}
                </span>
              )}
              {item.hot && (
                <span
                  className="absolute top-3 right-3 text-[10px] font-bold px-2 py-1 rounded-full flex items-center gap-1"
                  style={{ background: 'rgba(230,57,70,0.95)', color: '#fff' }}
                >
                  <Flame className="w-3 h-3 fill-white" /> HOT
                </span>
              )}
            </div>
            <div className="p-4">
              <span className="text-[10px] font-extrabold tracking-[0.15em]" style={{ color: C.red }}>
                {item.cat}
              </span>
              <h4 className="font-extrabold text-[17px] leading-snug mt-1.5" style={{ fontFamily: 'Manrope, system-ui', color: C.textPrimary }}>
                {item.title}
              </h4>
              <p className="text-[13.5px] mt-2 leading-[1.5]" style={{ color: C.textSecondary }}>
                {item.excerpt}
              </p>
              <div
                className="flex items-center justify-between mt-3 text-[11px] pt-3 border-t"
                style={{ color: C.textMuted, borderColor: C.border }}
              >
                <span className="font-medium">{item.time} чтения</span>
                <div className="flex items-center gap-4">
                  <span className="flex items-center gap-1.5"><Heart className="w-3.5 h-3.5" />{item.reactions}</span>
                  <span className="flex items-center gap-1.5"><MessageCircle className="w-3.5 h-3.5" />{item.comments}</span>
                  <Bookmark className="w-3.5 h-3.5" />
                </div>
              </div>
            </div>
          </article>
        ))}
      </section>
    </>
  );
};

// ========= SCREEN: ARTICLE =========
const ArticleScreen = ({ article, onBack }) => {
  const [playing, setPlaying] = useState(false);
  const it = article || feed[0];

  return (
    <>
      <header
        className="sticky top-0 z-20 px-4 py-3 flex items-center justify-between border-b"
        style={{ background: `${C.bg}E6`, backdropFilter: 'blur(12px)', borderColor: C.border }}
      >
        <button onClick={onBack} className="active:scale-95"><ChevronLeft className="w-6 h-6" /></button>
        <div className="flex items-center gap-4">
          <Headphones className="w-5 h-5" style={{ color: C.textSecondary }} />
          <Bookmark className="w-5 h-5" style={{ color: C.textSecondary }} />
          <Share2 className="w-5 h-5" style={{ color: C.textSecondary }} />
        </div>
      </header>

      <div className="relative">
        <img src={it.img} className="w-full h-72 object-cover" alt="" />
        <div
          className="absolute inset-0"
          style={{ background: 'linear-gradient(to bottom, transparent 0%, rgba(11,11,14,0.85) 100%)' }}
        />
        <button
          onClick={() => setPlaying(!playing)}
          className="absolute inset-0 flex items-center justify-center active:scale-95 transition"
        >
          <span
            className="w-16 h-16 rounded-full flex items-center justify-center shadow-2xl"
            style={{ background: `${C.red}E6`, boxShadow: `0 8px 32px ${C.red}66` }}
          >
            {playing ? <Pause className="w-6 h-6 text-white fill-white" /> : <Play className="w-7 h-7 text-white fill-white ml-0.5" />}
          </span>
        </button>
        {playing && (
          <div className="absolute bottom-3 left-4 right-4 flex items-center gap-2 text-white text-[11px]">
            <Volume2 className="w-3.5 h-3.5" />
            <div className="flex-1 h-0.5 bg-white/30 rounded-full overflow-hidden">
              <div className="h-full w-1/3" style={{ background: C.gold }} />
            </div>
            <span className="font-mono">2:48 / 8:12</span>
          </div>
        )}
      </div>

      <article className="px-5 py-6">
        <div className="flex items-center gap-2 mb-3">
          <span className="text-[10px] font-extrabold tracking-[0.15em]" style={{ color: C.red }}>{it.cat}</span>
          <span className="text-[12px]" style={{ color: C.textMuted }}>· {it.time} чтения · 25 мая</span>
        </div>
        <h1 className="font-extrabold text-[28px] leading-[1.15] mb-4" style={{ fontFamily: 'Manrope, system-ui' }}>
          {it.title}
        </h1>
        <p className="text-[14px] leading-[1.6] mb-6" style={{ color: C.textSecondary }}>
          Минфин предложил поднять порог УСН с 265 до 350 млн ₽. Разобрали с налоговым адвокатом Дмитрием Костальгиным, что это значит для производства, услуг и e-commerce — и три шага, которые нужно сделать на этой неделе.
        </p>

        {/* Why it matters — Smart Brevity */}
        <div
          className="rounded-2xl p-4 mb-6 border-l-[3px]"
          style={{ background: C.surface, borderColor: C.red }}
        >
          <div className="flex items-center gap-2 mb-2">
            <Zap className="w-3.5 h-3.5" style={{ color: C.red }} />
            <span className="text-[10px] font-extrabold tracking-[0.15em]" style={{ color: C.red }}>
              ПОЧЕМУ ЭТО ВАЖНО
            </span>
          </div>
          <p className="text-[15px] leading-[1.55]">
            <b>250+ тыс. ИП и ООО</b> остались бы на УСН вместо вынужденного перехода на ОСН с НДС 22%. Сэкономили бы суммарно <b>~120 млрд ₽</b> за 2026 год.
          </p>
        </div>

        <h2 className="font-extrabold text-[20px] mt-7 mb-3" style={{ fontFamily: 'Manrope, system-ui' }}>
          Что меняется по букве закона
        </h2>
        <p className="text-[16px] leading-[1.65]" style={{ color: C.textPrimary }}>
          В пояснительной записке Минфина предлагается с 1 января 2026 года повысить базовый порог годового дохода для применения УСН с 265 до 350 млн ₽, а максимальный — с 450 до 600 млн ₽. Это первая существенная индексация за три года…
        </p>

        {/* Pull quote */}
        <blockquote className="my-7 pl-5 border-l-2" style={{ borderColor: C.gold }}>
          <p className="text-[22px] leading-[1.3] italic font-light" style={{ fontFamily: 'Manrope, system-ui' }}>
            «350 млн — это не подарок государства, а возвращение к тому, что было съедено инфляцией».
          </p>
          <footer className="mt-3 text-[13px] flex items-center gap-2" style={{ color: C.textSecondary }}>
            <div className="w-7 h-7 rounded-full" style={{ background: `linear-gradient(135deg, ${C.red}, ${C.gold})` }} />
            <span><b style={{ color: C.textPrimary }}>Игорь Рыбаков</b> · сооснователь Технониколь</span>
          </footer>
        </blockquote>

        {/* Reactions */}
        <div
          className="mt-8 flex items-center justify-between border-t pt-4"
          style={{ borderColor: C.border }}
        >
          <div className="flex gap-2">
            {['🔥', '💯', '🤔', '😱'].map((e) => (
              <button
                key={e}
                className="px-3 py-1.5 rounded-full text-[15px] border active:scale-95 transition"
                style={{ background: C.surface, borderColor: C.border }}
              >
                {e}
              </button>
            ))}
          </div>
          <button className="flex items-center gap-1.5 text-[13px]" style={{ color: C.textSecondary }}>
            <Heart className="w-4 h-4 fill-current" style={{ color: C.red }} /> 142
          </button>
        </div>

        {/* Community CTA */}
        <div
          className="mt-7 rounded-2xl p-5 border"
          style={{
            background: `linear-gradient(135deg, ${C.steel}, ${C.bg})`,
            borderColor: `${C.gold}40`,
          }}
        >
          <span className="text-[10px] font-extrabold tracking-[0.15em]" style={{ color: C.gold }}>
            ✦ Х10 СООБЩЕСТВО
          </span>
          <h3 className="font-extrabold text-[18px] mt-2" style={{ fontFamily: 'Manrope, system-ui' }}>
            Обсудить в своём клампе
          </h3>
          <p className="text-[13px] mt-1.5" style={{ color: C.textSecondary }}>
            34 клампа уже обсуждают эту тему. Присоединись к разговору.
          </p>
          <button
            className="mt-4 px-5 py-2.5 rounded-xl text-[13px] font-semibold active:scale-[0.98] transition"
            style={{ background: C.red, color: '#fff' }}
          >
            Открыть в Х10 →
          </button>
        </div>
      </article>
    </>
  );
};

// ========= SCREEN: TAXES =========
const TaxesScreen = () => {
  const [filter, setFilter] = useState(0);
  const filters = ['Все', 'УСН', 'НДС', 'НДФЛ', 'Самозанятые', 'Релокация'];

  return (
    <>
      <TopBar title="Налоги" />

      {/* Header section */}
      <section
        className="px-5 pt-5 pb-7 border-b relative overflow-hidden"
        style={{
          background: `linear-gradient(135deg, #1A0B0C 0%, ${C.bg} 60%)`,
          borderColor: C.border,
        }}
      >
        <div className="absolute -right-12 -top-12 w-44 h-44 rounded-full" style={{ background: `${C.red}10` }} />
        <span className="text-[10px] font-extrabold tracking-[0.15em] relative" style={{ color: C.red }}>
          РУБРИКА
        </span>
        <h1 className="font-extrabold text-[34px] mt-1.5 leading-tight relative" style={{ fontFamily: 'Manrope, system-ui' }}>
          Налоги
        </h1>
        <p className="text-[13.5px] mt-2 max-w-md leading-[1.5] relative" style={{ color: C.textSecondary }}>
          Что меняется в НК РФ, как платить меньше легально, как разговаривать с ФНС.
        </p>

        {/* Metrics */}
        <div className="grid grid-cols-3 gap-2.5 mt-5 relative">
          {[
            { icon: BarChart3, k: '247', v: 'материалов' },
            { icon: TrendingUp, k: '+18%', v: 'охват/мес' },
            { icon: Calendar, k: '2/нед', v: 'разборов' },
          ].map((m, i) => {
            const Icon = m.icon;
            return (
              <div
                key={i}
                className="rounded-xl p-3 border"
                style={{ background: C.surface, borderColor: C.border }}
              >
                <Icon className="w-3.5 h-3.5 mb-1.5" style={{ color: C.gold }} />
                <div className="font-extrabold text-[18px] tabular-nums" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
                  {m.k}
                </div>
                <div className="text-[10px] mt-0.5" style={{ color: C.textMuted }}>{m.v}</div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Filters */}
      <div className="px-5 py-4 flex gap-2 overflow-x-auto" style={{ scrollbarWidth: 'none' }}>
        <button
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12px] font-medium border whitespace-nowrap"
          style={{ background: C.surface, borderColor: C.border, color: C.textSecondary }}
        >
          <Filter className="w-3.5 h-3.5" /> Фильтры
        </button>
        {filters.map((t, i) => (
          <button
            key={t}
            onClick={() => setFilter(i)}
            className="whitespace-nowrap px-3 py-1.5 rounded-full text-[12px] font-semibold active:scale-95 transition"
            style={{
              background: filter === i ? C.red : C.surface,
              color: filter === i ? '#fff' : C.textSecondary,
              border: filter === i ? 'none' : `1px solid ${C.border}`,
            }}
          >
            {t}
          </button>
        ))}
      </div>

      {/* Premium guide card */}
      <section
        className="mx-5 mb-5 rounded-2xl p-5 border relative overflow-hidden"
        style={{
          background: `linear-gradient(135deg, ${C.gold}15, transparent)`,
          borderColor: `${C.gold}40`,
        }}
      >
        <div className="absolute -right-8 -bottom-8 w-32 h-32 rounded-full" style={{ background: `${C.gold}08` }} />
        <span className="text-[10px] font-extrabold tracking-[0.15em] relative" style={{ color: C.gold }}>
          ✦ ГИД Х10
        </span>
        <h3 className="font-extrabold text-[19px] mt-2 leading-tight relative" style={{ fontFamily: 'Manrope, system-ui' }}>
          Налоговый календарь 2026
        </h3>
        <p className="text-[12.5px] mt-2 relative" style={{ color: C.textSecondary }}>
          18 ключевых дат для предпринимателя. PDF + интерактивная версия с напоминаниями.
        </p>
        <button
          className="mt-4 px-4 py-2.5 rounded-xl text-[13px] font-bold active:scale-[0.98] transition relative"
          style={{ background: C.gold, color: C.steel, fontFamily: 'Manrope, system-ui' }}
        >
          Открыть гид →
        </button>
      </section>

      {/* Article list */}
      <ul className="px-5 space-y-2.5">
        {taxesItems.map((it, i) => (
          <li
            key={i}
            className="flex gap-3 p-3.5 rounded-xl border active:scale-[0.99] transition cursor-pointer"
            style={{ background: C.surface, borderColor: C.border }}
          >
            <div className="w-1 rounded-full" style={{ background: it.hot ? C.red : C.border }} />
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-extrabold tracking-[0.15em]" style={{ color: C.red }}>{it.tag}</span>
                {it.hot && (
                  <span className="text-[10px] font-bold flex items-center gap-0.5" style={{ color: C.gold }}>
                    <Flame className="w-3 h-3" /> HOT
                  </span>
                )}
              </div>
              <h4 className="font-extrabold text-[15px] leading-snug mt-1" style={{ fontFamily: 'Manrope, system-ui' }}>
                {it.title}
              </h4>
              <span className="text-[11px] mt-1.5 block" style={{ color: C.textMuted }}>
                {it.mins} мин чтения
              </span>
            </div>
            <ChevronRight className="w-4 h-4 self-center" style={{ color: C.textMuted }} />
          </li>
        ))}
      </ul>
    </>
  );
};

// ========= SCREEN: VIDEO =========
const VideoScreen = () => {
  const videos = [
    { title: 'Россия 2026: катастрофа или прорыв?', views: '847K', time: '23 мая', dur: '14:22', img: 'https://images.unsplash.com/photo-1542744173-8e7e53415bb0?w=800&q=80', live: false },
    { title: 'Почему я не оставляю наследство детям', views: '1.2M', time: '21 мая', dur: '8:45', img: 'https://images.unsplash.com/photo-1511895426328-dc8714191300?w=800&q=80', live: false },
    { title: 'ПРЯМОЙ ЭФИР: Разбор недели', views: '12K', time: 'сейчас', dur: 'LIVE', img: 'https://images.unsplash.com/photo-1557804506-669a67965ba0?w=800&q=80', live: true },
    { title: 'Налоговая реформа 2026: вся правда', views: '534K', time: '19 мая', dur: '21:08', img: 'https://images.unsplash.com/photo-1554224155-6726b3ff858f?w=800&q=80', live: false },
  ];

  return (
    <>
      <TopBar title="Видео и подкасты" />

      <div className="px-4 pt-3 pb-4 flex gap-2 overflow-x-auto" style={{ scrollbarWidth: 'none' }}>
        {['Все', 'Утренний разбор', 'Подкасты', 'Shorts', 'Интервью', 'Эфиры'].map((t, i) => (
          <button
            key={t}
            className="whitespace-nowrap px-4 py-2 rounded-full text-[13px] font-semibold"
            style={{
              background: i === 0 ? C.red : C.surface,
              color: i === 0 ? '#fff' : C.textSecondary,
              border: i === 0 ? 'none' : `1px solid ${C.border}`,
            }}
          >
            {t}
          </button>
        ))}
      </div>

      {/* Featured podcast player */}
      <section
        className="mx-4 mb-5 rounded-2xl p-5 border relative overflow-hidden"
        style={{
          background: `linear-gradient(135deg, ${C.steel}, ${C.bg})`,
          borderColor: C.border,
        }}
      >
        <div className="flex items-center gap-2 mb-2">
          <span className="text-[10px] font-extrabold tracking-[0.15em]" style={{ color: C.gold }}>
            ✦ ПОДКАСТ НЕДЕЛИ
          </span>
        </div>
        <h3 className="font-extrabold text-[20px] leading-tight" style={{ fontFamily: 'Manrope, system-ui' }}>
          Разбор недели: что случилось в экономике
        </h3>
        <p className="text-[12.5px] mt-2" style={{ color: C.textSecondary }}>
          Игорь Рыбаков + Олег Хархордин · 47 минут
        </p>

        <div className="mt-4 flex items-center gap-3">
          <button
            className="w-12 h-12 rounded-full flex items-center justify-center active:scale-95 transition"
            style={{ background: C.red }}
          >
            <Play className="w-5 h-5 text-white fill-white ml-0.5" />
          </button>
          <div className="flex-1">
            <div className="flex items-end gap-0.5 h-7">
              {[...Array(40)].map((_, i) => (
                <div
                  key={i}
                  className="flex-1 rounded-full"
                  style={{
                    height: `${20 + Math.sin(i * 0.5) * 60 + Math.random() * 30}%`,
                    background: i < 12 ? C.gold : C.border,
                  }}
                />
              ))}
            </div>
            <div className="flex justify-between mt-1.5 text-[10px] font-mono" style={{ color: C.textMuted }}>
              <span>14:23</span><span>47:08</span>
            </div>
          </div>
        </div>
      </section>

      {/* Video grid */}
      <section className="px-4 space-y-3.5">
        {videos.map((v, i) => (
          <article
            key={i}
            className="rounded-2xl overflow-hidden border active:scale-[0.99] transition cursor-pointer"
            style={{ background: C.surface, borderColor: C.border }}
          >
            <div className="relative">
              <img src={v.img} className="w-full h-44 object-cover" alt="" />
              <div className="absolute inset-0 flex items-center justify-center">
                <span
                  className="w-12 h-12 rounded-full flex items-center justify-center"
                  style={{ background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(8px)' }}
                >
                  <Play className="w-5 h-5 text-white fill-white ml-0.5" />
                </span>
              </div>
              <span
                className="absolute bottom-3 right-3 text-[10px] font-bold px-2 py-1 rounded flex items-center gap-1"
                style={{
                  background: v.live ? C.red : 'rgba(0,0,0,0.75)',
                  color: '#fff',
                }}
              >
                {v.live && <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />}
                {v.dur}
              </span>
            </div>
            <div className="p-3.5">
              <h4 className="font-extrabold text-[15px] leading-snug" style={{ fontFamily: 'Manrope, system-ui' }}>
                {v.title}
              </h4>
              <div className="flex items-center gap-2 mt-1.5 text-[11px]" style={{ color: C.textMuted }}>
                <span>{v.views} просмотров</span>
                <span>·</span>
                <span>{v.time}</span>
              </div>
            </div>
          </article>
        ))}
      </section>
    </>
  );
};

// ========= SCREEN: COMMUNITY =========
const CommunityScreen = () => (
  <>
    <TopBar title="Сообщество Х10" />

    {/* Hero */}
    <section className="px-5 pt-3 pb-4">
      <div className="flex items-end justify-between">
        <div>
          <span className="text-[10px] font-extrabold tracking-[0.15em]" style={{ color: C.gold }}>
            ✦ ДВИЖЕНИЕ
          </span>
          <h1 className="font-extrabold text-[32px] mt-1 leading-none" style={{ fontFamily: 'Manrope, system-ui' }}>
            Х10
          </h1>
        </div>
        <div className="text-right">
          <div className="font-extrabold text-[24px] tabular-nums" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
            30 885
          </div>
          <div className="text-[11px]" style={{ color: C.textMuted }}>в 124 городах · 11 стран</div>
        </div>
      </div>
    </section>

    {/* My Clamp */}
    <section
      className="mx-5 mb-5 rounded-2xl p-5 border relative overflow-hidden"
      style={{ background: C.surface, borderColor: `${C.red}40` }}
    >
      <div className="absolute -right-10 -top-10 w-32 h-32 rounded-full" style={{ background: `${C.red}10` }} />
      <span className="text-[10px] font-extrabold tracking-[0.15em] relative" style={{ color: C.red }}>
        МОЙ КЛАМП
      </span>
      <h2 className="font-extrabold text-[20px] mt-2 relative" style={{ fontFamily: 'Manrope, system-ui' }}>
        {myClamp.name}
      </h2>
      <p className="text-[12.5px] mt-1.5 relative" style={{ color: C.textSecondary }}>
        🎯 {myClamp.goal}
      </p>

      <div className="flex items-center gap-3 mt-4 relative">
        <div className="flex -space-x-2">
          {[1, 2, 3, 4, 5].map((n) => (
            <div
              key={n}
              className="w-8 h-8 rounded-full border-2 flex items-center justify-center text-[10px] font-bold text-white"
              style={{
                borderColor: C.surface,
                background: `linear-gradient(135deg, ${['#E63946', '#D4A24C', '#3FB950', '#1F2937', '#8E1B26'][n - 1]}, ${C.red})`,
              }}
            >
              {['А', 'М', 'К', 'И', 'П'][n - 1]}
            </div>
          ))}
        </div>
        <span className="text-[12px]" style={{ color: C.textSecondary }}>
          +{myClamp.members - 5} участников
        </span>
      </div>

      <div className="mt-4 relative">
        <div className="flex justify-between text-[11px] mb-1.5" style={{ color: C.textSecondary }}>
          <span>Прогресс цели</span>
          <span className="font-mono font-bold" style={{ color: C.gold }}>{myClamp.progress}%</span>
        </div>
        <div className="h-1.5 rounded-full overflow-hidden" style={{ background: C.border }}>
          <div
            className="h-full rounded-full"
            style={{
              width: `${myClamp.progress}%`,
              background: `linear-gradient(to right, ${C.red}, ${C.gold})`,
            }}
          />
        </div>
      </div>

      <button
        className="w-full mt-5 font-semibold py-3 rounded-xl text-[13.5px] flex items-center justify-center gap-2 active:scale-[0.98] transition relative"
        style={{ background: C.red, color: '#fff' }}
      >
        <MessageSquare className="w-4 h-4" /> Открыть чат · {myClamp.nextMeeting}
      </button>
    </section>

    {/* Events */}
    <section className="px-5 mb-5">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-extrabold text-[19px]" style={{ fontFamily: 'Manrope, system-ui' }}>
          События рядом
        </h3>
        <span className="flex items-center text-[11px] gap-1" style={{ color: C.textSecondary }}>
          <MapPin className="w-3 h-3" /> Краснодар
        </span>
      </div>
      <div className="space-y-2.5">
        {events.map((e, i) => (
          <div
            key={i}
            className="rounded-xl border p-3.5 flex items-center gap-3.5 active:scale-[0.99] transition cursor-pointer"
            style={{ background: C.surface, borderColor: C.border }}
          >
            <div
              className={`w-14 h-14 rounded-xl flex flex-col items-center justify-center text-white bg-gradient-to-br ${e.gradient}`}
            >
              <span className="text-[10px] uppercase opacity-70 leading-none mt-0.5">{e.month}</span>
              <span className="font-extrabold text-[20px] leading-tight" style={{ fontFamily: 'Manrope, system-ui' }}>{e.date}</span>
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[10px] font-extrabold tracking-[0.15em]" style={{ color: C.gold }}>
                {e.city}
              </div>
              <h4 className="font-bold text-[14px] leading-tight mt-0.5 truncate" style={{ fontFamily: 'Manrope, system-ui' }}>
                {e.title}
              </h4>
              <span className="text-[11px] flex items-center gap-1 mt-1" style={{ color: C.textMuted }}>
                <Users className="w-3 h-3" /> {e.attendees} участников
              </span>
            </div>
            <ChevronRight className="w-4 h-4" style={{ color: C.textMuted }} />
          </div>
        ))}
      </div>
    </section>

    {/* Find clamp */}
    <section className="px-5">
      <h3 className="font-extrabold text-[19px] mb-3" style={{ fontFamily: 'Manrope, system-ui' }}>
        Войти глубже
      </h3>
      <div className="grid grid-cols-2 gap-2.5">
        {[
          { t: 'Создать свой кламп', d: 'Собрать команду 6-10 человек', i: '🚀' },
          { t: 'Найти кламп рядом', d: 'По теме или городу', i: '🔍' },
          { t: 'Стать кламперам', d: 'Лидер малой группы', i: '⚡' },
          { t: 'Региональный лидер', d: 'Развивать Х10 в городе', i: '🌐' },
        ].map((c, i) => (
          <button
            key={c.t}
            className="rounded-xl p-4 text-left active:scale-[0.98] transition border"
            style={{ background: C.surface, borderColor: C.border }}
          >
            <div className="text-[20px] mb-2">{c.i}</div>
            <div className="font-extrabold text-[13px] leading-tight" style={{ fontFamily: 'Manrope, system-ui' }}>
              {c.t}
            </div>
            <div className="text-[11px] mt-1 leading-tight" style={{ color: C.textMuted }}>
              {c.d}
            </div>
          </button>
        ))}
      </div>
    </section>
  </>
);

// ========= SCREEN: PROFILE =========
const ProfileScreen = () => (
  <>
    <TopBar title="Профиль" showSearch={false} />

    {/* User card */}
    <section
      className="mx-4 mt-3 rounded-2xl p-5 border relative overflow-hidden"
      style={{
        background: `linear-gradient(135deg, ${C.steel}, ${C.bg})`,
        borderColor: C.border,
      }}
    >
      <div className="absolute -right-12 -top-12 w-36 h-36 rounded-full" style={{ background: `${C.red}08` }} />
      <div className="flex items-center gap-4 relative">
        <div
          className="w-16 h-16 rounded-full flex items-center justify-center font-extrabold text-[26px] text-white"
          style={{
            background: `linear-gradient(135deg, ${C.red}, ${C.gold})`,
            fontFamily: 'Manrope, system-ui',
          }}
        >
          {me.name[0]}
        </div>
        <div>
          <h2 className="font-extrabold text-[20px]" style={{ fontFamily: 'Manrope, system-ui' }}>
            {me.name}
          </h2>
          <p className="text-[12.5px] mt-0.5 flex items-center gap-1.5" style={{ color: C.textSecondary }}>
            <span
              className="px-2 py-0.5 rounded text-[10px] font-bold"
              style={{ background: `${C.red}20`, color: C.red }}
            >
              {me.role}
            </span>
            <MapPin className="w-3 h-3" /> {me.city}
          </p>
        </div>
      </div>

      <button
        className="mt-4 w-full font-semibold py-3 rounded-xl text-[13.5px] flex items-center justify-center gap-2 active:scale-[0.98] transition border relative"
        style={{
          background: `${C.gold}15`,
          borderColor: `${C.gold}50`,
          color: C.gold,
        }}
      >
        <Crown className="w-4 h-4" /> Активировать Х10 Premium · 1 500 ₽/мес
      </button>
    </section>

    {/* Stats */}
    <section className="px-4 mt-4 grid grid-cols-4 gap-2">
      {[
        { i: Flame, k: me.streak, v: 'дней стрик', c: C.red },
        { i: BookOpen, k: me.read, v: 'прочитано', c: C.gold },
        { i: Bookmark, k: me.saved, v: 'сохранено', c: C.success },
        { i: Crown, k: me.ips, v: 'IPS', c: C.gold },
      ].map((s, i) => {
        const Icon = s.i;
        return (
          <div
            key={i}
            className="rounded-xl p-3 border text-center"
            style={{ background: C.surface, borderColor: C.border }}
          >
            <Icon className="w-4 h-4 mx-auto mb-1.5" style={{ color: s.c }} />
            <div className="font-extrabold text-[15px] tabular-nums" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
              {s.k}
            </div>
            <div className="text-[9px] mt-0.5" style={{ color: C.textMuted }}>{s.v}</div>
          </div>
        );
      })}
    </section>

    {/* Streak progress */}
    <section className="mx-4 mt-4 rounded-2xl p-4 border" style={{ background: C.surface, borderColor: C.border }}>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Flame className="w-4 h-4" style={{ color: C.red }} />
          <span className="font-bold text-[13px]">Стрик чтения · 23 дня</span>
        </div>
        <span className="text-[11px]" style={{ color: C.textSecondary }}>До ачивки: 7</span>
      </div>
      <div className="grid grid-cols-7 gap-1.5">
        {[...Array(7)].map((_, i) => (
          <div
            key={i}
            className="aspect-square rounded-md flex items-center justify-center text-[10px] font-bold"
            style={{
              background: i < 5 ? C.red : C.border,
              color: i < 5 ? '#fff' : C.textMuted,
            }}
          >
            {['П', 'В', 'С', 'Ч', 'П', 'С', 'В'][i]}
          </div>
        ))}
      </div>
    </section>

    {/* Subscriptions */}
    <section className="px-4 mt-6">
      <h3 className="font-extrabold text-[15px] mb-2.5" style={{ fontFamily: 'Manrope, system-ui' }}>
        Мои подписки
      </h3>
      <div className="space-y-2">
        {subs.map((s) => (
          <div
            key={s}
            className="flex items-center justify-between rounded-xl px-4 py-3 border"
            style={{ background: C.surface, borderColor: C.border }}
          >
            <span className="text-[13.5px]">{s}</span>
            <div className="w-10 h-6 rounded-full relative" style={{ background: C.red }}>
              <span className="absolute right-0.5 top-0.5 w-5 h-5 bg-white rounded-full" />
            </div>
          </div>
        ))}
      </div>
    </section>

    {/* Schedule */}
    <section className="px-4 mt-6">
      <h3 className="font-extrabold text-[15px] mb-2.5 flex items-center gap-2" style={{ fontFamily: 'Manrope, system-ui' }}>
        <Bell className="w-4 h-4" /> Дайджест-расписание
      </h3>
      <div className="rounded-xl border overflow-hidden" style={{ background: C.surface, borderColor: C.border }}>
        {[
          { t: '07:00', n: 'Утренний разбор Рыбакова', on: true },
          { t: '13:00', n: 'Smart-карусель за обедом', on: true },
          { t: '19:00', n: 'Что обсуждают в Х10', on: false },
        ].map((r, i) => (
          <div
            key={i}
            className="flex items-center justify-between px-4 py-3"
            style={{ borderTop: i > 0 ? `1px solid ${C.border}` : 'none' }}
          >
            <div>
              <span className="font-mono font-bold text-[13px]" style={{ color: C.gold }}>{r.t}</span>
              <span className="ml-3 text-[13px]">{r.n}</span>
            </div>
            <div
              className="w-10 h-6 rounded-full relative transition"
              style={{ background: r.on ? C.red : C.border }}
            >
              <span
                className="absolute top-0.5 w-5 h-5 bg-white rounded-full transition-all"
                style={{ left: r.on ? 'calc(100% - 22px)' : '2px' }}
              />
            </div>
          </div>
        ))}
      </div>
    </section>

    {/* Menu */}
    <section className="px-4 mt-6 space-y-2 pb-4">
      {[
        { t: 'Сохранённое', i: Bookmark },
        { t: 'История чтения', i: BookOpen },
        { t: 'Скачанные подкасты', i: Headphones },
        { t: 'Х10 Premium', i: Crown },
        { t: 'Настройки', i: Settings },
      ].map((it) => {
        const Icon = it.i;
        return (
          <button
            key={it.t}
            className="w-full flex items-center justify-between rounded-xl px-4 py-3 text-[13.5px] border active:scale-[0.99] transition"
            style={{ background: C.surface, borderColor: C.border }}
          >
            <span className="flex items-center gap-3">
              <Icon className="w-4 h-4" style={{ color: C.textSecondary }} />
              {it.t}
            </span>
            <ChevronRight className="w-4 h-4" style={{ color: C.textMuted }} />
          </button>
        );
      })}
    </section>
  </>
);

// ========= MAIN APP =========
export default function App() {
  const [tab, setTab] = useState('home');
  const [article, setArticle] = useState(null);

  // Inject fonts
  useEffect(() => {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'https://fonts.googleapis.com/css2?family=Manrope:wght@500;600;700;800&family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@500;700&display=swap';
    document.head.appendChild(link);
    const style = document.createElement('style');
    style.textContent = `
      *::-webkit-scrollbar { display: none; }
      body { font-family: Inter, system-ui, sans-serif; -webkit-font-smoothing: antialiased; }
    `;
    document.head.appendChild(style);
    return () => { document.head.removeChild(link); document.head.removeChild(style); };
  }, []);

  const handleOpenArticle = (a) => setArticle(a);
  const handleBackFromArticle = () => setArticle(null);

  return (
    <div
      className="min-h-screen w-full flex items-start justify-center py-0 sm:py-6"
      style={{
        background: `radial-gradient(ellipse at top, #1a1a22 0%, #050507 100%)`,
        fontFamily: 'Inter, system-ui, sans-serif',
      }}
    >
      <div
        className="w-full max-w-[440px] min-h-screen sm:min-h-[920px] sm:max-h-[920px] sm:rounded-[36px] overflow-hidden sm:shadow-2xl relative"
        style={{
          background: C.bg,
          color: C.textPrimary,
          boxShadow: '0 30px 80px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.04)',
        }}
      >
        <div
          className="absolute inset-0 overflow-y-auto pb-20"
          style={{ scrollbarWidth: 'none' }}
        >
          {article ? (
            <ArticleScreen article={article} onBack={handleBackFromArticle} />
          ) : tab === 'home' ? (
            <HomeScreen onOpenArticle={handleOpenArticle} />
          ) : tab === 'taxes' ? (
            <TaxesScreen />
          ) : tab === 'video' ? (
            <VideoScreen />
          ) : tab === 'community' ? (
            <CommunityScreen />
          ) : (
            <ProfileScreen />
          )}
        </div>

        {!article && (
          <div className="absolute bottom-0 inset-x-0">
            <BottomNav tab={tab} setTab={setTab} />
          </div>
        )}
      </div>
    </div>
  );
}
