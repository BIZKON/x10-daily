import { type PipelineRunStats, fetchPipelineRunStats } from "@/lib/api";
import { AlertTriangle, Ban, CircleCheck, Wallet } from "lucide-react";
import { Suspense } from "react";

export const metadata = { title: "Расходы — X10 Admin" };

/**
 * $-дашборд автономного конвейера (session 20). Читает агрегаты pipeline_runs
 * через /v1/admin/pipeline-runs/stats: расход за день МСК vs потолок, разбивка
 * по агентам, 7-дневный ряд, accept-rate гейта, алерты дня, последние раны.
 *
 * Server-only, без client JS (графики — чистый CSS) → нулевой bundle на маршрут.
 * Cache Components (Next 16): async fetch (+ cookies для auth) внутри <Suspense>.
 */
export default function CostPage() {
  return (
    <Suspense fallback={<CostSkeleton />}>
      <CostContent />
    </Suspense>
  );
}

function CostSkeleton() {
  return (
    <div className="space-y-4">
      <div className="h-10 w-64 animate-pulse rounded-xl bg-card" />
      <div className="h-40 animate-pulse rounded-2xl bg-card" />
      <div className="h-56 animate-pulse rounded-2xl bg-card" />
    </div>
  );
}

async function CostContent() {
  const stats = await fetchPipelineRunStats();

  return (
    <>
      <header className="mb-6 border-b border-fence pb-5">
        <h1 className="m-0 flex items-center gap-2 font-display text-2xl font-extrabold">
          <Wallet size={22} strokeWidth={1.75} /> Расходы конвейера
        </h1>
        <p className="mt-1.5 text-[13px] text-mist">
          $-мониторинг автономного pipeline (session 20). Источник —{" "}
          <code className="font-mono text-gold">pipeline_runs</code>. День считается по МСК (UTC+3),
          как дневной потолок.
        </p>
      </header>

      {!stats ? <ApiUnavailable /> : <Dashboard stats={stats} />}
    </>
  );
}

function ApiUnavailable() {
  return (
    <div className="rounded-2xl border border-red/40 bg-red/5 p-6">
      <h2 className="m-0 font-display text-lg font-extrabold text-red">Данные недоступны</h2>
      <p className="mt-2 text-[14px] text-mist">
        Не задан <code className="font-mono text-paper">X10_API_BASE_URL</code>, api не отвечает,
        или сессия не установлена (войди через <code className="font-mono text-paper">/login</code>{" "}
        — эндпоинт требует роль editor/admin).
      </p>
    </div>
  );
}

function Dashboard({ stats }: { stats: PipelineRunStats }) {
  return (
    <div className="space-y-5">
      <BudgetCard budget={stats.budget} alerts={stats.alertsToday} />
      <div className="grid gap-5 lg:grid-cols-[1.4fr_1fr]">
        <WeekChart
          series={stats.series7d}
          warnUsd={stats.budget.warnUsd}
          capUsd={stats.budget.capUsd}
        />
        <div className="space-y-5">
          <GateCard gate={stats.gateToday} />
          <ByAgentCard byAgent={stats.byAgent} />
        </div>
      </div>
      <RecentRuns recent={stats.recent} />
    </div>
  );
}

function usd(n: number): string {
  return `$${n.toFixed(n !== 0 && Math.abs(n) < 0.1 ? 4 : 2)}`;
}

/** success < warn ≤ gold < cap ≤ red. */
function spendTone(spend: number, warnUsd: number, capUsd: number): "success" | "gold" | "red" {
  if (spend >= capUsd) return "red";
  if (spend >= warnUsd) return "gold";
  return "success";
}

function BudgetCard({
  budget,
  alerts,
}: {
  budget: PipelineRunStats["budget"];
  alerts: PipelineRunStats["alertsToday"];
}) {
  const tone = spendTone(budget.todaySpendUsd, budget.warnUsd, budget.capUsd);
  const fill = {
    success: "bg-success",
    gold: "bg-gold",
    red: "bg-red",
  }[tone];
  const warnPct = budget.capUsd > 0 ? Math.min(100, (budget.warnUsd / budget.capUsd) * 100) : 60;

  return (
    <section className="rounded-2xl border border-fence bg-card p-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-[11px] font-extrabold uppercase tracking-[0.15em] text-haze">
            Расход за сегодня (МСК)
          </div>
          <div className="mt-1 flex items-baseline gap-2">
            <span
              className={`x10-num font-display text-4xl font-extrabold ${
                tone === "red" ? "text-red" : tone === "gold" ? "text-gold" : "text-paper"
              }`}
            >
              {usd(budget.todaySpendUsd)}
            </span>
            <span className="font-mono text-[13px] text-haze">/ {usd(budget.capUsd)} потолок</span>
          </div>
        </div>
        <div className="text-right">
          <div className="font-mono text-[13px] text-mist">{budget.pct}%</div>
          <div className="text-[11px] text-haze">{budget.todayRuns} ранов</div>
        </div>
      </div>

      {/* progress bar с маркером warn */}
      <div className="relative mt-4 h-2.5 overflow-hidden rounded-pill bg-night">
        <div
          className={`h-full rounded-pill ${fill} transition-all`}
          style={{ width: `${Math.max(2, budget.pct)}%` }}
        />
        <div
          className="absolute top-0 h-full w-px bg-paper/50"
          style={{ left: `${warnPct}%` }}
          title={`warn ${usd(budget.warnUsd)}`}
        />
      </div>
      <div className="mt-1.5 flex justify-between font-mono text-[10px] text-haze">
        <span>0</span>
        <span>warn {usd(budget.warnUsd)}</span>
        <span>cap {usd(budget.capUsd)}</span>
      </div>

      {alerts.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-2 border-t border-fence pt-3">
          {alerts.map((a) => (
            <span
              key={a.kind}
              className={`inline-flex items-center gap-1.5 rounded-pill border px-2.5 py-1 text-[11px] font-bold ${
                a.kind === "exhausted"
                  ? "border-red/40 bg-red/[0.08] text-red"
                  : "border-gold/40 bg-gold/[0.08] text-gold"
              }`}
            >
              {a.kind === "exhausted" ? (
                <Ban size={11} strokeWidth={2.5} />
              ) : (
                <AlertTriangle size={11} strokeWidth={2.5} />
              )}
              {a.kind === "exhausted" ? "Бюджет исчерпан" : "Предупреждение"} · {usd(a.spendUsd)}
            </span>
          ))}
        </div>
      )}
    </section>
  );
}

function WeekChart({
  series,
  warnUsd,
  capUsd,
}: {
  series: PipelineRunStats["series7d"];
  warnUsd: number;
  capUsd: number;
}) {
  const max = Math.max(capUsd, ...series.map((s) => s.spendUsd), 0.01);
  return (
    <section className="rounded-2xl border border-fence bg-card p-5">
      <h2 className="m-0 mb-4 font-display text-[15px] font-extrabold">Расход за 7 дней</h2>
      {series.length === 0 ? (
        <p className="py-12 text-center text-[13px] text-haze">Нет данных за период.</p>
      ) : (
        <>
          {/* plot-область: фикс. высота h-40, бары растут от низа (items-end) */}
          <div className="flex h-40 items-end gap-2">
            {series.map((s) => {
              const tone = spendTone(s.spendUsd, warnUsd, capUsd);
              const fill = { success: "bg-success/70", gold: "bg-gold/80", red: "bg-red/80" }[tone];
              const h = Math.max(2, Math.round((s.spendUsd / max) * 100));
              return (
                <div
                  key={s.day}
                  className={`relative flex-1 rounded-t ${fill}`}
                  style={{ height: `${h}%` }}
                  title={`${s.day}: ${usd(s.spendUsd)} · ${s.runs} ранов`}
                >
                  <span className="absolute -top-4 inset-x-0 text-center font-mono text-[10px] text-haze">
                    {usd(s.spendUsd)}
                  </span>
                </div>
              );
            })}
          </div>
          {/* подписи дат — отдельный ряд, выровнен по flex-1 как и бары */}
          <div className="mt-1.5 flex gap-2">
            {series.map((s) => (
              <span key={s.day} className="flex-1 text-center font-mono text-[10px] text-haze">
                {s.day.slice(8)}.{s.day.slice(5, 7)}
              </span>
            ))}
          </div>
        </>
      )}
      <p className="mt-3 border-t border-fence pt-2 font-mono text-[10px] text-haze">
        Шкала до {usd(max)}. Жёлтый — ≥ warn, красный — ≥ потолок.
      </p>
    </section>
  );
}

function GateCard({ gate }: { gate: PipelineRunStats["gateToday"] }) {
  const total = gate.accepted + gate.skipped;
  const rate = total > 0 ? Math.round((gate.accepted / total) * 100) : 0;
  return (
    <section className="rounded-2xl border border-fence bg-card p-5">
      <h2 className="m-0 mb-1 font-display text-[15px] font-extrabold">Гейт за сегодня</h2>
      <p className="m-0 text-[12px] text-haze">IngestAgent (Haiku) — фильтр RSS-айтемов.</p>
      <div className="mt-3 flex items-baseline gap-2">
        <span className="x10-num font-display text-3xl font-extrabold text-paper">{rate}%</span>
        <span className="text-[12px] text-mist">принято</span>
      </div>
      <div className="mt-3 flex gap-4 text-[12px]">
        <span className="inline-flex items-center gap-1.5 text-success">
          <CircleCheck size={13} strokeWidth={2} /> {gate.accepted} принято
        </span>
        <span className="inline-flex items-center gap-1.5 text-haze">
          <Ban size={13} strokeWidth={2} /> {gate.skipped} отклонено
        </span>
      </div>
    </section>
  );
}

const AGENT_LABEL: Record<string, string> = {
  ingest: "Ingest (гейт)",
  draft: "Draft (8 агентов)",
};

function ByAgentCard({ byAgent }: { byAgent: PipelineRunStats["byAgent"] }) {
  const sorted = [...byAgent].sort((a, b) => b.spendUsd - a.spendUsd);
  return (
    <section className="rounded-2xl border border-fence bg-card p-5">
      <h2 className="m-0 mb-3 font-display text-[15px] font-extrabold">По агентам (сегодня)</h2>
      {sorted.length === 0 ? (
        <p className="m-0 text-[13px] text-haze">Сегодня ранов не было.</p>
      ) : (
        <ul className="space-y-2">
          {sorted.map((a) => (
            <li key={a.agent} className="flex items-center justify-between text-[13px]">
              <span className="text-mist">{AGENT_LABEL[a.agent] ?? a.agent}</span>
              <span className="flex items-center gap-3 font-mono text-[12px]">
                <span className="text-haze">{a.runs}×</span>
                <span className="text-paper">{usd(a.spendUsd)}</span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function RecentRuns({ recent }: { recent: PipelineRunStats["recent"] }) {
  return (
    <section className="rounded-2xl border border-fence bg-card p-5">
      <h2 className="m-0 mb-3 font-display text-[15px] font-extrabold">Последние раны</h2>
      {recent.length === 0 ? (
        <p className="m-0 text-[13px] text-haze">
          Ledger пуст — конвейер ещё не записал ни одного рана.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-[12px]">
            <thead>
              <tr className="border-b border-fence text-left text-[10px] uppercase tracking-wider text-haze">
                <th className="py-2 pr-3 font-bold">Агент</th>
                <th className="py-2 pr-3 font-bold">Статус</th>
                <th className="py-2 pr-3 text-right font-bold">$</th>
                <th className="py-2 pr-3 font-bold">Модель</th>
                <th className="py-2 font-bold">Когда</th>
              </tr>
            </thead>
            <tbody>
              {recent.map((r, i) => (
                <tr key={`${r.createdAt}-${i}`} className="border-b border-fence/50">
                  <td className="py-2 pr-3 font-mono text-mist">{r.agent}</td>
                  <td className="py-2 pr-3">
                    <StatusChip status={r.status} />
                  </td>
                  <td className="py-2 pr-3 text-right font-mono text-paper">{usd(r.costUsd)}</td>
                  <td className="py-2 pr-3 font-mono text-[11px] text-haze">
                    {r.modelUsed?.replace("anthropic/", "") ?? "—"}
                  </td>
                  <td className="py-2 font-mono text-[11px] text-haze">
                    {formatDate(r.createdAt)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function StatusChip({ status }: { status: string }) {
  const cls =
    status === "succeeded"
      ? "border-success/40 bg-success/10 text-success"
      : status === "skipped"
        ? "border-fence bg-night text-haze"
        : status === "failed" || status === "halted"
          ? "border-red/40 bg-red/10 text-red"
          : "border-gold/40 bg-gold/10 text-gold";
  return (
    <span className={`rounded-pill border px-2 py-0.5 font-mono text-[10px] ${cls}`}>{status}</span>
  );
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("ru-RU", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Moscow",
  });
}
