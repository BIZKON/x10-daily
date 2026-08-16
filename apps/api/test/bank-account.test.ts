import { describe, expect, it } from "vitest";
import { accountKeyValid, checkBankDetails } from "../src/lib/bank-account";

/**
 * Реквизиты в счёте (спека 7).
 *
 * ⚠️ Здесь синтетические реквизиты, а не настоящие: репозиторий публичный.
 * Боевые живут в `.env.production` и проверяются этим же кодом при выставлении
 * счёта.
 */

// БИК Сбербанка (публичный справочник ЦБ) + счета, подобранные под него.
const BIK = "044525225";
const ACCOUNT = "40702810200000012345";
const CORR = "30101810400000000225";

describe("контрольный ключ счёта", () => {
  it("верные реквизиты проходят", () => {
    expect(accountKeyValid(BIK, ACCOUNT)).toBe(true);
    expect(accountKeyValid(BIK, CORR)).toBe(true);
  });

  it("🔴 подменённая цифра не проходит", () => {
    // Ровно та ошибка, ради которой всё это: одну цифру глазами не поймать.
    const broken = `${ACCOUNT.slice(0, 12)}9${ACCOUNT.slice(13)}`;
    expect(accountKeyValid(BIK, broken)).toBe(false);
  });

  it("счёт от другого банка не проходит", () => {
    // Ключ считается ПО БИК: счёт из другого банка ловится этим же способом.
    expect(accountKeyValid("044525974", ACCOUNT)).toBe(false);
  });

  it("неверная длина отбивается сразу", () => {
    expect(accountKeyValid(BIK, "123")).toBe(false);
    expect(accountKeyValid("0445", ACCOUNT)).toBe(false);
    expect(accountKeyValid(BIK, `${ACCOUNT}0`)).toBe(false);
  });

  it("буквы вместо цифр не проходят", () => {
    expect(accountKeyValid(BIK, "4070281О200000012345")).toBe(false);
  });
});

describe("реквизиты из окружения", () => {
  const FULL = {
    X10_BANK_NAME: "ПАО «Банк»",
    X10_BANK_BIK: BIK,
    X10_BANK_ACCOUNT: ACCOUNT,
    X10_BANK_CORR_ACCOUNT: CORR,
  };

  it("полный набор принимается", () => {
    const r = checkBankDetails(FULL);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.bank.bik).toBe(BIK);
  });

  it("🔴 три реквизита из четырёх — не счёт", () => {
    // Такой документ выглядит заполненным, но в банке клиента не проходит.
    const r = checkBankDetails({ ...FULL, X10_BANK_CORR_ACCOUNT: undefined });
    expect(r).toEqual({ ok: false, reason: "not_set" });
  });

  it("пустые строки за реквизиты не считаются", () => {
    expect(checkBankDetails({ ...FULL, X10_BANK_NAME: "   " }).ok).toBe(false);
  });

  it("опечатка в расчётном счёте называется по имени", () => {
    const r = checkBankDetails({ ...FULL, X10_BANK_ACCOUNT: "40702810200000012346" });
    expect(r).toEqual({ ok: false, reason: "bad_account" });
  });

  it("опечатка в корсчёте отличается от опечатки в расчётном", () => {
    const r = checkBankDetails({ ...FULL, X10_BANK_CORR_ACCOUNT: "30101810400000000226" });
    expect(r).toEqual({ ok: false, reason: "bad_corr_account" });
  });

  it("короткий БИК называется отдельно", () => {
    expect(checkBankDetails({ ...FULL, X10_BANK_BIK: "0445252" })).toEqual({
      ok: false,
      reason: "bad_bik",
    });
  });
});
