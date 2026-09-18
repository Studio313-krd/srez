import { useEffect, useRef, useState } from "react";
import {
  ArrowDown,
  ArrowDownToLine,
  ArrowUp,
  Check,
  ChevronDown,
  CircleAlert,
  MessageSquare,
  Search,
  X,
} from "lucide-react";
import { Hint } from "./help";
import { api, ApiError, downloadTable } from "../api";
import type { Dashboard, Report, StoreData } from "../api";
import {
  active,
  clock,
  employeeName,
  errorText,
  fields,
  getReport,
  Modal,
  money,
  network,
  Notice,
  stageLabel,
  stages,
  statusText,
  values,
} from "./shared";
import type { Numbers } from "./shared";
import { percent, Progress } from "./progress";
import type { Metric } from "./progress";

type Draft = {
  store: StoreData;
  report: Report;
  values: Numbers;
  employee: string;
  comment: string;
  field: string;
};
const columns = [
  { key: "store", label: "Магазин" },
  ...fields.map(([key, label]) => ({key: "plan." + key, label: label === "Алкогольные единицы" ? "Алкоголь, ед" : label})),
  ...stages.flatMap((stage) =>
    fields.map(([key, label]) => ({
      key: stage + "." + key,
      label: label === "Алкогольные единицы" ? "Алкоголь, ед" : label,
      stage,
    })),
  ),
];
const exportColumns = columns.flatMap(c => "stage" in c
  ? [c, {...c, key:c.key + ".percent", label:c.label + " · выполнение, %"}] : [c]);
const normalize = (v: unknown) =>
  String(v ?? "")
    .toLowerCase()
    .replaceAll("ё", "е")
    .trim();
function raw(s: StoreData, key: string): string | number | null {
  if (key === "store") return s.name + " " + s.code + " " + network(s);
  if (key.startsWith("plan.")) {
    const value = s.plan?.[key.split(".")[1] as Metric];
    return value == null ? null : Number(value);
  }
  const [stage, field, measure] = key.split("."),
    r = getReport(s, stage);
  const n = r?.current?.[field as keyof Numbers];
  if (measure === "percent") return percent(n, s.plan?.[field as Metric]);
  return n == null ? null : Number(n);
}

export default function Office({
  data,
  onRefresh,
  onDirty,
  onTalk,
  onPlan,
  onSaved,
}: {
  data: Dashboard;
  onRefresh: () => Promise<void>;
  onDirty: (b: boolean) => void;
  onTalk: (s: StoreData, stage: string) => void;
  onPlan: (s: StoreData) => void;
  onSaved: (s: string) => void;
}) {
  const [query, setQuery] = useState(""),
    [view, setView] = useState("all"),
    [filters, setFilters] = useState<Record<string, string>>({}),
    [sort, setSort] = useState<{ key: string; direction: 1 | -1 } | null>(null);
  const [filter, setFilter] = useState<string | null>(null),
    [draft, setDraft] = useState<Draft | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [conflict, setConflict] = useState(false),
    [exportOpen, setExportOpen] = useState(false);
  const request = useRef({ signature: "", id: "" });
  const form = useRef<HTMLFormElement>(null);
  const absent = (s: StoreData) =>
    s.reports.some(
      (r) => !r.current && ["missing", "unfilled"].includes(r.status),
    );
  const questions = (s: StoreData) =>
    s.reports.some((r) =>
      r.findings.some((f) => f.kind === "manual_question" && active(f)),
    );
  const missingCount = data.stores.filter(absent).length,
    questionCount = data.stores.filter(questions).length;
  let rows = data.stores.filter(
    (s) =>
      normalize(raw(s, "store")).includes(normalize(query)) &&
      (view === "all" || (view === "missing" ? absent(s) : questions(s))) &&
      Object.entries(filters).every(([k, v]) =>
        normalize(raw(s, k)).includes(normalize(v)),
      ),
  );
  if (sort)
    rows = [...rows].sort((a, b) => {
      const x = raw(a, sort.key),
        y = raw(b, sort.key);
      if (x == null || y == null) return x === y ? 0 : x == null ? 1 : -1;
      return (
        sort.direction *
        (typeof x === "number" && typeof y === "number"
          ? x - y
          : String(x).localeCompare(String(y), "ru"))
      );
    });
  useEffect(() => {
    if (draft)
      form.current
        ?.querySelector<HTMLInputElement>('[name="' + draft.field + '"]')
        ?.focus();
  }, [draft?.report.id, draft?.field]);
  function begin(s: StoreData, r: Report | undefined, field: string) {
    if (!r) {
      setError("На эту дату отчёт ещё не создан. Выберите сегодняшний день");
      return;
    }
    if (draft?.report.id === r.id) return;
    if (
      draft &&
      !confirm("Перейти к другому отчёту? Несохранённые цифры будут отменены.")
    )
      return;
    if (r.available_at && Date.parse(r.available_at) > Date.now()) {
      setError(
        "Ввод этого отчёта откроется в " + clock(r.available_at, s.timezone),
      );
      return;
    }
    setDraft({
      store: s,
      report: r,
      values: values(r),
      employee: employeeName(s, r),
      comment: "",
      field,
    });
    onDirty(true);
    setError("");
    setConflict(false);
  }
  function cancel() {
    setDraft(null);
    setError("");
    setConflict(false);
    onDirty(false);
  }
  async function save(e: React.SubmitEvent) {
    e.preventDefault();
    if (!draft) return;
    setBusy(true);
    setError("");
    try {
      const payload = {
        ...draft.values,
        employee: draft.employee,
        comment: draft.comment,
        version: draft.report.version,
      };
      const signature = JSON.stringify(payload);
      if (request.current.signature !== signature)
        request.current = { signature, id: crypto.randomUUID() };
      await api("reports/" + draft.report.id + "/", {
        ...payload,
        request_id: request.current.id,
      });
      const label =
        draft.store.name + " · " + stageLabel(draft.report.checkpoint);
      cancel();
      await onRefresh();
      onSaved("Сохранено: " + label);
    } catch (e) {
      setError(errorText(e));
      if (e instanceof ApiError && e.status === 409) setConflict(true);
    } finally {
      setBusy(false);
    }
  }
  async function exportData(format: "csv" | "xlsx") {
    setBusy(true);
    setError("");
    try {
      await downloadTable({
        format,
        title: "Отчёты магазинов",
        context: data.date,
        columns: exportColumns.map((c) =>
          "stage" in c
            ? stageLabel(String(c.stage)) + " · " + c.label
            : (c.key.startsWith("plan.") ? "Дневной план · " : "") + c.label,
        ),
        rows: rows.map((s) => exportColumns.map((c) => raw(s, c.key))),
      });
      setExportOpen(false);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <div className="s-title-row">
        <div>
          <h1>
            Отчёты магазинов{" "}
            <Hint
              label="Таблица отчётов"
              text="Одна строка — один магазин. Слева три дневных плана. В каждом времени показаны фактические показатели и их процент от дневного плана. Нажмите цифру для ввода. Стрелки в заголовках и кнопки «% плана» открывают поиск и сортировку"
            />
          </h1>
          <p>
            Весь день в одной таблице. Нажмите на цифру или пустую ячейку, чтобы
            изменить
          </p>
        </div>
        <button
          className="s-btn"
          title="Скачать найденные строки с текущей сортировкой. Формат Excel или CSV выбирается следующим шагом"
          onClick={() => setExportOpen(true)}
        >
          <ArrowDownToLine size={18} />
          Скачать таблицу
        </button>
      </div>
      <div className="s-sheet-toolbar">
        <label className="s-search">
          <Search size={19} />
          <input
            aria-label="Найти магазин"
            placeholder="Найти магазин"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
        <div className="s-view-filters">
          {[
            ["all", "Все магазины", data.stores.length],
            ["missing", "Не сдали", missingCount],
            ["questions", "Есть вопрос", questionCount],
          ].map(([key, label, count]) => (
            <button
              key={key}
              className={view === key ? "selected" : ""}
              aria-pressed={view === key}
              onClick={() => setView(String(key))}
            >
              {label}
              <span>{count}</span>
            </button>
          ))}
        </div>
        <span className="s-table-date">
          {new Date(data.date + "T12:00:00").toLocaleDateString("ru-RU", {
            day: "numeric",
            month: "long",
          })}
        </span>
      </div>
      {missingCount > 0 && (
        <div className="s-missing-note">
          <CircleAlert size={18} />
          <span>
            {missingCount === 1
              ? "У одного магазина нет отчёта"
              : `Нет отчёта у магазинов: ${missingCount}`}
            . Пустые ячейки с просроченным сроком отмечены «Не сдан»
          </span>
          <button
            onClick={() => setView(view === "missing" ? "all" : "missing")}
          >
            {view === "missing" ? "Показать все" : "Показать"}
          </button>
        </div>
      )}
      {Object.values(filters).some(Boolean) || sort ? (
        <div className="s-filter-summary">
          Применены поиск по столбцам или сортировка{" "}
          <button
            className="s-text-button"
            onClick={() => {
              setFilters({});
              setSort(null);
            }}
          >
            Сбросить
          </button>
        </div>
      ) : null}
      <form onSubmit={save} ref={form}>
        <div className="s-sheet-scroll">
          <table className="s-sheet" aria-label="Отчёты за день">
            <colgroup>
              <col style={{ width: 215 }} />
              <col style={{ width: 105 }} />
              <col style={{ width: 85 }} />
              <col style={{ width: 95 }} />
              {stages.flatMap((s) => [
                <col key={s + "a"} style={{ width: 125 }} />,
                <col key={s + "b"} style={{ width: 95 }} />,
                <col key={s + "c"} style={{ width: 105 }} />,
              ])}
              <col style={{ width: 56 }} />
            </colgroup>
            <thead>
              <tr className="s-groups">
                <th>Магазин</th>
                <th colSpan={3}>План на день</th>
                {stages.map((s) => (
                  <th key={s} colSpan={3}>
                    {s === "close" ? "Закрытие · итог дня" : stageLabel(s)}
                    <span>Накопительным итогом</span>
                  </th>
                ))}
                <th>Связь</th>
              </tr>
              <tr>
                {columns.map((c) => (
                  <th key={c.key}>
                    <button
                      type="button"
                      aria-label={
                        "Поиск и сортировка: " +
                        ("stage" in c
                          ? stageLabel(String(c.stage)) + " · "
                          : "") +
                        c.label
                      }
                      onClick={() => setFilter(c.key)}
                      className={
                        filters[c.key] || sort?.key === c.key
                          ? "is-filtered"
                          : ""
                      }
                    >
                      {c.label}
                      {sort?.key === c.key ? (
                        sort.direction === 1 ? (
                          <ArrowUp size={13} />
                        ) : (
                          <ArrowDown size={13} />
                        )
                      ) : (
                        <ChevronDown size={13} />
                      )}
                    </button>
                    {"stage" in c && <button type="button" className="s-percent-filter"
                      aria-label={`Поиск и сортировка: ${stageLabel(String(c.stage))} · ${c.label} · выполнение, %`}
                      onClick={() => setFilter(c.key + ".percent")}>
                      % плана <ChevronDown size={12} />
                    </button>}
                  </th>
                ))}
                <th>
                  <span className="s-sr-only">Обсуждение</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((s) => (
                <tr
                  key={s.id}
                  className={draft?.store.id === s.id ? "editing" : ""}
                >
                  <th scope="row">
                    <span className="s-store-brand">{network(s)}</span>
                    <b>{s.name}</b>
                    <span className="s-store-code">
                      {s.code} ·{" "}
                      {employeeName(s).replace(" (тестовый сотрудник)", "")}
                    </span>
                  </th>
                  {fields.map(([key, label]) => <td className="s-plan-cell" key={key}>
                    <button
                      type="button"
                      title="Изменить дневной план"
                      aria-label={`Изменить план: ${s.code} · ${label}`}
                      onClick={() => onPlan(s)}
                    >
                      {money(s.plan?.[key])}
                    </button>
                  </td>)}
                  {stages.flatMap((stage) => {
                    const r = getReport(s, stage),
                      editing = draft?.report.id === r?.id && !!draft;
                    return fields.map(([key, label], i) => (
                      <td
                        key={stage + key}
                        className={
                          "s-value " +
                          (i === 0 ? "group-start " : "") +
                          (editing
                            ? "active-cell"
                            : !r?.current
                              ? "empty-cell"
                              : "") +
                          (!r?.current && r?.status === "missing"
                            ? " overdue"
                            : "")
                        }
                      >
                        {editing ? (
                          <><input
                            aria-label={
                              s.code + " " + stageLabel(stage) + " " + label
                            }
                            name={key}
                            inputMode={
                              key === "revenue" ? "decimal" : "numeric"
                            }
                            pattern={key === "revenue" ? undefined : "[0-9]+"}
                            required
                            disabled={busy || conflict}
                            value={draft.values[key]}
                            onChange={(e) =>
                              setDraft({
                                ...draft,
                                values: {
                                  ...draft.values,
                                  [key]: e.target.value,
                                },
                              })
                            }
                            onKeyDown={(e) => {
                              if (e.key === "Escape") {
                                e.preventDefault();
                                cancel();
                              }
                            }}
                            onPaste={(e) => {
                              const parts = e.clipboardData
                                .getData("text")
                                .trim()
                                .split("\t");
                              if (key === "revenue" && parts.length === 3) {
                                e.preventDefault();
                                setDraft({
                                  ...draft,
                                  values: {
                                    revenue: parts[0].replaceAll(" ", ""),
                                    receipts: parts[1].trim(),
                                    units: parts[2].trim(),
                                  },
                                });
                              }
                            }}
                          /><Progress actual={draft.values[key]} plan={s.plan?.[key]} compact /></>
                        ) : (
                          <button
                            type="button"
                            aria-label={`Изменить ${label}: ${s.code}, ${stageLabel(stage)}`}
                            onClick={() => begin(s, r, key)}
                          >
                            <span>{money(r?.current?.[key])}</span>
                            <Progress actual={r?.current?.[key]} plan={s.plan?.[key]} compact />
                            {i === 0 && (
                              <small
                                className={r?.status === "missing" ? "bad" : ""}
                              >
                                {statusText(r)}
                              </small>
                            )}
                          </button>
                        )}
                      </td>
                    ));
                  })}
                  <td className="s-chat-cell">
                    <button
                      type="button"
                      aria-label={"Обсудить отчёт " + s.code}
                      title="Задать продавцу вопрос, прочитать ответ и посмотреть историю цифр"
                      className={questions(s) ? "has-question" : ""}
                      onClick={() =>
                        onTalk(
                          s,
                          s.reports.find((r) => r.findings.some(active))
                            ?.checkpoint || "13",
                        )
                      }
                    >
                      <MessageSquare size={20} />
                      {questions(s) && <i />}
                    </button>
                  </td>
                </tr>
              ))}
              {!rows.length && (
                <tr>
                  <td colSpan={14} className="s-no-rows">
                    {data.stores.length
                      ? "Ничего не найдено. Измените поиск или выберите «Все магазины»"
                      : "На эту дату нет отчётов магазинов. Выберите другой день"}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="s-sheet-foot">
          <span>Магазинов: {rows.length}</span>
          <span>
            <i className="s-cell-sample" />
            Пустая ячейка → введите показатели → сохраните отчёт
          </span>
          <span>Под каждым показателем — % дневного плана</span>
        </div>
        {draft && (
          <div className="s-edit-bar">
            <div className="s-edit-title">
              <b>
                {draft.store.name} · {stageLabel(draft.report.checkpoint)}
              </b>
              <span>
                Заполните три выделенные ячейки. Tab — следующая ячейка
              </span>
            </div>
            <div className="s-edit-options">
              <label>
                Сотрудник
                <input
                  required
                  value={draft.employee}
                  disabled={busy}
                  onChange={(e) =>
                    setDraft({ ...draft, employee: e.target.value })
                  }
                />
              </label>
              <label>
                {draft.report.version
                  ? "Причина исправления"
                  : "Комментарий, если нужен"}
                <input
                  required={!!draft.report.version}
                  value={draft.comment}
                  disabled={busy}
                  placeholder={
                    draft.report.version
                      ? "Что изменилось и почему"
                      : "Например: возврат товара"
                  }
                  onChange={(e) =>
                    setDraft({ ...draft, comment: e.target.value })
                  }
                />
              </label>
            </div>
            <div className="s-edit-actions">
              <button
                type="button"
                className="s-btn"
                disabled={busy}
                onClick={cancel}
              >
                Отмена
              </button>
              <button className="s-btn primary" disabled={busy || conflict}>
                {busy ? "Сохраняем…" : "Сохранить отчёт"}
                <Check size={18} />
              </button>
            </div>
            {error && <Notice error>{error}</Notice>}
            {conflict && (
              <button
                type="button"
                className="s-text-button"
                onClick={() => {
                  if (
                    confirm("Отменить правки и загрузить актуальные цифры?")
                  ) {
                    cancel();
                    onRefresh();
                  }
                }}
              >
                Обновить данные
              </button>
            )}
          </div>
        )}
      </form>
      {error && !draft && <Notice error>{error}</Notice>}
      <div className="s-next-tip">
        <MessageSquare size={18} />
        <p>
          <b>Нужны пояснения?</b> Нажмите значок сообщения в строке магазина.
          Ответ продавца появится там же
        </p>
      </div>
      {filter && (
        <Modal
          title={"Столбец: " + exportColumns.find((c) => c.key === filter)!.label}
          onClose={() => setFilter(null)}
        >
          <div className="s-modal-body">
            <label>
              Поиск в этом столбце
              <input
                autoFocus
                value={filters[filter] || ""}
                onChange={(e) =>
                  setFilters({ ...filters, [filter]: e.target.value })
                }
                placeholder="Введите значение"
              />
            </label>
            <div className="s-dialog-actions">
              <button
                className="s-btn"
                onClick={() => {
                  setSort({ key: filter, direction: 1 });
                  setFilter(null);
                }}
              >
                <ArrowUp size={17} />
                По возрастанию
              </button>
              <button
                className="s-btn"
                onClick={() => {
                  setSort({ key: filter, direction: -1 });
                  setFilter(null);
                }}
              >
                <ArrowDown size={17} />
                По убыванию
              </button>
            </div>
            <button className="s-btn primary" onClick={() => setFilter(null)}>
              Применить поиск
            </button>
          </div>
        </Modal>
      )}
      {exportOpen && (
        <Modal title="Скачать таблицу" onClose={() => setExportOpen(false)}>
          <div className="s-modal-body">
            <p>
              Будут сохранены найденные магазины ({rows.length}) с учётом поиска
              и сортировки
            </p>
            <div className="s-dialog-actions">
              <button
                className="s-btn primary"
                disabled={busy}
                onClick={() => exportData("xlsx")}
              >
                Excel (.xlsx)
              </button>
              <button
                className="s-btn"
                disabled={busy}
                onClick={() => exportData("csv")}
              >
                CSV (.csv)
              </button>
            </div>
            {error && <Notice error>{error}</Notice>}
          </div>
        </Modal>
      )}
    </>
  );
}
