/**
 * SimHash64 на FNV-1a по словесным токенам (RU/EN/digits).
 *
 * Walking Skeleton (ТЗ #1, N3): нужен для дедупа на стороне cron'а — близкие
 * по содержанию заголовки (после rewrap/punctuation) получают одинаковый
 * fingerprint. Шкала отличий — Hamming distance, но в этой версии хватает
 * exact-match — точные совпадения отсекаются на (source_id, external_id),
 * SimHash сохраняется как структура под будущий ТЗ #3 (pgvector cosine).
 *
 * Без npm-зависимостей: 64-битная арифметика через BigInt.
 */

const FNV_OFFSET = 0xcbf29ce484222325n;
const FNV_PRIME = 0x100000001b3n;
const MASK_64 = 0xffffffffffffffffn;

/** FNV-1a 64-bit по UTF-8 байтам. */
function fnv1a64(token: string): bigint {
  let h = FNV_OFFSET;
  const bytes = new TextEncoder().encode(token);
  for (const b of bytes) {
    h ^= BigInt(b);
    h = (h * FNV_PRIME) & MASK_64;
  }
  return h;
}

/** Токенизация: lowercase, оставляем только буквы (RU/EN) и цифры. */
function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((t) => t.length >= 2);
}

/**
 * SimHash64 → 16-символьная hex-строка. Пустой вход → "0000000000000000".
 */
export function simhash64(text: string): string {
  const tokens = tokenize(text);
  if (tokens.length === 0) return "0000000000000000";

  const v = new Array<number>(64).fill(0);
  for (const tok of tokens) {
    const h = fnv1a64(tok);
    for (let i = 0; i < 64; i++) {
      const bit = (h >> BigInt(i)) & 1n;
      v[i]! += bit === 1n ? 1 : -1;
    }
  }

  let fp = 0n;
  for (let i = 0; i < 64; i++) {
    if (v[i]! > 0) fp |= 1n << BigInt(i);
  }
  return fp.toString(16).padStart(16, "0");
}
