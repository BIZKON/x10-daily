import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MaskerUnconfiguredError, createMasker } from "../src/masker";

describe("createMasker", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("dev + no MASKER URL → pass-through", async () => {
    const m = createMasker({ NODE_ENV: "development" });
    const { masked, session } = await m.mask("Иванов И.И., +7-916-555-12-34");
    expect(masked).toContain("Иванов");
    expect(session.sessionId).toBe("passthrough");
    expect(await m.unmask(masked, session)).toBe(masked);
  });

  it("test + no MASKER URL → pass-through", async () => {
    const m = createMasker({ NODE_ENV: "test" });
    const r = await m.mask("foo");
    expect(r.masked).toBe("foo");
  });

  it("production + no MASKER + Anthropic direct (no AI Gateway) → fail-closed", () => {
    expect(() => createMasker({ NODE_ENV: "production" })).toThrow(MaskerUnconfiguredError);
  });

  it("production + no MASKER + Timeweb AI Gateway → pass-through (ПДн не покидают РФ, §14)", async () => {
    const m = createMasker({ NODE_ENV: "production", AI_GATEWAY_API_KEY: "tw-key" });
    const { masked, session } = await m.mask("Иванов И.И., +7-916-555-12-34");
    expect(masked).toContain("Иванов");
    expect(session.sessionId).toBe("passthrough");
    expect(await m.unmask(masked, session)).toBe(masked);
  });

  it("MASKER URL+KEY → HTTP-вызов", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(
        new Response(JSON.stringify({ masked: "[NAME_1], [PHONE_1]", sessionId: "sess-1" }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      );

    const m = createMasker({
      NODE_ENV: "production",
      MASKER_BASE_URL: "https://masker.example.com",
      MASKER_API_KEY: "secret",
    });

    const { masked, session } = await m.mask("Иванов, +7-916-555-12-34");
    expect(fetchSpy).toHaveBeenCalledOnce();
    expect(masked).toBe("[NAME_1], [PHONE_1]");
    expect(session.sessionId).toBe("sess-1");
    const [, init] = fetchSpy.mock.calls[0]!;
    expect((init as RequestInit).headers).toMatchObject({
      authorization: "Bearer secret",
    });
  });

  it("unmask отправляет sessionId", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(
        new Response(JSON.stringify({ text: "Иванов, +7-916-555-12-34" }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      );

    const m = createMasker({
      NODE_ENV: "production",
      MASKER_BASE_URL: "https://masker.example.com",
      MASKER_API_KEY: "secret",
    });

    const restored = await m.unmask("[NAME_1], [PHONE_1]", { sessionId: "sess-1" });
    expect(restored).toBe("Иванов, +7-916-555-12-34");
    expect(fetchSpy).toHaveBeenCalledOnce();
  });
});
