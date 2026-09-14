import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import {
  ArrowDownLeft,
  ArrowDownToLine,
  ArrowRight,
  ArrowUpRight,
  Bell,
  CalendarDays,
  Check,
  CheckCheck,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleHelp,
  Clock3,
  FileCheck2,
  FileClock,
  History,
  LayoutDashboard,
  ListFilter,
  LogOut,
  MessageSquare,
  MoreHorizontal,
  PanelLeftClose,
  Search,
  Send,
  Settings2,
  ShieldCheck,
  Store,
  Users,
  X,
  CircleAlert,
  Radio,
  Network,
  CheckCircle2,
} from "lucide-react";
import "@fontsource-variable/golos-text";
import "@fontsource-variable/manrope";
import "@fontsource/ibm-plex-mono/400.css";
import "./styles.css";
import "./readability.css";

type Variant = "a" | "b" | "c";
type Status = "ok" | "missing" | "review" | "late";
type StoreRow = {
  code: string;
  name: string;
  city: string;
  network: string;
  employee: string;
  initials: string;
  revenue: string;
  percent: number;
  status: Status;
  time: string;
};
const rows: StoreRow[] = [
  {
    code: "ММ-020",
    name: "Бульвар Юности, 5Б",
    city: "Белгород",
    network: "Мильстрим",
    employee: "Мария Иванова",
    initials: "МИ",
    revenue: "29 400",
    percent: 41,
    status: "review",
    time: "17:02",
  },
  {
    code: "КК-001",
    name: "Гражданский проспект",
    city: "Белгород",
    network: "Культура крепкого",
    employee: "Анна Петрова",
    initials: "АП",
    revenue: "—",
    percent: 0,
    status: "missing",
    time: "—",
  },
  {
    code: "ММ-025",
    name: "Хмелева, 63/1",
    city: "Старый Оскол",
    network: "Мильстрим",
    employee: "Елена Соколова",
    initials: "ЕС",
    revenue: "—",
    percent: 0,
    status: "missing",
    time: "—",
  },
  {
    code: "ММ-019",
    name: "Попутная, 15А",
    city: "Белгород",
    network: "Мильстрим",
    employee: "Ольга Смирнова",
    initials: "ОС",
    revenue: "61 040",
    percent: 85,
    status: "ok",
    time: "16:58",
  },
  {
    code: "КК-002",
    name: "Есенина",
    city: "Белгород",
    network: "Культура крепкого",
    employee: "Ирина Волкова",
    initials: "ИВ",
    revenue: "54 820",
    percent: 87,
    status: "ok",
    time: "17:01",
  },
  {
    code: "ММ-031",
    name: "Станке Димитрова, 77Б",
    city: "Брянск",
    network: "Мильстрим",
    employee: "Наталья Морозова",
    initials: "НМ",
    revenue: "38 150",
    percent: 76,
    status: "late",
    time: "17:08",
  },
  {
    code: "ММ-018",
    name: "Ленина, 1А",
    city: "Белгород",
    network: "Мильстрим",
    employee: "Татьяна Орлова",
    initials: "ТО",
    revenue: "46 280",
    percent: 92,
    status: "ok",
    time: "17:00",
  },
  {
    code: "КК-007",
    name: "Уютный",
    city: "Старый Оскол",
    network: "Культура крепкого",
    employee: "Дарья Кузнецова",
    initials: "ДК",
    revenue: "51 225",
    percent: 95,
    status: "ok",
    time: "17:03",
  },
];
const variantMeta = {
  a: {
    name: "Рабочий стол",
    note: "Общая таблица и быстрый контроль",
    number: "01",
  },
  b: { name: "Фокус", note: "Сначала замечания, затем детали", number: "02" },
  c: {
    name: "Диспетчерская",
    note: "Состояние сети на одном экране",
    number: "03",
  },
};
const statusNames = {
  ok: "Принят",
  missing: "Не отправлен",
  review: "Проверить",
  late: "С опозданием",
};
const statusIcons = {
  ok: CheckCheck,
  missing: Clock3,
  review: CircleAlert,
  late: FileClock,
};

function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <div className={`brand ${compact ? "compact" : ""}`}>
      <span className="brand-symbol">
        <i />
        <i />
        <i />
      </span>
      <span>
        срез<span className="brand-caption">контроль розницы</span>
      </span>
    </div>
  );
}
function Badge({
  status,
  children,
}: {
  status: Status;
  children?: React.ReactNode;
}) {
  const Icon = statusIcons[status];
  return (
    <span className={`badge ${status}`}>
      <Icon size={13} />
      {children || statusNames[status]}
    </span>
  );
}
function IconButton({
  children,
  label,
  onClick,
}: {
  children: React.ReactNode;
  label: string;
  onClick?: () => void;
}) {
  return (
    <button
      className="icon-button"
      aria-label={label}
      title={label}
      onClick={onClick}
    >
      {children}
    </button>
  );
}
function User({ office = true }: { office?: boolean }) {
  return (
    <div className="user">
      <span className="avatar">{office ? "АК" : "ОС"}</span>
      <div>
        <b>{office ? "Алексей Козлов" : "Ольга Смирнова"}</b>
        <small>{office ? "Видеоконтроль" : "Сотрудник магазина"}</small>
      </div>
    </div>
  );
}
function Periods({
  mobile = false,
  onChange,
}: {
  mobile?: boolean;
  onChange?: (v: string) => void;
}) {
  const [selected, setSelected] = useState("17:00");
  return (
    <div className={`periods ${mobile ? "mobile-periods" : ""}`}>
      {["13:00", "17:00", "Закрытие"].map((p, i) => (
        <button
          key={p}
          className={selected === p ? "selected" : ""}
          aria-pressed={selected === p}
          onClick={() => {
            setSelected(p);
            onChange?.(p);
          }}
        >
          <span className="period-icon">
            {i === 0 ? (
              <Check size={14} />
            ) : i === 1 ? (
              <Clock3 size={15} />
            ) : (
              <span className="empty-dot" />
            )}
          </span>
          <span>
            {p}
            <small>
              {i === 0 ? "Отчёт принят" : i === 1 ? "Текущий срез" : "До 22:15"}
            </small>
          </span>
          {mobile && i === 1 && <span className="period-dot" />}
        </button>
      ))}
    </div>
  );
}

function PrototypeBar({ variant, role }: { variant: Variant; role: string }) {
  return (
    <div className="prototype-bar">
      <a className="prototype-label" href="?">
        Варианты интерфейса
      </a>
      <div className="prototype-options">
        {(["a", "b", "c"] as Variant[]).map((v) => (
          <a
            key={v}
            href={`?v=${v}&role=${role}`}
            className={variant === v ? "active" : ""}
          >
            {variantMeta[v].number}
            <span>{variantMeta[v].name}</span>
          </a>
        ))}
      </div>
      <a
        className="role-switch"
        href={`?v=${variant}&role=${role === "office" ? "store" : "office"}`}
      >
        {role === "office" ? (
          <Store size={14} />
        ) : (
          <LayoutDashboard size={14} />
        )}
        <span>{role === "office" ? "Экран магазина" : "Кабинет офиса"}</span>
        <ArrowUpRight size={14} />
      </a>
    </div>
  );
}

function SideNav({ notify }: { notify: (v: string) => void }) {
  return (
    <aside className="sidebar" aria-label="Навигация кабинета">
      <Brand />
      <button
        className="network-switch"
        onClick={() =>
          notify(
            "Демонстрация: подключены две сети — Мильстрим и Культура крепкого.",
          )
        }
      >
        <span className="network-icon">
          <Network size={17} />
        </span>
        <span>
          Розничная сеть<small>2 сети · 82 магазина</small>
        </span>
        <ChevronDown size={14} />
      </button>
      <p className="nav-label">РАБОЧЕЕ МЕСТО</p>
      <nav aria-label="Рабочее место">
        <button className="active">
          <LayoutDashboard size={18} />
          Обзор смены<span className="nav-count">8</span>
        </button>
        <button
          onClick={() =>
            document
              .querySelector(".table-area")
              ?.scrollIntoView({ behavior: "smooth" })
          }
        >
          <FileCheck2 size={18} />
          Отчёты магазинов
        </button>
        <button
          onClick={() =>
            document
              .querySelector(".issue-panel")
              ?.scrollIntoView({ behavior: "smooth" })
          }
        >
          <MessageSquare size={18} />
          Замечания<span className="nav-count plain">3</span>
        </button>
        <button
          onClick={() =>
            notify(
              "История будет показывать исходный отчёт и каждое исправление с автором и временем.",
            )
          }
        >
          <History size={18} />
          История изменений
        </button>
      </nav>
      <p className="nav-label second">УПРАВЛЕНИЕ</p>
      <nav aria-label="Управление сетью">
        <button
          onClick={() =>
            notify(
              "В реестре будут магазины, графики работы и назначенные ответственные.",
            )
          }
        >
          <Store size={18} />
          Магазины
        </button>
        <button
          onClick={() =>
            notify(
              "Изменять планы смогут только сотрудники с соответствующими правами.",
            )
          }
        >
          <CalendarDays size={18} />
          Планы и графики
        </button>
        <button
          onClick={() =>
            notify("Доступ будет назначаться персонально по роли и магазинам.")
          }
        >
          <Users size={18} />
          Сотрудники
        </button>
      </nav>
      <div className="sidebar-bottom">
        <div className="help-card">
          <ShieldCheck size={21} />
          <b>Каждый отчёт на месте</b>
          <p>
            Изменения сохраняются
            <br />в истории смены.
          </p>
        </div>
        <User />
        <IconButton
          label="Свернуть меню"
          onClick={() => notify("В макете навигация показана полностью.")}
        >
          <PanelLeftClose size={16} />
        </IconButton>
      </div>
    </aside>
  );
}

function TopNav({
  variant,
  notify,
}: {
  variant: Variant;
  notify: (v: string) => void;
}) {
  return (
    <header className="top-nav">
      <Brand />
      <nav>
        <button className="active">
          {variant === "b" ? "Рабочая смена" : "Обзор сети"}
        </button>
        <button
          onClick={() =>
            document
              .querySelector(".table-area")
              ?.scrollIntoView({ behavior: "smooth" })
          }
        >
          Магазины
        </button>
        <button
          onClick={() => notify("История будет содержать все версии отчётов.")}
        >
          История
        </button>
        <button
          onClick={() =>
            notify("Планы и графики доступны ответственному руководителю.")
          }
        >
          Планы и графики
        </button>
      </nav>
      <div className="top-nav-right">
        <span className="live-dot" />
        <span>{variant === "c" ? "НА СВЯЗИ" : "Система работает"}</span>
        <IconButton
          label="Уведомления"
          onClick={() =>
            notify("В демонстрационной смене 8 магазинов требуют внимания.")
          }
        >
          <Bell size={18} />
        </IconButton>
        <span className="avatar">АК</span>
      </div>
    </header>
  );
}

function Stats({ variant }: { variant: Variant }) {
  return (
    <div className={`stats stats-${variant}`}>
      <article className="stat accepted">
        <div className="stat-label">
          <span>Отчёты приняты</span>
          <CheckCircle2 size={18} />
        </div>
        <div className="stat-value">
          74<span>/ 82</span>
        </div>
        <div className="stat-foot">
          <span className="mini-dot" />в том числе 1 с опозданием
        </div>
      </article>
      <article className="stat absent">
        <div className="stat-label">
          <span>Ещё не отправили</span>
          <Clock3 size={18} />
        </div>
        <div className="stat-value">
          5<small>магазинов</small>
        </div>
        <div className="stat-foot">Срок сдачи был в 17:05</div>
      </article>
      <article className="stat attention">
        <div className="stat-label">
          <span>Нужно проверить</span>
          <CircleAlert size={18} />
        </div>
        <div className="stat-value">
          3<small>отчёта</small>
        </div>
        <div className="stat-foot">Ожидают вашего решения</div>
      </article>
      <article className="stat progress-stat">
        <div className="stat-label">
          <span>Получено за срез</span>
          <Radio size={18} />
        </div>
        <div className="stat-value">
          94<span>%</span>
        </div>
        <div className="mini-progress">
          <i />
        </div>
        <div className="stat-foot">77 из 82 магазинов отчитались</div>
      </article>
    </div>
  );
}

function OfficeTable({
  variant,
  onSelect,
}: {
  variant: Variant;
  onSelect: (r: StoreRow) => void;
}) {
  const [filter, setFilter] = useState("all");
  const [query, setQuery] = useState("");
  const [network, setNetwork] = useState("all");
  const visible = rows.filter(
    (r) =>
      (filter === "all" ||
        (filter === "attention" && ["review", "missing"].includes(r.status)) ||
        r.status === filter) &&
      (network === "all" || r.network === network) &&
      `${r.name} ${r.city} ${r.code} ${r.employee}`
        .toLocaleLowerCase("ru")
        .includes(query.toLocaleLowerCase("ru")),
  );
  return (
    <section className="table-area">
      <div className="table-heading">
        <div>
          <h2>
            {variant === "c" ? "Матрица отчётности" : "Магазины и отчёты"}
          </h2>
          <span className="muted">14 сентября · срез 17:00</span>
        </div>
        <button
          className="text-button"
          onClick={() => {
            const blob = new Blob(
              [
                "\uFEFFКод;Магазин;Город;Статус;Выручка\n" +
                  visible
                    .map(
                      (r) =>
                        `${r.code};${r.name};${r.city};${statusNames[r.status]};${r.revenue}`,
                    )
                    .join("\n"),
              ],
              { type: "text/csv;charset=utf-8;" },
            );
            const a = document.createElement("a");
            a.href = URL.createObjectURL(blob);
            a.download = "demo-reports.csv";
            a.click();
            URL.revokeObjectURL(a.href);
          }}
        >
          <ArrowDownToLine size={15} />
          Выгрузить
        </button>
      </div>
      <div className="table-tools">
        <div className="filter-tabs">
          <button
            className={filter === "all" ? "active" : ""}
            onClick={() => setFilter("all")}
          >
            Все магазины<span>82</span>
          </button>
          <button
            className={filter === "attention" ? "active" : ""}
            onClick={() => setFilter("attention")}
          >
            Требуют внимания<span>8</span>
          </button>
        </div>
        <IconButton
          label="Только опоздания"
          onClick={() => setFilter(filter === "late" ? "all" : "late")}
        >
          <ListFilter size={16} />
        </IconButton>
      </div>
      <div className="search-row">
        <label className="search-input">
          <Search size={16} />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Магазин, город или сотрудник"
            aria-label="Поиск магазина"
          />
          <kbd>/</kbd>
        </label>
        <select
          aria-label="Фильтр по сети"
          value={network}
          onChange={(e) => setNetwork(e.target.value)}
        >
          <option value="all">Обе сети</option>
          <option>Мильстрим</option>
          <option>Культура крепкого</option>
        </select>
      </div>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Магазин</th>
              {variant !== "c" && <th>Сотрудник</th>}
              <th className="numeric">
                Выручка, ₽<small>накопительно</small>
              </th>
              {variant === "c" && <th>13:00</th>}
              <th>17:00</th>
              {variant === "c" && <th>Закрытие</th>}
              <th className="row-arrow"><span className="sr-only">Действия</span></th>
            </tr>
          </thead>
          <tbody>
            {visible.map((r, i) => (
              <tr
                key={r.code}
                className={`${r.status === "review" ? "review-row" : ""}`}
                onClick={() => onSelect(r)}
              >
                <td>
                  <div className="store-title">
                    <span
                      className={`store-network ${r.network === "Мильстрим" ? "mm" : "kk"}`}
                    >
                      {r.network === "Мильстрим" ? "М" : "К"}
                    </span>
                    <div>
                      <b>{r.name}</b>
                      <small>
                        {r.city}
                        <span className="cell-separator">·</span>
                        {r.code}
                      </small>
                    </div>
                  </div>
                </td>
                {variant !== "c" && (
                  <td>
                    <span className="employee-name">{r.employee}</span>
                    <small className="cell-small">{r.network}</small>
                  </td>
                )}
                <td className="numeric">
                  <b>{r.revenue}</b>
                  <small className="cell-small">
                    {r.revenue === "—"
                      ? "Нет данных"
                      : `${r.percent}% дневного плана`}
                  </small>
                </td>
                {variant === "c" && (
                  <td>
                    <span className="matrix-ok">
                      <Check size={13} />
                      {i % 2 === 0 ? "12:59" : "13:02"}
                    </span>
                  </td>
                )}
                <td>
                  <Badge status={r.status} />
                  <small className="cell-small receipt-time">
                    {r.time === "—" ? "Ожидаем отчёт" : `Получен в ${r.time}`}
                  </small>
                </td>
                {variant === "c" && (
                  <td>
                    <span className="matrix-wait">
                      —<small>до 22:15</small>
                    </span>
                  </td>
                )}
                <td>
                  <IconButton
                    label={`Открыть ${r.code}`}
                    onClick={() => onSelect(r)}
                  >
                    <ChevronRight size={15} />
                  </IconButton>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!visible.length && (
          <div className="empty-state">
            Магазины не найдены. Измените поиск или фильтр.
          </div>
        )}
      </div>
      <div className="table-footer">
        <span>Показано {visible.length} из 82 · демонстрационная выборка</span>
        <span className="table-page">
          1<ChevronRight size={15} />
        </span>
      </div>
    </section>
  );
}

function IssuePanel({
  onSelect,
  notify,
}: {
  onSelect: (r: StoreRow) => void;
  notify: (v: string) => void;
}) {
  return (
    <aside className="issue-panel" aria-label="Замечания и напоминания">
      <div className="issue-panel-title">
        <span className="issue-icon">
          <CircleAlert size={17} />
        </span>
        <h2>Нужен ваш ответ</h2>
        <span className="count-outline">3</span>
      </div>
      <p className="muted">Замечания к текущему срезу</p>
      <div className="issue-card">
        <div className="issue-card-meta">
          <span>ММ-020</span>
          <span>10 мин назад</span>
        </div>
        <h3>Выручка уменьшилась</h3>
        <p>
          Бульвар Юности, 5Б<span>Белгород · Мария Иванова</span>
        </p>
        <div className="value-change">
          <span>
            <small>13:00</small>32 600 ₽
          </span>
          <ArrowRight size={17} />
          <span className="decrease">
            <small>17:00</small>29 400 ₽
          </span>
        </div>
        <div className="issue-explanation">
          <ArrowDownLeft size={15} />
          <span>−3 200 ₽ · возможно, был возврат</span>
        </div>
        <button className="primary-button" onClick={() => onSelect(rows[0])}>
          Разобрать замечание
          <ArrowRight size={15} />
        </button>
      </div>
      <div className="compact-issue">
        <span className="warning-square">
          <Clock3 size={17} />
        </span>
        <div>
          <b>5 магазинов не отчитались</b>
          <p>Срок сдачи прошёл 7 минут назад</p>
          <button
            className="text-button"
            onClick={() =>
              notify(
                "Демо: напоминания поставлены в очередь. Реальная отправка в Telegram ещё не подключена.",
              )
            }
          >
            Напомнить в Telegram
            <ArrowUpRight size={13} />
          </button>
        </div>
      </div>
      <div className="compact-issue">
        <span className="warning-square neutral">
          <FileClock size={17} />
        </span>
        <div>
          <b>Один отчёт с опозданием</b>
          <p>Станке Димитрова, 77Б · 17:08</p>
          <button className="text-button" onClick={() => onSelect(rows[5])}>
            Посмотреть историю
            <ArrowRight size={13} />
          </button>
        </div>
      </div>
      <div className="next-period">
        <Clock3 size={17} />
        <div>
          <small>СЛЕДУЮЩИЙ СРЕЗ</small>
          <b>Закрытие магазинов</b>
          <p>По графику каждой точки</p>
        </div>
      </div>
    </aside>
  );
}

function FocusWorkspace({
  notify,
  onSelect,
}: {
  notify: (v: string) => void;
  onSelect: (r: StoreRow) => void;
}) {
  const [active, setActive] = useState(0);
  return (
    <div className="focus-workspace">
      <section className="focus-queue">
        <div className="section-kicker">
          ОЧЕРЕДЬ НА РАЗБОР<span>8 магазинов</span>
        </div>
        <h2>
          Начнём с того,
          <br />
          что требует внимания
        </h2>
        <p className="muted">
          Полные и корректные отчёты уже приняты.
          <br />
          Здесь — только вопросы к текущему срезу.
        </p>
        <div className="focus-tabs">
          <button className="active">
            Замечания <b>3</b>
          </button>
          <button
            onClick={() =>
              notify("Демо: 5 магазинов не прислали отчёт к сроку 17:05.")
            }
          >
            Не отправлены <b>5</b>
          </button>
        </div>
        {[
          {
            title: "Выручка меньше предыдущего среза",
            store: "Бульвар Юности, 5Б",
            code: "ММ-020",
            detail: "Белгород · 17:02",
            type: "review",
          },
          {
            title: "Нужно пояснение к возврату",
            store: "Громобоя, 15",
            code: "ММ-042",
            detail: "Иваново · 17:02",
            type: "review",
          },
          {
            title: "Необычное количество единиц",
            store: "Учебный магазин № 3",
            code: "ДЕМО-03",
            detail: "Тестовая точка · 17:01",
            type: "review",
          },
        ].map((issue, i) => (
          <button
            className={`focus-ticket ${active === i ? "selected" : ""}`}
            key={issue.code}
            onClick={() => {
              setActive(i);
              if (i > 0)
                notify(
                  "Демо: подробно показан сценарий уменьшения выручки в первом замечании.",
                );
            }}
          >
            <div>
              <span className="ticket-index">
                {String(i + 1).padStart(2, "0")}
              </span>
              <span className="ticket-time">{issue.detail}</span>
              <ChevronRight size={17} />
            </div>
            <h3>{issue.title}</h3>
            <p>{issue.store}</p>
            <span className="ticket-code">{issue.code}</span>
          </button>
        ))}
      </section>
      <section className="focus-detail">
        <div className="detail-eyebrow">
          <span className="network-tag">МИЛЬСТРИМ</span>
          <span className="muted">ММ-020</span>
          <IconButton
            label="Действия с замечанием"
            onClick={() => onSelect(rows[0])}
          >
            <MoreHorizontal size={18} />
          </IconButton>
        </div>
        <div className="focus-detail-header">
          <div>
            <h2>Бульвар Юности, 5Б</h2>
            <p>Белгород</p>
          </div>
          <Badge status="review">Требует пояснения</Badge>
        </div>
        <div className="shift-person">
          <span className="avatar">МИ</span>
          <div>
            <b>Мария Иванова</b>
            <small>На смене сегодня · до 22:00</small>
          </div>
          <button
            className="text-button"
            onClick={() =>
              notify(
                "Демо: карточка сотрудника будет содержать доступные рабочие контакты.",
              )
            }
          >
            <MessageSquare size={16} />
            Связаться
          </button>
        </div>
        <div className="comparison-title">
          <h3>Что изменилось за срез</h3>
          <span>Накопительные данные</span>
        </div>
        <div className="comparison-table">
          <div className="comparison-row comparison-head">
            <span>Показатель</span>
            <span>13:00</span>
            <span>17:00</span>
          </div>
          <div className="comparison-row emphasized">
            <span>Выручка</span>
            <b>32 600 ₽</b>
            <b>
              29 400 ₽<small>−3 200 ₽</small>
            </b>
          </div>
          <div className="comparison-row">
            <span>Количество чеков</span>
            <b>17</b>
            <b>16</b>
          </div>
          <div className="comparison-row">
            <span>Алкогольные единицы</span>
            <b>22</b>
            <b>20</b>
          </div>
        </div>
        <div className="reason-callout">
          <CircleAlert size={19} />
          <div>
            <b>Возможно, оформлен возврат</b>
            <p>
              Показатели уменьшились. Запросите пояснение у сотрудника, прежде
              чем принимать решение.
            </p>
          </div>
        </div>
        <div className="detail-action">
          <button
            className="primary-button"
            onClick={() =>
              notify(
                "Демо: запрос пояснения подготовлен. Сообщения сотрудникам не отправлялись.",
              )
            }
          >
            <Send size={16} />
            Запросить пояснение
          </button>
          <button
            className="secondary-button"
            onClick={() => onSelect(rows[0])}
          >
            Открыть отчёт
            <ArrowUpRight size={15} />
          </button>
        </div>
        <div className="history-preview">
          <div>
            <History size={16} />
            <b>История отчёта</b>
          </div>
          <p>
            <span className="history-dot" />
            <time>17:02</time>Отчёт получен · Мария Иванова
          </p>
          <p>
            <span className="history-dot warning" />
            <time>17:02</time>Найдено уменьшение показателей
          </p>
        </div>
      </section>
    </div>
  );
}

function EventStream({ notify }: { notify: (v: string) => void }) {
  return (
    <aside className="event-stream">
      <div className="stream-head">
        <h2>Лента смены</h2>
        <span className="live-dot" />
      </div>
      <p className="muted">Последние события</p>
      {[
        {
          time: "17:08",
          type: "late",
          title: "Отчёт получен с опозданием",
          desc: "ММ-031 · Брянск",
          detail: "На 3 минуты позже срока",
        },
        {
          time: "17:05",
          type: "missing",
          title: "5 отчётов ещё не поступили",
          desc: "Контроль срока сдачи",
          detail: "Ожидаем данные магазинов",
        },
        {
          time: "17:03",
          type: "ok",
          title: "Отчёт принят",
          desc: "КК-007 · Старый Оскол",
          detail: "Замечаний нет",
        },
        {
          time: "17:02",
          type: "review",
          title: "Уменьшение выручки",
          desc: "ММ-020 · Белгород",
          detail: "32 600 → 29 400 ₽",
        },
        {
          time: "17:01",
          type: "ok",
          title: "Отчёт принят",
          desc: "КК-002 · Белгород",
          detail: "Замечаний нет",
        },
        {
          time: "17:00",
          type: "ok",
          title: "Отчёт принят",
          desc: "ММ-018 · Белгород",
          detail: "Замечаний нет",
        },
      ].map((e, i) => (
        <div className={`stream-event ${e.type}`} key={i}>
          <time>{e.time}</time>
          <span className="event-dot" />
          <div>
            <b>{e.title}</b>
            <p>{e.desc}</p>
            <small>{e.detail}</small>
          </div>
        </div>
      ))}
      <button
        className="secondary-button"
        onClick={() =>
          notify(
            "Демонстрационная лента показывает последние шесть событий смены.",
          )
        }
      >
        <History size={15} />
        Вся история смены
        <ArrowRight size={14} />
      </button>
      <div className="stream-note">
        <ShieldCheck size={18} />
        <p>Получение отчёта и каждое исправление записываются в историю.</p>
      </div>
    </aside>
  );
}

function DetailDialog({
  row,
  onClose,
  notify,
}: {
  row: StoreRow;
  onClose: () => void;
  notify: (v: string) => void;
}) {
  return (
    <div className="dialog-backdrop" onClick={onClose}>
      <section
        className="detail-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="dialog-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="dialog-head">
          <span className="muted">{row.code} · демо</span>
          <IconButton label="Закрыть отчёт" onClick={onClose}>
            <X size={20} />
          </IconButton>
        </div>
        <h2 id="dialog-title">{row.name}</h2>
        <p>
          {row.city} · {row.employee}
        </p>
        <Badge status={row.status} />
        <div className="dialog-values">
          <span>
            Срез<b>17:00</b>
          </span>
          <span>
            Выручка<b>{row.revenue} ₽</b>
          </span>
          <span>
            Получен<b>{row.time}</b>
          </span>
        </div>
        <div className="reason-callout">
          <CircleAlert size={20} />
          <p>
            {row.status === "review"
              ? "Необходимо проверить показатели и получить пояснение сотрудника."
              : row.status === "missing"
                ? "К сроку 17:05 отчёт не поступил. Отправьте сотруднику напоминание."
                : row.status === "late"
                  ? "Отчёт получен в 17:08. Опоздание на 3 минуты останется в истории."
                  : "Обязательные показатели заполнены. Замечаний к отчёту нет."}
          </p>
        </div>
        <label className="comment-label">
          Комментарий видеоконтроля
          <textarea placeholder="Зафиксируйте причину или результат проверки" />
        </label>
        <button
          className="primary-button"
          onClick={() => {
            notify(
              "Комментарий сохранён в демонстрации. Серверное сохранение пока не подключено.",
            );
            onClose();
          }}
        >
          Сохранить комментарий
          <Check size={16} />
        </button>
      </section>
    </div>
  );
}

function Office({
  variant,
  notify,
}: {
  variant: Variant;
  notify: (v: string) => void;
}) {
  const [selected, setSelected] = useState<StoreRow | null>(null);
  return (
    <div className={`office-layout office-${variant}`}>
      {variant === "a" ? (
        <SideNav notify={notify} />
      ) : (
        <TopNav variant={variant} notify={notify} />
      )}
      <main className="office-main">
        {variant === "a" && (
          <div className="office-topline">
            <span>
              Рабочее место <ChevronRight size={12} /> Обзор смены
            </span>
            <div>
              <span className="live-dot" /> Обновлено в 17:12
              <IconButton
                label="Уведомления"
                onClick={() =>
                  notify("8 магазинов требуют внимания в текущем срезе.")
                }
              >
                <Bell size={17} />
              </IconButton>
            </div>
          </div>
        )}
        <div className="page-title-row">
          <div>
            <div className="eyebrow">
              {variant === "a"
                ? "ПОНЕДЕЛЬНИК, 14 СЕНТЯБРЯ"
                : variant === "b"
                  ? "14 СЕНТЯБРЯ · ПОНЕДЕЛЬНИК"
                  : "ПОНЕДЕЛЬНИК / 14.09.2026"}
            </div>
            <h1>
              {variant === "a"
                ? "Смена под контролем"
                : variant === "b"
                  ? "Рабочая смена"
                  : "Контроль сети"}
              <span className="demo-indicator">ДЕМО</span>
              {variant === "c" && <span className="console-live">LIVE</span>}
            </h1>
            <p>
              {variant === "b"
                ? "Все отчёты собраны в одном месте. Разберите то, что требует внимания."
                : variant === "c"
                  ? "Видеоконтроль · обе сети · 82 магазина"
                  : "Отчётность магазинов за день — без пропущенных деталей."}
            </p>
          </div>
          {variant === "a" ? (
            <button
              className="date-button"
              onClick={() =>
                notify(
                  "В прототипе показана демонстрационная смена 14 сентября 2026 года.",
                )
              }
            >
              <CalendarDays size={16} />
              14 сентября 2026
              <ChevronDown size={14} />
            </button>
          ) : variant === "b" ? (
            <div className="focus-day-progress">
              <span>
                <b>77</b> / 82
              </span>
              <div>
                <b>магазина отчитались</b>
                <small>Срез 17:00 · срок до 17:05</small>
                <div className="mini-progress">
                  <i />
                </div>
              </div>
            </div>
          ) : (
            <div className="console-clock">
              <span>ВРЕМЯ ДЕЖУРСТВА, МСК</span>
              <b>
                17<span>:</span>12
              </b>
              <small>Демонстрационная смена</small>
            </div>
          )}
        </div>
        {variant !== "b" && (
          <Periods
            onChange={(v) =>
              notify(
                `Демо: сейчас подробно показан срез 17:00. Вы выбрали «${v}».`,
              )
            }
          />
        )}
        <Stats variant={variant} />
        {variant === "b" ? (
          <FocusWorkspace notify={notify} onSelect={setSelected} />
        ) : (
          <div className="office-workspace">
            <OfficeTable variant={variant} onSelect={setSelected} />
            {variant === "a" ? (
              <IssuePanel onSelect={setSelected} notify={notify} />
            ) : (
              <EventStream notify={notify} />
            )}
          </div>
        )}
        {variant === "b" && (
          <div className="focus-bottom">
            <span>
              <CheckCheck size={16} />
              74 отчёта приняты, 3 на проверке, 5 ожидаем
            </span>
            <button
              className="text-button"
              onClick={() =>
                notify("Общая таблица доступна в варианте «Рабочий стол».")
              }
            >
              Посмотреть все магазины
              <ArrowRight size={15} />
            </button>
          </div>
        )}
        <footer className="app-footer">
          <span>
            Демонстрационные данные · не подключено к рабочей отчётности
          </span>
          <span>Срез · Мильстрим / Культура крепкого</span>
        </footer>
      </main>
      {selected && (
        <DetailDialog
          row={selected}
          onClose={() => setSelected(null)}
          notify={notify}
        />
      )}
    </div>
  );
}

function StoreScreen({
  variant,
  notify,
}: {
  variant: Variant;
  notify: (v: string) => void;
}) {
  const [period, setPeriod] = useState("17:00");
  const [revenue, setRevenue] = useState("61040");
  const [checks, setChecks] = useState("23");
  const [units, setUnits] = useState("38");
  const [comment, setComment] = useState("");
  const [showComment, setShowComment] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitted, setSubmitted] = useState(false);
  const parse = (s: string) =>
    Number(s.replace(/[\s\u00a0]/g, "").replace(",", "."));
  const previous =
    period === "Закрытие"
      ? { time: "17:00", revenue: 61040, checks: 23, units: 38 }
      : period === "17:00"
        ? { time: "13:00", revenue: 24500, checks: 10, units: 18 }
        : { time: "", revenue: 0, checks: 0, units: 0 };
  const numericRevenue =
    revenue.trim() && Number.isFinite(parse(revenue)) ? parse(revenue) : null;
  const planPercent =
    numericRevenue === null ? null : Math.round((numericRevenue / 72000) * 100);
  const remaining =
    numericRevenue === null ? null : Math.max(0, 72000 - numericRevenue);
  function selectPeriod(value: string) {
    setPeriod(value);
    setSubmitted(false);
    setErrors({});
    setComment("");
    setShowComment(false);
    const data =
      value === "13:00"
        ? ["24500", "10", "18"]
        : value === "17:00"
          ? ["61040", "23", "38"]
          : ["86000", "32", "58"];
    setRevenue(data[0]);
    setChecks(data[1]);
    setUnits(data[2]);
  }
  function submit(e: React.SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    const next: Record<string, string> = {};
    for (const [k, v] of Object.entries({ revenue, checks, units })) {
      if (!v.trim())
        next[k] = "Заполните это поле. Если продаж не было, укажите 0.";
      else if (!Number.isFinite(parse(v))) next[k] = "Введите число";
      else if (k !== "revenue" && !Number.isInteger(parse(v)))
        next[k] = "Количество должно быть целым числом";
    }
    if (
      !Object.keys(next).length &&
      (parse(revenue) < previous.revenue ||
        parse(checks) < previous.checks ||
        parse(units) < previous.units) &&
      !comment.trim()
    ) {
      next.comment = "Показатели уменьшились. Опишите возврат или исправление.";
      setShowComment(true);
    }
    if (
      !Object.keys(next).length &&
      parse(checks) === 0 &&
      (parse(revenue) !== 0 || parse(units) !== 0) &&
      !comment.trim()
    ) {
      next.comment =
        "Указаны продажи при нулевом количестве чеков. Проверьте данные или добавьте пояснение.";
      setShowComment(true);
    }
    setErrors(next);
    if (!Object.keys(next).length) setSubmitted(true);
  }
  return (
    <div className={`store-screen store-${variant}`}>
      <header className="store-header">
        <Brand compact />
        <IconButton
          label="Помощь"
          onClick={() =>
            notify(
              "Вводите значения накопительным итогом с начала смены. При проблемах обратитесь к видеоконтролю.",
            )
          }
        >
          <CircleHelp size={21} />
        </IconButton>
      </header>
      <main className="store-main">
        <div className="store-location">
          <span className="store-location-icon">
            <Store size={19} />
          </span>
          <div>
            <small>МИЛЬСТРИМ · ММ-019</small>
            <b>Попутная, 15А</b>
            <span>Белгород</span>
          </div>
          <IconButton
            label="Сменить магазин"
            onClick={() =>
              notify(
                "При подмене здесь можно будет выбрать другой доступный магазин.",
              )
            }
          >
            <ChevronDown size={18} />
          </IconButton>
        </div>
        <div className="store-greeting">
          <span className="eyebrow">ПОНЕДЕЛЬНИК, 14 СЕНТЯБРЯ</span>
          <h1>{variant === "b" ? "Как проходит смена?" : "Отчёт за смену"}</h1>
          <div>
            <span className="small-avatar">ОС</span>Ольга Смирнова
            <span className="on-shift">
              <span />
              На смене
            </span>
          </div>
        </div>
        <Periods mobile onChange={selectPeriod} />
        {submitted ? (
          <section className="submission-success" role="status">
            <span>
              <CheckCheck size={32} />
            </span>
            <h2>Готово, отчёт заполнен</h2>
            <p>
              Демонстрация подтверждения
              <br />
              для среза {period}.
            </p>
            <div>
              В рабочем сервисе здесь будут
              <br />
              время приёма сервером и номер отчёта.
            </div>
            <button
              className="secondary-button"
              onClick={() => setSubmitted(false)}
            >
              Вернуться к отчёту
            </button>
          </section>
        ) : (
          <form className="report-form" onSubmit={submit} noValidate>
            <div className="form-heading">
              <div>
                <h2>Показатели на {period}</h2>
                <p>Накопительным итогом с начала дня</p>
              </div>
              <span className="deadline">
                <Clock3 size={13} />
                {period === "17:00"
                  ? "до 17:05"
                  : period === "13:00"
                    ? "до 13:05"
                    : "до 22:15"}
              </span>
            </div>
            <label className="number-field">
              Выручка
              <div className={`input-wrap ${errors.revenue ? "invalid" : ""}`}>
                <input
                  aria-label="Выручка"
                  inputMode="decimal"
                  value={revenue}
                  onChange={(e) => setRevenue(e.target.value)}
                  aria-invalid={!!errors.revenue}
                />
                <span>₽</span>
              </div>
              <small>
                {errors.revenue ||
                  (previous.time
                    ? `На ${previous.time} — ${previous.revenue.toLocaleString("ru-RU")} ₽`
                    : "Первый отчёт за день")}
              </small>
            </label>
            <div className="number-pair">
              <label className="number-field">
                Количество чеков
                <div className={`input-wrap ${errors.checks ? "invalid" : ""}`}>
                  <input
                    aria-label="Количество чеков"
                    inputMode="numeric"
                    value={checks}
                    onChange={(e) => setChecks(e.target.value)}
                    aria-invalid={!!errors.checks}
                  />
                </div>
                <small>
                  {errors.checks ||
                    (previous.time
                      ? `На ${previous.time} — ${previous.checks}`
                      : "С начала дня")}
                </small>
              </label>
              <label className="number-field">
                Алкогольные ед.
                <div className={`input-wrap ${errors.units ? "invalid" : ""}`}>
                  <input
                    aria-label="Алкогольные единицы"
                    inputMode="numeric"
                    value={units}
                    onChange={(e) => setUnits(e.target.value)}
                    aria-invalid={!!errors.units}
                  />
                </div>
                <small>
                  {errors.units ||
                    (previous.time
                      ? `На ${previous.time} — ${previous.units}`
                      : "С начала дня")}
                </small>
              </label>
            </div>
            <div className="calculated-value">
              <span>
                Единиц в чеке<small>Рассчитается автоматически</small>
              </span>
              <b>
                {checks.trim() &&
                units.trim() &&
                parse(checks) > 0 &&
                Number.isFinite(parse(units) / parse(checks))
                  ? (parse(units) / parse(checks)).toLocaleString("ru-RU", {
                      maximumFractionDigits: 2,
                    })
                  : "—"}
              </b>
            </div>
            <button
              type="button"
              className="add-comment"
              onClick={() => setShowComment(!showComment)}
            >
              <MessageSquare size={16} />
              {showComment ? "Скрыть пояснение" : "Добавить пояснение"}
              <span>необязательно</span>
            </button>
            {showComment && (
              <label className="comment-label">
                Пояснение
                <textarea
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  placeholder="Например, оформлен возврат"
                />
                {errors.comment && (
                  <small className="field-error">{errors.comment}</small>
                )}
              </label>
            )}
            <button type="submit" className="primary-button submit-report">
              Отправить отчёт
              <ArrowRight size={18} />
            </button>
            <p className="form-footnote">
              <ShieldCheck size={13} />
              После отправки останется история изменений
            </p>
          </form>
        )}
        <div className="daily-plan">
          <div>
            <span>План выручки на день</span>
            <b>72 000 ₽</b>
          </div>
          <div className="mini-progress">
            <i
              style={{
                width: `${Math.min(100, Math.max(0, planPercent ?? 0))}%`,
              }}
            />
          </div>
          <p>
            <span>
              Сейчас выполнено{" "}
              <b>{planPercent === null ? "—" : `${planPercent}%`}</b>
            </span>
            <span>
              {remaining === null
                ? "Введите выручку"
                : remaining === 0
                  ? "План выполнен"
                  : `Осталось ${remaining.toLocaleString("ru-RU")} ₽`}
            </span>
          </p>
        </div>
        <div className="mobile-demo">Макет · демонстрационные данные</div>
      </main>
      <nav className="store-bottom">
        <button className="active" onClick={() => setSubmitted(false)}>
          <FileCheck2 size={21} />
          Мой отчёт
        </button>
        <button
          onClick={() =>
            notify("Здесь будет история ваших отчётов и исправлений.")
          }
        >
          <History size={21} />
          История
        </button>
        <button
          onClick={() =>
            notify("Демонстрационный профиль: Ольга Смирнова, ММ-019.")
          }
        >
          <Users size={21} />
          Профиль
        </button>
      </nav>
    </div>
  );
}

function Gallery() {
  return (
    <main className="gallery">
      <Brand />
      <div className="eyebrow">ВЕБ-СЕРВИС КОНТРОЛЯ ОТЧЁТНОСТИ</div>
      <h1>
        Одна задача
        <br />
        Три рабочих пространства
      </h1>
      <p>
        Выберите вариант, чтобы посмотреть кабинет видеоконтроля
        <br />и форму отчёта для сотрудника магазина.
      </p>
      <div className="gallery-grid">
        {(["a", "b", "c"] as Variant[]).map((v) => (
          <article className={`gallery-card gallery-${v}`} key={v}>
            <span className="gallery-number">{variantMeta[v].number}</span>
            <div className="gallery-mini">
              <span />
              <div>
                <i />
                <i />
                <i />
                <i />
              </div>
            </div>
            <h2>{variantMeta[v].name}</h2>
            <p>{variantMeta[v].note}</p>
            <a href={`?v=${v}&role=office`}>
              Кабинет видеоконтроля
              <ArrowUpRight size={17} />
            </a>
            <a href={`?v=${v}&role=store`}>
              Форма магазина
              <ArrowUpRight size={17} />
            </a>
          </article>
        ))}
      </div>
      <footer>
        Интерактивные макеты · демонстрационные данные · сентябрь 2026
      </footer>
    </main>
  );
}
export default function PrototypeApp() {
  const params = new URLSearchParams(window.location.search);
  const variant = (
    ["a", "b", "c"].includes(params.get("v") || "") ? params.get("v") : null
  ) as Variant | null;
  const role = params.get("role") === "store" ? "store" : "office";
  const capture = params.get("capture") === "1";
  const [toast, setToast] = useState("");
  function notify(v: string) {
    setToast(v);
  }
  return (
    <div
      className={`app variant-${variant || "a"} role-${role} ${capture ? "capture" : ""}`}
    >
      {variant ? (
        <>
          {!capture && <PrototypeBar variant={variant} role={role} />}{" "}
          {role === "office" ? (
            <Office variant={variant} notify={notify} />
          ) : (
            <StoreScreen variant={variant} notify={notify} />
          )}
        </>
      ) : (
        <Gallery />
      )}
      {toast && (
        <div className="toast" role="status">
          <span>{toast}</span>
          <IconButton label="Закрыть сообщение" onClick={() => setToast("")}>
            <X size={17} />
          </IconButton>
        </div>
      )}
    </div>
  );
}
