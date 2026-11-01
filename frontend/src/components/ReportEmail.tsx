import React,{useEffect,useRef,useState} from 'react';
import {EmailDelivery,getEmailDelivery,requestEmailDelivery} from '../services/api';

export default function ReportEmail({scanId}:{scanId:number}) {
  return <DeliveryPanel key={scanId} scanId={scanId}/>;
}
function DeliveryPanel({scanId}:{scanId:number}) {
  const [delivery,setDelivery]=useState<EmailDelivery|null>(null);
  const [error,setError]=useState('');
  const [busy,setBusy]=useState(false);
  const [refresh,setRefresh]=useState(0);
  const [paused,setPaused]=useState(false);
  const action=useRef<AbortController|null>(null);
  useEffect(()=>()=>action.current?.abort(),[]);
  useEffect(()=>{
    const controller=new AbortController();let timer:ReturnType<typeof setTimeout>|undefined;let attempts=0;
    setError('');setPaused(false);
    async function check(){
      try {
        const next=await getEmailDelivery(scanId,controller.signal);
        if(controller.signal.aborted)return;
        setDelivery(next);
        if(next.enabled && ['PENDING','SENDING'].includes(next.status)){
          if(++attempts<60)timer=setTimeout(check,5000);else setPaused(true);
        }
      }catch{if(!controller.signal.aborted)setError('Não foi possível consultar o envio. O PDF continua disponível para download.');}
    }
    void check();return ()=>{controller.abort();clearTimeout(timer);};
  },[scanId,refresh]);
  async function request(){
    if(busy)return;
    const controller=new AbortController();action.current=controller;setBusy(true);setError('');
    try{
      const next=await requestEmailDelivery(scanId,controller.signal);
      if(controller.signal.aborted)return;
      setDelivery(next);setRefresh(x=>x+1);
    }catch{if(!controller.signal.aborted)setError('Não foi possível solicitar o envio. O PDF continua disponível para download.');}
    finally{if(!controller.signal.aborted)setBusy(false);}
  }
  const messages:Record<EmailDelivery['status'],string>={
    NOT_REQUESTED:'Envie o PDF para o e-mail do proprietário da varredura.',PENDING:'E-mail aguardando envio.',
    SENDING:'Enviando relatório por e-mail.',SENT:'Relatório aceito pelo servidor de e-mail.',
    FAILED:'Não foi possível enviar o relatório. O PDF continua disponível para download.'
  };
  const canRequest=delivery?.enabled && ['NOT_REQUESTED','FAILED'].includes(delivery.status);
  return <div aria-label="Envio do PDF" className="mt-5 border-t border-white/10 pt-4">
    <h3 className="text-sm font-medium">Envio por e-mail</h3>
    <p className="my-2 text-sm text-slate-400">{delivery ? delivery.enabled ? messages[delivery.status] : 'Envio por e-mail indisponível no momento. O PDF continua disponível para download.' : 'Consultando envio...'}</p>
    {delivery?.recipient && <p className="mb-2 text-xs text-slate-400">Destinatário: {delivery.recipient}</p>}
    {delivery?.sentAt && <p className="mb-2 text-xs text-slate-400">Enviado em {new Date(delivery.sentAt).toLocaleString('pt-BR')}</p>}
    {delivery?.enabled && delivery.nextAttemptAt && <p className="mb-2 text-xs text-slate-400">Nova tentativa prevista para {new Date(delivery.nextAttemptAt).toLocaleString('pt-BR')}</p>}
    {delivery?.failureCode && <p className="mb-2 text-xs text-risk-medium">Falha: {delivery.failureCode}</p>}
    {error && <p role="alert" className="mb-2 text-sm text-risk-medium">{error}</p>}
    {paused && <p className="mb-2 text-sm text-slate-400">Consulta automática pausada. Consulte novamente para atualizar.</p>}
    {canRequest && <button disabled={busy} onClick={()=>void request()} className="rounded-md border border-white/20 px-4 py-2 text-sm disabled:opacity-50">{delivery.status==='FAILED'?'Tentar envio novamente':'Enviar PDF por e-mail'}</button>}
    {(error || paused) && <button disabled={busy} onClick={()=>setRefresh(x=>x+1)} className="ml-3 rounded-md border border-white/20 px-4 py-2 text-sm">Consultar envio novamente</button>}
  </div>;
}
