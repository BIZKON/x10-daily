// Заземление ops-находок ревью s24 (запуск в контейнере pipeline):
//   1) deepseek-chat (V3.2) + max_tokens=14336 → gateway клампит (200) или энфорсит (400)?
//   2) v4-flash: время до ЗАГОЛОВКОВ vs до ТЕЛА — буферизует ли gateway (грозит ли 60s-таймаут)?
const base = process.env.AI_GATEWAY_BASE_URL || "https://api.timeweb.ai/v1";
const key = process.env.AI_GATEWAY_API_KEY;

async function call(model, maxTokens, userPrompt) {
  const t0 = Date.now();
  const res = await fetch(`${base}/chat/completions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: 'Верни строго JSON-объект {"text": string}. Только JSON.' },
        { role: "user", content: userPrompt },
      ],
    }),
  });
  const tHeaders = Date.now() - t0;
  const bodyText = await res.text();
  const tBody = Date.now() - t0;
  let parsed;
  try {
    parsed = JSON.parse(bodyText);
  } catch {
    parsed = null;
  }
  return { status: res.status, tHeaders, tBody, bodyText, parsed };
}

(async () => {
  console.log("=== ПРОБА 1: deepseek-chat (V3.2) + max_tokens=14336 (>8K кап?) ===");
  try {
    const r1 = await call("deepseek/deepseek-chat", 14336, "Скажи привет одним словом.");
    console.log(`status=${r1.status} tHeaders=${r1.tHeaders}ms tBody=${r1.tBody}ms`);
    if (r1.status !== 200) console.log("BODY:", r1.bodyText.slice(0, 400));
    else
      console.log(
        `finish=${r1.parsed?.choices?.[0]?.finish_reason} completion_tokens=${r1.parsed?.usage?.completion_tokens}`,
      );
  } catch (e) {
    console.log("ERR:", e.message);
  }

  console.log("\n=== ПРОБА 2: v4-flash буферизация (tHeaders vs tBody) ===");
  try {
    const r2 = await call(
      "deepseek/deepseek-v4-flash",
      4096,
      "Перечисли 10 трендов российского бизнеса 2026 года, по 2-3 предложения каждый, внутри JSON поля text.",
    );
    console.log(
      `status=${r2.status} tHeaders=${r2.tHeaders}ms tBody=${r2.tBody}ms (разница тело-заголовки=${r2.tBody - r2.tHeaders}ms)`,
    );
    console.log(
      `finish=${r2.parsed?.choices?.[0]?.finish_reason} completion_tokens=${r2.parsed?.usage?.completion_tokens}`,
    );
    console.log(
      r2.tHeaders > 30000
        ? "→ ВЫВОД: заголовки приходят ПОЗДНО → gateway БУФЕРИЗУЕТ → 60s-таймаут реально рубит длинные вызовы (finding #2)."
        : "→ ВЫВОД: заголовки рано, тело тянется дольше → 60s покрывает только заголовки (finding #7); но всё равно хрупко.",
    );
  } catch (e) {
    console.log("ERR:", e.message);
  }
})();
