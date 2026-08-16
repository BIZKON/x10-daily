/**
 * Сумма прописью для счёта (спека 7).
 *
 * Обязательный реквизит российского счёта: бухгалтерия сверяет цифру с
 * прописью и при расхождении возвращает документ. Пишем сами, без пакета:
 * задача умещается в полсотни строк, а зависимость ради неё пришлось бы
 * обновлять и проверять годами.
 *
 * 🔴 Два места, где такие функции обычно врут: тысячи женского рода («одна
 * тысяча», «две тысячи») и числа 11–19, которые склоняются не как единицы.
 */

const ONES_M = [
  "",
  "один",
  "два",
  "три",
  "четыре",
  "пять",
  "шесть",
  "семь",
  "восемь",
  "девять",
];
const ONES_F = ["", "одна", "две", "три", "четыре", "пять", "шесть", "семь", "восемь", "девять"];
const TEENS = [
  "десять",
  "одиннадцать",
  "двенадцать",
  "тринадцать",
  "четырнадцать",
  "пятнадцать",
  "шестнадцать",
  "семнадцать",
  "восемнадцать",
  "девятнадцать",
];
const TENS = [
  "",
  "",
  "двадцать",
  "тридцать",
  "сорок",
  "пятьдесят",
  "шестьдесят",
  "семьдесят",
  "восемьдесят",
  "девяносто",
];
const HUNDREDS = [
  "",
  "сто",
  "двести",
  "триста",
  "четыреста",
  "пятьсот",
  "шестьсот",
  "семьсот",
  "восемьсот",
  "девятьсот",
];

/** Форма слова по числу: 1 рубль, 2 рубля, 5 рублей. */
export function plural(n: number, one: string, few: string, many: string): string {
  const mod100 = Math.abs(n) % 100;
  // 11–14 берут форму «многих» вопреки последней цифре — это и есть ловушка.
  if (mod100 >= 11 && mod100 <= 14) return many;
  const mod10 = mod100 % 10;
  if (mod10 === 1) return one;
  if (mod10 >= 2 && mod10 <= 4) return few;
  return many;
}

/** Группа из трёх цифр словами. `female` — для тысяч. */
function tripletWords(n: number, female: boolean): string[] {
  const words: string[] = [];
  const h = Math.floor(n / 100);
  const rest = n % 100;

  if (h > 0) words.push(HUNDREDS[h] as string);

  if (rest >= 10 && rest <= 19) {
    words.push(TEENS[rest - 10] as string);
  } else {
    const t = Math.floor(rest / 10);
    const o = rest % 10;
    if (t > 0) words.push(TENS[t] as string);
    if (o > 0) words.push((female ? ONES_F[o] : ONES_M[o]) as string);
  }

  return words;
}

const SCALES = [
  { value: 1_000_000_000, female: false, forms: ["миллиард", "миллиарда", "миллиардов"] },
  { value: 1_000_000, female: false, forms: ["миллион", "миллиона", "миллионов"] },
  { value: 1_000, female: true, forms: ["тысяча", "тысячи", "тысяч"] },
] as const;

/**
 * «Триста пятьдесят тысяч рублей 00 копеек».
 *
 * Копейки цифрами — так принято в счетах и так короче: их сверяют глазами, а не
 * читают вслух.
 */
export function amountInWords(rub: number): string {
  const totalKop = Math.round(Math.abs(rub) * 100);
  const whole = Math.floor(totalKop / 100);
  const kop = totalKop % 100;

  const words: string[] = [];
  let rest = whole;

  for (const scale of SCALES) {
    const count = Math.floor(rest / scale.value);
    if (count > 0) {
      words.push(...tripletWords(count, scale.female));
      words.push(plural(count, scale.forms[0], scale.forms[1], scale.forms[2]));
      rest %= scale.value;
    }
  }

  if (rest > 0) words.push(...tripletWords(rest, false));
  if (words.length === 0) words.push("ноль");

  const rubleWord = plural(whole, "рубль", "рубля", "рублей");
  const kopWord = plural(kop, "копейка", "копейки", "копеек");
  const text = `${words.join(" ")} ${rubleWord} ${String(kop).padStart(2, "0")} ${kopWord}`;

  return text.charAt(0).toUpperCase() + text.slice(1);
}
