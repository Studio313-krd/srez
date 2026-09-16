import {useEffect, useRef, useState} from 'react';
import {api} from './api';
import './test-site.css';

type Run = {date:string;started:boolean;reports:{checkpoint:string;available_at:string;deadline:string;store__code:string}[]};
const labels:Record<string,string>={'13':'13:00','17':'17:00',close:'Закрытие'};
const time=(value:string)=>new Date(value).toLocaleTimeString('ru-RU',{timeZone:'Europe/Moscow',hour:'2-digit',minute:'2-digit',second:'2-digit'});

export default function TestSiteControls() {
  const [run,setRun]=useState<Run|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false);
  const [confirm,setConfirm]=useState(false),[notice,setNotice]=useState('');
  const dialog=useRef<HTMLDialogElement>(null);
  useEffect(()=>{let live=true;api<Run>('test-site/').then(r=>{if(live)setRun(r);}).catch(e=>{if(live)setError(e.message);});return()=>{live=false;};},[]);
  useEffect(()=>{if(confirm)dialog.current?.showModal();},[confirm]);
  async function start(restart=false) {
    setBusy(true);setError('');
    try {
      const result=await api<{message:string}>('test-site/start/',{restart_confirmed:restart});
      setNotice(result.message);setConfirm(false);setRun(await api<Run>('test-site/'));
    } catch(e) {setError(e instanceof Error?e.message:'Не удалось начать прогон');}
    finally {setBusy(false);}
  }
  const points=run?.reports.filter(r=>r.store__code==='TEST-MS')||[];
  return <section className="t-controls" aria-label="Тестовый прогон">
    <div className="t-controls-head"><div><h2>Первый тест за 9 минут</h2><p>Продавец заполняет отчёты двух учебных магазинов. Видеоконтроль проверяет их под аккаунтом администратора.</p></div>
      <button className="primary-button" disabled={busy||!run} onClick={()=>run?.started?setConfirm(true):start()}>{busy?'Подготавливаем…':run?.started?'Начать заново':'Начать тест сейчас'}</button></div>
    <p>Сначала проверьте сотрудников и планы во вкладках ниже. Затем запускайте прогон, когда оба участника вошли на сайт.</p>
    {!!points.length && <ol className="t-checkpoints">{points.map(p=><li key={p.checkpoint}><b>{labels[p.checkpoint]}</b><span>Откроется в {time(p.available_at)}</span><span>Сдать до {time(p.deadline)} МСК</span></li>)}</ol>}
    <p>Названия срезов остаются «13:00», «17:00» и «Закрытие», но здесь они открываются с интервалом в 3 минуты. Не отправляйте первый отчёт «Культуры крепкого» до его срока — так вы проверите опоздание и Telegram.</p>
    <a href={'/?date='+(run?.date||'')}>Открыть рабочий стол на сегодня →</a>
    {notice&&<p role="status" className="t-notice">{notice}</p>}
    {error&&<p role="alert" className="t-error">{error}</p>}
    {confirm&&<dialog ref={dialog} className="t-confirm" aria-labelledby="t-confirm-title" onCancel={()=>setConfirm(false)}>
      <h2 id="t-confirm-title">Начать тест заново</h2><p>Учебные отчёты, исправления и вопросы двух магазинов за сегодня будут удалены. Доступы, сотрудники и планы сохранятся. Уже отправленные сообщения останутся в Telegram.</p>
      {error&&<p role="alert" className="t-error">{error}</p>}
      <div><button className="secondary-button" disabled={busy} onClick={()=>setConfirm(false)}>Отмена</button><button className="primary-button" disabled={busy} onClick={()=>start(true)}>Удалить учебные отчёты и начать</button></div>
    </dialog>}
  </section>;
}
