export type User = {
  id: number;
  name: string;
  username: string;
  role: "store" | "office" | "manager" | null;
  admin: boolean;
};
export type Revision = {
  version: number;
  author: string;
  received_at: string | null;
  revenue: string | null;
  receipts: number | null;
  units: number | null;
  origin: string;
  employee: string;
  recorded_by: string;
  imported_at: string | null;
  source_data: SourceData;
  comment: string;
  units_per_receipt: string | null;
};
export type Finding = {
  id: number;
  kind: string;
  message: string;
  state: string;
  version: number;
  actions: { author: string; action: string; comment: string; at: string }[];
};
export type Report = {
  id: number;
  checkpoint: string;
  deadline: string | null;
  available_at: string | null;
  imported: boolean;
  source_data: SourceData;
  first_received_at: string | null;
  version: number;
  status: string;
  late: boolean;
  current: Revision | null;
  findings: Finding[];
  history?: Revision[];
};
export type StoreData = {
  id: number;
  code: string;
  name: string;
  city: string;
  network: string;
  timezone: string;
  monitoring_enabled: boolean;
  profile: Record<string, unknown>;
  employees: { employee_id: number; employee__name: string; slot: string }[];
  business_date: string;
  checkpoint_status: Record<string, string>;
  reports: Report[];
  plan: {
    id: number;
    revenue: string | null;
    receipts: number | null;
    units: number | null;
    approved_at: string;
    origin: string;
    units_per_receipt: string | null;
  } | null;
};
export type SourceData = {
  url?: string;
  sheet?: string;
  row?: number;
  employee?: string;
  contacts?: unknown;
  reserves?: unknown;
  returning?: unknown;
  losses?: unknown;
  priority?: unknown;
  action?: unknown;
  responsible?: unknown;
};
export type Dashboard = {
  date: string;
  server_time: string;
  stores: StoreData[];
  worker_ok: boolean;
};
let csrf = "";
export async function downloadTable(data: {columns: string[]; rows: (string | number | null)[][]; format: "csv" | "xlsx"; title: string; context: string}) {
  const response = await fetch("/api/table-export/", {method:"POST", credentials:"same-origin", headers:{"Content-Type":"application/json", "X-CSRFToken":csrf}, body:JSON.stringify(data)});
  if (!response.ok) {
    if (response.status === 401) window.dispatchEvent(new Event("session-expired"));
    const result = await response.json().catch(() => ({}));
    throw new Error(result.error || "Не удалось выгрузить таблицу. Повторите попытку.");
  }
  const url = URL.createObjectURL(await response.blob());
  const name = (data.context || "table").replace(/[<>:"/\\|?*]/g, "-");
  const link = document.createElement("a"); link.href=url; link.download=`srez-${name}.${data.format}`; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}
export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}
export async function api<T>(
  path: string,
  data?: unknown,
  signal?: AbortSignal,
): Promise<T> {
  let response: Response;
  try {
    response = await fetch("/api/" + path, {
      method: data === undefined ? "GET" : "POST",
      credentials: "same-origin",
      headers:
        data === undefined
          ? {}
          : { "Content-Type": "application/json", "X-CSRFToken": csrf },
      body: data === undefined ? undefined : JSON.stringify(data),
      signal,
    });
  } catch (error) {
    if (signal?.aborted) throw error;
    throw new ApiError(
      "Нет связи с сервером. Введённые данные остаются в форме; повторите отправку после восстановления связи.",
      0,
    );
  }
  if (!response.headers.get("content-type")?.includes("application/json")) {
    throw new ApiError("Сервер временно недоступен. Повторите действие.", 502);
  }
  const result = await response.json();
  if (!response.ok) {
    if (response.status === 401 && path !== "login/")
      window.dispatchEvent(new Event("session-expired"));
    throw new ApiError(
      result.error || "Не удалось выполнить действие.",
      response.status,
    );
  }
  if (result.csrf) csrf = result.csrf;
  return result;
}
