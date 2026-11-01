import React,{useEffect,useRef,useState} from 'react';
import {getReport,requestReport,downloadReport,ReportMetadata} from '../services/api';
import ReportEmail from './ReportEmail';

export default function ReportDownload({scanId}:{scanId:number}) {
  return <ReportPanel key={scanId} scanId={scanId}/>;
}
function ReportPanel({scanId}:{scanId:number}) {
  const [report,setReport]=useState<ReportMetadata|null>(null);
  const [error,setError]=useState('');
  const [busy,setBusy]=useState(false);
  const [refresh,setRefresh]=useState(0);
  const [paused,setPaused]=useState(false);
  const action=useRef<AbortController|null>(null);
  useEffect(()=>()=>action.current?.abort(),[]);
  useEffect(()=>{
    const controller=new AbortController();let timer:ReturnType<typeof setTimeout>|undefined;let tries=0;
    setError('');setPaused(false);
    async function check() {
      try {
        const next=await getReport(scanId,controller.signal);
        if(controller.signal.aborted)return;
        setReport(next);
        if(next.status==='PENDING' || next.status==='GENERATING') {
          if(++tries<60)timer=setTimeout(check,5000);
          else setPaused(true);
        }
      } catch {
        if(!controller.signal.aborted)setError('Não foi possível consultar o PDF. O resultado da varredura continua disponível.');
      }
    }
    void check();
    return ()=>{controller.abort();clearTimeout(timer);};
  },[scanId,refresh]);
  async function run(download:boolean) {
    if(busy)return;
    const controller=new AbortController();action.current=controller;setBusy(true);setError('');
    try {
      if(download) {
        const pdf=await downloadReport(scanId,controller.signal);
        if(controller.signal.aborted)return;
        const url=URL.createObjectURL(pdf);const link=document.createElement('a');
        link.href=url;link.download=`websec-scan-${scanId}.pdf`;document.body.appendChild(link);link.click();link.remove();
        setTimeout(()=>URL.revokeObjectURL(url),10000);
      } else {
        const next=await requestReport(scanId,controller.signal);
        if(controller.signal.aborted)return;
        setReport(next);setRefresh(x=>x+1);
      }
    } catch {
      if(!controller.signal.aborted)setError('Não foi possível concluir a operação do PDF. Consulte o estado e tente novamente.');
    } finally {if(!controller.signal.aborted)setBusy(false);}
  }
  const messages:Record<ReportMetadata['status'],string>={
    NOT_REQUESTED:'O PDF ainda não foi solicitado.',PENDING:'PDF aguardando geração.',GENERATING:'PDF em geração.',
    READY:'PDF pronto para download.',FAILED:'A geração do PDF falhou. A varredura permanece concluída.',
    MISSING:'O arquivo PDF não está disponível. Gere novamente a partir dos resultados salvos.'
  };
  const canGenerate=report && ['NOT_REQUESTED','FAILED','MISSING'].includes(report.status);
  return <section aria-label="Relatório PDF" className="mb-6 rounded-xl border border-white/10 bg-panel p-5">
    <h2 className="font-medium">Relatório PDF</h2>
    <p className="my-2 text-sm text-slate-300">{report?messages[report.status]:'Consultando PDF...'}</p>
    {report?.generatedAt && <p className="mb-2 text-xs text-slate-400">Emitido em {new Date(report.generatedAt).toLocaleString('pt-BR')}</p>}
    {error && <p role="alert" className="my-2 text-sm text-risk-medium">{error}</p>}
    {paused && <p className="my-2 text-sm text-slate-400">Consulta automática pausada. Você pode consultar novamente.</p>}
    <div className="flex flex-wrap gap-3">
      {report?.status==='READY' && <button disabled={busy} onClick={()=>void run(true)} className="rounded-md bg-accent px-4 py-2 text-ink disabled:opacity-50">Baixar PDF</button>}
      {canGenerate && <button disabled={busy} onClick={()=>void run(false)} className="rounded-md bg-accent px-4 py-2 text-ink disabled:opacity-50">{report.status==='NOT_REQUESTED'?'Gerar PDF':'Gerar PDF novamente'}</button>}
      {(error || paused) && <button disabled={busy} onClick={()=>setRefresh(x=>x+1)} className="rounded-md border border-white/20 px-4 py-2">Consultar PDF novamente</button>}
    </div>
    {report?.status==='READY' && <ReportEmail scanId={scanId}/>}
  </section>;
}
