import type { StoreData } from "../api";

export const metrics = [
  ["revenue", "Выручка", "₽"], ["receipts", "Чеки", "чеков"], ["units", "Алкогольные единицы", "ед"],
] as const;
export type Metric = typeof metrics[number][0];
type Numeric = string | number | null | undefined;
export function numeric(value: Numeric): number | null {
  if (value == null || String(value).trim() === "") return null;
  const parsed = Number(String(value).replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}
export function percent(actual: Numeric, plan: Numeric): number | null {
  const a = numeric(actual), p = numeric(plan);
  return a == null || p == null || p <= 0 ? null : Math.round(a / p * 1000) / 10;
}
const format = (n: number) => new Intl.NumberFormat("ru-RU", {maximumFractionDigits: 1}).format(n);
export function Progress({actual, plan, compact = false}: {actual: Numeric; plan: Numeric; compact?: boolean}) {
  const p = numeric(plan), result = percent(actual, plan);
  return <span className={"s-progress " + (result != null && result >= 100 ? "complete" : "")}
    title="Показатель с начала смены ÷ дневной план × 100%. Больше 100% означает перевыполнение">
    {p == null ? "Нет плана" : p === 0 ? "План 0 · без %" : result == null ? (compact ? "— %" : "— % плана") : `${format(result)}%${compact ? "" : " плана"}`}
  </span>;
}
export function DailyPlan({store}: {store: StoreData}) {
  return <section className="s-daily-plan" aria-label="Дневные планы">
    <h2>План на день</h2>
    <dl>{metrics.map(([key, label, unit]) => <div key={key}><dt>{label}</dt>
      <dd>{store.plan?.[key] == null ? "Не задан" : `${new Intl.NumberFormat("ru-RU").format(Number(store.plan[key]))} ${unit}`}</dd>
    </div>)}</dl>
    <p>На 13:00, 17:00 и закрытие считаем выполнение одного дневного плана</p>
  </section>;
}
