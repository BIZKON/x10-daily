import { describe, expect, it } from "vitest";
import { createApp } from "../src/app";
import type { AppBindings, RateLimiter } from "../src/bindings";

/**
 * Карусель — HumanGate на слайды (реестр §3.5).
 *
 * 🔴 Правило CLAUDE.md §4: ИИ не публикует автономно. Конвейер доводит слайды
 * до `pending_review`, в канал альбом пускает ТОЛЬКО редактор. Проверяем
 * ворота: посторонний не рисует карусели за наши деньги и не публикует их.
 */

const noopLimiter: RateLimiter = {
  async limit() {
    return { success: true };
  },
};

const TEST_BINDINGS: AppBindings = {
  NODE_ENV: "development",
  DATABASE_URL: "postgresql://test:test@localhost/test",
  ENGAGEMENT_LIMITER: noopLimiter,
  PIPELINE_LIMITER: noopLimiter,
};

const ID = "00000000-0000-4000-8000-000000000001";
const BASE = "https://x10-api.local/v1/admin/carousels";

const call = (path: string, method = "GET") =>
  createApp().fetch(new Request(`${BASE}${path}`, { method }), TEST_BINDINGS);

describe("без входа карусели закрыты", () => {
  it("очередь не отдаётся", async () => {
    expect((await call("?status=pending_review")).status).toBe(401);
  });

  it("🔴 нарисовать нельзя: это платный прогон модели", async () => {
    expect((await call(`/${ID}/make`, "POST")).status).toBe(401);
  });

  it("🔴 одобрить нельзя: одобрение публикует альбом в канал", async () => {
    expect((await call(`/${ID}/approve`, "POST")).status).toBe(401);
  });

  it("отклонить тоже нельзя", async () => {
    expect((await call(`/${ID}/reject`, "POST")).status).toBe(401);
  });
});

describe("адрес статьи проверяется до базы", () => {
  it("не-uuid в адресе — 400, а не поход в базу", async () => {
    const res = await createApp().fetch(
      new Request(`${BASE}/не-uuid/make`, { method: "POST" }),
      TEST_BINDINGS,
    );
    expect(res.status).toBe(400);
  });
});
