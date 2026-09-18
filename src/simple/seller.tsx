import { useEffect, useState } from "react";
import { Check, MessageSquare, PencilLine } from "lucide-react";
import { Hint } from "./help";
import { DailyPlan, metrics, Progress } from "./progress";
import type { Dashboard, StoreData } from "../api";
import {
  active,
  EntryForm,
  getReport,
  money,
  network,
  stageLabel,
  stages,
  Status,
} from "./shared";

export default function Seller({
  data,
  dirty,
  onDirty,
  onRefresh,
  onTalk,
  onSaved,
  employeeName,
}: {
  data: Dashboard;
  dirty: boolean;
  onDirty: (v: boolean) => void;
  onRefresh: () => Promise<void>;
  onTalk: (s: StoreData, stage: string) => void;
  onSaved: (s: string) => void;
  employeeName?: string;
}) {
  const [storeId, setStoreId] = useState(
    () => data.stores.find((s) => s.network === "MM")?.id || data.stores[0]?.id,
  );
  const store = data.stores.find((s) => s.id === storeId) || data.stores[0];
  const [stage, setStage] = useState(
    () => store?.reports.find((r) => !r.current)?.checkpoint || "13",
  );
  useEffect(() => {
    if (store && !data.stores.some((s) => s.id === storeId))
      setStoreId(store.id);
  }, [storeId, data.stores]);
  const report = store && getReport(store, stage);
  function change(fn: () => void) {
    if (dirty && !confirm("Перейти и отменить несохранённые цифры?")) return;
    onDirty(false);
    fn();
  }
  if (!store)
    return (
      <div className="s-empty">
        На эту дату нет доступных магазинов. Выберите другую дату
      </div>
    );
  const questions = store.reports.filter((r) =>
    r.findings.some((f) => f.kind === "manual_question" && active(f) && f.actions.at(-1)?.author_role !== "store"),
  );
  return (
    <div className="s-seller">
      <div className="s-title-row">
        <div>
          <span className="s-store-brand">{network(store)}</span>
          <h1>
            Мой отчёт{" "}
            <Hint
              label="Мой отчёт"
              text="Проверьте магазин, дату и время. Введите выручку, чеки и алкогольные единицы накопительным итогом, затем нажмите «Сохранить отчёт»"
            />
          </h1>
          <p>{store.name}</p>
        </div>
        {data.stores.length > 1 && (
          <label className="s-store-select">
            Магазин
            <select
              value={store.id}
              onChange={(e) =>
                change(() => {
                  setStoreId(Number(e.target.value));
                  setStage(
                    data.stores
                      .find((s) => s.id === Number(e.target.value))
                      ?.reports.find((r) => !r.current)?.checkpoint || "13",
                  );
                })
              }
            >
              {data.stores.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.code} · {s.city}, {s.name}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
      {!!questions.length && (
        <button
          className="s-question-callout"
          onClick={() => onTalk(store, questions[0].checkpoint)}
        >
          <MessageSquare size={22} />
          <span>
            <b>Сообщение от видеоконтроля</b>
            <span>
              К отчёту за {stageLabel(questions[0].checkpoint)} · нажмите, чтобы
              ответить
            </span>
          </span>
          <span>Ответить →</span>
        </button>
      )}
      <div className="s-day-steps" aria-label="Время отчёта">
        {stages.map((s) => {
          const r = getReport(store, s);
          return (
            <button
              key={s}
              title={
                "Открыть отчёт на " +
                stageLabel(s) +
                ". Вводите итог с начала смены"
              }
              className={s === stage ? "selected" : ""}
              aria-pressed={s === stage}
              onClick={() => {
                if (s !== stage) change(() => setStage(s));
              }}
            >
              <span className="s-step-icon">
                {r?.current ? <Check size={19} /> : <PencilLine size={18} />}
              </span>
              <span>
                <b>{stageLabel(s)}</b>
                <small>
                  {r?.current
                    ? "Сохранён"
                    : s === stage
                      ? "Заполняете сейчас"
                      : "Ещё не заполнен"}
                </small>
              </span>
            </button>
          );
        })}
      </div>
      <DailyPlan store={store} />
      <button className="s-text-button s-seller-question" onClick={() => onTalk(store, stage)}>
        <MessageSquare size={17} />
        Задать вопрос видеоконтролю / история отчёта
      </button>
      {report ? (
        <EntryForm
          key={report.id + ":" + report.version}
          store={store}
          report={report}
          defaultEmployee={employeeName}
          onDirty={onDirty}
          onSaved={async () => {
            await onRefresh();
            onSaved(
              "Отчёт за " +
                stageLabel(stage) +
                " сохранён — видеоконтроль видит ваши цифры",
            );
          }}
        />
      ) : (
        <p className="s-empty">
          На эту дату отчёт ещё не создан. Выберите сегодняшний день или
          сообщите видеоконтролю
        </p>
      )}
      <section className="s-my-day">
        <header>
          <h2>Отчёты за день</h2>
          <span>Сохранённые показатели и выполнение дневного плана</span>
        </header>
        <div className="s-day-reports">
          {stages.map((s) => {
            const r = getReport(store, s);
            return (
              <button
                key={s}
                className="s-day-report"
                onClick={() => {
                  if (s !== stage) change(() => setStage(s));
                }}
              >
                <span>{stageLabel(s)}</span>
                {metrics.map(([key, label, unit]) => <span className="s-day-metric" key={key}>
                  <span>{label}</span><b>{money(r?.current?.[key])} {unit}</b>
                  <Progress actual={r?.current?.[key]} plan={store.plan?.[key]} />
                </span>)}
                <Status report={r} />
              </button>
            );
          })}
        </div>
      </section>
      <p className="s-seller-help">
        Каждый раз вводите итог с начала смены. Например: 5 000 ₽ утром + 7 000
        ₽ позже = 12 000 ₽ в отчёте на 17:00
      </p>
    </div>
  );
}
