import React,{useEffect,useRef,useState} from 'react';
import {Link,useNavigate,useSearchParams} from 'react-router-dom';
import {getDomainHistory,ScanResponse} from '../services/api';
import {compareScans,ScanComparison,ComparisonChange} from '../services/scanComparison';
import {ApiError,invalidResponseError,toApiError} from '../lib/apiError';
import {ErrorPanel,LoadingPanel,StatePanel} from '../components/FeedbackState';
import SeverityBadge from '../components/SeverityBadge';
import {useAuth} from '../context/AuthContext';

export default function ScanComparisonPage(){
  const [params]=useSearchParams();const navigate=useNavigate();const {logout}=useAuth();
  const raw=params.get('dominio');const parsed=raw && /^[1-9][0-9]*$/.test(raw)?Number(raw):NaN;
  const domainId=Number.isSafeInteger(parsed)?parsed:null;
  const [history,setHistory]=useState<{domainId:number;scans:ScanResponse[]}|null>(null);
  const [loading,setLoading]=useState(false);const [refresh,setRefresh]=useState(0);
  const [baseline,setBaseline]=useState('');const [compared,setCompared]=useState('');
  const [result,setResult]=useState<ScanComparison|null>(null);
  const [error,setError]=useState<ApiError|null>(null);const [busy,setBusy]=useState(false);
  const action=useRef<AbortController|null>(null);
  useEffect(()=>{
    const controller=new AbortController();action.current?.abort();setResult(null);setError(null);setBusy(false);
    setHistory(null);setBaseline('');setCompared('');
    if(domainId===null)return;
    setLoading(true);
    getDomainHistory(domainId,controller.signal).then(scans=>{
      if(controller.signal.aborted)return;
      const completed=scans.filter(s=>s.status==='COMPLETED');
      setHistory({domainId,scans:completed});
      setBaseline(completed.length>1?String(completed[1].id):'');setCompared(completed.length?String(completed[0].id):'');
    }).catch(err=>{if(!controller.signal.aborted)setError(toApiError(err));})
      .finally(()=>{if(!controller.signal.aborted)setLoading(false);});
    return ()=>{controller.abort();action.current?.abort();};
  },[domainId,refresh]);
  const scans=history?.domainId===domainId?history.scans:[];
  function select(setter:(value:string)=>void,value:string){
    action.current?.abort();setBusy(false);setResult(null);setError(null);setter(value);
  }
  async function compare(event:React.FormEvent){
    event.preventDefault();if(busy || !baseline || !compared || baseline===compared)return;
    action.current?.abort();const controller=new AbortController();action.current=controller;
    setBusy(true);setError(null);setResult(null);
    try{
      const next=await compareScans(Number(baseline),Number(compared),controller.signal);
      if(controller.signal.aborted)return;
      if(next.domainId!==domainId)throw invalidResponseError('domínio da comparação divergente');
      setResult(next);
    }catch(err){if(!controller.signal.aborted)setError(toApiError(err));}
    finally{if(!controller.signal.aborted)setBusy(false);}
  }
  const goToLogin=()=>{logout();navigate('/login',{replace:true});};
  return <div className="mx-auto max-w-5xl px-6 py-10">
    <Link to="/" className="mb-6 inline-block text-sm text-slate-400">← Dashboard</Link>
    <h1 className="mb-2 text-xl font-semibold">Comparar varreduras</h1>
    <p className="mb-6 text-sm text-slate-400">Selecione uma base e outra execução concluída do mesmo domínio. As diferenças são relativas à base escolhida.</p>
    {domainId===null && <StatePanel title="Domínio inválido"><p>Abra a comparação pelo histórico do domínio no Dashboard.</p></StatePanel>}
    {loading && <LoadingPanel label="Carregando varreduras concluídas..."/>}
    {error && <ErrorPanel title="Não foi possível carregar a comparação" error={error} handlers={{retry:()=>setRefresh(x=>x+1),dashboard:()=>navigate('/'),login:goToLogin}}/>}
    {!loading && history?.domainId===domainId && scans.length<2 && <StatePanel title="São necessárias duas varreduras concluídas"><p>Os resultados atuais continuam disponíveis no histórico.</p></StatePanel>}
    {domainId!==null && <form onSubmit={compare} className="mb-6 grid gap-4 rounded-xl border border-white/10 bg-panel p-5 sm:grid-cols-2">
      <Selection label="Varredura base" id="comparison-base" value={baseline} scans={scans} onChange={v=>select(setBaseline,v)}/>
      <Selection label="Varredura comparada" id="comparison-current" value={compared} scans={scans} onChange={v=>select(setCompared,v)}/>
      <button disabled={busy || loading || scans.length<2 || !baseline || !compared || baseline===compared} className="rounded-md bg-accent px-4 py-2 text-ink disabled:opacity-50">{busy?'Comparando...':'Comparar varreduras'}</button>
    </form>}
    {result?.domainId===domainId && <Results result={result}/>}
  </div>;
}
function Selection({label,id,value,scans,onChange}:{label:string;id:string;value:string;scans:ScanResponse[];onChange:(v:string)=>void}){
  return <div><label htmlFor={id} className="mb-1 block text-sm">{label}</label>
    <select id={id} value={value} onChange={e=>onChange(e.target.value)} className="w-full rounded-md border border-white/20 bg-ink p-2">
      <option value="">Selecione</option>{scans.map(s=><option key={s.id} value={s.id}>#{s.id} — {new Date(s.finishedAt??s.createdAt).toLocaleString('pt-BR')}</option>)}
    </select></div>;
}
function Results({result:r}:{result:ScanComparison}){
  return <section aria-label="Resultado da comparação">
    <h2 className="mb-3 text-lg font-medium">{r.hostname}: base #{r.baseline.id} → comparada #{r.compared.id}</h2>
    {!r.complete && <div className="mb-5 rounded-xl border border-risk-medium/50 bg-risk-medium/5 p-4">
      <h3 className="font-medium">Comparação limitada</h3>{r.limitations.map((text,i)=><p key={i} className="mt-2 text-sm">{text}</p>)}
      <p className="mt-2 text-sm">Sem identidade confiável: {r.unidentifiedBaseline} na base e {r.unidentifiedCompared} na comparada.</p>
    </div>}
    <div className="mb-5 grid gap-3 sm:grid-cols-4">
      {[['Novos em relação à base',r.complete?r.added.length:'Indeterminado'],['Não detectados novamente',r.complete?r.removed.length:'Indeterminado'],
        ['Persistentes',r.persistent.length],['Severidade alterada',r.persistent.filter(x=>x.severityChanged).length]].map(([label,value])=>
        <div key={label} className="rounded-xl border border-white/10 bg-panel p-4"><p className="text-xs text-slate-400">{label}</p><p className="mt-1 text-lg font-semibold">{value}</p></div>)}
    </div>
    <p className="mb-4 text-sm text-slate-400">Ausência de um achado não comprova correção: cobertura e condições do alvo podem mudar entre varreduras. A identidade usa regra ZAP, URL, método HTTP e parâmetro; o texto não identifica o achado.</p>
    <p className="mb-5 text-xs text-slate-500">Duplicatas agrupadas: {r.duplicateBaseline} na base e {r.duplicateCompared} na comparada. Cada grupo usa a maior severidade entre as ocorrências identificadas.</p>
    {r.complete && <><Changes title="Novos em relação à base" rows={r.added}/><Changes title="Não detectados novamente" rows={r.removed}/></>}
    <Changes title="Persistentes" rows={r.persistent}/>
    {!r.complete && <><Changes title="Sem correspondência confirmada — base" rows={r.unmatchedBaseline} uncertain/><Changes title="Sem correspondência confirmada — comparada" rows={r.unmatchedCompared} uncertain/></>}
    <div className="mt-6 flex gap-4 text-sm text-accent"><Link to={`/scans/${r.baseline.id}`}>Abrir varredura base</Link><Link to={`/scans/${r.compared.id}`}>Abrir varredura comparada</Link></div>
  </section>;
}
function Changes({title,rows,uncertain=false}:{title:string;rows:ComparisonChange[];uncertain?:boolean}){
  return <section className="mb-6"><h3 className="mb-3 font-medium">{title}</h3>
    {rows.length===0?<p className="text-sm text-slate-500">Nenhum achado nesta categoria.</p>:<ul className="space-y-3">{rows.map(row=>
      <li key={JSON.stringify([row.ruleId,row.url,row.parameter,row.method])} className="rounded-xl border border-white/10 bg-panel p-4">
        <h4 className="mb-2 break-words font-medium">{row.title}</h4>
        <p className="mb-2 break-all text-xs text-slate-400">{row.method} {row.url} · Regra {row.ruleId} · Parâmetro: {row.parameter||'não informado'}</p>
        <div className="flex items-center gap-2 text-sm">{row.baselineSeverity?<SeverityBadge severity={row.baselineSeverity}/>:<span>{uncertain?'Correspondência indeterminada na base':'Ausente na base'}</span>}<span>→</span>{row.comparedSeverity?<SeverityBadge severity={row.comparedSeverity}/>:<span>{uncertain?'Correspondência indeterminada na comparada':'Ausente na comparada'}</span>}</div>
        {row.severityChanged && <p className="mt-2 text-xs text-risk-medium">Severidade alterada</p>}
        <p className="mt-2 text-xs text-slate-500">Ocorrências identificadas: {uncertain && row.baselineOccurrences===0?'Indeterminado':row.baselineOccurrences} → {uncertain && row.comparedOccurrences===0?'Indeterminado':row.comparedOccurrences}</p>
      </li>)}</ul>}
  </section>;
}
