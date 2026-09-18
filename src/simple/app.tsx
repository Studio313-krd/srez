import { useCallback, useEffect, useRef, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  CircleHelp,
  LogOut,
  RefreshCw,
  Table2,
} from "lucide-react";
import { api } from "../api";
import type { Dashboard, StoreData, User } from "../api";
import Office from "./office";
import Seller from "./seller";
import { Hint } from "./help";
import Settings, { PlanEditor } from "./settings";
import { Conversation, errorText, Modal, Notice } from "./shared";
import "./simple.css";

type Session = { user: User | null; today: string; local_preview: boolean; test_mode: boolean };
export default function SimpleWorkspace() {
  const [session, setSession] = useState<Session | null>(null),
    [data, setData] = useState<Dashboard | null>(null),
    [date, setDate] = useState(""),
    [screen, setScreen] = useState("reports"),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [dirty, setDirty] = useState(false);
  const [help, setHelp] = useState(false),
    [loginName, setLoginName] = useState(""),
    [loginPassword, setLoginPassword] = useState(""),
    [talk, setTalk] = useState<{ id: number; stage: string } | null>(null),
    [plan, setPlan] = useState<StoreData | null>(null);
  const dirtyRef = useRef(dirty);
  const initialQuery = useRef(new URLSearchParams(window.location.search));
  const linkedReport = useRef(Number(initialQuery.current.get("report")) || null);
  const boot = useRef<Promise<{session: Session; error?: string}> | null>(null);
  dirtyRef.current = dirty;
  const user = session?.user,
    isSeller = user?.role === "store";
  const viewRef = useRef("");
  viewRef.current = (user?.id ?? "") + ":" + date;
  useEffect(() => {
    document.title = session?.local_preview ? "Срез — локальный прототип" : session?.test_mode ? "Срез — тестовая версия" : "Срез — отчёты магазинов";
  }, [session?.local_preview, session?.test_mode]);
  useEffect(() => {
    let live = true;
    // Reuse the request across StrictMode effects; consume the URL only once.
    if (!boot.current) {
      const token = new URLSearchParams(window.location.hash.slice(1)).get("seller");
      if (token !== null) window.history.replaceState(null, "", window.location.pathname + window.location.search);
      boot.current = api<Session>("session/").then(async s => {
        if (token === null) return {session:s};
        try {
          const result = await api<{user:User}>("employee-link/login/", {token});
          return {session:{...s, user:result.user}};
        } catch (e) {
          return {session:{...s, user:null}, error:errorText(e)};
        }
      });
    }
    boot.current
      .then((result) => {
        if (live) {
          setSession(result.session);
          const queryDate = initialQuery.current.get("date") || "";
          setDate(/^\d{4}-\d{2}-\d{2}$/.test(queryDate) ? queryDate : result.session.today);
          if (result.error) setError(result.error);
        }
      })
      .catch((e) => setError(errorText(e)));
    const expired = () => {
      setSession((s) => (s ? { ...s, user: null } : s));
      setData(null);
    };
    window.addEventListener("session-expired", expired);
    const openLink = () => {
      if (new URLSearchParams(window.location.hash.slice(1)).has("seller")) window.location.reload();
    };
    window.addEventListener("hashchange", openLink);
    return () => {
      live = false;
      window.removeEventListener("session-expired", expired);
      window.removeEventListener("hashchange", openLink);
    };
  }, []);
  const refresh = useCallback(async () => {
    if (!user || !date) return;
    const key = user.id + ":" + date;
    const d = await api<Dashboard>("dashboard/?date=" + date);
    if (viewRef.current === key) {
      setData(d);
      setError("");
    }
  }, [user?.id, date]);
  useEffect(() => {
    setData(null);
    refresh().catch((e) => setError(errorText(e)));
  }, [refresh]);
  useEffect(() => {
    if (!data || !linkedReport.current) return;
    const store = data.stores.find(s => s.reports.some(r => r.id === linkedReport.current));
    const report = store?.reports.find(r => r.id === linkedReport.current);
    if (store && report) setTalk({id:store.id, stage:report.checkpoint});
    else setNotice("Отчёт из ссылки не найден на выбранную дату или недоступен этому сотруднику");
    linkedReport.current = null;
  }, [data]);
  useEffect(() => {
    if (!user) return;
    const timer = setInterval(() => {
      if (!dirtyRef.current && !document.hidden)
        refresh().catch((e) => setError(errorText(e)));
    }, 15000);
    return () => clearInterval(timer);
  }, [refresh, user?.id]);
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (dirtyRef.current) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, []);
  function safe(fn: () => void) {
    if (dirty && !confirm("Есть несохранённые цифры. Отменить их и перейти?"))
      return;
    setDirty(false);
    fn();
  }
  async function selectRole(role: "manager" | "store") {
    if (user?.role === role) return;
    safe(async () => {
      setBusy(true);
      try {
        const s = await api<{ user: User }>("local-preview/login/", { role });
        setSession((v) => (v ? { ...v, user: s.user } : null));
        setData(null);
        setScreen("reports");
        setTalk(null);
        setPlan(null);
        setNotice("");
      } catch (e) {
        setError(errorText(e));
      } finally {
        setBusy(false);
      }
    });
  }
  async function logout() {
    safe(async () => {
      try {
        await api("logout/", {});
        setSession((s) => (s ? { ...s, user: null } : s));
        setData(null);
      } catch (e) {
        setError(errorText(e));
      }
    });
  }
  function moveDay(offset: number) {
    const d = new Date(date + "T12:00:00");
    d.setDate(d.getDate() + offset);
    safe(() =>
      setDate(
        d.getFullYear() +
          "-" +
          String(d.getMonth() + 1).padStart(2, "0") +
          "-" +
          String(d.getDate()).padStart(2, "0"),
      ),
    );
  }
  const selectedStore = talk && data?.stores.find((s) => s.id === talk.id);
  return (
    <div className="simple-app">
      <a href="#s-main" className="s-skip">
        Перейти к отчётам
      </a>
      {(session?.local_preview || session?.test_mode) && <div className="s-preview-bar">
        <span>
          <i />
          {session.local_preview ? "Локальный прототип" : "Тестовая версия Среза"}{" "}
          <span className="s-preview-detail">
            {session.local_preview ? "· учебные данные · уведомления выключены" : "· отдельная учебная база"}
          </span>
        </span>
        {session?.local_preview && user && ["test.admin", "test.seller"].includes(user.username) && (
          <div className="s-role-switch" aria-label="Посмотреть интерфейс">
            <span>Посмотреть как</span>
            <button
              disabled={busy}
              className={!isSeller ? "active" : ""}
              onClick={() => selectRole("manager")}
            >
              Видеоконтроль
            </button>
            <button
              disabled={busy}
              className={isSeller ? "active" : ""}
              onClick={() => selectRole("store")}
            >
              Продавец
            </button>
          </div>
        )}
      </div>}
      <header className="s-header">
        <div className="s-logo">
          <Table2 size={28} />
          <b>срез</b>
          <span>Отчёты за день</span>
        </div>
        {user && (
          <div className="s-header-tools">
            <button className="s-text-button" onClick={() => setHelp(true)}>
              <CircleHelp size={19} />
              Как пользоваться
            </button>
            <span className="s-account">
              {isSeller ? "Продавец" : "Видеоконтроль"}
            </span>
            <button className="s-icon" aria-label="Выйти" onClick={logout}>
              <LogOut size={20} />
            </button>
          </div>
        )}
      </header>
      {!session ? (
        <main className="s-welcome">
          {error ? <Notice error>{error}</Notice> : <p>Открываем Срез…</p>}
        </main>
      ) : !user ? (
        <main className="s-welcome">
          <span className="s-label">Новый интерфейс</span>
          <h1>Вход в Срез</h1>
          <p>
            Для офиса — таблица всей сети
            <br />
            Для продавца — три поля и кнопка сохранения
          </p>
          <p>Продавцу достаточно открыть личную ссылку от видеоконтроля</p>
          <details className="s-admin-login" open={!session.local_preview}>
          <summary>Вход администратора</summary>
          <form className="s-login-form" onSubmit={async e => {
            e.preventDefault(); setBusy(true); setError("");
            try {
              const result = await api<{user:User}>("login/", {username: loginName, password: loginPassword});
              setSession({...session, user:result.user}); setLoginPassword(""); setNotice(""); setScreen("reports");
            } catch(e) {setError(errorText(e));} finally {setBusy(false);}
          }}>
            <label>Логин<input autoComplete="username" required value={loginName} onChange={e => setLoginName(e.target.value)} /></label>
            <label>Пароль<input autoComplete="current-password" type="password" required value={loginPassword} onChange={e => setLoginPassword(e.target.value)} /></label>
            <button className="s-btn primary" disabled={busy}>{busy ? "Входим…" : "Войти"}</button>
          </form>
          </details>
          {session.local_preview ? (
            <div className="s-welcome-roles">
              <button onClick={() => selectRole("manager")} disabled={busy}>
                <Table2 size={27} />
                <b>Видеоконтроль</b>
                <span>Проверить отчёты и задать вопрос →</span>
              </button>
              <button onClick={() => selectRole("store")} disabled={busy}>
                <span className="s-three-fields" aria-hidden="true">
                  <i />
                  <i />
                  <i />
                </span>
                <b>Продавец</b>
                <span>Заполнить показатели магазина →</span>
              </button>
            </div>
          ) : null}
          {error && <Notice error>{error}</Notice>}
          {session.local_preview && <small>Кнопки «Видеоконтроль» и «Продавец» — быстрый вход без пароля только для локальной проверки</small>}
        </main>
      ) : (
        <>
          <div className="s-nav-row">
            {!isSeller ? (
              <nav aria-label="Разделы">
                <button
                  className={screen === "reports" ? "selected" : ""}
                  onClick={() => {
                    if (screen !== "reports") safe(() => setScreen("reports"));
                  }}
                >
                  Отчёты
                </button>
                <button
                  className={screen === "settings" ? "selected" : ""}
                  onClick={() => {
                    if (screen !== "settings")
                      safe(() => setScreen("settings"));
                  }}
                >
                  Магазины и сотрудники
                </button>
              </nav>
            ) : (
              <span className="s-seller-nav">
                Заполните отчёт — офис увидит его сразу
              </span>
            )}
            <div className="s-date">
              <Hint
                label="Рабочая дата"
                text="Выберите день, за который смотрите или заполняете отчёты. Это дата смены магазина. Кнопка «Сегодня» возвращает текущую дату"
              />
              <button
                className="s-icon"
                aria-label="Предыдущий день"
                title="Показать отчёты за предыдущую дату"
                onClick={() => moveDay(-1)}
              >
                <ChevronLeft size={18} />
              </button>
              <label>
                <span className="s-sr-only">Рабочая дата</span>
                <input
                  aria-label="Рабочая дата"
                  type="date"
                  value={date}
                  onChange={(e) => {
                    if (e.target.value) safe(() => setDate(e.target.value));
                  }}
                />
              </label>
              <button
                className="s-icon"
                aria-label="Следующий день"
                title="Показать отчёты за следующую дату"
                onClick={() => moveDay(1)}
              >
                <ChevronRight size={18} />
              </button>
              <button
                className="s-text-button"
                disabled={date === session.today}
                onClick={() => safe(() => setDate(session.today))}
              >
                Сегодня
              </button>
            </div>
          </div>
          <main id="s-main" className={"s-main " + (dirty ? "has-draft" : "")}>
            {error && <Notice error>{error}</Notice>}
            {notice && (
              <div className="s-success">
                <Notice>{notice}</Notice>
                <button className="s-text-button" onClick={() => setNotice("")}>
                  Закрыть
                </button>
              </div>
            )}
            {!data ? (
              <p className="s-loading">
                {error ? (
                  <button
                    className="s-btn"
                    onClick={() =>
                      refresh().catch((e) => setError(errorText(e)))
                    }
                  >
                    Повторить загрузку
                  </button>
                ) : (
                  "Загружаем показатели…"
                )}
              </p>
            ) : isSeller ? (
              <Seller
                employeeName={user.employee_name}
                key={date}
                data={data}
                dirty={dirty}
                onDirty={setDirty}
                onRefresh={refresh}
                onTalk={(s, stage) => setTalk({ id: s.id, stage })}
                onSaved={setNotice}
              />
            ) : screen === "settings" ? (
              <Settings
                date={date}
                stores={data.stores}
                localPreview={!!session.local_preview}
                onRefresh={refresh}
                onPlan={setPlan}
                onSaved={setNotice}
              />
            ) : (
              <Office
                key={date}
                data={data}
                onRefresh={refresh}
                onDirty={setDirty}
                onTalk={(s, stage) => setTalk({ id: s.id, stage })}
                onPlan={setPlan}
                onSaved={setNotice}
              />
            )}
          </main>
          <footer className="s-footer">
            <span>
              {dirty
                ? "Есть несохранённые изменения"
                : data
                  ? "Обновлено " +
                    new Date(data.server_time).toLocaleTimeString("ru-RU", {
                      hour: "2-digit",
                      minute: "2-digit",
                    })
                  : ""}
            </span>
            <button
              className="s-text-button"
              title="Загрузить свежие показатели с сервера. Обычно они обновляются автоматически"
              disabled={dirty}
              onClick={() => refresh().catch((e) => setError(errorText(e)))}
            >
              <RefreshCw size={15} />
              Обновить
            </button>
            <span>
              {session.test_mode ? "Учебная база · " : ""}Магазинов на дату: {data?.stores.length ?? "—"}
            </span>
          </footer>
        </>
      )}
      {talk && selectedStore && (
        <Conversation
          store={selectedStore}
          stage={talk.stage}
          isSeller={!!isSeller}
          onClose={() => setTalk(null)}
          onChange={refresh}
        />
      )}
      {plan && (
        <PlanEditor
          store={plan}
          date={date}
          onClose={() => setPlan(null)}
          onSaved={async () => {
            await refresh();
            setNotice("План на день сохранён");
          }}
        />
      )}
      {help && (
        <Modal title="Как пользоваться" onClose={() => setHelp(false)}>
          <div className="s-modal-body s-help">
            <p>
              {isSeller
                ? "Три шага, чтобы сдать отчёт"
                : "Вся ежедневная работа — на одном листе"}
            </p>
            <ol>
              {(isSeller
                ? [
                    "Проверьте магазин и дату. Выберите 13:00, 17:00 или закрытие",
                    "Введите выручку, чеки и алкогольные единицы с начала смены",
                    "Нажмите «Сохранить отчёт». Дождитесь сообщения о сохранении",
                    "Под полями видны планы и проценты выполнения. Внизу — сохранённые итоги на 13:00, 17:00 и закрытие",
                    "Чтобы написать в офис, нажмите «Задать вопрос видеоконтролю / история отчёта». Там же появится ответ",
                  ]
                : [
                    "Выберите дату. В таблице сразу видны все три отчёта каждого магазина",
                    "Для ввода нажмите на ячейку. Заполните три показателя и нажмите «Сохранить отчёт»",
                    "Чтобы уточнить цифры, нажмите значок сообщения в строке магазина",
                    "Сотрудники, часы работы и дневной план — в разделе «Магазины и сотрудники»",
                    "У сотрудника нажмите «Доступ»: выберите магазины, создайте и скопируйте личную ссылку. Отправьте её продавцу в личном сообщении — он войдёт без пароля",
                    "В выборе магазинов есть поиск по коду и названию. Чтобы отозвать старую ссылку, нажмите «Заменить ссылку»",
                    "Над списками магазинов и сотрудников есть поиск сразу по всем столбцам. Он работает вместе с фильтрами в заголовках",
                    "«Удалить» сохраняет историю. Чтобы вернуть запись, включите «Показывать удалённые…» над нужной таблицей и нажмите «Восстановить»",
                  ]
              ).map((s, i) => (
                <li key={s}>
                  <span>{i + 1}</span>
                  {s}
                </li>
              ))}
            </ol>
            <p className="s-help-note">
              {session?.local_preview
                ? "В локальном прототипе можно переключать роли в верхней полосе. Изменения сохраняются в отдельной учебной базе на этом компьютере"
                : "Продавец входит по личной ссылке от видеоконтроля. Администратор управляет сотрудниками и доступом в разделе «Магазины и сотрудники»"}
            </p>
            {session?.test_mode && !session.local_preview && !isSeller && <p><a href="/management?classic=1">Настройки тестового прогона и уведомлений</a></p>}
            <button className="s-btn primary" onClick={() => setHelp(false)}>
              Понятно, начнём
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
