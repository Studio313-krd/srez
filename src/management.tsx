import {
  Children,
  cloneElement,
  isValidElement,
  useEffect,
  useRef,
  useState,
} from "react";
import type React from "react";
import {
  ArrowUpRight,
  Check,
  FileSpreadsheet,
  Pencil,
  Plus,
  Search,
  X,
} from "lucide-react";
import { api } from "./api";
import "./management.css";
import DataTable from "./data-table";

type Profile = {
  legal_entity?: string;
  region?: string;
  vacancies?: number;
  staffing?: string;
  shift_rate?: string;
  [key: string]: unknown;
};
type Shop = {
  id: number;
  code: string;
  name: string;
  city: string;
  network: string;
  timezone: string;
  opens_at: string;
  closes_at: string;
  weekdays: number[];
  active_from: string;
  active_until: string | null;
  monitoring_enabled: boolean;
  profile: Profile;
  staff: { id: number; name: string; slot: string }[];
};
type Person = {
  id: number;
  name: string;
  position: string;
  active: boolean;
  notes: string;
  stores: { code: string; name: string; slot: string }[];
  sources: string[];
};
type Legal = { id: number; name: string; data: Record<string, unknown> };
type Source = {
  id: number;
  title: string;
  url: string;
  imported_at: string;
  stats: Record<string, number>;
  sheets: { id: number; title: string }[];
};
type Issue = {
  id: number;
  kind: string;
  message: string;
  details: Record<string, unknown>;
  resolved: boolean;
  resolution: string;
  store__code: string | null;
};
type Overview = {
  notifications: {channel: string; enabled: boolean; token_set: boolean; chat_set: boolean; public_url_ready: boolean; ready: boolean; pending: number; last_sent_at: string | null; last_error: string}[];
  stores: Shop[];
  employees: Person[];
  legal_entities: Legal[];
  sources: Source[];
  issues: Issue[];
  users: { id: number; name: string; username: string; role: string; stores: string[] }[];
  events: {
    id: number;
    author: string;
    action: string;
    entity: string;
    at: string;
  }[];
};
type Plan = {
  id: number;
  store_id: number;
  revenue: string;
  receipts: number | null;
  units: number | null;
  units_per_receipt: string | null;
  origin: string;
  reason: string;
  created_at: string;
};
type Exception = {
  id: number;
  store_id: number;
  store__code: string;
  date: string;
  closed: boolean;
  opens_at: string | null;
  closes_at: string | null;
  reason: string;
};
type Editor =
  | { kind: "store"; item?: Shop }
  | { kind: "employee"; item?: Person }
  | { kind: "legal"; item?: Legal }
  | { kind: "plan"; shop: Shop; item?: Plan }
  | { kind: "schedule" }
  | { kind: "issue"; item: Issue }
  | { kind: "password" };
const tabs = [
  ["stores", "Магазины"],
  ["employees", "Сотрудники"],
  ["plans", "Планы"],
  ["schedule", "Графики"],
  ["legal", "Юрлица"],
  ["sources", "Источники"],
  ["issues", "Сверка данных"],
  ["notifications", "Уведомления"],
  ["access", "Доступ и история"],
] as const;
const networks: Record<string, string> = {
  MM: "Мильстрим",
  KK: "Культура крепкого",
};
const slots: Record<string, string> = {
  curator: "Куратор",
  seller1: "Продавец 1",
  seller2: "Продавец 2",
};
const issueNames: Record<string, string> = {
  address_mapping: "Адреса",
  hr_conflict: "Кадровый реестр",
  header_date: "Дата в заголовке",
  invalid_value: "Значение ячейки",
  header_missing: "Заголовок",
  missing_source: "Нет в отчётах",
  source_summary: "Итоги реестра",
  future_values: "Будущие даты",
  manual_conflict: "Ручное исправление",
};
const amount = (n: unknown) =>
  n == null || n === ""
    ? "—"
    : Number(n).toLocaleString("ru-RU", { maximumFractionDigits: 2 });
const stamp = (s: string) =>
  new Date(s).toLocaleString("ru-RU", {
    timeZone: "Europe/Moscow",
    dateStyle: "short",
    timeStyle: "short",
  });
const display = (v: unknown): string =>
  v == null
    ? "—"
    : typeof v === "object"
      ? Array.isArray(v)
        ? v.map(display).join(" · ")
        : Object.entries(v)
            .map(([k, x]) => `${k}: ${display(x)}`)
            .join(" · ")
      : String(v);
const err = (e: unknown) =>
  e instanceof Error ? e.message : "Не удалось сохранить изменения";
function Field({
  label,
  children,
  wide = false,
}: {
  label: string;
  children: React.ReactNode;
  wide?: boolean;
}) {
  return (
    <label className={wide ? "m-wide" : ""}>
      <span>{label}</span>
      {Children.map(children, (child) =>
        isValidElement(child) &&
        ["input", "select", "textarea"].includes(String(child.type))
          ? cloneElement(
              child as React.ReactElement<{ "aria-label"?: string }>,
              { "aria-label": label },
            )
          : child,
      )}
    </label>
  );
}
function Empty({ children }: { children: React.ReactNode }) {
  return <div className="m-empty">{children}</div>;
}
function EditButton({
  onClick,
  label,
}: {
  onClick: () => void;
  label: string;
}) {
  return (
    <button className="m-edit" aria-label={label} onClick={onClick}>
      <Pencil size={16} />
    </button>
  );
}

export default function Management({
  date,
  refresh,
}: {
  date: string;
  refresh: number;
}) {
  const [tab, setTab] = useState(
    new URLSearchParams(location.search).get("tab") || "stores",
  );
  const [data, setData] = useState<Overview | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [revision, setRevision] = useState(0);
  const [search, setSearch] = useState("");
  const [network, setNetwork] = useState("");
  const [editor, setEditor] = useState<Editor | null>(null);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [exceptions, setExceptions] = useState<Exception[]>([]);
  const [loadedDate, setLoadedDate] = useState("");
  const [showResolved, setShowResolved] = useState(false);
  const [issueKind, setIssueKind] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    setError("");
    api<Overview>("manage/", undefined, controller.signal)
      .then(setData)
      .catch((e) => {
        if (!controller.signal.aborted) setError(err(e));
      });
    return () => controller.abort();
  }, [revision, refresh]);
  useEffect(() => {
    if (!date || !["plans", "schedule"].includes(tab)) return;
    const controller = new AbortController();
    if (tab === "plans") {
      setLoadedDate("");
      api<{ plans: Plan[] }>(
        "manage/plans/?date=" + date,
        undefined,
        controller.signal,
      )
        .then((r) => {
          setPlans(r.plans);
          setLoadedDate(date);
        })
        .catch((e) => {
          if (!controller.signal.aborted) setError(err(e));
        });
    } else
      api<{ exceptions: Exception[] }>(
        "manage/schedule/",
        undefined,
        controller.signal,
      )
        .then((r) => setExceptions(r.exceptions))
        .catch((e) => {
          if (!controller.signal.aborted) setError(err(e));
        });
    return () => controller.abort();
  }, [tab, date, revision, refresh]);
  function changeTab(value: string) {
    setTab(value);
    setSearch("");
    setNetwork("");
    setNotice("");
    const url = new URL(location.href);
    url.searchParams.set("tab", value);
    history.replaceState({}, "", url);
  }
  const query = search.trim().toLocaleLowerCase("ru");
  const shops =
    data?.stores.filter(
      (s) =>
        (!network || s.network === network) &&
        [
          s.code,
          s.name,
          s.city,
          s.profile.region,
          s.profile.legal_entity,
          ...s.staff.map((p) => p.name),
        ]
          .join(" ")
          .toLocaleLowerCase("ru")
          .includes(query),
    ) || [];
  const unresolved = data?.issues.filter((i) => !i.resolved).length || 0;
  const latest = new Map<number, Plan>();
  plans.forEach((p) => {
    if (!latest.has(p.store_id)) latest.set(p.store_id, p);
  });
  return (
    <section className="m-page" aria-label="Управление сетью">
      {error && (
        <div className="w-notice w-error" role="alert">
          {error}
        </div>
      )}
      {notice && (
        <div className="m-success" role="status">
          <Check size={18} />
          {notice}
        </div>
      )}
      <nav className="m-tabs" aria-label="Разделы управления">
        {tabs.map(([key, label]) => (
          <button
            key={key}
            className={tab === key ? "is-active" : ""}
            aria-current={tab === key ? "page" : undefined}
            onClick={() => changeTab(key)}
          >
            {label}
            {key === "issues" && unresolved > 0 && <span>{unresolved}</span>}
          </button>
        ))}
      </nav>
      {!data ? (
        <Empty>Загружаем справочники…</Empty>
      ) : (
        <>
          {["stores", "employees", "plans"].includes(tab) && (
            <div className="m-toolbar">
              <label className="m-search">
                <Search size={18} />
                <input
                  aria-label="Поиск в справочнике"
                  placeholder={
                    tab === "employees"
                      ? "ФИО или магазин"
                      : "Адрес, город, код или сотрудник"
                  }
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </label>
              {tab !== "employees" && (
                <select
                  aria-label="Торговая сеть"
                  value={network}
                  onChange={(e) => setNetwork(e.target.value)}
                >
                  <option value="">Обе сети</option>
                  {Object.entries(networks).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </select>
              )}
              {tab !== "plans" && (
                <button
                  className="primary-button"
                  onClick={() =>
                    setEditor({ kind: tab === "stores" ? "store" : "employee" })
                  }
                >
                  <Plus size={17} />
                  {tab === "stores"
                    ? "Добавить магазин"
                    : "Добавить сотрудника"}
                </button>
              )}
            </div>
          )}
          {tab === "stores" && (
            <>
              <div className="m-section-heading">
                <div>
                  <h2>
                    Магазины сети <span>{data.stores.length}</span>
                  </h2>
                  <p>
                    {data.stores.filter((s) => s.network === "MM").length}{" "}
                    Мильстрим ·{" "}
                    {data.stores.filter((s) => s.network === "KK").length}{" "}
                    Культура крепкого · кадровый состав по основному реестру
                  </p>
                </div>
                <small>Показано {shops.length}</small>
              </div>
              <div className="m-table-wrap">
                <DataTable label="Магазины" context={date} className="m-table m-shops">
                  <thead>
                    <tr>
                      <th>Магазин</th>
                      <th>Сотрудники</th>
                      <th>Юрлицо / куратор</th>
                      <th>Ставка / вакансии</th>
                      <th>Контроль сроков</th>
                      <th>
                        <span className="sr-only">Действия</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {shops.map((s) => (
                      <tr key={s.id}>
                        <td>
                          <span className="m-code">
                            {s.code} · {networks[s.network]}
                          </span>
                          <strong>{s.city}</strong>
                          <span>{s.name}</span>
                        </td>
                        <td>
                          {["seller1", "seller2"].map((slot) => (
                            <div className="m-staff-line" key={slot}>
                              <small>{slots[slot]}</small>
                              <span>
                                {s.staff.find((p) => p.slot === slot)?.name ||
                                  "Вакансия / не указан"}
                              </span>
                            </div>
                          ))}
                        </td>
                        <td>
                          <span>{s.profile.legal_entity || "—"}</span>
                          <small>
                            {s.staff.find((p) => p.slot === "curator")?.name ||
                              "Куратор не указан"}
                          </small>
                        </td>
                        <td>
                          <strong>{amount(s.profile.shift_rate)} ₽</strong>
                          <small>Вакансий: {s.profile.vacancies ?? "—"}</small>
                        </td>
                        <td>
                          <span
                            className={
                              "m-badge " +
                              (s.monitoring_enabled ? "is-good" : "")
                            }
                          >
                            {s.monitoring_enabled
                              ? `${s.opens_at}–${s.closes_at}`
                              : "График не подтверждён"}
                          </span>
                        </td>
                        <td>
                          <EditButton
                            label={"Изменить магазин " + s.code}
                            onClick={() =>
                              setEditor({ kind: "store", item: s })
                            }
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </DataTable>
                {!shops.length && <Empty>Магазины не найдены</Empty>}
              </div>
              <p className="m-footnote">
                В источниках нет часов работы. Откройте карточку магазина,
                проверьте график и включите контроль сроков. Отслеживание
                начнётся со следующего рабочего дня по часовому поясу магазина.
              </p>
            </>
          )}
          {tab === "employees" && (
            <>
              <div className="m-section-heading">
                <div>
                  <h2>
                    Сотрудники <span>{data.employees.length}</span>
                  </h2>
                  <p>
                    Сотрудники уже перенесены из реестра. Сначала найдите ФИО через поиск, чтобы не добавлять его повторно.
                  </p>
                </div>
              </div>
              <div className="w-help m-staff-help">
                <p><b>Новый сотрудник:</b> «Добавить сотрудника» → ФИО → «Сохранить». Затем в «Магазинах» откройте нужный магазин и назначьте его в «Продавец 1» или «Продавец 2».</p>
                <p><b>Перевод или увольнение:</b> измените назначение в карточках магазинов. Для уволенного откройте запись сотрудника и снимите «Доступен для назначения в магазин». История отчётов сохранится.</p>
                <p><b>Подмена:</b> продавец может вписать ФИО в отчёте. Кадровая запись и логин — разные вещи: сама запись доступ в сервис не выдаёт. Доступ к магазину выдаётся отдельно при запуске.</p>
              </div>
              <div className="m-table-wrap">
                <DataTable label="Сотрудники" context={date} className="m-table">
                  <thead>
                    <tr>
                      <th>ФИО</th>
                      <th>Должность</th>
                      <th>Назначение по реестру</th>
                      <th>Статус</th>
                      <th>
                        <span className="sr-only">Действия</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.employees
                      .filter((p) =>
                        [p.name, ...p.stores.map((s) => s.code + " " + s.name)]
                          .join(" ")
                          .toLocaleLowerCase("ru")
                          .includes(query),
                      )
                      .map((p) => (
                        <tr key={p.id}>
                          <td>
                            <strong>{p.name}</strong>
                            {p.notes && <small>{p.notes}</small>}
                          </td>
                          <td>{p.position}</td>
                          <td>
                            {p.stores.length ? (
                              p.stores.map((s) => (
                                <small key={s.code + s.slot}>
                                  {s.code} · {slots[s.slot]}
                                </small>
                              ))
                            ) : (
                              <small>Нет текущего назначения</small>
                            )}
                          </td>
                          <td>
                            <span className="m-badge">
                              {p.active ? "В справочнике" : "Неактивен"}
                            </span>
                          </td>
                          <td>
                            <EditButton
                              label={"Изменить сотрудника " + p.name}
                              onClick={() =>
                                setEditor({ kind: "employee", item: p })
                              }
                            />
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </DataTable>
              </div>
            </>
          )}
          {tab === "plans" && (
            <>
              <div className="m-section-heading">
                <div>
                  <h2>Дневные планы</h2>
                  <p>
                    На {date.split("-").reverse().join(".")} · план есть у{" "}
                    {latest.size} из {data.stores.length} магазинов · изменения
                    сохраняются отдельными версиями
                  </p>
                </div>
              </div>
              {loadedDate !== date ? (
                <Empty>Загружаем планы…</Empty>
              ) : (
                <div className="m-table-wrap">
                  <DataTable label="Дневные планы" context={date} className="m-table">
                    <thead>
                      <tr>
                        <th>Магазин</th>
                        <th className="m-number">Выручка, ₽</th>
                        <th className="m-number">Чеки</th>
                        <th className="m-number">Алк ед</th>
                        <th className="m-number">Ед/чек</th>
                        <th>Основание</th>
                        <th>
                          <span className="sr-only">Действия</span>
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {shops.map((s) => {
                        const p = latest.get(s.id);
                        return (
                          <tr key={s.id}>
                            <td>
                              <span className="m-code">{s.code}</span>
                              <strong>{s.city}</strong>
                              <small>{s.name}</small>
                            </td>
                            <td className="m-number" data-export={p?.revenue == null ? null : Number(p.revenue)}>{amount(p?.revenue)}</td>
                            <td className="m-number" data-export={p?.receipts ?? null}>{amount(p?.receipts)}</td>
                            <td className="m-number" data-export={p?.units ?? null}>{amount(p?.units)}</td>
                            <td className="m-number" data-export={p?.units_per_receipt == null ? null : Number(p.units_per_receipt)}>
                              {amount(p?.units_per_receipt)}
                            </td>
                            <td>
                              {p ? (
                                <>
                                  <span className="m-badge">
                                    {p.origin === "sheets"
                                      ? "Из таблицы"
                                      : "Администратор"}
                                  </span>
                                  <small>{p.reason}</small>
                                  {plans.filter((x) => x.store_id === s.id)
                                    .length > 1 && (
                                    <details>
                                      <summary>Предыдущие версии</summary>
                                      {plans
                                        .filter(
                                          (x) =>
                                            x.store_id === s.id &&
                                            x.id !== p.id,
                                        )
                                        .map((x) => (
                                          <p key={x.id}>
                                            {amount(x.revenue)} ₽ · {x.reason} ·{" "}
                                            {stamp(x.created_at)}
                                          </p>
                                        ))}
                                    </details>
                                  )}
                                </>
                              ) : (
                                <small>Не задан</small>
                              )}
                            </td>
                            <td>
                              <EditButton
                                label={"Изменить план " + s.code}
                                onClick={() =>
                                  setEditor({ kind: "plan", shop: s, item: p })
                                }
                              />
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </DataTable>
                </div>
              )}
            </>
          )}
          {tab === "schedule" && (
            <>
              <div className="m-section-heading">
                <div>
                  <h2>Графики и особые дни</h2>
                  <p>
                    Обычные часы и дни недели задаются в карточке магазина ·
                    здесь можно назначить выходной или другое время работы
                  </p>
                </div>
                <button
                  className="primary-button"
                  onClick={() => setEditor({ kind: "schedule" })}
                >
                  <Plus size={17} />
                  Особый день
                </button>
              </div>
              <div className="m-schedule-summary">
                <strong>
                  {data.stores.filter((s) => s.monitoring_enabled).length} из{" "}
                  {data.stores.length}
                </strong>
                <span>магазинов с подтверждённым графиком</span>
                <button
                  className="secondary-button"
                  onClick={() => changeTab("stores")}
                >
                  Настроить графики
                </button>
              </div>
              {exceptions.length ? (
                <div className="m-table-wrap">
                  <DataTable label="Особые дни" context={date} className="m-table">
                    <thead>
                      <tr>
                        <th>Дата</th>
                        <th>Магазин</th>
                        <th>Режим</th>
                        <th>Причина</th>
                      </tr>
                    </thead>
                    <tbody>
                      {exceptions.map((x) => (
                        <tr key={x.id}>
                          <td>{x.date}</td>
                          <td>{x.store__code}</td>
                          <td>
                            {x.closed
                              ? "Выходной"
                              : `${x.opens_at || "По графику"} — ${x.closes_at || "По графику"}`}
                          </td>
                          <td>{x.reason}</td>
                        </tr>
                      ))}
                    </tbody>
                  </DataTable>
                </div>
              ) : (
                <Empty>Особые дни пока не назначены</Empty>
              )}
            </>
          )}
          {tab === "legal" && (
            <>
              <div className="m-section-heading">
                <div>
                  <h2>
                    Юридические лица <span>{data.legal_entities.length}</span>
                  </h2>
                  <p>Реквизиты из кадрового реестра</p>
                </div>
                <button
                  className="primary-button"
                  onClick={() => setEditor({ kind: "legal" })}
                >
                  <Plus size={17} />
                  Добавить юрлицо
                </button>
              </div>
              <div className="m-legal-list">
                {data.legal_entities.map((l) => (
                  <article key={l.id}>
                    <div>
                      <h3>{l.name}</h3>
                      <p>
                        {
                          data.stores.filter(
                            (s) => s.profile.legal_entity === l.name,
                          ).length
                        }{" "}
                        магазинов
                      </p>
                    </div>
                    <button
                      className="secondary-button"
                      onClick={() => setEditor({ kind: "legal", item: l })}
                    >
                      Реквизиты <ArrowUpRight size={16} />
                    </button>
                  </article>
                ))}
              </div>
            </>
          )}
          {tab === "sources" && <Sources sources={data.sources} />}
          {tab === "issues" && (
            <>
              <div className="m-section-heading">
                <div>
                  <h2>
                    Сверка данных <span>{unresolved}</span>
                  </h2>
                  <p>
                    Расхождения сохранены вместе с исходными значениями ·
                    основной кадровый реестр принят за основу карточек магазинов
                  </p>
                </div>
              </div>
              <div className="m-toolbar">
                <select
                  aria-label="Вид расхождения"
                  value={issueKind}
                  onChange={(e) => setIssueKind(e.target.value)}
                >
                  <option value="">Все расхождения</option>
                  {Object.entries(issueNames).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </select>
                <label className="m-check">
                  <input
                    type="checkbox"
                    checked={showResolved}
                    onChange={(e) => setShowResolved(e.target.checked)}
                  />
                  Показывать проверенные
                </label>
              </div>
              <div className="m-issues">
                {data.issues
                  .filter(
                    (i) =>
                      (!i.resolved || showResolved) &&
                      (!issueKind || i.kind === issueKind),
                  )
                  .map((i) => (
                    <article key={i.id}>
                      <div className="m-issue-meta">
                        <span className="m-badge">
                          {issueNames[i.kind] || "Сверка"}
                        </span>
                        <span className="m-code">
                          {i.store__code || "Вся сеть"}
                        </span>
                        {i.resolved && (
                          <span className="m-badge is-good">Проверено</span>
                        )}
                      </div>
                      <h3>{i.message}</h3>
                      <IssueDetails details={i.details} />
                      {i.resolution && (
                        <p className="m-resolution">{i.resolution}</p>
                      )}
                      {!i.resolved && (
                        <button
                          className="secondary-button"
                          onClick={() => setEditor({ kind: "issue", item: i })}
                        >
                          Зафиксировать результат
                        </button>
                      )}
                    </article>
                  ))}
              </div>
            </>
          )}
          {tab === "notifications" && <>
            <div className="m-section-heading"><div><h2>Уведомления в Telegram и MAX</h2><p>Боты отправляют в офисный чат новые замечания и ответы магазинов. В сообщении есть ссылка на нужный день и время отчёта.</p></div></div>
            <div className="m-notification-grid">
              {data.notifications.map((n) => <article className="w-help" key={n.channel}>
                <h3>{n.channel === "telegram" ? "Telegram" : "MAX"}</h3>
                <p><b>{n.ready ? "Отправка включена" : n.enabled ? "Нужна настройка" : "Отправка выключена"}</b></p>
                <p>Бот: {n.token_set ? "токен задан" : "токен не задан"}<br/>Чат офиса: {n.chat_set ? "задан" : "не задан"}<br/>Ссылка на сервис: {n.public_url_ready ? "настроена" : "нужен внешний адрес HTTPS"}</p>
                <p>В очереди: {n.pending}<br/>Последняя отправка: {n.last_sent_at ? stamp(n.last_sent_at) : "ещё не было"}</p>
                {n.last_error && <p role="alert">Последняя попытка не удалась ({n.last_error}). Повтор выполняется автоматически; если ошибка сохраняется, передайте её специалисту по запуску.</p>}
              </article>)}
            </div>
            <div className="w-help"><h3>Какие уведомления придут</h3><p>Магазин не сдал отчёт к подтверждённому сроку; показатели требуют проверки; первый отчёт пришёл поздно; магазин ответил на вопрос офиса.</p><p>Пустые исторические строки без известного срока видны в «Требуют внимания». Они не рассылаются как новые опоздания. Telegram и MAX работают независимо: ошибка одного канала не останавливает другой.</p><p>Для подключения специалист указывает токен бота, ID офисного чата и внешний адрес сервиса в настройках сервера. Для продавцов ничего устанавливать в сервисе не нужно.</p></div>
          </>}
          {tab === "access" && (
            <>
              <div className="m-section-heading">
                <div>
                  <h2>Общий доступ офиса</h2>
                  <p>
                    Магазины, отчёты, планы и справочники доступны под одной
                    учётной записью
                  </p>
                </div>
              </div>
              <div className="m-access">
                {data.users.filter(u => u.role !== "store").map((u) => (
                  <div key={u.id}>
                    <span className="w-avatar">А</span>
                    <div>
                      <strong>{u.name}</strong>
                      <small>Логин: {u.username} · полный доступ</small>
                    </div>
                  </div>
                ))}
                <button
                  className="secondary-button"
                  onClick={() => setEditor({ kind: "password" })}
                >
                  Изменить пароль
                </button>
              </div>
              <p className="m-footnote">
                Изменения от общего аккаунта записываются на имя
                «Администратор». ФИО сотрудника магазина указывается отдельно в
                отчёте.
              </p>
              <div className="m-section-heading">
                <div>
                  <h2>Доступы магазинов</h2>
                  <p>Каждый логин открывает только назначенный магазин. Первоначальные пароли передаются офису отдельно; сотрудникам выдаётся только доступ их магазина.</p>
                </div>
              </div>
              <div className="m-table-wrap">
                <DataTable label="Доступы магазинов" context={date} className="m-table">
                  <thead><tr><th>Магазин</th><th>Логин</th><th>Название</th></tr></thead>
                  <tbody>{data.users.filter(u => u.role === "store").map(u => <tr key={u.id}><td>{u.stores.join(", ")}</td><td>{u.username}</td><td>{u.name}</td></tr>)}</tbody>
                </DataTable>
              </div>
              <div className="m-section-heading">
                <div>
                  <h2>История изменений</h2>
                  <p>
                    Последние 100 действий в управлении · версии показателей
                    доступны в каждом отчёте
                  </p>
                </div>
              </div>
              <div className="m-table-wrap">
                <DataTable label="История действий" context={date} className="m-table">
                  <thead>
                    <tr>
                      <th>Когда, МСК</th>
                      <th>Действие</th>
                      <th>Объект</th>
                      <th>Кто</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.events.map((e) => (
                      <tr key={e.id}>
                        <td data-sort={e.at}>{stamp(e.at)}</td>
                        <td>{e.action}</td>
                        <td>{e.entity}</td>
                        <td>{e.author}</td>
                      </tr>
                    ))}
                  </tbody>
                </DataTable>
                {!data.events.length && <Empty>Изменений пока нет</Empty>}
              </div>
            </>
          )}
          {editor && (
            <EditorDialog
              editor={editor}
              data={data}
              date={date}
              onClose={() => setEditor(null)}
              onSaved={() => {
                setEditor(null);
                setRevision((x) => x + 1);
                setNotice("Изменения сохранены");
              }}
            />
          )}
        </>
      )}
    </section>
  );
}

function IssueDetails({ details }: { details: Record<string, unknown> }) {
  const labels: Record<string, string> = {
    master: "Основной реестр",
    source: "Источник",
    original: "В отчётной таблице",
    canonical: "В кадровом реестре",
    sheet: "Лист",
    row: "Строка",
    cell: "Ячейка",
    value: "Значение",
    field: "Поле",
    header: "Заголовок",
    date: "Рабочая дата",
    document: "Документ",
    store: "Магазин",
    address: "Адрес",
    city: "Город",
    other: "Другой лист",
    source_address: "Адрес в отчёте",
    registry_address: "Адрес в реестре",
    tab: "Лист",
    secondary: "Другой лист",
    column: "Столбец",
    day: "Рабочая дата",
    count: "Количество",
    report_address: "Адрес в отчёте",
    secondary_staff: "Сотрудники в другом листе",
    current_staff: "Сотрудники в основном реестре",
    imported_date: "Принятая рабочая дата",
    google: "В Google-отчётах",
    extra_store: "Дополнительный магазин",
    location: "Расположение ячейки",
  };
  return (
    <dl className="m-details">
      {Object.entries(details).map(([k, v]) => (
        <div key={k}>
          <dt>{labels[k] || k}</dt>
          <dd>{display(v)}</dd>
        </div>
      ))}
    </dl>
  );
}

function Sources({ sources }: { sources: Source[] }) {
  const [sourceId, setSourceId] = useState(sources[0]?.id || 0);
  const source = sources.find((s) => s.id === sourceId);
  const [sheetId, setSheetId] = useState(0);
  const [sheet, setSheet] = useState<{
    title: string;
    values: unknown[][];
    formulas: unknown[][];
  } | null>(null);
  const [error, setError] = useState("");
  const [formulas, setFormulas] = useState(false);
  useEffect(() => {
    setSheetId(source?.sheets[0]?.id || 0);
  }, [sourceId, source]);
  useEffect(() => {
    setSheet(null);
    setError("");
    if (!sheetId) return;
    const controller = new AbortController();
    api<{ title: string; values: unknown[][]; formulas: unknown[][] }>(
      "manage/sheets/" + sheetId + "/",
      undefined,
      controller.signal,
    )
      .then(setSheet)
      .catch((e) => {
        if (!controller.signal.aborted) setError(err(e));
      });
    return () => controller.abort();
  }, [sheetId]);
  const rows = sheet?.values || [];
  const columns = Math.max(1, ...rows.map((r) => r.length));
  function column(n: number): string {
    return n >= 26
      ? column(Math.floor(n / 26) - 1) + String.fromCharCode(65 + (n % 26))
      : String.fromCharCode(65 + n);
  }
  return (
    <>
      <div className="m-section-heading">
        <div>
          <h2>Исходные данные</h2>
          <p>
            Полные копии {sources.length} документов ·{" "}
            {sources.reduce((n, s) => n + s.sheets.length, 0)} листов · значения
            и формулы на момент импорта
          </p>
        </div>
      </div>
      <div className="m-source-list">
        {sources.map((s) => (
          <button
            key={s.id}
            className={sourceId === s.id ? "is-active" : ""}
            onClick={() => setSourceId(s.id)}
          >
            <FileSpreadsheet size={23} />
            <span>
              <strong>{s.title}</strong>
              <small>
                {s.sheets.length} листов · загружено {stamp(s.imported_at)}
              </small>
            </span>
          </button>
        ))}
      </div>
      <div className="m-toolbar">
        <label className="m-sheet-select">
          Лист
          <select
            value={sheetId}
            onChange={(e) => setSheetId(Number(e.target.value))}
          >
            {source?.sheets.map((s) => (
              <option key={s.id} value={s.id}>
                {s.title}
              </option>
            ))}
          </select>
        </label>
        <label className="m-check">
          <input
            type="checkbox"
            checked={formulas}
            onChange={(e) => setFormulas(e.target.checked)}
          />
          Показать формулы
        </label>
        {source?.url?.startsWith("https://") && (
          <a
            className="secondary-button"
            href={source.url}
            target="_blank"
            rel="noreferrer"
          >
            Открыть оригинал <ArrowUpRight size={16} />
          </a>
        )}
      </div>
      {error && (
        <div className="w-notice w-error" role="alert">
          {error}
        </div>
      )}
      {!sheet ? (
        <Empty>Загружаем лист…</Empty>
      ) : !rows.length ? (
        <Empty>В исходном листе нет заполненных ячеек</Empty>
      ) : (
        <>
          <div className="m-source-grid">
            <DataTable label="Исходный лист" key={sheetId} pageSize={50} context={sheet.title}>
              <thead>
                <tr>
                  <th>№</th>
                  {Array.from({ length: columns }, (_, i) => (
                    <th key={i}>{column(i)}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row, index) => (
                  <tr key={index}>
                    <th>{index + 1}</th>
                    {Array.from({ length: columns }, (_, j) => {
                      const f = sheet.formulas[index]?.[j];
                      const value =
                        formulas && typeof f === "string" && f.startsWith("=")
                          ? f
                          : row[j];
                      return (
                        <td key={j} data-sort={typeof value === "number" ? value : display(value)} data-export={typeof value === "number" ? value : value == null ? null : display(value)} title={value == null ? "" : display(value)}>
                          {value == null ? "" : display(value)}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </DataTable>
          </div>

        </>
      )}
      <p className="m-footnote">
        Здесь сохранены прежние таблицы для справки. Новые отчёты, планы и
        изменения ведите в сервисе.
      </p>
    </>
  );
}

function EditorDialog({
  editor,
  data,
  date,
  onClose,
  onSaved,
}: {
  editor: Editor;
  data: Overview;
  date: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [closed, setClosed] = useState(false);
  const [monitoring, setMonitoring] = useState(
    editor.kind === "store" ? editor.item?.monitoring_enabled || false : false,
  );
  const [weekdays, setWeekdays] = useState(
    editor.kind === "store"
      ? editor.item?.weekdays || [0, 1, 2, 3, 4, 5, 6]
      : [],
  );
  useEffect(() => {
    ref.current?.showModal();
  }, []);
  const title =
    editor.kind === "store"
      ? editor.item
        ? `Магазин ${editor.item.code}`
        : "Новый магазин"
      : editor.kind === "employee"
        ? "Карточка сотрудника"
        : editor.kind === "legal"
          ? "Реквизиты юрлица"
          : editor.kind === "plan"
            ? `План · ${editor.shop.code}`
            : editor.kind === "schedule"
              ? "Особый день"
              : editor.kind === "issue"
                ? "Результат сверки"
                : "Изменить пароль";
  async function save(e: React.SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const f = new FormData(e.currentTarget);
    const value = (key: string) => String(f.get(key) ?? "");
    let path = "",
      payload: unknown;
    if (editor.kind === "store") {
      path = "stores/" + (editor.item?.id || 0) + "/";
      payload = {
        code: value("code"),
        name: value("name"),
        city: value("city"),
        network: value("network"),
        timezone: value("timezone"),
        opens_at: value("opens_at"),
        closes_at: value("closes_at"),
        active_from: value("active_from"),
        active_until: value("active_until"),
        weekdays,
        monitoring_enabled: monitoring,
        profile: {
          region: value("region"),
          legal_entity: value("legal_entity"),
          vacancies:
            value("vacancies") === "" ? null : Number(value("vacancies")),
          staffing: value("staffing"),
          shift_rate: value("shift_rate"),
        },
        staff: Object.keys(slots)
          .filter((slot) => value(slot))
          .map((slot) => ({ slot, id: Number(value(slot)) })),
      };
    } else if (editor.kind === "employee") {
      path = "employees/" + (editor.item?.id || 0) + "/";
      payload = {
        name: value("name"),
        position: value("position"),
        notes: value("notes"),
        active: f.has("active"),
      };
    } else if (editor.kind === "legal") {
      path = "legal/" + (editor.item?.id || 0) + "/";
      const details: Record<string, string> = {};
      for (const [key, v] of f.entries())
        if (key.startsWith("detail:")) details[key.slice(7)] = String(v);
      payload = { name: value("name"), data: details };
    } else if (editor.kind === "plan") {
      path = "plans/";
      payload = {
        store_id: editor.shop.id,
        date,
        revenue: value("revenue"),
        receipts: value("receipts"),
        units: value("units"),
        units_per_receipt: value("units_per_receipt"),
        reason: value("reason"),
      };
    } else if (editor.kind === "schedule") {
      path = "schedule/";
      payload = {
        store_id: Number(value("store_id")),
        date: value("date"),
        closed,
        opens_at: closed ? null : value("opens_at"),
        closes_at: closed ? null : value("closes_at"),
        reason: value("reason"),
      };
    } else if (editor.kind === "issue") {
      path = "issues/" + editor.item.id + "/";
      payload = { resolution: value("resolution") };
    } else {
      path = "password/";
      if (value("password") !== value("repeat")) {
        setError("Новые пароли не совпадают");
        setBusy(false);
        return;
      }
      payload = { current: value("current"), password: value("password") };
    }
    try {
      await api("manage/" + path, payload);
      onSaved();
    } catch (e) {
      setError(err(e));
    } finally {
      setBusy(false);
    }
  }
  const shop = editor.kind === "store" ? editor.item : undefined;
  return (
    <dialog
      ref={ref}
      className="m-dialog"
      onCancel={(e) => {
        e.preventDefault();
        if (!busy) onClose();
      }}
      aria-labelledby="m-dialog-title"
    >
      <header>
        <div>
          <span className="w-kicker">УПРАВЛЕНИЕ СЕТЬЮ</span>
          <h2 id="m-dialog-title">{title}</h2>
        </div>
        <button
          className="m-edit"
          aria-label="Закрыть карточку"
          onClick={onClose}
          disabled={busy}
        >
          <X size={21} />
        </button>
      </header>
      <form onSubmit={save}>
        <div className="m-form-body">
          {editor.kind === "store" && (
            <>
              <h3>Карточка магазина</h3>
              <div className="m-form-grid">
                <Field label="Постоянный код">
                  <input
                    name="code"
                    required
                    maxLength={32}
                    defaultValue={shop?.code}
                  />
                </Field>
                <Field label="Сеть">
                  <select name="network" defaultValue={shop?.network || "MM"}>
                    {Object.entries(networks).map(([k, v]) => (
                      <option key={k} value={k}>
                        {v}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Город">
                  <input
                    name="city"
                    required
                    maxLength={100}
                    defaultValue={shop?.city}
                  />
                </Field>
                <Field label="Регион">
                  <input name="region" defaultValue={shop?.profile.region} />
                </Field>
                <Field label="Адрес" wide>
                  <input
                    name="name"
                    required
                    maxLength={200}
                    defaultValue={shop?.name}
                  />
                </Field>
                <Field label="Юридическое лицо" wide>
                  <input
                    name="legal_entity"
                    list="legal-options"
                    defaultValue={shop?.profile.legal_entity}
                  />
                  <datalist id="legal-options">
                    {data.legal_entities.map((l) => (
                      <option key={l.id} value={l.name} />
                    ))}
                  </datalist>
                </Field>
              </div>
              <h3>Команда и ставки</h3>
              <div className="m-form-grid">
                {Object.entries(slots).map(([slot, label]) => (
                  <Field key={slot} label={label} wide={slot === "curator"}>
                    <select
                      name={slot}
                      defaultValue={
                        shop?.staff.find((s) => s.slot === slot)?.id || ""
                      }
                    >
                      <option value="">Не назначен</option>
                      {data.employees
                        .filter(
                          (p) =>
                            p.active || shop?.staff.some((s) => s.id === p.id),
                        )
                        .map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name}
                          </option>
                        ))}
                    </select>
                  </Field>
                ))}
                <Field label="Ставка за смену, ₽">
                  <input
                    name="shift_rate"
                    type="number"
                    min="0"
                    step="0.01"
                    defaultValue={shop?.profile.shift_rate}
                  />
                </Field>
                <Field label="Количество вакансий">
                  <input
                    name="vacancies"
                    type="number"
                    min="0"
                    step="1"
                    defaultValue={shop?.profile.vacancies ?? ""}
                  />
                </Field>
                <Field label="Кадровая ситуация" wide>
                  <textarea
                    name="staffing"
                    rows={2}
                    defaultValue={shop?.profile.staffing}
                  />
                </Field>
              </div>
              <h3>График и контроль сроков</h3>
              <p className="m-footnote">
                Проверьте часы и часовой пояс. При включении контроль начнётся
                со следующего рабочего дня. Сроки уже созданных отчётов
                сохраняются.
              </p>
              <div className="m-form-grid">
                <Field label="Часовой пояс" wide>
                  <select
                    name="timezone"
                    defaultValue={shop?.timezone || "Europe/Moscow"}
                  >
                    {[
                      ["Europe/Moscow", "Москва (МСК)"],
                      ["Europe/Samara", "Самара (МСК +1)"],
                      ["Asia/Yekaterinburg", "Екатеринбург / Тюмень (МСК +2)"],
                      ["Asia/Omsk", "Омск (МСК +3)"],
                    ].map(([k, v]) => (
                      <option key={k} value={k}>
                        {v}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Открытие">
                  <input
                    type="time"
                    name="opens_at"
                    required
                    defaultValue={shop?.opens_at || "10:00"}
                  />
                </Field>
                <Field label="Закрытие">
                  <input
                    type="time"
                    name="closes_at"
                    required
                    defaultValue={shop?.closes_at || "22:00"}
                  />
                </Field>
                <fieldset className="m-weekdays m-wide">
                  <legend>Рабочие дни</legend>
                  {["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"].map((day, i) => (
                    <label key={day}>
                      <input
                        type="checkbox"
                        checked={weekdays.includes(i)}
                        onChange={(e) =>
                          setWeekdays((prev) =>
                            e.target.checked
                              ? [...prev, i].sort()
                              : prev.filter((v) => v !== i),
                          )
                        }
                      />
                      {day}
                    </label>
                  ))}
                </fieldset>
                <Field label="Начало учёта в сервисе">
                  <input
                    type="date"
                    name="active_from"
                    required
                    defaultValue={shop?.active_from || date}
                  />
                </Field>
                <Field label="Последний день (если известен)">
                  <input
                    type="date"
                    name="active_until"
                    defaultValue={shop?.active_until || ""}
                  />
                </Field>
                <label className="m-check m-wide">
                  <input
                    type="checkbox"
                    checked={monitoring}
                    onChange={(e) => setMonitoring(e.target.checked)}
                  />
                  График проверен, включить контроль сроков
                </label>
              </div>
            </>
          )}
          {editor.kind === "employee" && (
            <div className="m-form-grid">
              <Field label="ФИО" wide>
                <input
                  name="name"
                  required
                  maxLength={200}
                  defaultValue={editor.item?.name}
                />
              </Field>
              <Field label="Должность" wide>
                <input
                  name="position"
                  required
                  maxLength={100}
                  defaultValue={editor.item?.position || "Продавец"}
                />
              </Field>
              <Field label="Примечание" wide>
                <textarea
                  name="notes"
                  rows={3}
                  defaultValue={editor.item?.notes}
                />
              </Field>
              <label className="m-check m-wide">
                <input
                  type="checkbox"
                  name="active"
                  defaultChecked={editor.item?.active ?? true}
                />
                Доступен для назначения в магазин
              </label>
              <p className="m-footnote m-wide">
                Назначение продавцов и куратора меняется в карточке магазина.
                Запись сотрудника не создаёт отдельный логин.
              </p>
            </div>
          )}
          {editor.kind === "legal" && (
            <div className="m-form-grid">
              <Field label="Краткое название" wide>
                <input
                  name="name"
                  required
                  maxLength={250}
                  defaultValue={editor.item?.name}
                />
              </Field>
              {Object.entries(
                editor.item?.data || {
                  "Полное наименование": "",
                  ИНН: "",
                  КПП: "",
                  "Юридический адрес": "",
                  Банк: "",
                  "Расчётный счёт": "",
                },
              ).map(([key, v]) => (
                <Field key={key} label={key} wide>
                  <textarea
                    name={"detail:" + key}
                    rows={display(v).length > 100 ? 3 : 1}
                    defaultValue={v == null ? "" : display(v)}
                  />
                </Field>
              ))}
            </div>
          )}
          {editor.kind === "plan" && (
            <>
              <p>
                {editor.shop.city}, {editor.shop.name} ·{" "}
                {date.split("-").reverse().join(".")}
              </p>
              <div className="m-form-grid">
                <Field label="План выручки, ₽">
                  <input
                    name="revenue"
                    type="number"
                    required
                    min="0"
                    step="0.01"
                    defaultValue={editor.item?.revenue}
                  />
                </Field>
                <Field label="План чеков">
                  <input
                    name="receipts"
                    type="number"
                    min="0"
                    step="1"
                    defaultValue={editor.item?.receipts ?? ""}
                  />
                </Field>
                <Field label="План алкогольных единиц">
                  <input
                    name="units"
                    type="number"
                    min="0"
                    step="1"
                    defaultValue={editor.item?.units ?? ""}
                  />
                </Field>
                <Field label="План ед/чек">
                  <input
                    name="units_per_receipt"
                    type="number"
                    min="0"
                    step="0.0001"
                    defaultValue={editor.item?.units_per_receipt ?? ""}
                  />
                </Field>
                <Field label="Основание / причина изменения" wide>
                  <textarea name="reason" required maxLength={300} rows={3} />
                </Field>
              </div>
              <p className="m-footnote">
                Будет создана новая версия. Предыдущий план останется в истории.
              </p>
            </>
          )}
          {editor.kind === "schedule" && (
            <div className="m-form-grid">
              <Field label="Магазин" wide>
                <select name="store_id" required>
                  <option value="">Выберите магазин</option>
                  {data.stores.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.code} · {s.city}, {s.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Дата" wide>
                <input name="date" type="date" required defaultValue={date} />
              </Field>
              <label className="m-check m-wide">
                <input
                  type="checkbox"
                  checked={closed}
                  onChange={(e) => setClosed(e.target.checked)}
                />
                Магазин закрыт в этот день
              </label>
              {!closed && (
                <>
                  <Field label="Открытие">
                    <input type="time" name="opens_at" />
                  </Field>
                  <Field label="Закрытие">
                    <input type="time" name="closes_at" />
                  </Field>
                </>
              )}
              <Field label="Причина" wide>
                <textarea name="reason" required maxLength={300} rows={3} />
              </Field>
            </div>
          )}
          {editor.kind === "issue" && (
            <>
              <p>{editor.item.message}</p>
              <IssueDetails details={editor.item.details} />
              <Field label="Что проверили и какое значение принято">
                <textarea name="resolution" required rows={4} />
              </Field>
              <p className="m-footnote">
                Результат сохранится рядом с расхождением. Если нужно изменить
                магазин или сотрудника, отредактируйте его карточку.
              </p>
            </>
          )}
          {editor.kind === "password" && (
            <div className="m-form-grid">
              <Field label="Текущий пароль" wide>
                <input
                  name="current"
                  type="password"
                  autoComplete="current-password"
                  required
                />
              </Field>
              <Field label="Новый пароль" wide>
                <input
                  name="password"
                  type="password"
                  autoComplete="new-password"
                  required
                  minLength={10}
                />
              </Field>
              <Field label="Повторите новый пароль" wide>
                <input
                  name="repeat"
                  type="password"
                  autoComplete="new-password"
                  required
                  minLength={10}
                />
              </Field>
              <p className="m-footnote m-wide">
                После изменения остальные сотрудники офиса должны будут войти с
                новым паролем.
              </p>
            </div>
          )}
          {error && (
            <div className="w-notice w-error" role="alert">
              {error}
            </div>
          )}
        </div>
        <footer>
          <button
            type="button"
            className="secondary-button"
            onClick={onClose}
            disabled={busy}
          >
            Отмена
          </button>
          <button className="primary-button" disabled={busy}>
            <Check size={17} />
            {busy ? "Сохраняем…" : "Сохранить"}
          </button>
        </footer>
      </form>
    </dialog>
  );
}
