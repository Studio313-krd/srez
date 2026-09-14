import { useEffect, useRef, useState } from "react";
import type React from "react";
import {
  ArrowRight,
  Check,
  CheckCircle2,
  ChevronRight,
  CircleAlert,
  Clock3,
  History,
  LayoutDashboard,
  PanelLeftClose,
  PanelLeftOpen,
  LogOut,
  RefreshCw,
  Search,
  Send,
  Settings2,
  ShieldCheck,
  Store,
  X,
} from "lucide-react";
import { api, ApiError } from "./api";
import Management from "./management";
import DataTable from "./data-table";
import "./sidebar.css";
import type {
  Dashboard,
  Finding,
  Report,
  Revision,
  StoreData,
  User,
} from "./api";

const stages = ["13", "17", "close"];
const stageName = (stage: string) =>
  stage === "close" ? "Закрытие" : stage + ":00";
const statusNames: Record<string, string> = {
  ok: "Получен",
  missing: "Опаздывает",
  waiting: "Ожидается",
  review: "Проверить",
  late: "С опозданием",
  imported: "Из таблицы",
  partial: "Не полностью",
  unfilled: "Нет отчёта",
  not_expected: "Не требуется",
};
const actionNames: Record<string, string> = {
  open: "Новое",
  requested: "Ждём пояснение",
  escalated: "Руководителю",
  accepted: "Исключение принято",
  resolved: "Исправлено",
  reply: "Пояснение магазина",
};
const active = (finding: Finding) =>
  ["open", "requested", "escalated"].includes(finding.state);
const slotStatus = (store: StoreData, stage: string) =>
  store.reports.find((r) => r.checkpoint === stage)?.status || store.checkpoint_status?.[stage] || "waiting";
const needsAttention = (store: StoreData, stage: string) => {
  const report = store.reports.find((r) => r.checkpoint === stage);
  return ["missing", "unfilled", "partial", "review"].includes(slotStatus(store, stage)) || !!report?.findings.some(active);
};
const missingFields = (report: Report) => report.current
  ? [["revenue", "выручка"], ["receipts", "количество чеков"], ["units", "алкогольные единицы"]]
      .filter(([key]) => report.current![key as "revenue" | "receipts" | "units"] == null).map(([,label]) => label)
  : [];
const money = (value?: string | number | null) =>
  value == null
    ? "—"
    : new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 2 }).format(
        Number(value),
      );
const time = (
  value: string | null,
  zone = "Europe/Moscow",
  withDate = false,
) =>
  value
    ? new Intl.DateTimeFormat("ru-RU", {
        timeZone: zone,
        hour: "2-digit",
        minute: "2-digit",
        ...(withDate ? ({ day: "2-digit", month: "2-digit" } as const) : {}),
      }).format(new Date(value))
    : "—";
const dayText = (day: string) =>
  new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(day + "T12:00:00Z"));
const errorText = (error: unknown) =>
  error instanceof Error ? error.message : "Не удалось выполнить действие.";

function Brand() {
  return (
    <div className="w-brand">
      <span className="w-mark" aria-hidden="true">
        <i />
        <i />
        <i />
      </span>
      <span>
        срез<span className="w-brand-sub">Отчётность магазинов</span>
      </span>
    </div>
  );
}
function Status({ status }: { status: string }) {
  const Icon =
    status === "ok"
      ? CheckCircle2
      : status === "waiting"
        ? Clock3
        : CircleAlert;
  return (
    <span className={"w-status s-" + status}>
      <Icon size={14} />
      {statusNames[status] || status}
    </span>
  );
}
function Notice({
  children,
  error = false,
}: {
  children: React.ReactNode;
  error?: boolean;
}) {
  return (
    <div
      className={"w-notice " + (error ? "w-error" : "")}
      role={error ? "alert" : "status"}
    >
      <CircleAlert size={18} />
      <span>{children}</span>
    </div>
  );
}

function Login({ onLogin }: { onLogin: (user: User) => void }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function enter(event: React.SubmitEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const result = await api<{ user: User }>("login/", {
        username,
        password,
      });
      onLogin(result.user);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="w-login">
      <section className="w-login-story">
        <Brand />
        <div>
          <span className="w-kicker">КАЖДЫЙ МАГАЗИН · КАЖДЫЙ ДЕНЬ</span>
          <h1>
            Рабочий день
            <br />
            Вся картина
          </h1>
          <p>
            Три среза продаж, понятный статус отчётов и история каждого
            исправления.
          </p>
          <div className="w-login-stages">
            {stages.map((s, i) => (
              <div key={s}>
                <span>{i + 1}</span>
                <b>{stageName(s)}</b>
              </div>
            ))}
          </div>
        </div>
        <small>Мильстрим / Культура крепкого</small>
      </section>
      <section className="w-login-form">
        <ShieldCheck size={30} />
        <h2>Войти в рабочий стол</h2>
        <p>
          Введите логин и пароль,
          <br />
          которые вам выдал руководитель.
        </p>
        <form onSubmit={enter}>
          <label>
            Логин
            <input
              name="username"
              autoComplete="username"
              required
              value={username}
              onChange={(e) => setUsername(e.target.value)}
            />
          </label>
          <label>
            Пароль
            <input
              name="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
          {error && <Notice error>{error}</Notice>}
          <button className="primary-button" disabled={busy}>
            {busy ? "Входим…" : "Войти"}
            <ArrowRight size={18} />
          </button>
        </form>
        <small>Если забыли пароль, обратитесь к администратору.</small>
      </section>
    </main>
  );
}

export default function Workspace() {
  const [user, setUser] = useState<User | null>(null);
  const [starting, setStarting] = useState(true);
  const [error, setError] = useState("");
  useEffect(() => {
    let live = true;
    api<{ user: User | null }>("session/")
      .then((result) => {
        if (live) setUser(result.user);
      })
      .catch((e) => {
        if (live) setError(errorText(e));
      })
      .finally(() => {
        if (live) setStarting(false);
      });
    const expired = () => setUser(null);
    window.addEventListener("session-expired", expired);
    return () => {
      live = false;
      window.removeEventListener("session-expired", expired);
    };
  }, []);
  return (
    <div className="app variant-a w-app">
      {starting ? (
        <main className="w-loading">
          <Brand />
          <p>Подключаем рабочий стол…</p>
        </main>
      ) : error ? (
        <main className="w-loading">
          <Notice error>{error}</Notice>
          <button
            className="secondary-button"
            onClick={() => location.reload()}
          >
            Повторить подключение
          </button>
        </main>
      ) : user ? (
        <Desk key={user.id} user={user} onLogout={() => setUser(null)} />
      ) : (
        <Login onLogin={setUser} />
      )}
    </div>
  );
}

function Desk({ user, onLogout }: { user: User; onLogout: () => void }) {
  const [collapsed, setCollapsed] = useState(() => { try { return localStorage.getItem("srez-sidebar-collapsed") === "true"; } catch { return false; } });
  function toggleSidebar() { setCollapsed(value => { try { localStorage.setItem("srez-sidebar-collapsed", String(!value)); } catch {} return !value; }); }
  const query = new URLSearchParams(location.search);
  const [date, setDate] = useState(query.get("date") || "");
  const [data, setData] = useState<Dashboard | null>(null);
  const [error, setError] = useState("");
  const [selectedId, setSelectedId] = useState<number | null>(
    Number(query.get("report")) || null,
  );
  const [storeId, setStoreId] = useState<number | null>(null);
  const [refresh, setRefresh] = useState(0);
  const [busy, setBusy] = useState(false);
  const isOffice = user.role === "office" || user.role === "manager";
  const management =
    location.pathname.startsWith("/management") && user.role === "manager";
  useEffect(() => {
    const abort = new AbortController();
    setBusy(true);
    setError("");
    api<Dashboard>(
      "dashboard/" + (date ? "?date=" + encodeURIComponent(date) : ""),
      undefined,
      abort.signal,
    )
      .then((result) => {
        if (abort.signal.aborted) return;
        setData(result);
        if (!date) setDate(result.date);
      })
      .catch((e) => {
        if (!abort.signal.aborted) setError(errorText(e));
      })
      .finally(() => {
        if (!abort.signal.aborted) setBusy(false);
      });
    return () => abort.abort();
  }, [date, refresh]);
  useEffect(() => {
    if (selectedId || management) return;
    const id = window.setInterval(() => setRefresh((r) => r + 1), 30000);
    return () => clearInterval(id);
  }, [selectedId, management]);
  async function createReport(store: StoreData, checkpoint: string) {
    try {
      const report = await api<Report>("manage/reports/", {
        store_id: store.id,
        date: data!.date,
        checkpoint,
      });
      setSelectedId(report.id);
      setRefresh((r) => r + 1);
    } catch (e) {
      setError(errorText(e));
    }
  }
  function changeDate(value: string) {
    setSelectedId(null);
    setData(null);
    setDate(value);
  }
  async function leave() {
    try {
      await api("logout/", {});
      onLogout();
    } catch (e) {
      setError(errorText(e));
    }
  }
  const selectedStore = data?.stores.find((s) =>
    s.reports.some((r) => r.id === selectedId),
  );
  const selectedReport = selectedStore?.reports.find(
    (r) => r.id === selectedId,
  );
  const currentStore =
    data?.stores.find((s) => s.id === storeId) || data?.stores[0];
  return (
    <div className={"w-desk " + (isOffice ? collapsed ? "w-nav-collapsed" : "" : "w-store-desk")}>
      {isOffice && (
        <aside className="w-sidebar" aria-label="Навигация и учётная запись">
          <div className="w-sidebar-top"><Brand /><button className="w-collapse" type="button" onClick={toggleSidebar} aria-label={collapsed ? "Развернуть панель" : "Свернуть панель"} title={collapsed ? "Развернуть панель" : "Свернуть панель"} aria-expanded={!collapsed}>{collapsed ? <PanelLeftOpen size={21}/> : <PanelLeftClose size={21}/>}</button></div>
          <div className="w-nav-label">ОПЕРАЦИОННЫЙ КОНТРОЛЬ</div>
          <nav aria-label="Основная навигация">
            <a
              href={"/?date=" + date}
              className={!management ? "w-nav-current" : ""}
              title="Рабочий стол" aria-label="Рабочий стол"
            >
              <LayoutDashboard size={18} />
              <span className="w-nav-text">Рабочий стол</span>
            </a>
            {user.role === "manager" && (
              <a
                href={"/management?date=" + date}
                className={management ? "w-nav-current" : ""}
                title="Управление" aria-label="Управление"
              >
                <Settings2 size={18} />
                <span className="w-nav-text">Управление</span>
              </a>
            )}
          </nav>
          <div className="w-sidebar-note">
            <span className="w-kicker">ТРИ СРЕЗА В ДЕНЬ</span>
            <b>13:00 / 17:00 / закрытие</b>
            <p>Все показатели — накопительным итогом с начала смены.</p>
          </div>
          <div className="w-account">
            <span className="w-avatar">{user.name.slice(0, 1)}</span>
            <div>
              <b>{user.name}</b>
              <small>
                {user.role === "manager" ? "Полный доступ" : "Офис"}
              </small>
            </div>
            <button onClick={leave} aria-label="Выйти">
              <LogOut size={18} />
            </button>
          </div>
        </aside>
      )}
      <main className="w-main">
        {!isOffice && (
          <header className="w-store-brand">
            <Brand />
            <button className="secondary-button" onClick={leave}>
              <LogOut size={16} />
              Выйти
            </button>
          </header>
        )}
        <header className="w-page-head">
          <div>
            <span className="w-kicker">
              {isOffice ? "ОТЧЁТНОСТЬ СЕТИ" : user.name}
            </span>
            <h1>
              {management
                ? "Управление"
                : isOffice
                  ? "Рабочий стол"
                  : "Отчёт за смену"}
            </h1>
            <p>
              {management
                ? "Магазины, сотрудники и настройки ежедневной работы."
                : isOffice
                  ? "Сдача отчётов и вопросы, которые требуют внимания."
                  : "Заполните показатели с начала рабочего дня."}
            </p>
          </div>
          <div className="w-head-actions">
            <label className="w-date">
              <span>Рабочая дата</span>
              <input
                type="date"
                aria-label="Рабочая дата"
                value={date}
                required
                onChange={(e) => {
                  if (e.target.value) changeDate(e.target.value);
                }}
              />
            </label>
            <button
              className="w-refresh"
              aria-label="Обновить данные"
              disabled={busy}
              onClick={() => setRefresh((r) => r + 1)}
            >
              <RefreshCw size={18} />
            </button>
          </div>
        </header>
        {error && <Notice error>{error}</Notice>}
        {data && !data.worker_ok && isOffice && (
          <Notice>
            Автопроверка сроков давно не обновлялась. Сообщите администратору;
            отчёты можно продолжать принимать.
          </Notice>
        )}
        {management ? (
          <Management date={date} refresh={refresh} />
        ) : !data ? (
          <div className="w-empty">
            {busy
              ? "Загружаем отчёты…"
              : "Данные недоступны. Нажмите «Обновить данные»."}
          </div>
        ) : data.stores.length === 0 ? (
          <div className="w-empty">
            <Store size={32} />
            <h2>Нет доступных магазинов</h2>
            <p>
              Администратор должен назначить магазины и указать дату начала
              работы в сервисе.
            </p>
          </div>
        ) : isOffice ? (
          <OfficeDashboard
            data={data}
            onOpen={setSelectedId}
            onCreate={user.role === "manager" ? createReport : undefined}
          />
        ) : (
          <section className="w-store-content">
            <label>
              Магазин
              <select
                value={currentStore?.id || ""}
                onChange={(e) => setStoreId(Number(e.target.value))}
              >
                {data.stores.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.code} · {s.name}
                  </option>
                ))}
              </select>
            </label>
            {currentStore && (
              <>
                <div className="w-store-meta">
                  <span>{currentStore.city}</span>
                  <span>{currentStore.timezone}</span>
                </div>
                <div className="w-plan-summary">
                  <span>План выручки на день</span>
                  <strong>
                    {currentStore.plan
                      ? money(currentStore.plan.revenue) + " ₽"
                      : "Не задан"}
                  </strong>
                </div>
                <div className="w-store-checkpoints">
                  {currentStore.reports.map((report) => (
                    <button
                      key={report.id}
                      onClick={() => setSelectedId(report.id)}
                    >
                      <div>
                        <span className="w-stage-number">
                          {stages.indexOf(report.checkpoint) + 1}
                        </span>
                        <div>
                          <h2>{stageName(report.checkpoint)}</h2>
                          <small>
                            Сдать до{" "}
                            {time(report.deadline, currentStore.timezone, true)}
                          </small>
                        </div>
                      </div>
                      <Status status={report.status} />
                      <div className="w-stage-value">
                        {report.current
                          ? money(report.current.revenue) + " ₽"
                          : "Заполнить показатели"}
                        <ChevronRight size={18} />
                      </div>
                    </button>
                  ))}
                </div>
                {!currentStore.reports.length && (
                  <Notice>
                    На эту дату отчёты не ожидаются: проверьте рабочую дату и
                    график магазина.
                  </Notice>
                )}
                <div className="w-hint">
                  <ShieldCheck size={20} />
                  <p>
                    Сохранённые отчёты доступны в каждом срезе. Исправление
                    создаёт новую версию с вашим именем и причиной изменения.
                  </p>
                </div>
              </>
            )}
          </section>
        )}
        {data && (
          <footer className="w-footer">
            <span>{dayText(data.date)}</span>
            <span>Обновлено {time(data.server_time)} МСК</span>
            <span>{busy ? "Обновляем…" : "Данные сервера"}</span>
          </footer>
        )}
      </main>
      {selectedStore && selectedReport && (
        <ReportDialog
          key={selectedReport.id}
          store={selectedStore}
          report={selectedReport}
          date={data!.date}
          user={user}
          onClose={() => setSelectedId(null)}
          onChange={() => setRefresh((r) => r + 1)}
        />
      )}
    </div>
  );
}

function OfficeDashboard({
  data,
  onOpen,
  onCreate,
}: {
  data: Dashboard;
  onOpen: (id: number) => void;
  onCreate?: (store: StoreData, checkpoint: string) => void;
}) {
  const [search, setSearch] = useState("");
  const [network, setNetwork] = useState("all");
  const [filter, setFilter] = useState(new URLSearchParams(location.search).get("view") === "issues" ? "questions" : "all");
  const [stage, setStage] = useState("17");
  const relevant = data.stores.flatMap((s) =>
    s.reports.filter((r) => r.checkpoint === stage),
  );
  const received = relevant.filter((r) => r.current).length;
  const missing = data.stores.filter((s) => ["missing", "unfilled"].includes(slotStatus(s, stage))).length;
  const overdue = relevant.filter((r) => r.status === "missing").length;
  const unknownDeadline = missing - overdue;
  const review = relevant.filter(
    (r) => r.status === "partial" || (r.current && r.findings.some(active)),
  ).length;
  const stores = data.stores
    .filter(
      (store) =>
        (network === "all" || store.network === network) &&
        [store.name, store.code, store.city]
          .join(" ")
          .toLocaleLowerCase()
          .includes(search.toLocaleLowerCase()),
    )
    .filter((store) => {
      const report = store.reports.find((r) => r.checkpoint === stage);
      return (
        filter === "all" ||
        (filter === "attention" ? needsAttention(store, stage)
          : filter === "missing" ? ["missing", "unfilled"].includes(slotStatus(store, stage))
          : filter === "questions" ? report?.findings.some(active) || report?.status === "partial"
          : report?.late || report?.status === "missing")
      );
    });
  const findings = data.stores.flatMap((store) =>
    store.reports
      .filter((r) => r.checkpoint === stage)
      .flatMap((report) =>
        report.findings
          .filter(active)
          .map((finding) => ({ store, report, finding })),
      ),
  );
  return (
    <>
      <div className="w-periods">
        <div role="group" aria-label="Контрольный срез">
          {stages.map((s) => (
            <button
              key={s}
              className={stage === s ? "selected" : ""}
              aria-pressed={stage === s}
              onClick={() => setStage(s)}
            >
              {stageName(s)}
            </button>
          ))}
        </div>
        <span>Показатели с начала рабочего дня</span>
      </div>
      <section className="w-stats" aria-label="Статистика выбранного среза">
        <div>
          <span>Магазины сети</span>
          <strong>
            {data.stores.length}
            <small>магазинов</small>
          </strong>
          <p>
            {data.stores.filter((s) => s.network === "MM").length} Мильстрим ·{" "}
            {data.stores.filter((s) => s.network === "KK").length} Культура
            крепкого
          </p>
        </div>
        <div>
          <span>Есть показатели</span>
          <strong className="w-green">
            {received}
            <small>из {data.stores.length}</small>
          </strong>
          <div className="w-meter">
            <span
              style={{
                width:
                  (relevant.length ? (received / relevant.length) * 100 : 0) +
                  "%",
              }}
            />
          </div>
        </div>
        <div>
          <span>Нет отчёта</span>
          <strong className={missing ? "w-amber" : ""}>{missing}</strong>
          <p>{overdue} просрочено · {unknownDeadline} без известного срока</p>
          <button className="w-inline-link" onClick={() => setFilter("missing")}>Показать магазины</button>
        </div>
        <div>
          <span>Требуют проверки</span>
          <strong className={review ? "w-amber" : ""}>{review}</strong>
          <p>Замечания или неполные данные</p>
          <button className="w-inline-link" onClick={() => setFilter("questions")}>Посмотреть причины</button>
        </div>
      </section>
      {missing > 0 && <Notice><b>На {stageName(stage)} нет отчёта у {missing} магазинов.</b>{" "}
        {unknownDeadline > 0 && "У части отчётов срок неизвестен, поэтому опоздание не подтверждено. "}
        Откройте «Нет отчёта», свяжитесь с магазином и уточните показатели.</Notice>}
      <details className="w-help">
        <summary>Что такое замечания и что с ними делать</summary>
        <p>Это вопрос к конкретному отчёту: нет показателей, пропущено число, итог меньше предыдущего или отчёт пришёл поздно. Это повод проверить данные, а не автоматически ошибка продавца.</p>
        <p>Выберите время → откройте статус магазина → прочитайте причину. Если нужны уточнения, нажмите «Задать вопрос магазину». Ответ появится в этой же карточке. Неверные числа исправляются через «Исправить показатели».</p>
        <p>Сотрудники, планы и графики находятся в «Управлении». «Сверка данных» там относится к старым импортированным таблицам.</p>
      </details>
      <div className="w-office-grid">
        <section className="w-table-panel">
          <div className="w-panel-heading">
            <h2>
              Магазины<span>{stores.length}</span>
            </h2>

          </div>
          <div className="w-filters">
            <label className="w-search">
              <Search size={17} />
              <input
                aria-label="Поиск магазина"
                placeholder="Магазин, код или город"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </label>
            <select
              aria-label="Сеть"
              value={network}
              onChange={(e) => setNetwork(e.target.value)}
            >
              <option value="all">Все сети</option>
              <option value="MM">Мильстрим</option>
              <option value="KK">Культура крепкого</option>
            </select>
          </div>
          <div className="w-filter-tabs">
            {[
              ["all", "Все магазины"],
              ["attention", "Требуют внимания"],
              ["missing", "Нет отчёта"],
              ["questions", "Замечания и неполные"],
              ["late", "Опоздания"],
            ].map(([key, label]) => (
              <button
                key={key}
                aria-pressed={filter === key}
                className={filter === key ? "selected" : ""}
                onClick={() => setFilter(key)}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="w-table-scroll">
            <DataTable key={stage} label="Отчёты магазинов" context={`${data.date}-${stage}`}>
              <thead>
                <tr>
                  <th>Магазин</th>
                  <th>Отчёт · {stageName(stage)}</th>
                  <th>Сотрудник</th>
                  <th className="w-number">Выручка · {stageName(stage)}</th>
                  <th>Чеки</th>
                  <th>Алкогольные ед</th>
                  <th>План выручки</th>
                  <th>К плану</th>
                </tr>
              </thead>
              <tbody>
                {stores.map((store) => {
                  const current = store.reports.find(
                    (r) => r.checkpoint === stage,
                  )?.current;
                  const percent =
                    current?.revenue != null && Number(store.plan?.revenue) > 0
                      ? (Number(current.revenue) /
                          Number(store.plan!.revenue)) *
                        100
                      : null;
                  return (
                    <tr key={store.id}>
                      <td>
                        <b>{store.name}</b>
                        <small>
                          {store.code} · {store.city}
                        </small>
                      </td>
                      {[stage].map((s) => {
                        const report = store.reports.find(
                          (r) => r.checkpoint === s,
                        );
                        return (
                          <td key={s} data-search={statusNames[slotStatus(store, s)]} data-sort={statusNames[slotStatus(store, s)]} data-export={statusNames[slotStatus(store, s)]}>
                            {report ? (
                              <button
                                className="w-report-cell"
                                aria-label={`${store.code}, ${stageName(s)}: ${statusNames[report.status]}`}
                                onClick={() => onOpen(report.id)}
                              >
                                <span className="w-cell-stage">{stageName(s)}</span>
                                <Status status={report.status} />
                                <small>
                                  {report.imported
                                    ? report.current
                                      ? "Время сдачи неизвестно"
                                      : "Показатели не перенесены"
                                    : report.current
                                      ? time(
                                          report.first_received_at,
                                          store.timezone,
                                        )
                                      : report.deadline
                                        ? "до " +
                                          time(report.deadline, store.timezone)
                                        : "Срок не задан"}
                                </small>
                              </button>
                            ) : onCreate && data.date <= store.business_date && slotStatus(store, s) !== "not_expected" ? (
                              <button
                                className="w-report-cell"
                                onClick={() => onCreate(store, s)}
                                aria-label={`${store.code}, ${stageName(s)}: заполнить`}
                              >
                                <span className="w-cell-stage">{stageName(s)}</span>
                                <Status status={slotStatus(store, s)} />
                                <small>Открыть карточку</small>
                              </button>
                            ) : (
                              <Status status={slotStatus(store, s)} />
                            )}
                          </td>
                        );
                      })}
                      <td>{current?.author || "—"}</td>
                      <td className="w-number" data-sort={current?.revenue == null ? null : Number(current.revenue)} data-export={current?.revenue == null ? null : Number(current.revenue)}>
                        <b>{current ? money(current.revenue) + " ₽" : "—"}</b>
                      </td>
                      <td data-export={current?.receipts ?? null}>{current?.receipts ?? "—"}</td>
                      <td data-export={current?.units ?? null}>{current?.units ?? "—"}</td>
                      <td data-sort={store.plan?.revenue == null ? null : Number(store.plan.revenue)} data-export={store.plan?.revenue == null ? null : Number(store.plan.revenue)}>{store.plan ? money(store.plan.revenue) + " ₽" : "—"}</td>
                      <td data-sort={percent} data-export={percent == null ? null : Math.round(percent)}>
                        <b>
                          {percent === null ? "—" : Math.round(percent) + "%"}
                        </b>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </DataTable>
          </div>
          {stores.length === 0 && (
            <div className="w-empty">
              По этим условиям магазинов нет. Измените поиск или фильтр.
            </div>
          )}
          <div className="w-table-note">
            Таблица показывает срез {stageName(stage)}. Чтобы посмотреть другое время, переключите вкладку сверху.
            «Нет отчёта» означает отсутствие показателей; «Опаздывает» — известный срок сдачи уже прошёл.
          </div>
        </section>
        <aside className="w-issues" aria-label="Замечания к отчётам">
          <div className="w-panel-heading">
            <h2>
              Вопросы к отчётам<span>{findings.length}</span>
            </h2>
            <CircleAlert size={18} />
          </div>
          <p className="w-issues-caption">
            Замечания к срезу {stageName(stage)}
          </p>
          {findings.slice(0, 12).map(({ store, report, finding }) => (
            <button
              key={finding.id}
              className="w-issue"
              onClick={() => onOpen(report.id)}
            >
              <span className="w-issue-type">{actionNames[finding.state]}</span>
              <b>{finding.message}</b>
              <p>
                {store.code} · {store.name}
              </p>
              <span className="w-issue-link">
                Открыть отчёт
                <ArrowRight size={15} />
              </span>
            </button>
          ))}
          {!findings.length && (
            <div className="w-empty">
              <CheckCircle2 size={26} />
              <p>Вопросов и автоматических замечаний пока нет. Пустые и неполные отчёты видны в фильтре «Требуют внимания». Вопрос можно задать из карточки.</p>
            </div>
          )}
          {findings.length > 12 && (
            <p className="w-issues-caption">
              Остальные замечания доступны в строках магазинов.
            </p>
          )}
        </aside>
      </div>
    </>
  );
}

function ReportDialog({
  store,
  report,
  date,
  user,
  onClose,
  onChange,
}: {
  store: StoreData;
  report: Report;
  date: string;
  user: User;
  onClose: () => void;
  onChange: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [history, setHistory] = useState<Revision[]>([]);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [historyOpen, setHistoryOpen] = useState(false);
  const [editing, setEditing] = useState(user.role === "store");
  const [questionOpen, setQuestionOpen] = useState(false);
  const [question, setQuestion] = useState("");
  const [sendingQuestion, setSendingQuestion] = useState(false);
  useEffect(() => {
    dialog.current?.showModal();
    const el = dialog.current;
    return () => el?.close();
  }, []);
  useEffect(() => {
    const abort = new AbortController();
    api<Report>("reports/" + report.id + "/", undefined, abort.signal)
      .then((r) => setHistory(r.history || []))
      .catch((e) => {
        if (!abort.signal.aborted) setError(errorText(e));
      });
    return () => abort.abort();
  }, [report.id, report.version, report.findings]);
  const isStore = user.role === "store";
  return (
    <dialog
      className="w-dialog"
      aria-labelledby="report-dialog-title"
      ref={dialog}
      onCancel={onClose}
    >
      <header className="w-dialog-head">
        <div>
          <span className="w-kicker">
            {store.code} · {dayText(date)}
          </span>
          <h2 id="report-dialog-title">
            {stageName(report.checkpoint)} ·{" "}
            {isStore ? "Показатели смены" : "Карточка отчёта"}
          </h2>
          <p>{store.name}</p>
        </div>
        <button
          autoFocus
          className="w-close"
          aria-label="Закрыть отчёт"
          onClick={onClose}
        >
          <X size={21} />
        </button>
      </header>
      <div className="w-dialog-content">
        <div className="w-report-meta">
          <Status status={report.status} />
          <span>
            {report.deadline
              ? "Срок: " + time(report.deadline, store.timezone, true)
              : report.imported
                ? "Время сдачи в источнике не указано"
                : "Срок не задан"}
          </span>
        </div>
        {report.first_received_at && (
          <p className="w-received">
            Первое получение:{" "}
            {time(report.first_received_at, store.timezone, true)} ·{" "}
            {store.timezone}
            {report.late && " · с опозданием"}
          </p>
        )}
        {error && <Notice error>{error}</Notice>}
        {notice && <Notice>{notice}</Notice>}
        {missingFields(report).length > 0 && <Notice><b>Почему нужна проверка:</b> не заполнены {missingFields(report).join(", ")}. Уточните значения у магазина и дополните отчёт.</Notice>}
        {!report.current && <Notice><b>Нет отчёта за {stageName(report.checkpoint)}.</b> Показатели этого среза отсутствуют. {report.deadline ? "Проверьте указанный срок сдачи." : "Срок неизвестен: это не подтверждённое опоздание."}</Notice>}
        {!isStore && <section className="w-question">
          <button className="secondary-button" onClick={() => setQuestionOpen(!questionOpen)}>{questionOpen ? "Скрыть вопрос" : "Задать вопрос магазину"}</button>
          {questionOpen && <form onSubmit={async (event) => {
            event.preventDefault(); setSendingQuestion(true); setError("");
            try { await api("reports/" + report.id + "/question/", {comment:question}); setQuestion(""); setQuestionOpen(false); setNotice("Вопрос сохранён. Продавец увидит его в этом отчёте; ответ появится здесь же."); onChange(); }
            catch (e) { setError(errorText(e)); } finally { setSendingQuestion(false); }
          }}>
            <label>Вопрос магазину<textarea required maxLength={2000} rows={3} value={question} onChange={(e) => setQuestion(e.target.value)} placeholder="Например: уточните количество алкогольных единиц на закрытие" /></label>
            <button className="primary-button" disabled={sendingQuestion}>{sendingQuestion ? "Сохраняем…" : "Сохранить вопрос"}</button>
          </form>}
        </section>}
        {user.role === "manager" && (
          <button
            className="secondary-button"
            style={{ marginBottom: 18 }}
            onClick={() => setEditing((v) => !v)}
          >
            {editing
              ? "Вернуться к просмотру"
              : report.current
                ? "Исправить показатели"
                : "Заполнить показатели"}
          </button>
        )}
        {editing ? (
          <ReportForm
            key={report.id + ":" + report.version}
            report={report}
            store={store}
            onSaved={(revision) => {
              setNotice(
                "Сохранено в " +
                  time(revision.received_at, store.timezone, true) +
                  ". Версия " +
                  revision.version +
                  ".",
              );
              onChange();
              if (user.role === "manager") setEditing(false);
            }}
          />
        ) : report.current ? (
          <>
            <div className="w-values">
              <div>
                <span>Выручка</span>
                <b>{money(report.current.revenue)} ₽</b>
              </div>
              <div>
                <span>Чеки</span>
                <b>{report.current.receipts ?? "—"}</b>
              </div>
              <div>
                <span>Алкогольные единицы</span>
                <b>{report.current.units ?? "—"}</b>
              </div>
              <div>
                <span>Ед/чек</span>
                <b>{report.current.units_per_receipt || "—"}</b>
              </div>
            </div>
            <p className="w-received">
              Сотрудник: {report.current.author} · версия {report.version}
              {report.current.origin === "sheets"
                ? " · из таблицы"
                : " · внёс: " + report.current.recorded_by}
            </p>
            {report.current.comment && (
              <blockquote className="w-comment">
                {report.current.comment}
              </blockquote>
            )}
          </>
        ) : (
          <Notice>Показатели ещё не отправлены сотрудником магазина.</Notice>
        )}
        {(report.source_data?.url || report.current?.source_data?.url) && (
          <p className="w-received">
            <a
              href={report.current?.source_data?.url || report.source_data.url}
              target="_blank"
              rel="noreferrer"
            >
              Открыть строку в исходной таблице
            </a>{" "}
            · лист {report.source_data.sheet}, строка {report.source_data.row}
          </p>
        )}
        {Object.entries({
          priority: "Приоритет",
          contacts: "Контакты",
          reserves: "Брони",
          returning: "Возвраты",
          losses: "Потери",
          responsible: "Ответственный",
        }).map(([key, label]) => {
          const value = (report.source_data as Record<string, unknown>)[key];
          return value != null && value !== "" ? (
            <p className="w-received" key={key}>
              <b>{label}:</b> {String(value)}
            </p>
          ) : null;
        })}
        {!!report.findings.length && (
          <section className="w-findings">
            <h3>Замечания и пояснения</h3>
            {report.findings.map((f) => (
              <FindingCard
                key={f.id + ":" + f.state + ":" + f.actions.length}
                finding={f}
                isStore={isStore}
                onChange={onChange}
                zone={store.timezone}
              />
            ))}
          </section>
        )}
        <button
          className="w-history-toggle"
          aria-expanded={historyOpen}
          onClick={() => setHistoryOpen(!historyOpen)}
        >
          <History size={17} />
          История отчёта · {history.length}
          <ChevronRight size={16} />
        </button>
        {historyOpen && (
          <ol className="w-history">
            {[...history].reverse().map((r) => (
              <li key={r.version}>
                <b>
                  Версия {r.version} · {money(r.revenue)} ₽ /{" "}
                  {r.receipts ?? "—"} чеков / {r.units ?? "—"} единиц
                </b>
                <small>
                  {r.author} ·{" "}
                  {r.origin === "sheets"
                    ? "Из таблицы · время сдачи неизвестно"
                    : time(r.received_at, store.timezone, true)}
                </small>
                <p>
                  {r.comment ||
                    (r.origin === "sheets"
                      ? "Перенесено из источника"
                      : "Первичная отправка")}
                </p>
              </li>
            ))}
            {!history.length && <li>Отчёт ещё не отправлен.</li>}
          </ol>
        )}
      </div>
    </dialog>
  );
}

function ReportForm({
  report,
  store,
  onSaved,
}: {
  report: Report;
  store: StoreData;
  onSaved: (r: Revision) => void;
}) {
  const [revenue, setRevenue] = useState(report.current?.revenue || "");
  const [receipts, setReceipts] = useState(
    report.current?.receipts != null ? String(report.current.receipts) : "",
  );
  const [units, setUnits] = useState(
    report.current?.units != null ? String(report.current.units) : "",
  );
  const [comment, setComment] = useState("");
  const [employee, setEmployee] = useState(
    report.current?.employee || report.source_data?.employee || "",
  );
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [conflict, setConflict] = useState(false);
  const request = useRef({ signature: "", id: "" });
  const previous = store.reports
    .filter(
      (r) =>
        stages.indexOf(r.checkpoint) < stages.indexOf(report.checkpoint) &&
        r.current,
    )
    .at(-1);
  const numericRevenue = Number(revenue.replaceAll(" ", "").replace(",", "."));
  const available =
    !report.available_at || new Date(report.available_at) <= new Date();
  const percent =
    store.plan &&
    Number(store.plan.revenue) > 0 &&
    revenue !== "" &&
    Number.isFinite(numericRevenue)
      ? Math.round((numericRevenue / Number(store.plan.revenue)) * 100)
      : null;
  async function save(event: React.SubmitEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const payload = {
      revenue,
      receipts,
      units,
      comment,
      employee,
      version: report.version,
    };
    const signature = JSON.stringify(payload);
    if (request.current.signature !== signature)
      request.current = { signature, id: crypto.randomUUID() };
    try {
      const result = await api<{ revision: Revision }>(
        "reports/" + report.id + "/",
        { ...payload, request_id: request.current.id },
      );
      onSaved(result.revision);
    } catch (e) {
      setError(errorText(e));
      if (e instanceof ApiError && e.status === 409) setConflict(true);
    } finally {
      setBusy(false);
    }
  }
  return (
    <form className="w-report-form" onSubmit={save}>
      <div className="w-form-intro">
        <b>Накопительным итогом</b>
        <p>
          С начала смены до {stageName(report.checkpoint).toLowerCase()}. Если
          продаж не было, укажите нули.
        </p>
      </div>
      {previous?.current && (
        <div className="w-previous">
          <span>На {stageName(previous.checkpoint)}</span>
          <b>
            {money(previous.current.revenue)} ₽ · {previous.current.receipts}{" "}
            чеков · {previous.current.units} ед.
          </b>
        </div>
      )}
      <fieldset disabled={busy || !available || conflict}>
        <label>
          Сотрудник магазина
          <input
            name="employee"
            list="report-employees"
            required
            maxLength={200}
            value={employee}
            onChange={(e) => setEmployee(e.target.value)}
            placeholder="Выберите ФИО или впишите сотрудника на подмене"
          />
          <datalist id="report-employees">
            {store.employees
              ?.filter((p) => p.slot !== "curator")
              .map((p) => (
                <option key={p.slot} value={p.employee__name} />
              ))}
          </datalist>
        </label>
        <label>
          Выручка, ₽
          <input
            name="revenue"
            inputMode="decimal"
            required
            autoComplete="off"
            value={revenue}
            onChange={(e) => setRevenue(e.target.value)}
          />
        </label>
        <div className="w-two-fields">
          <label>
            Количество чеков
            <input
              name="receipts"
              inputMode="numeric"
              required
              pattern="[0-9]+"
              value={receipts}
              onChange={(e) => setReceipts(e.target.value)}
            />
          </label>
          <label>
            Алкогольные единицы
            <input
              name="units"
              inputMode="numeric"
              required
              pattern="[0-9]+"
              value={units}
              onChange={(e) => setUnits(e.target.value)}
            />
          </label>
        </div>
        <div className="w-calculated">
          <div>
            <span>Единиц на чек</span>
            <b>
              {Number(receipts) > 0 && units !== ""
                ? money(Number(units) / Number(receipts))
                : "—"}
            </b>
          </div>
          <div>
            <span>Выполнение плана</span>
            <b>{percent === null ? "—" : percent + "%"}</b>
          </div>
        </div>
        <label>
          {report.version ? "Причина исправления" : "Пояснение, если нужно"}
          <textarea
            name="comment"
            required={report.version > 0}
            maxLength={2000}
            rows={3}
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder={
              report.version
                ? "Что изменилось и почему"
                : "Возвраты, необычные показатели или другие обстоятельства"
            }
          />
        </label>
      </fieldset>
      {error && <Notice error>{error}</Notice>}
      {!available && (
        <Notice>
          Форма откроется в {time(report.available_at, store.timezone, true)} по
          времени магазина.
        </Notice>
      )}
      {conflict && (
        <button
          type="button"
          className="secondary-button"
          onClick={() => location.reload()}
        >
          Загрузить актуальную версию
        </button>
      )}
      <button
        className="primary-button w-submit"
        disabled={busy || !available || conflict}
      >
        {busy
          ? "Сохраняем…"
          : report.version
            ? "Сохранить исправление"
            : "Отправить отчёт"}
        <Send size={17} />
      </button>
      <small className="w-form-note">
        Время получения фиксируется после сохранения на сервере.
      </small>
    </form>
  );
}

function FindingCard({
  finding,
  isStore,
  onChange,
  zone,
}: {
  finding: Finding;
  isStore: boolean;
  onChange: () => void;
  zone: string;
}) {
  const [action, setAction] = useState(isStore ? "reply" : "requested");
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function send(event: React.SubmitEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api("findings/" + finding.id + "/action/", { action, comment });
      setComment("");
      onChange();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <article
      className={"w-finding " + (!active(finding) ? "w-finding-closed" : "")}
    >
      <span className="w-issue-type">{actionNames[finding.state]}</span>
      <p>
        <b>{finding.message}</b>
      </p>
      {finding.actions.map((a, i) => (
        <blockquote className="w-comment" key={i}>
          <small>
            {a.author} · {actionNames[a.action]} · {time(a.at, zone, true)}
          </small>
          <p>{a.comment}</p>
        </blockquote>
      ))}
      {active(finding) && (
        <form onSubmit={send}>
          {!isStore && (
            <label>
              Действие
              <select
                value={action}
                onChange={(e) => setAction(e.target.value)}
              >
                <option value="requested">Запросить пояснение</option>
                <option value="accepted">Подтвердить исключение</option>
                <option value="escalated">Передать руководителю</option>
              </select>
            </label>
          )}
          <label>
            {isStore ? "Ответ видеоконтролю" : "Комментарий"}
            <textarea
              required
              maxLength={2000}
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              rows={2}
            />
          </label>
          {error && <Notice error>{error}</Notice>}
          <button className="secondary-button" disabled={busy}>
            {busy
              ? "Сохраняем…"
              : isStore
                ? "Отправить пояснение"
                : "Сохранить решение"}
            <Check size={16} />
          </button>
        </form>
      )}
    </article>
  );
}
