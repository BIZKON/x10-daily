/**
 * Секрет пригласительной ссылки (Спека 5).
 *
 * 🔴 В базе лежит только sha256-хеш. Сам секрет существует ровно один раз — в
 * ответе на создание приглашения; показать ссылку повторно физически нельзя,
 * и утечка дампа не даёт войти в чужой кабинет.
 *
 * Длина 32 байта (256 бит) из `crypto.getRandomValues` — угадать перебором
 * нереально, а ссылка остаётся достаточно короткой, чтобы её пересылали в чате
 * не ломая.
 */

const TOKEN_BYTES = 32;
/**
 * Без `l`, `o`, `0`, `1` — их путают при переписывании и диктовке.
 *
 * Ровно 32 символа не случайно: 256 делится на 32 нацело, поэтому `byte % 32`
 * даёт равномерное распределение. При 33 символах часть букв выпадала бы чаще
 * остальных — смещение по модулю, которое тихо съедает энтропию.
 */
const ALPHABET = "abcdefghijkmnpqrstuvwxyz23456789";

/**
 * Новый секрет. Алфавит без похожих символов (`l`/`1`, `0`/`o`) — ссылку
 * иногда диктуют голосом или переписывают руками.
 */
export function newInviteToken(): string {
  const bytes = new Uint8Array(TOKEN_BYTES);
  crypto.getRandomValues(bytes);
  let out = "";
  for (const b of bytes) {
    out += ALPHABET[b % ALPHABET.length];
  }
  return out;
}

/** sha256(token) в hex — ровно то, что хранится в `team_invites.token_hash`. */
export async function hashInviteToken(token: string): Promise<string> {
  const data = new TextEncoder().encode(token);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
