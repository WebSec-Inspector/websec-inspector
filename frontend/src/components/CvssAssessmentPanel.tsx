import React,{useEffect,useRef,useState} from 'react';
import {CVSS_METRICS,CvssView,CvssCalculation,getCvss,previewCvss,saveCvss} from '../services/cvss';
import {toApiError} from '../lib/apiError';

export default function CvssAssessmentPanel({findingId,onSaved}:{findingId:number;onSaved?:()=>void}){
  return <Panel key={findingId} findingId={findingId} onSaved={onSaved}/>;
}
function Panel({findingId,onSaved}:{findingId:number;onSaved?:()=>void}){
  const [data,setData]=useState<CvssView|null>(null),[values,setValues]=useState<Record<string,string>>({});
  const [calculation,setCalculation]=useState<CvssCalculation|null>(null),[justification,setJustification]=useState('');
  const [error,setError]=useState(''),[busy,setBusy]=useState(false),[refresh,setRefresh]=useState(0);
  const action=useRef<AbortController|null>(null);const guard=useRef(false);
  const vector='CVSS:4.0/'+CVSS_METRICS.map(m=>`${m.key}:${values[m.key]??''}`).join('/');
  const complete=CVSS_METRICS.every(m=>Boolean(values[m.key]));
  useEffect(()=>{
    const controller=new AbortController();setError('');
    getCvss(findingId,controller.signal).then(next=>{
      if(controller.signal.aborted)return;setData(next);
      setValues(next.assessment?Object.fromEntries(next.assessment.vector.split('/').slice(1).map(s=>s.split(':'))):{});
      setJustification(next.assessment?.justification??'');setCalculation(null);
    }).catch(err=>{if(!controller.signal.aborted)setError(toApiError(err).message);});
    return ()=>{controller.abort();action.current?.abort();};
  },[findingId,refresh]);
  async function run(save:boolean){
    if(guard.current || !complete)return;guard.current=true;setBusy(true);setError('');
    const controller=new AbortController();action.current=controller;
    try{
      if(save){
        const next=await saveCvss(findingId,vector,justification.trim(),data?.assessment?.revision??0,controller.signal);
        if(controller.signal.aborted)return;setData(next);setCalculation(null);onSaved?.();
      }else{
        const next=await previewCvss(vector,controller.signal);
        if(!controller.signal.aborted)setCalculation(next);
      }
    }catch(err){if(!controller.signal.aborted)setError(toApiError(err).message);}
    finally{if(!controller.signal.aborted){guard.current=false;setBusy(false);}}
  }
  return <section aria-label="Avaliação CVSS" className="mt-5 border-t border-white/10 pt-4">
    <h4 className="font-medium">CVSS 4.0 Base</h4>
    {!data && !error && <p className="mt-2 text-sm text-slate-400">Consultando avaliação...</p>}
    {data && !data.assessment && <p className="my-2 text-sm text-slate-400">CVSS ainda não avaliado. O risco do scanner não define as métricas do CVSS.</p>}
    {data?.assessment && <div className="my-3 rounded-lg border border-accent/30 p-3">
      <p className="font-medium">CVSS 4.0 Base {data.assessment.score.toFixed(1)} · {data.assessment.severity}</p>
      <p className="mt-1 break-all font-mono text-xs">{data.assessment.vector}</p>
      <p className="mt-2 whitespace-pre-wrap break-words text-sm">{data.assessment.justification}</p>
      <p className="mt-2 text-xs text-slate-400">Revisão {data.assessment.revision} · {data.assessment.assessorName} · {new Date(data.assessment.assessedAt).toLocaleString('pt-BR')}</p>
    </div>}
    {data && !data.canAssess && <p className="my-2 text-xs text-slate-400">A avaliação é registrada por um gerente ou administrador com acesso à varredura.</p>}
    {data?.canAssess && <div className="mt-4">
      <p className="mb-3 text-sm text-slate-400">Preencha todas as métricas com base na análise do achado. Nenhuma métrica é presumida pelo sistema.</p>
      <div className="grid gap-3 sm:grid-cols-2">{CVSS_METRICS.map(m=><div key={m.key}>
        <label htmlFor={`cvss-${findingId}-${m.key}`} className="mb-1 block text-xs">{m.label} ({m.key})</label>
        <select id={`cvss-${findingId}-${m.key}`} data-testid={`cvss-metric-${m.key}`} aria-describedby={`cvss-help-${findingId}-${m.key}`} value={values[m.key]??''} disabled={busy}
          onChange={e=>{setValues(v=>({...v,[m.key]:e.target.value}));setCalculation(null);}} className="w-full rounded border border-white/20 bg-ink p-2 text-sm">
          <option value="">Não definido</option>{Object.entries(m.values).map(([value,label])=><option key={value} value={value}>{label} ({value})</option>)}
        </select><p id={`cvss-help-${findingId}-${m.key}`} className="mt-1 text-xs text-slate-500">{m.help}</p>
      </div>)}</div>
      <button type="button" disabled={busy || !complete} onClick={()=>void run(false)} className="my-4 rounded border border-accent/40 px-3 py-2 text-sm text-accent disabled:opacity-50">Calcular CVSS 4.0</button>
      {calculation && <div className="mb-4"><p className="font-semibold">CVSS 4.0 Base {calculation.score.toFixed(1)} · {calculation.severity}</p><p className="break-all font-mono text-xs">{calculation.vector}</p>
        <a href={`https://www.first.org/cvss/calculator/4.0#${calculation.vector}`} target="_blank" rel="noopener noreferrer" className="text-xs text-accent underline">Conferir na calculadora FIRST</a></div>}
      <label htmlFor={`cvss-reason-${findingId}`} className="mb-1 block text-sm">Justificativa da avaliação</label>
      <textarea id={`cvss-reason-${findingId}`} value={justification} maxLength={2000} disabled={busy} onChange={e=>setJustification(e.target.value)} className="min-h-24 w-full rounded border border-white/20 bg-ink p-2 text-sm"/>
      <p className="my-2 text-xs text-slate-400">Salvar registra o autor e o histórico e atualiza o PDF do relatório.</p>
      <button type="button" disabled={busy || !calculation || calculation.vector!==vector || !justification.trim()} onClick={()=>void run(true)} className="rounded bg-accent px-4 py-2 text-sm text-ink disabled:opacity-50">Registrar avaliação</button>
    </div>}
    {error && <div className="mt-3"><p role="alert" className="text-sm text-risk-medium">{error}</p><button type="button" disabled={busy} onClick={()=>setRefresh(n=>n+1)} className="mt-2 text-sm text-accent underline">Recarregar avaliação</button></div>}
    {data && data.history.length>1 && <details className="mt-4"><summary className="cursor-pointer text-sm">Histórico de avaliações anteriores (até 20 revisões recentes)</summary>{data.history.slice(1).map(h=><div key={h.revision} className="mt-3 border-l border-white/20 pl-3 text-xs">
      <p>Revisão {h.revision} · CVSS 4.0 Base {h.score.toFixed(1)} · {new Date(h.assessedAt).toLocaleString('pt-BR')}</p><p className="break-all font-mono">{h.vector}</p><p className="whitespace-pre-wrap break-words">{h.justification}</p>
    </div>)}</details>}
  </section>;
}
