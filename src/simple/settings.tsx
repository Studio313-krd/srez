import { useEffect, useState } from "react";
import { Pencil, Plus, RotateCcw, Search, Trash2, Users, X } from "lucide-react";
import { api } from "../api";
import type { StoreData } from "../api";
import DataTable from "../data-table";
import { errorText, Modal, money, Notice } from "./shared";
import { Field, Hint } from "./help";
import { russianTimezones, timezoneLabel } from "./timezones";
import { AccessEditor } from "./access";
import type { EmployeeAccess } from "./access";

type Employee = {
  access: EmployeeAccess | null;
  id: number;
  name: string;
  active: boolean;
  archived: boolean;
  position: string;
  notes: string;
  stores: { code: string; name: string; archived: boolean }[];
};
type Shop = {
  id: number;
  code: string;
  name: string;
  city: string;
  network: string;
  active_from: string;
  opens_at: string;
  closes_at: string;
  timezone: string;
  weekdays: number[];
  monitoring_enabled: boolean;
  archived: boolean;
  staff: { id: number; name: string; slot: string; archived?: boolean }[];
};
type SettingsData = { stores: Shop[]; employees: Employee[] };
type ArchiveTarget = { kind: "stores" | "employees"; item: Shop | Employee };

export function PlanEditor({
  store,
  date,
  onClose,
  onSaved,
}: {
  store: StoreData;
  date: string;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [revenue, setRevenue] = useState(store.plan?.revenue || ""),
    [receipts, setReceipts] = useState(store.plan?.receipts?.toString() || ""),
    [units, setUnits] = useState(store.plan?.units?.toString() || ""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  async function save(e: React.SubmitEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await api("manage/plans/", {
        store_id: store.id,
        date,
        revenue,
        receipts,
        units,
      });
      await onSaved();
      onClose();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal title="План магазина на день" onClose={onClose}>
      <form className="s-modal-body" onSubmit={save}>
        <p>
          {store.name} ·{" "}
          {new Date(date + "T12:00:00").toLocaleDateString("ru-RU")}
        </p>
        <Field
          label="План выручки, ₽"
          hint="Плановая выручка магазина за выбранный день. Фактическая выручка делится на этот план, чтобы показать процент выполнения"
        >
          <input
            required
            type="number"
            min="0"
            step="0.01"
            value={revenue}
            onChange={(e) => setRevenue(e.target.value)}
          />
        </Field>
        <div className="s-form-pair">
          <Field
            label="План чеков"
            hint="Сколько покупок магазин должен совершить за день. Необязательное поле"
          >
            <input
              type="number"
              min="0"
              step="1"
              value={receipts}
              onChange={(e) => setReceipts(e.target.value)}
            />
          </Field>
          <Field
            label="План алкогольных единиц"
            hint="План количества проданных алкогольных единиц за день. Необязательное поле"
          >
            <input
              type="number"
              min="0"
              step="1"
              value={units}
              onChange={(e) => setUnits(e.target.value)}
            />
          </Field>
        </div>
        {error && <Notice error>{error}</Notice>}
        <button className="s-btn primary" disabled={busy}>
          {busy ? "Сохраняем…" : "Сохранить план"}
        </button>
      </form>
    </Modal>
  );
}

export default function Settings({
  date,
  stores,
  localPreview,
  onRefresh,
  onPlan,
  onSaved,
}: {
  date: string;
  stores: StoreData[];
  localPreview: boolean;
  onRefresh: () => Promise<void>;
  onPlan: (s: StoreData) => void;
  onSaved: (s: string) => void;
}) {
  const [data, setData] = useState<SettingsData | null>(null),
    [error, setError] = useState(""),
    [shop, setShop] = useState<Shop | null>(null),
    [employee, setEmployee] = useState<Employee | "new" | null>(null),
    [accessEmployee, setAccessEmployee] = useState<Employee | null>(null),
    [storeQuery, setStoreQuery] = useState(""),
    [employeeQuery, setEmployeeQuery] = useState(""),
    [showDeletedStores, setShowDeletedStores] = useState(false),
    [showDeletedEmployees, setShowDeletedEmployees] = useState(false),
    [archiveTarget, setArchiveTarget] = useState<ArchiveTarget | null>(null);
  async function load() {
    setData(await api<SettingsData>("manage/?include_archived=1"));
    setError("");
  }
  useEffect(() => {
    load().catch((e) => setError(errorText(e)));
  }, []);
  async function updated(label: string) {
    await load();
    await onRefresh();
    onSaved(label);
  }
  if (!data) return <p className="s-empty">{error || "Открываем магазины…"}</p>;
  return (
    <>
      <div className="s-title-row">
        <div>
          <h1>Магазины и сотрудники</h1>
          <p>Часы работы, кто выходит на смену и план — рядом с магазином</p>
        </div>
        <button
          className="s-btn primary"
          title="Создать магазин, задать его график и назначить сотрудников"
          onClick={() =>
            setShop({
              id: 0,
              code: nextStoreCode("MM", data.stores),
              name: "",
              city: "",
              network: "MM",
              active_from: date,
              opens_at: "10:00",
              closes_at: "22:00",
              timezone: "Europe/Moscow",
              weekdays: [0, 1, 2, 3, 4, 5, 6],
              monitoring_enabled: true,
              archived: false,
              staff: [],
            })
          }
        >
          <Plus size={18} />
          Добавить магазин
        </button>
      </div>
      {error && <Notice error>{error}</Notice>}
      <div className="s-settings-table">
        <DirectoryFilters kind="stores" query={storeQuery} onQuery={setStoreQuery}
          showDeleted={showDeletedStores} onShowDeleted={setShowDeletedStores}
          deletedCount={data.stores.filter(s => s.archived).length} />
        <DataTable label="Настройки магазинов" context={date} query={storeQuery} onClearQuery={() => setStoreQuery("")}>
          <thead>
            <tr>
              <th>Магазин</th>
              <th>Сеть</th>
              <th>Продавцы</th>
              <th>Часы работы</th>
              <th>Часовой пояс</th>
              <th>План на день</th>
              <th>Действия</th>
            </tr>
          </thead>
          <tbody>
            {data.stores.filter(s => showDeletedStores || !s.archived).map((s) => {
              const original = stores.find((x) => x.id === s.id);
              return (
                <tr key={s.id} className={s.archived ? "s-deleted-row" : undefined}>
                  <td data-sort={s.name}>
                    <b>{s.name}</b>
                    <small>{s.code}{s.city ? " · " + s.city : ""}</small>
                    {s.archived && <span className="s-deleted-tag">Удалён</span>}
                  </td>
                  <td>
                    {s.network === "MM" ? "Мильстрим" : "Культура крепкого"}
                  </td>
                  <td>
                    {s.staff
                      .filter((a) => a.slot !== "curator")
                      .map((a) => a.name + (a.archived ? " (удалён)" : ""))
                      .join(", ") || "Назначьте сотрудника"}
                  </td>
                  <td>
                    {s.opens_at}–{s.closes_at}
                    <small>
                      {s.weekdays.length === 7
                        ? "Ежедневно"
                        : s.weekdays
                            .map(
                              (i) =>
                                ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"][i],
                            )
                            .join(", ")}
                    </small>
                  </td>
                  <td
                    data-sort={s.timezone}
                    data-export={timezoneLabel(s.timezone)}
                  >
                    {timezoneLabel(s.timezone)}
                  </td>
                  <td
                    data-sort={Number(original?.plan?.revenue) || null}
                    data-export={original?.plan?.revenue ?? null}
                    data-search={original ? `${money(original.plan?.revenue)} ₽ ${original.plan?.revenue ?? ""}` : s.archived ? "—" : "Нет плана"}
                  >
                    {original ? (
                      <button
                        className="s-text-button"
                        title="Открыть дневной план и сохранить новую версию"
                        onClick={() => onPlan(original)}
                      >
                        {money(original.plan?.revenue)} ₽<Pencil size={15} />
                      </button>
                    ) : (
                      <span title={s.archived ? "Планы сохранены и будут доступны после восстановления магазина" : undefined}>{s.archived ? "—" : "Нет плана"}</span>
                    )}
                  </td>
                  <td>
                    <div className="s-row-actions">
                    {!s.archived && (
                    <button
                      className="s-btn"
                      title="Изменить данные магазина, сотрудников и график"
                      onClick={() => setShop(s)}
                    >
                      Настроить
                    </button>
                    )}
                    <button className={"s-btn " + (s.archived ? "" : "s-delete-action")}
                      title={s.archived ? "Вернуть магазин в рабочий список" : "Переместить в удалённые с сохранением отчётов"}
                      onClick={() => setArchiveTarget({ kind: "stores", item: s })}>
                      {s.archived ? <RotateCcw size={16} /> : <Trash2 size={16} />}
                      {s.archived ? "Восстановить" : "Удалить"}
                    </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </DataTable>
      </div>
      <section className="s-staff-section">
        <div className="s-title-row">
          <div>
            <h2>
              <Users size={22} />
              Сотрудники
            </h2>
            <p>
              Сначала добавьте ФИО, затем назначьте сотрудника в настройках
              магазина
            </p>
          </div>
          <button
            className="s-btn"
            title="Добавить ФИО в справочник, затем назначить сотрудника в магазине"
            onClick={() => setEmployee("new")}
          >
            <Plus size={18} />
            Добавить сотрудника
          </button>
        </div>
        <DirectoryFilters kind="employees" query={employeeQuery} onQuery={setEmployeeQuery}
          showDeleted={showDeletedEmployees} onShowDeleted={setShowDeletedEmployees}
          deletedCount={data.employees.filter(e => e.archived).length} />
        <DataTable className="s-employees-table" label="Сотрудники" context={date} query={employeeQuery} onClearQuery={() => setEmployeeQuery("")}>
          <thead>
            <tr>
              <th>ФИО</th>
              <th>Магазины</th>
              <th>Статус</th>
              <th>Действия</th>
            </tr>
          </thead>
          <tbody>
            {data.employees.filter(e => showDeletedEmployees || !e.archived).map((e) => (
              <tr key={e.id} className={e.archived ? "s-deleted-row" : undefined}>
                <td>{e.name}<small>{e.access?.has_link ? "Вход по личной ссылке" : "Доступ на сайт не выдан"}</small></td>
                <td data-export={e.stores.map(s => `${s.code} · ${s.name}${s.archived ? " (удалён)" : ""}`).join(", ") || "Не назначен"}>
                  {e.stores.length ? <div className="s-employee-stores">
                    {e.stores.map((s, index) => <div key={`${s.code}-${index}`}>
                      <span className="s-employee-store-code">{s.code}</span>{" · "}{s.name}{s.archived ? " (удалён)" : ""}
                    </div>)}
                  </div> : "Не назначен"}
                </td>
                <td>{e.archived ? <span className="s-deleted-tag">Удалён</span> : e.active ? "Работает" : "Не работает"}
                  {e.access && <small>{e.access.enabled ? "Вход разрешён" : "Вход закрыт"}</small>}</td>
                <td>
                  <div className="s-row-actions">
                  {!e.archived && <button className="s-btn" onClick={() => setAccessEmployee(e)}>Доступ</button>}
                  {!e.archived && (
                  <button
                    className="s-btn"
                    onClick={() => setEmployee(e)}
                  >
                    Изменить
                  </button>
                  )}
                  <button className={"s-btn " + (e.archived ? "" : "s-delete-action")}
                    title={e.archived ? "Вернуть сотрудника в рабочий список" : "Переместить в удалённые с сохранением истории"}
                    onClick={() => setArchiveTarget({ kind: "employees", item: e })}>
                    {e.archived ? <RotateCcw size={16} /> : <Trash2 size={16} />}
                    {e.archived ? "Восстановить" : "Удалить"}
                  </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </DataTable>
        <p className="s-muted">
          Чтобы сотрудник мог войти на сайт, нажмите «Доступ», выберите магазины и отправьте ему личную ссылку
        </p>
      </section>
      {shop && (
        <ShopEditor
          shop={shop}
          shops={data.stores}
          employees={data.employees}
          localPreview={localPreview}
          onClose={() => setShop(null)}
          onSaved={() =>
            updated(
              shop.id
                ? "Настройки магазина сохранены"
                : "Магазин добавлен. Выдайте продавцу доступ к нему через карточку сотрудника",
            )
          }
        />
      )}
      {employee && (
        <EmployeeEditor
          employee={employee}
          onClose={() => setEmployee(null)}
          onSaved={() => updated("Сотрудник сохранён")}
        />
      )}
      {accessEmployee && <AccessEditor employee={accessEmployee} shops={data.stores}
        onClose={() => setAccessEmployee(null)} onSaved={() => updated("Доступ сотрудника сохранён")} />}
      {archiveTarget && <ArchiveDialog target={archiveTarget} onClose={() => setArchiveTarget(null)}
        onSaved={() => updated(archiveTarget.item.archived
          ? (archiveTarget.kind === "stores" ? "Магазин восстановлен" : "Сотрудник восстановлен")
          : (archiveTarget.kind === "stores" ? "Магазин перемещён в удалённые. Вернуть его можно через галочку над таблицей" : "Сотрудник перемещён в удалённые. Вернуть его можно через галочку над таблицей"))} />}
    </>
  );
}

function DirectoryFilters({ kind, query, onQuery, showDeleted, onShowDeleted, deletedCount }: {
  kind: "stores" | "employees"; query: string; onQuery: (value: string) => void;
  showDeleted: boolean; onShowDeleted: (value: boolean) => void; deletedCount: number;
}) {
  const stores = kind === "stores";
  const searchLabel = stores ? "Поиск по всем полям магазинов" : "Поиск по всем полям сотрудников";
  const deletedLabel = stores ? "Показывать удалённые магазины" : "Показывать удалённых сотрудников";
  return <div className="s-directory-filters">
    <div className="s-directory-search">
      <div className="s-field-caption">
        <label htmlFor={`directory-search-${kind}`}>{searchLabel}</label>
        <Hint label={searchLabel} text="Поиск сразу по всем столбцам таблицы. Можно ввести несколько слов из разных полей. Фильтры в заголовках действуют одновременно с поиском; в экспорт попадут только найденные строки" />
      </div>
      <div className="s-directory-search-input">
        <Search size={19} aria-hidden="true" />
        <input id={`directory-search-${kind}`} type="search" value={query}
          placeholder={stores ? "Название, город, сеть, сотрудник, часы…" : "ФИО, магазин или статус…"}
          onChange={e => onQuery(e.target.value)} />
        {query && <button type="button" aria-label={`Очистить ${stores ? "поиск магазинов" : "поиск сотрудников"}`} onClick={() => onQuery("")}><X size={18} /></button>}
      </div>
    </div>
    <div className="s-check-help">
      <label className="s-check"><input type="checkbox" checked={showDeleted} onChange={e => onShowDeleted(e.target.checked)} />
        <span>{deletedLabel} <span className="s-muted">({deletedCount})</span></span>
      </label>
      <Hint label={deletedLabel} text="Добавляет в таблицу удалённые записи вместе с действующими. Удалённые помечены и доступны для восстановления. Снимите галочку, чтобы снова скрыть их" />
    </div>
  </div>;
}

function ArchiveDialog({ target, onClose, onSaved }: { target: ArchiveTarget; onClose: () => void; onSaved: () => Promise<void> }) {
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const restoring = target.item.archived, store = target.kind === "stores";
  async function save() {
    setBusy(true); setError("");
    try {
      await api(`manage/${target.kind}/${target.item.id}/archive/`, { archived: !restoring });
      await onSaved(); onClose();
    } catch (e) { setError(errorText(e)); }
    finally { setBusy(false); }
  }
  return <Modal title={`${restoring ? "Восстановить" : "Переместить в удалённые"} ${store ? "магазин" : "сотрудника"}`} onClose={() => { if (!busy) onClose(); }}>
    <div className="s-modal-body">
      <p><strong>{target.item.name}</strong>{"code" in target.item && <small className="s-muted"> · {target.item.code}</small>}</p>
      <p>{restoring
        ? store ? "Магазин вернётся в список отчётов вместе с сохранёнными данными и назначениями. При включённом контроле новые сроки начнут действовать со следующего рабочего дня"
          : "Сотрудник вернётся в справочник. Сохранятся его назначения в магазины и прежняя отметка о работе"
        : store ? "Магазин исчезнет из рабочих списков. Новые отчёты и уведомления для него создаваться не будут. Отчёты, планы и сотрудники сохранятся"
          : "Сотрудник исчезнет из рабочего справочника и списка ФИО при заполнении отчёта. Его прошлые отчёты и назначения сохранятся. Его личный вход на сайт будет отключён"}</p>
      {!restoring && <p>Вернуть запись можно в любой момент: включите галочку «{store ? "Показывать удалённые магазины" : "Показывать удалённых сотрудников"}» и нажмите «Восстановить»</p>}
      {error && <Notice error>{error}</Notice>}
      <div className="s-dialog-actions">
        <button type="button" className="s-btn" disabled={busy} onClick={onClose}>Отмена</button>
        <button type="button" className={"s-btn " + (restoring ? "primary" : "s-delete-action")} disabled={busy} onClick={save}>
          {busy ? "Сохраняем…" : restoring ? "Восстановить" : "Переместить в удалённые"}
        </button>
      </div>
    </div>
  </Modal>;
}

function nextStoreCode(network: string, shops: Shop[]) {
  const prefix = network === "MM" ? "LOCAL-MS-" : "LOCAL-KK-";
  let number = 1;
  while (shops.some((s) => s.code === prefix + String(number).padStart(3, "0")))
    number++;
  return prefix + String(number).padStart(3, "0");
}

function ShopEditor({
  shop,
  shops,
  employees,
  localPreview,
  onClose,
  onSaved,
}: {
  shop: Shop;
  shops: Shop[];
  employees: Employee[];
  localPreview: boolean;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const creating = !shop.id;
  const [name, setName] = useState(shop.name),
    [code, setCode] = useState(shop.code),
    [city, setCity] = useState(shop.city),
    [network, setNetwork] = useState(shop.network),
    [from, setFrom] = useState(shop.active_from),
    [codeChanged, setCodeChanged] = useState(false);
  const [open, setOpen] = useState(shop.opens_at),
    [close, setClose] = useState(shop.closes_at),
    [weekdays, setWeekdays] = useState(shop.weekdays),
    [monitor, setMonitor] = useState(shop.monitoring_enabled),
    [zone, setZone] = useState(shop.timezone);
  const [sellers, setSellers] = useState(
      ["seller1", "seller2"].map(
        (slot) => shop.staff.find((s) => s.slot === slot)?.id.toString() || "",
      ),
    ),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  async function save(e: React.SubmitEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    if (!weekdays.length) {
      setError("Отметьте хотя бы один рабочий день магазина");
      setBusy(false);
      return;
    }
    try {
      await api(
        creating && localPreview ? "local-preview/stores/" : "manage/stores/" + shop.id + "/",
        {
          name: name.trim(),
          code: code.trim(),
          city: city.trim(),
          network,
          active_from: from,
          opens_at: open,
          closes_at: close,
          weekdays,
          monitoring_enabled: monitor,
          timezone: zone,
          staff: [
            ...shop.staff.filter((s) => s.slot === "curator"),
            ...sellers.flatMap((id, i) =>
              id ? [{ id: Number(id), slot: "seller" + (i + 1) }] : [],
            ),
          ],
        },
      );
      await onSaved();
      onClose();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      title={creating ? "Добавить магазин" : "Настроить магазин"}
      onClose={onClose}
      wide
    >
      <form className="s-modal-body" onSubmit={save}>
        <p className="s-muted">
          {creating
            ? "Укажите магазин и его график. Сотрудников можно назначить сейчас или позже"
            : "Изменения сохранятся после нажатия кнопки внизу"}
        </p>
        <fieldset disabled={busy}>
          <div className="s-form-pair">
            <Field
              label="Сеть"
              hint="Выберите сеть, к которой относится магазин. Она будет указана в таблицах и списке магазинов продавца"
            >
              <select
                value={network}
                onChange={(e) => {
                  setNetwork(e.target.value);
                  if (creating && !codeChanged)
                    setCode(nextStoreCode(e.target.value, shops));
                }}
              >
                <option value="MM">Мильстрим</option>
                <option value="KK">Культура крепкого</option>
              </select>
            </Field>
            <Field
              label="Код магазина"
              hint="Уникальное короткое обозначение магазина. Мы предложили свободный код; при необходимости замените его своим. У двух магазинов не может быть одинакового кода"
            >
              <input
                required
                maxLength={32}
                value={code}
                onChange={(e) => {
                  setCode(e.target.value);
                  setCodeChanged(true);
                }}
              />
            </Field>
          </div>
          <Field
            label="Название или адрес"
            hint="Так магазин будет называться в отчётах. Например: ул. Ленина, 15. Укажите адрес, чтобы отличать магазины одной сети"
          >
            <input
              required
              maxLength={200}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Например: ул. Ленина, 15"
            />
          </Field>
          <div className="s-form-pair">
            <Field
              label="Город"
              hint="Населённый пункт, где находится магазин. Часовой пояс выберите отдельно ниже"
            >
              <input
                required
                maxLength={100}
                value={city}
                onChange={(e) => setCity(e.target.value)}
                placeholder="Например: Самара"
              />
            </Field>
            <Field
              label="Начало учёта"
              hint="С этой даты магазин появляется в отчётах. Если указать будущую дату, на сегодняшнем листе магазина ещё не будет"
            >
              <input
                required
                type="date"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
              />
            </Field>
          </div>
          <h3>Кто работает</h3>
          <div className="s-form-pair">
            {sellers.map((id, i) => (
              <Field
                key={i}
                label={"Продавец " + (i + 1)}
                hint="Сотрудник будет предлагаться в поле ФИО при заполнении отчёта. Это назначение для подписи отчётов, оно не создаёт логин. При подмене ФИО можно вписать вручную"
              >
                <select
                  value={id}
                  onChange={(e) =>
                    setSellers(
                      sellers.map((v, j) => (i === j ? e.target.value : v)),
                    )
                  }
                >
                  <option value="">Не назначен</option>
                  {employees
                    .filter((e) => (!e.archived && e.active) || e.id.toString() === id)
                    .map((e) => (
                      <option value={e.id} key={e.id}>
                        {e.name}{e.archived ? " (удалён)" : !e.active ? " (не работает)" : ""}
                      </option>
                    ))}
                </select>
              </Field>
            ))}
          </div>
          <h3>Когда ждём отчёты</h3>
          <Field
            label="Часовой пояс"
            hint="Выберите местное время магазина. По нему рассчитываются открытие, закрытие и сроки отчётов. МСК+2 означает на два часа позже Москвы; GMT+5 — на пять часов позже Гринвича"
          >
            <select value={zone} onChange={(e) => setZone(e.target.value)}>
              {!russianTimezones.some(([id]) => id === zone) && (
                <option value={zone}>{zone}</option>
              )}
              {russianTimezones.map(([id]) => (
                <option key={id} value={id}>
                  {timezoneLabel(id)}
                </option>
              ))}
            </select>
          </Field>
          <p className="s-timezone-note">{timezoneLabel(zone)}</p>
          <div className="s-form-pair">
            <Field
              label="Открытие"
              hint="Начало смены по местному времени магазина. Отчёты на 13:00 и 17:00 ожидаются, только если магазин работает в это время"
            >
              <input
                required
                type="time"
                value={open}
                onChange={(e) => setOpen(e.target.value)}
              />
            </Field>
            <Field
              label="Закрытие"
              hint="Окончание смены по местному времени магазина. Отчёт на закрытие нужно сдать в течение 15 минут. Если закрытие раньше открытия или равно ему, смена заканчивается на следующий день"
            >
              <input
                required
                type="time"
                value={close}
                onChange={(e) => setClose(e.target.value)}
              />
            </Field>
          </div>
          <fieldset className="s-weekdays">
            <legend>
              <span className="s-field-caption">
                Рабочие дни
                <Hint
                  label="Рабочие дни"
                  text="Отметьте дни, когда магазин открыт. В остальные дни система не ждёт отчёты по графику и не считает их просроченными. Дни относятся к местному времени магазина. Сроки уже созданных отчётов при изменении графика сохраняются"
                />
              </span>
            </legend>
            {["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"].map((d, i) => (
              <label key={i}>
                <input
                  type="checkbox"
                  checked={weekdays.includes(i)}
                  onChange={(e) =>
                    setWeekdays(
                      e.target.checked
                        ? [...weekdays, i].sort()
                        : weekdays.filter((v) => v !== i),
                    )
                  }
                />
                {d}
              </label>
            ))}
          </fieldset>
          <div className="s-check-help">
            <label className="s-check">
              <input
                type="checkbox"
                checked={monitor}
                onChange={(e) => setMonitor(e.target.checked)}
              />
              Отмечать просроченные отчёты
            </label>
            <Hint
              label="Отмечать просроченные отчёты"
              text="Если отчёт не сдан до 13:05, 17:05 или через 15 минут после закрытия, он отмечается просроченным. Первый запуск — со следующего рабочего дня. При отключении новые проверки прекращаются; прежние сроки и замечания остаются. Уведомления здесь выключены"
            />
          </div>
          <p className="s-muted">
            При первом включении контроль начнётся со следующего рабочего дня.
            Сроки уже созданных отчётов сохранятся
          </p>
        </fieldset>
        {error && <Notice error>{error}</Notice>}
        <div className="s-dialog-actions">
          <button className="s-btn primary" disabled={busy}>
            {busy
              ? "Сохраняем…"
              : creating
                ? "Добавить магазин"
                : "Сохранить настройки"}
          </button>
          <button
            type="button"
            className="s-btn"
            disabled={busy}
            onClick={onClose}
          >
            Отмена
          </button>
        </div>
      </form>
    </Modal>
  );
}
function EmployeeEditor({
  employee,
  onClose,
  onSaved,
}: {
  employee: Employee | "new";
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [name, setName] = useState(employee === "new" ? "" : employee.name),
    [active, setActive] = useState(employee === "new" || employee.active),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  async function save(e: React.SubmitEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await api(
        "manage/employees/" + (employee === "new" ? 0 : employee.id) + "/",
        { name, active },
      );
      await onSaved();
      onClose();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      title={employee === "new" ? "Добавить сотрудника" : "Изменить сотрудника"}
      onClose={onClose}
    >
      <form className="s-modal-body" onSubmit={save}>
        <Field
          label="ФИО"
          hint="Укажите фамилию, имя и отчество. После добавления назначьте сотрудника в настройках магазина"
        >
          <input
            autoFocus
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Фамилия Имя Отчество"
          />
        </Field>
        <label className="s-check">
          <input
            type="checkbox"
            checked={active}
            onChange={(e) => setActive(e.target.checked)}
          />
          Сотрудник работает
        </label>
        <Hint
          label="Сотрудник работает"
          text="Снимите отметку, если сотрудник уволился. Его прошлые отчёты сохранятся, а новые назначения в магазины станут недоступны"
        />
        {error && <Notice error>{error}</Notice>}
        <button className="s-btn primary" disabled={busy}>
          {busy ? "Сохраняем…" : "Сохранить сотрудника"}
        </button>
      </form>
    </Modal>
  );
}
