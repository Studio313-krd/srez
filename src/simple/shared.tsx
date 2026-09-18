import { useEffect, useRef, useState } from "react";
import { Field } from "./help";
import { Progress } from "./progress";
import type { ReactNode } from "react";
import { Check, CircleAlert, Clock3, X } from "lucide-react";
import { api, ApiError } from "../api";
import type { Finding, Report, Revision, StoreData } from "../api";

export const stages = ["13", "17", "close"];
export const stageLabel = (s: string) =>
  s === "close" ? "Закрытие" : s + ":00";
export const money = (n: string | number | null | undefined) =>
  n == null
    ? "—"
    : new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 2 }).format(
        Number(n),
      );
export const active = (f: Finding) =>
  ["open", "requested", "escalated"].includes(f.state);
export const getReport = (s: StoreData, stage: string) =>
  s.reports.find((r) => r.checkpoint === stage);
export const clock = (d: string | null | undefined, zone = "Europe/Moscow") =>
  d
    ? new Date(d).toLocaleTimeString("ru-RU", {
        timeZone: zone,
        hour: "2-digit",
        minute: "2-digit",
      })
    : "—";
export const errorText = (e: unknown) =>
  e instanceof Error ? e.message : "Не удалось сохранить. Попробуйте ещё раз";
export const network = (s: StoreData) =>
  s.network === "MM" ? "Мильстрим" : "Культура крепкого";
export const missing = (r: Report) =>
  !r.current && ["missing", "unfilled"].includes(r.status);
export const statusText = (r?: Report) =>
  !r
    ? "Нет отчёта"
    : !r.current
      ? r.status === "unfilled"
        ? "Нет данных"
        : missing(r)
          ? "Не сдан"
          : "Ждём отчёт"
      : r.findings.some(active)
        ? "Проверить"
        : r.late
          ? "С опозданием"
          : "Сдан";
export function Status({ report }: { report?: Report }) {
  const bad = report && missing(report),
    review = report?.findings.some(active);
  return (
    <span
      className={
        "s-status " +
        (bad ? "bad" : review ? "warn" : report?.current ? "good" : "muted")
      }
    >
      {bad || review ? (
        <CircleAlert size={15} />
      ) : report?.current ? (
        <Check size={15} />
      ) : (
        <Clock3 size={15} />
      )}{" "}
      {statusText(report)}
    </span>
  );
}
export function Notice({
  children,
  error = false,
}: {
  children: ReactNode;
  error?: boolean;
}) {
  return (
    <div
      className={"s-notice " + (error ? "error" : "")}
      role={error ? "alert" : "status"}
    >
      {error ? <CircleAlert size={18} /> : <Check size={18} />}
      <span>{children}</span>
    </div>
  );
}
export function Modal({
  title,
  children,
  onClose,
  wide = false,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    ref.current?.showModal();
    return () => previous?.focus();
  }, []);
  return (
    <dialog
      ref={ref}
      className={"s-modal " + (wide ? "wide" : "")}
      aria-label={title}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
    >
      <header>
        <h2>{title}</h2>
        <button className="s-icon" aria-label="Закрыть окно" onClick={onClose}>
          <X size={22} />
        </button>
      </header>
      {children}
    </dialog>
  );
}
export type Numbers = { revenue: string; receipts: string; units: string };
export const values = (r: Report): Numbers => ({
  revenue: r.current?.revenue ?? "",
  receipts: r.current?.receipts?.toString() ?? "",
  units: r.current?.units?.toString() ?? "",
});
export const employeeName = (s: StoreData, r?: Report) =>
  r?.current?.employee ||
  s.employees.find((e) => e.slot !== "curator")?.employee__name ||
  "";
export const fields = [
  ["revenue", "Выручка, ₽"],
  ["receipts", "Чеки"],
  ["units", "Алкогольные единицы"],
] as const;

export function EntryForm({
  store,
  report,
  onSaved,
  onDirty,
  defaultEmployee,
}: {
  store: StoreData;
  report: Report;
  onSaved: () => Promise<void>;
  onDirty: (v: boolean) => void;
  defaultEmployee?: string;
}) {
  const [draft, setDraft] = useState(values(report)),
    [employee, setEmployee] = useState(report.current?.employee || defaultEmployee || employeeName(store, report));
  const [comment, setComment] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [dirty, setDirty] = useState(false),
    [conflict, setConflict] = useState(false);
  const request = useRef({ signature: "", id: "" });
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  const editable =
    !report.available_at || Date.parse(report.available_at) <= now;
  const change = () => {
    setDirty(true);
    onDirty(true);
  };
  const previous = store.reports
    .filter(
      (r) =>
        stages.indexOf(r.checkpoint) < stages.indexOf(report.checkpoint) &&
        r.current,
    )
    .at(-1);
  const falling =
    previous?.current &&
    ["revenue", "receipts", "units"].some(
      (k) =>
        draft[k as keyof Numbers] !== "" &&
        Number(draft[k as keyof Numbers].replace(",", ".")) <
          Number(previous.current![k as keyof Numbers]),
    );
  async function save(e: React.SubmitEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const payload = { ...draft, employee, comment, version: report.version };
      const signature = JSON.stringify(payload);
      if (request.current.signature !== signature)
        request.current = { signature, id: crypto.randomUUID() };
      await api("reports/" + report.id + "/", {
        ...payload,
        request_id: request.current.id,
      });
      onDirty(false);
      setDirty(false);
      await onSaved();
    } catch (e) {
      setError(errorText(e));
      if (e instanceof ApiError && e.status === 409) setConflict(true);
    } finally {
      setBusy(false);
    }
  }
  return (
    <form className="s-entry" onSubmit={save}>
      <div className="s-entry-heading">
        <div>
          <span className="s-label">
            {report.checkpoint === "close"
              ? "Отчёт на закрытие"
              : "Отчёт на " + stageLabel(report.checkpoint)}
          </span>
          <h2>
            {report.current ? "Показатели сохранены" : "Введите три показателя"}
          </h2>
        </div>
        <Status report={report} />
      </div>
      <p className="s-muted">
        С начала рабочего дня. Если продаж не было, укажите нули
      </p>
      {previous?.current && (
        <div className="s-previous">
          На {stageLabel(previous.checkpoint)} уже было:{" "}
          <b>
            {money(previous.current.revenue)} ₽ · {previous.current.receipts}{" "}
            чеков · {previous.current.units} ед
          </b>
        </div>
      )}
      <fieldset disabled={busy || !editable || conflict}>
        <div className="s-employee-label">
          <Field
            label="Кто сегодня работает"
            hint="Выберите своё ФИО из списка. Если вы на подмене или вас нет в списке, впишите ФИО полностью вручную"
          >
            <input
              list={"employees-" + store.id}
              required
              value={employee}
              onChange={(e) => {
                setEmployee(e.target.value);
                change();
              }}
            />
          </Field>
          <datalist id={"employees-" + store.id}>
            {store.employees.map((p) => (
              <option key={p.slot} value={p.employee__name} />
            ))}
          </datalist>
        </div>
        <div className="s-number-fields">
          {fields.map(([key, label]) => (
            <div className="s-number-field" key={key}>
              <Field
                label={label}
                hint={
                  key === "revenue"
                    ? "Общая выручка в рублях с начала смены, включая ранее сданные отчёты. Копейки можно указать через точку или запятую"
                    : key === "receipts"
                      ? "Общее количество чеков с начала смены. Введите целое число; если покупок не было — 0"
                      : "Общее количество проданных алкогольных единиц с начала смены. Введите целое число, а не сумму в рублях"
                }
              >
                <input
                  name={key}
                  required
                  inputMode={key === "revenue" ? "decimal" : "numeric"}
                  pattern={key === "revenue" ? undefined : "[0-9]+"}
                  placeholder="0"
                  value={draft[key]}
                  onChange={(e) => {
                    setDraft({ ...draft, [key]: e.target.value });
                    change();
                  }}
                />
              </Field>
              <div className="s-input-progress" aria-live="polite">
                <span>План: {money(store.plan?.[key])}{key === "revenue" ? " ₽" : ""}</span>
                <Progress actual={draft[key]} plan={store.plan?.[key]} />
              </div>
              <span>
                {key === "revenue"
                  ? "Рубли с копейками"
                  : key === "receipts"
                    ? "Количество покупок"
                    : "Количество проданных единиц"}
              </span>
            </div>
          ))}
        </div>
        {falling && (
          <Notice error>
            Итог меньше предыдущего отчёта. Проверьте цифры или объясните
            возврат в комментарии
          </Notice>
        )}
        {(report.current || falling || !!error) && (
          <Field
            label={
              report.current
                ? "Почему меняете цифры"
                : "Комментарий к показателям"
            }
            hint="Объясните исправление, возврат или необычные цифры. Пояснение увидит видеоконтроль, оно сохранится в истории отчёта"
          >
            <textarea
              required={!!report.current || !!falling}
              value={comment}
              onChange={(e) => {
                setComment(e.target.value);
                change();
              }}
              placeholder="Например: исправили количество чеков"
              rows={2}
            />
          </Field>
        )}
      </fieldset>
      {error && <Notice error>{error}</Notice>}
      {!editable && (
        <p className="s-previous">
          Ввод откроется в {clock(report.available_at, store.timezone)} по
          времени магазина
        </p>
      )}
      {conflict && (
        <button
          type="button"
          className="s-btn"
          onClick={() => {
            if (
              confirm(
                "Загрузить сохранённые цифры? Текущие правки будут отменены.",
              )
            ) {
              onDirty(false);
              onSaved();
            }
          }}
        >
          Загрузить сохранённую версию
        </button>
      )}
      <div className="s-entry-footer">
        <button
          className="s-btn primary"
          title="Отправить три показателя в офис. Дождитесь подтверждения сохранения"
          disabled={
            busy || !editable || conflict || (!dirty && !!report.current)
          }
        >
          {busy
            ? "Сохраняем…"
            : report.current
              ? "Сохранить изменения"
              : "Сохранить отчёт"}
          <Check size={19} />
        </button>
        <span aria-live="polite">
          {dirty
            ? "Изменения ещё не сохранены"
            : report.current
              ? "Сохранено в " +
                clock(report.current.received_at, store.timezone)
              : "После сохранения отчёт сразу увидит офис"}
        </span>
      </div>
    </form>
  );
}

export function Conversation({
  store,
  stage,
  isSeller,
  onClose,
  onChange,
}: {
  store: StoreData;
  stage: string;
  isSeller: boolean;
  onClose: () => void;
  onChange: () => Promise<void>;
}) {
  const [selected, setSelected] = useState(stage),
    [report, setReport] = useState<Report | null>(null),
    [text, setText] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [history, setHistory] = useState(false);
  const id = getReport(store, selected)?.id;
  async function load() {
    if (id) setReport(await api<Report>("reports/" + id + "/"));
    else setReport(null);
  }
  useEffect(() => {
    setReport(null);
    setText("");
    setError("");
    let live = true;
    if (id)
      api<Report>("reports/" + id + "/")
        .then((r) => {
          if (live) setReport(r);
        })
        .catch((e) => {
          if (live) setError(errorText(e));
        });
    return () => {
      live = false;
    };
  }, [id]);
  const questions =
    report?.findings.filter((f) => f.kind === "manual_question") || [];
  const openQuestion = questions.find(active);
  const automated =
    report?.findings.filter((f) => f.kind !== "manual_question" && active(f)) ||
    [];
  async function send(e: React.SubmitEvent) {
    e.preventDefault();
    if (!id) return;
    setBusy(true);
    setError("");
    try {
      if (isSeller && openQuestion) {
        await api("findings/" + openQuestion.id + "/action/", {
          action: "reply",
          comment: text,
        });
      } else await api("reports/" + id + "/question/", { comment: text });
      setText("");
      await load();
      await onChange();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  async function accept(f: Finding) {
    setBusy(true);
    try {
      await api("findings/" + f.id + "/action/", {
        action: "accepted",
        comment: "Проверено видеоконтролем",
      });
      await load();
      await onChange();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      title="Обсуждение отчёта"
      onClose={onClose}
      wide
    >
      <div className="s-modal-body">
        <p className="s-dialog-store">{store.name}</p>
        <div className="s-time-switch">
          {stages.map((s) => (
            <button
              key={s}
              className={selected === s ? "selected" : ""}
              onClick={() => {
                if (
                  !text ||
                  confirm("Переключить время и удалить неотправленный текст?")
                )
                  setSelected(s);
              }}
            >
              {stageLabel(s)}
            </button>
          ))}
        </div>
        {report ? (
          <>
            <Status report={report} />
            {automated.map((f) => (
              <div className="s-auto-question" key={f.id}>
                <CircleAlert size={19} />
                <p>{f.message}</p>
                {!isSeller && (
                  <button
                    className="s-btn"
                    disabled={busy}
                    onClick={() => accept(f)}
                  >
                    Проверено
                  </button>
                )}
              </div>
            ))}
            <div className="s-conversation">
              {questions.flatMap((f) => f.actions.map((a, i) => ({...a, key:f.id + "-" + i})))
                .sort((a, b) => a.at.localeCompare(b.at)).map(a => (
                  <article
                    className={a.author_role === "store" ? "seller" : "office"}
                    key={a.key}
                  >
                    <small>
                      {a.author_role === "store" ? "Продавец" : "Видеоконтроль"} · {a.author} ·{" "}
                      {clock(a.at, store.timezone)}
                    </small>
                    <p>{a.comment}</p>
                  </article>
                ))}
              {!questions.length && (
                <p className="s-empty">
                  {isSeller
                    ? "Есть вопрос по отчёту? Напишите видеоконтролю — сообщение появится у него в таблице"
                    : "Нужно уточнить цифры? Напишите продавцу. Он увидит вопрос рядом со своим отчётом"}
                </p>
              )}
            </div>
            {(
              <form onSubmit={send}>
                <label>
                  {isSeller ? "Сообщение видеоконтролю" : "Сообщение продавцу"}
                  <textarea
                    required
                    maxLength={2000}
                    rows={3}
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    placeholder={
                      isSeller
                        ? "Задайте вопрос или напишите ответ"
                        : "Например: проверьте количество алкогольных единиц"
                    }
                  />
                </label>
                <div className="s-dialog-actions">
                  <button className="s-btn primary" disabled={busy}>
                    {busy
                      ? "Отправляем…"
                      : "Отправить сообщение"}
                  </button>
                  {!isSeller && openQuestion && (
                    <button
                      type="button"
                      className="s-btn"
                      disabled={busy}
                      onClick={() => accept(openQuestion)}
                    >
                      Вопрос решён
                    </button>
                  )}
                </div>
              </form>
            )}
            <button
              className="s-text-button s-history-button"
              onClick={() => setHistory(!history)}
            >
              {history ? "Скрыть" : "Показать"} историю изменений (
              {report.history?.length || 0})
            </button>
            {history && (
              <ol className="s-history">
                {[...(report.history || [])].reverse().map((r: Revision) => (
                  <li key={r.version}>
                    <b>
                      Версия {r.version} · {money(r.revenue)} ₽ / {r.receipts}{" "}
                      чеков / {r.units} ед
                    </b>
                    <span>
                      Внёс: {r.recorded_by || r.author} · {clock(r.received_at, store.timezone)}
                    </span>
                    {r.employee && <span>Сотрудник смены: {r.employee}</span>}
                    <p>{r.comment || "Первая отправка"}</p>
                  </li>
                ))}
              </ol>
            )}
          </>
        ) : !id ? (
          <p>На эту дату отчёт ещё не создан. Выберите сегодняшний день</p>
        ) : !error ? (
          <p>Загрузка отчёта…</p>
        ) : null}
        {error && <Notice error>{error}</Notice>}
      </div>
    </Modal>
  );
}
