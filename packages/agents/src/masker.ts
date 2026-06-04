/**
 * KikuAI Masker middleware — mask → LLM → unmask.
 * См. CLAUDE.md §7: иностранные LLM не должны видеть сырые ПДн (152-ФЗ).
 *
 * Поведение:
 *  - MASKER_BASE_URL+KEY заданы                  → реальные HTTP-вызовы
 *  - prod + MASKER пуст + Anthropic direct       → fail-closed (бросаем)
 *  - prod + MASKER пуст + Timeweb AI Gateway     → pass-through (ПДн в РФ, §14)
 *  - dev/test + MASKER пуст                      → pass-through (заглушка)
 */

import type { Env } from "@x10/config";

export type MaskerSession = {
  /** Стабильные плейсхолдеры для мультитурновых диалогов. */
  sessionId: string;
};

export type MaskResult = {
  masked: string;
  session: MaskerSession;
};

export class MaskerUnconfiguredError extends Error {
  constructor() {
    super(
      "MASKER_BASE_URL/MASKER_API_KEY не заданы в production. " +
        "Запрещено отправлять ПДн в иностранные LLM без обезличивания (152-ФЗ). " +
        "См. CLAUDE.md §7.",
    );
    this.name = "MaskerUnconfiguredError";
  }
}

export type Masker = {
  mask(text: string, session?: MaskerSession): Promise<MaskResult>;
  unmask(text: string, session: MaskerSession): Promise<string>;
};

const passthrough: Masker = {
  async mask(text) {
    return { masked: text, session: { sessionId: "passthrough" } };
  },
  async unmask(text) {
    return text;
  },
};

class HttpMasker implements Masker {
  constructor(
    private baseUrl: string,
    private apiKey: string,
  ) {}

  async mask(text: string, session?: MaskerSession): Promise<MaskResult> {
    const res = await fetch(`${this.baseUrl}/mask`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({ text, sessionId: session?.sessionId }),
    });
    if (!res.ok) throw new Error(`Masker mask failed: ${res.status} ${await res.text()}`);
    const data = (await res.json()) as { masked: string; sessionId: string };
    return { masked: data.masked, session: { sessionId: data.sessionId } };
  }

  async unmask(text: string, session: MaskerSession): Promise<string> {
    const res = await fetch(`${this.baseUrl}/unmask`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({ text, sessionId: session.sessionId }),
    });
    if (!res.ok) throw new Error(`Masker unmask failed: ${res.status} ${await res.text()}`);
    const data = (await res.json()) as { text: string };
    return data.text;
  }
}

export function createMasker(
  env: Pick<Env, "NODE_ENV" | "MASKER_BASE_URL" | "MASKER_API_KEY" | "AI_GATEWAY_API_KEY">,
): Masker {
  const url = env.MASKER_BASE_URL?.trim();
  const key = env.MASKER_API_KEY?.trim();

  if (url && key) {
    return new HttpMasker(url, key);
  }

  // Fail-closed ТОЛЬКО при прямом подключении к иностранному LLM (Anthropic
  // direct). При работе через Timeweb AI Gateway (AI_GATEWAY_API_KEY задан)
  // LLM-вызовы идут на российскую инфру api.timeweb.ai → ПДн не покидают РФ,
  // 152-ФЗ покрывается DPA с Timeweb, обезличивание не обязательно. Это то же
  // решение session 14, что вынесло MASKER_* из productionRequired и сузило
  // ZDR-чек в @x10/config env.ts. Без этого условия pipeline-функции падают в
  // проде с MaskerUnconfiguredError, хотя Masker архитектурно не нужен.
  if (env.NODE_ENV === "production" && !env.AI_GATEWAY_API_KEY?.trim()) {
    throw new MaskerUnconfiguredError();
  }

  return passthrough;
}
