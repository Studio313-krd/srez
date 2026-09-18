import { Children, cloneElement, isValidElement, useEffect, useMemo, useRef, useState } from "react";
import type { ReactElement, ReactNode } from "react";
import { createPortal } from "react-dom";
import { ArrowDown, ArrowUp, ArrowDownToLine, ChevronDown, ChevronLeft, ChevronRight, X } from "lucide-react";
import { downloadTable } from "./api";
import "./data-table.css";

type CellProps = { children?: ReactNode; className?: string; "data-sort"?: string | number | null; "data-search"?: string; "data-export"?: string | number | null };
type Element = ReactElement<CellProps>;
const elements = (node: ReactNode) => Children.toArray(node).filter(isValidElement) as Element[];
function textOf(node: ReactNode): string {
  if (node == null || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(textOf).filter(Boolean).join(" ");
  if (isValidElement<CellProps>(node)) return textOf(node.props.children);
  return "";
}
const normalize = (value: unknown) => String(value ?? "").toLocaleLowerCase("ru").replaceAll("ё", "е").replace(/\s+/g, " ").trim();
const sortable = (value: string | number | null) => {
  if (typeof value === "number" || value === null) return value;
  const cleaned = value.replace(/[\s₽%]/g, "").replace(",", ".");
  if (cleaned === "" || cleaned === "—") return null;
  return /^-?\d+(\.\d+)?$/.test(cleaned) ? Number(cleaned) : value;
};

export default function DataTable({ children, className = "", label, pageSize = 100, context = "", query = "", onClearQuery }: {
  children: ReactNode; className?: string; label: string; pageSize?: number; context?: string;
  query?: string; onClearQuery?: () => void;
}) {
  const [filters, setFilters] = useState<Record<number, string>>({});
  const [sort, setSort] = useState<{column: number; direction: 1 | -1} | null>(null);
  const [page, setPage] = useState(0);
  const [menu, setMenu] = useState<{column: number; left: number; top: number} | null>(null);
  const [exportOpen, setExportOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const menuRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const exportRef = useRef<HTMLDialogElement>(null);
  const parts = elements(children);
  const head = parts.find(p => p.type === "thead");
  const body = parts.find(p => p.type === "tbody");
  const header = elements(head?.props.children)[0];
  const headers = elements(header?.props.children);
  const rows = useMemo(() => elements(body?.props.children).map((element, index) => {
    const cells = elements(element.props.children);
    return {element, index, cells, search: cells.map(c => c.props["data-search"] ?? textOf(c.props.children)),
      values: cells.map(c => "data-sort" in c.props ? c.props["data-sort"] ?? null : textOf(c.props.children))};
  }), [body]);
  const titles = headers.map(h => textOf(h.props.children));
  const usable = titles.map(t => !!t && t !== "Действия");
  const terms = normalize(query).split(" ").filter(Boolean);
  const matched = rows.filter(r => {
    const allFields = normalize(r.search.filter((_, i) => usable[i]).join(" "));
    return terms.every(term => allFields.includes(term)) &&
      Object.entries(filters).every(([column, value]) => normalize(r.search[Number(column)]).includes(normalize(value)));
  });
  useEffect(() => { setPage(0); }, [query]);
  if (sort) matched.sort((a, b) => {
    const x = sortable(a.values[sort.column]), y = sortable(b.values[sort.column]);
    if (x === null || y === null) return x === y ? a.index - b.index : x === null ? 1 : -1;
    const result = typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y), "ru", {numeric:true, sensitivity:"base"});
    return result * sort.direction || a.index - b.index;
  });
  const activeFilters = Object.entries(filters).filter(([,value]) => value.trim());
  const pages = Math.max(1, Math.ceil(matched.length / pageSize));
  const safePage = Math.min(page, pages - 1);
  function closeMenu() { setMenu(null); triggerRef.current?.focus(); }
  useEffect(() => {
    if (!menu) return;
    menuRef.current?.querySelector("input")?.focus();
    const outside = (e: PointerEvent) => { if (!menuRef.current?.contains(e.target as Node) && !triggerRef.current?.contains(e.target as Node)) setMenu(null); };
    const escape = (e: KeyboardEvent) => { if (e.key === "Escape") closeMenu(); };
    const resize = () => setMenu(null);
    document.addEventListener("pointerdown", outside); document.addEventListener("keydown", escape);
    window.addEventListener("resize", resize);
    return () => { document.removeEventListener("pointerdown", outside); document.removeEventListener("keydown", escape); window.removeEventListener("resize", resize); };
  }, [menu?.column]);
  useEffect(() => { if (exportOpen) exportRef.current?.showModal(); }, [exportOpen]);
  async function save(format: "csv" | "xlsx") {
    setBusy(true); setError("");
    try {
      const columns = titles.filter((_,i) => usable[i]);
      const values = matched.map(row => row.cells.filter((_,i) => usable[i]).map(cell =>
        "data-export" in cell.props ? cell.props["data-export"] ?? null : textOf(cell.props.children)));
      await downloadTable({columns, rows: values, format, title: label, context});
      setExportOpen(false);
    } catch (e) { setError(e instanceof Error ? e.message : "Не удалось выгрузить таблицу"); }
    finally { setBusy(false); }
  }
  return <div className="st-block" data-table={label}>
    <div className="st-toolbar">
      <span aria-live="polite">Найдено {matched.length} из {rows.length}</span>
      {(activeFilters.length > 0 || sort || (terms.length > 0 && onClearQuery)) && <button type="button" onClick={() => {setFilters({}); setSort(null); setPage(0); onClearQuery?.();}}>Сбросить всё <X size={16}/></button>}
      <button type="button" className="st-export" onClick={() => {setError(""); setExportOpen(true);}}><ArrowDownToLine size={17}/>Экспорт</button>
    </div>
    {(activeFilters.length > 0 || sort) && <div className="st-applied">
      {activeFilters.map(([key, value]) => <button type="button" key={key} onClick={() => setFilters(f => ({...f, [key]: ""}))}>{titles[Number(key)]}: {value} <X size={14}/></button>)}
      {sort && <button type="button" onClick={() => setSort(null)}>{titles[sort.column]} {sort.direction === 1 ? "↑" : "↓"} <X size={14}/></button>}
    </div>}
    <div className="st-scroll"><table className={className} aria-label={label}>
      <thead><tr>{headers.map((h, i) => cloneElement(h, {
        key:i, ...({"aria-sort": sort?.column === i ? sort.direction === 1 ? "ascending" : "descending" : "none"} as object),
        children: usable[i] ? <button type="button" className={"st-heading " + (filters[i] || sort?.column === i ? "is-active" : "")}
          aria-label={`Поиск и сортировка: ${titles[i]}`} aria-expanded={menu?.column === i} aria-haspopup="dialog"
          onClick={e => {triggerRef.current=e.currentTarget; const box=e.currentTarget.getBoundingClientRect(); setMenu(menu?.column === i ? null : {column:i,left:Math.max(8,Math.min(box.left,window.innerWidth-300)),top:Math.max(8,Math.min(box.bottom+6,window.innerHeight-340))});}}>
          <span>{h.props.children}</span>{sort?.column === i ? sort.direction === 1 ? <ArrowUp size={16}/> : <ArrowDown size={16}/> : <ChevronDown size={16}/>}</button> : h.props.children,
      }))}</tr></thead>
      <tbody>{matched.slice(safePage*pageSize, (safePage+1)*pageSize).map(r => r.element)}
        {!matched.length && <tr><td colSpan={headers.length}><div className="st-empty">По этим условиям строк нет. Измените поиск или сбросьте фильтры.</div></td></tr>}
      </tbody>
    </table></div>
    {pages > 1 && <div className="st-pages"><span>Строки {safePage*pageSize+1}–{Math.min((safePage+1)*pageSize,matched.length)} из {matched.length}</span>
      <button type="button" aria-label="Предыдущие строки" disabled={safePage === 0} onClick={() => setPage(safePage-1)}><ChevronLeft size={18}/></button>
      <button type="button" aria-label="Следующие строки" disabled={safePage === pages-1} onClick={() => setPage(safePage+1)}><ChevronRight size={18}/></button></div>}
    {menu && createPortal(<div ref={menuRef} className="st-menu" role="dialog" aria-label={`Столбец ${titles[menu.column]}`} style={{left:menu.left, top:menu.top}}>
      <div className="st-menu-title"><b>{titles[menu.column]}</b><button type="button" aria-label="Закрыть настройки столбца" onClick={closeMenu}><X size={18}/></button></div>
      <label>Поиск в этом столбце<input aria-label={`Поиск: ${titles[menu.column]}`} value={filters[menu.column] || ""} placeholder="Введите часть значения" onChange={e => {setFilters(f => ({...f,[menu.column]:e.target.value})); setPage(0);}} /></label>
      <button type="button" onClick={() => {setSort({column:menu.column,direction:1});setPage(0);closeMenu();}}><ArrowUp size={17}/>По возрастанию / А–Я</button>
      <button type="button" onClick={() => {setSort({column:menu.column,direction:-1});setPage(0);closeMenu();}}><ArrowDown size={17}/>По убыванию / Я–А</button>
      <button type="button" onClick={() => {setFilters(f => ({...f,[menu.column]:""})); if(sort?.column===menu.column)setSort(null); closeMenu();}}>Сбросить этот столбец</button>
    </div>,document.body)}
    {exportOpen && createPortal(<dialog ref={exportRef} className="st-export-dialog" aria-labelledby="st-export-title" onCancel={() => setExportOpen(false)}>
      <div className="st-menu-title"><h2 id="st-export-title">В каком формате выгрузить</h2><button type="button" aria-label="Закрыть экспорт" onClick={() => setExportOpen(false)}><X size={20}/></button></div>
      <p>{label}{context ? " · " + context : ""}</p><p>Будут выгружены все найденные строки: <b>{matched.length}</b>. Поиск и порядок сортировки сохранятся, включая строки на других страницах.</p>
      {error && <p role="alert" className="st-error">{error}</p>}
      <div className="st-formats"><button type="button" disabled={busy} onClick={() => save("xlsx")}>Excel (.xlsx)</button><button type="button" disabled={busy} onClick={() => save("csv")}>CSV (.csv)</button></div>
      {busy && <p role="status">Готовим файл…</p>}
    </dialog>,document.body)}
  </div>;
}
