import { describe, expect, it } from "vitest";
import {
  ALL_PERMISSIONS,
  DB_ROLE_BY_TEAM_ROLE,
  PERMISSIONS,
  TEAM_ROLES,
  TEAM_ROLE_LABEL,
  TEAM_ROLE_SUMMARY,
  can,
  dbRoleCan,
  teamRoleFromDbRole,
} from "@x10/config";

/**
 * Карта прав команды (Спека 5). Живёт в `@x10/config`, а тест — здесь: в
 * packages/config нет тестового раннера, а заводить его ради одного файла
 * значило бы тянуть новую зависимость. Тесты фиксируют не реализацию, а РЕШЕНИЯ:
 * что именно роль может и, главное, чего не может.
 */

describe("роли ↔ значения БД", () => {
  it("каждая роль ложится на существующее значение user_role — без ADD VALUE", () => {
    // PG-enum: reader | subscriber | author | editor | admin.
    const allowed = new Set(["reader", "subscriber", "author", "editor", "admin"]);
    for (const r of TEAM_ROLES) {
      expect(allowed.has(DB_ROLE_BY_TEAM_ROLE[r])).toBe(true);
    }
  });

  it("отображение обратимо: роль → БД → роль", () => {
    for (const r of TEAM_ROLES) {
      expect(teamRoleFromDbRole(DB_ROLE_BY_TEAM_ROLE[r])).toBe(r);
    }
  });

  it("🔴 reader — НЕ член команды: читатель мини-аппа не должен получить прав", () => {
    expect(teamRoleFromDbRole("reader")).toBeNull();
    for (const p of ALL_PERMISSIONS) {
      expect(dbRoleCan("reader", p)).toBe(false);
    }
  });

  it("пустая/неизвестная роль прав не даёт", () => {
    for (const p of ALL_PERMISSIONS) {
      expect(can(null, p)).toBe(false);
      expect(dbRoleCan(undefined, p)).toBe(false);
      expect(dbRoleCan("нет-такой-роли", p)).toBe(false);
    }
  });

  it("у каждой роли есть человеческая подпись — её видит клиент", () => {
    for (const r of TEAM_ROLES) {
      expect(TEAM_ROLE_LABEL[r]).toBeTruthy();
      expect(TEAM_ROLE_SUMMARY[r]).toBeTruthy();
    }
  });
});

describe("что может Владелец", () => {
  it("может всё — иначе система становится необслуживаемой", () => {
    for (const p of ALL_PERMISSIONS) {
      expect(can("owner", p)).toBe(true);
    }
  });
});

describe("что может Редактор", () => {
  it("публикует и ведёт справочники", () => {
    expect(can("editor", "content.publish")).toBe(true);
    expect(can("editor", "catalog.manage")).toBe(true);
    expect(can("editor", "cost.view")).toBe(true);
  });

  it("🔴 не управляет командой: доступ не выдаёт тот, кому его выдали", () => {
    expect(can("editor", "team.manage")).toBe(false);
  });
});

describe("что может Автор", () => {
  it("пишет и правит", () => {
    expect(can("author", "content.view")).toBe(true);
    expect(can("author", "content.edit")).toBe(true);
  });

  it("🔴 НЕ публикует — в этом весь смысл роли", () => {
    expect(can("author", "content.publish")).toBe(false);
  });

  it("не ведёт справочники, настройки и команду", () => {
    expect(can("author", "catalog.manage")).toBe(false);
    expect(can("author", "settings.manage")).toBe(false);
    expect(can("author", "team.manage")).toBe(false);
  });
});

describe("что может Наблюдатель", () => {
  it("видит контент — иначе роль бессмысленна", () => {
    expect(can("viewer", "content.view")).toBe(true);
  });

  it("🔴 не видит СУММ: роль под заказчика и агентство, себестоимость им не нужна", () => {
    expect(can("viewer", "cost.view")).toBe(false);
  });

  it("не меняет ничего вообще", () => {
    for (const p of ALL_PERMISSIONS) {
      if (p === "content.view") continue;
      expect(can("viewer", p)).toBe(false);
    }
  });
});

describe("целостность карты", () => {
  it("каждое право кому-то принадлежит — право без ролей мертво", () => {
    for (const p of ALL_PERMISSIONS) {
      expect((PERMISSIONS[p] as readonly string[]).length).toBeGreaterThan(0);
    }
  });

  it("в карте только известные роли — опечатка молча отняла бы доступ", () => {
    const known = new Set<string>(TEAM_ROLES);
    for (const p of ALL_PERMISSIONS) {
      for (const r of PERMISSIONS[p] as readonly string[]) {
        expect(known.has(r)).toBe(true);
      }
    }
  });

  it("🔴 управление командой — только у Владельца", () => {
    expect(PERMISSIONS["team.manage"]).toEqual(["owner"]);
  });
});
