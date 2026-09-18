import { useEffect, useState } from "react";
import { api } from "../api";
import { Field } from "./help";
import { errorText, Modal, Notice } from "./shared";

export type EmployeeAccess = { enabled: boolean; has_link: boolean; store_ids: number[]; link_path?: string };
const normalize = (value: string) => value.toLocaleLowerCase("ru").replaceAll("ё", "е").trim();
export function AccessEditor({ employee, shops, onClose, onSaved }: {
  employee: { id: number; name: string; active: boolean; archived: boolean; access: EmployeeAccess | null; stores: {code:string}[] };
  shops: { id: number; code: string; name: string; archived: boolean }[];
  onClose: () => void; onSaved: () => Promise<void>;
}) {
  const [enabled, setEnabled] = useState(employee.access?.enabled ?? true);
  const [ids, setIds] = useState(employee.access?.store_ids.filter(id => shops.some(s => s.id === id && !s.archived))
    || shops.filter(s => !s.archived && employee.stores.some(a => a.code === s.code)).map(s => s.id));
  const [query, setQuery] = useState("");
  const [link, setLink] = useState("");
  const [loading, setLoading] = useState(!!employee.access);
  const [busy, setBusy] = useState(false), [error, setError] = useState(""), [message, setMessage] = useState("");
  const [changed, setChanged] = useState(false);
  useEffect(() => {
    if (!employee.access) return;
    let live = true;
    api<EmployeeAccess>(`manage/employees/${employee.id}/access/`).then(result => {
      if (live) setLink(result.link_path ? new URL(result.link_path, window.location.origin).href : "");
    }).catch(e => { if (live) setError(errorText(e)); }).finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [employee.id]);
  const available = shops.filter(s => !s.archived);
  const words = normalize(query).split(/\s+/).filter(Boolean);
  const found = available.filter(s => words.every(word => normalize(`${s.code} ${s.name}`).includes(word)));
  function edit() { setChanged(true); setMessage(""); }
  async function save(rotate = false) {
    if (rotate && !confirm("Заменить ссылку? Старая ссылка и открытые по ней сеансы перестанут работать. Новую нужно отправить продавцу.")) return;
    setBusy(true); setError(""); setMessage("");
    try {
      const result = await api<EmployeeAccess>(`manage/employees/${employee.id}/access/`, {enabled, store_ids: ids, rotate_link: rotate});
      setLink(result.link_path ? new URL(result.link_path, window.location.origin).href : "");
      setChanged(false);
      setMessage(enabled ? "Доступ сохранён. Скопируйте ссылку и отправьте продавцу в личном сообщении" : "Вход сотрудника закрыт");
      await onSaved();
    } catch (e) {setError(errorText(e));} finally {setBusy(false);}
  }
  async function copy() {
    try {
      await navigator.clipboard.writeText(link);
      setMessage("Ссылка скопирована — отправьте её продавцу в личном сообщении");
    } catch {
      setError("Не удалось скопировать автоматически. Выделите ссылку в поле и скопируйте вручную");
    }
  }
  return <Modal title="Доступ сотрудника на сайт" onClose={() => {if (!busy) onClose();}}>
    <form className="s-modal-body" onSubmit={e => {e.preventDefault(); void save();}}>
      <p><strong>{employee.name}</strong></p>
      <p>Продавец открывает свою ссылку и сразу видит доступные магазины. Логин и пароль не нужны</p>
      {link && <div className="s-personal-link">
        <Field label="Личная ссылка сотрудника" hint="Отправьте ссылку только этому сотруднику. Она открывает его отчёты без пароля и действует, пока вы не закроете вход или не замените ссылку">
          <textarea readOnly rows={3} value={link} onFocus={e => e.currentTarget.select()} />
        </Field>
        <button type="button" className="s-btn primary" disabled={busy || changed || !enabled} onClick={copy}>Скопировать ссылку</button>
        {changed && <p className="s-muted">Сначала сохраните изменения доступа</p>}
        {!enabled && <p className="s-muted">Вход по ссылке закрыт</p>}
      </div>}
      <fieldset disabled={busy || loading}>
        <h3 className="s-access-heading">Какие магазины доступны</h3>
        <Field label="Поиск магазина" hint="Введите код или название магазина. Поиск не снимает галочки у уже выбранных магазинов">
          <input type="search" placeholder="Код или название магазина" value={query} onChange={e => setQuery(e.target.value)} />
        </Field>
        <p className="s-muted" role="status">Выбрано: {ids.length} · Найдено: {found.length} из {available.length}</p>
        <div className="s-access-stores">
          {found.map(s => <label className="s-check" key={s.id}>
            <input type="checkbox" checked={ids.includes(s.id)} onChange={e => {setIds(e.target.checked ? [...ids, s.id] : ids.filter(id => id !== s.id)); edit();}} />
            <span>{s.code} · {s.name}</span>
          </label>)}
          {!found.length && <p>Магазины не найдены. Измените поисковый запрос</p>}
        </div>
        <label className="s-check s-access-heading"><input type="checkbox" checked={enabled} onChange={e => {setEnabled(e.target.checked); edit();}} />Вход на сайт разрешён</label>
        <p className="s-muted">Чтобы закрыть доступ, снимите эту галочку. Удаление сотрудника или отметка «Не работает» тоже отключает вход; после восстановления разрешите вход здесь заново</p>
      </fieldset>
      {loading && <p role="status">Загружаем ссылку…</p>}
      {error && <Notice error>{error}</Notice>}
      {message && <p className="s-access-success" role="status">{message}</p>}
      <div className="s-dialog-actions">
        <button className="s-btn primary" disabled={busy || loading}>{busy ? "Сохраняем…" : link ? "Сохранить доступ" : "Создать ссылку"}</button>
        <button type="button" className="s-btn" disabled={busy} onClick={onClose}>Готово</button>
      </div>
      {link && <button type="button" className="s-text-button s-replace-link" disabled={busy || loading || changed}
        title="Создать новую ссылку, отключить старую и завершить прежние сеансы продавца" onClick={() => void save(true)}>Заменить ссылку</button>}
    </form>
  </Modal>;
}
