import React,{useState} from 'react';
import {Finding} from '../services/api';
import SeverityBadge from './SeverityBadge';
import CvssAssessmentPanel from './CvssAssessmentPanel';

export default function ScanFindings({findings,onAssessmentSaved}:{findings:Finding[];onAssessmentSaved?:()=>void}){
  const [filter,setFilter]=useState('ALL');
  const rows=filter==='ALL'?findings:findings.filter(f=>f.severity===filter);
  return <section aria-label="Achados técnicos">
    <label htmlFor="findings-risk" className="mb-1 block text-sm">Filtrar risco ZAP</label>
    <select id="findings-risk" value={filter} onChange={e=>setFilter(e.target.value)} className="mb-4 rounded border border-white/20 bg-ink p-2 text-sm">
      <option value="ALL">Todos</option>{[['CRITICAL','Crítico'],['HIGH','Alto'],['MEDIUM','Médio'],['LOW','Baixo'],['INFORMATIONAL','Informativo']].map(([value,label])=><option key={value} value={value}>{label}</option>)}
    </select>
    {rows.length===0?<p className="text-sm text-slate-400">Nenhum achado corresponde a este filtro.</p>:<ul className="space-y-3">{rows.map(f=><Card key={f.id} finding={f} onAssessmentSaved={onAssessmentSaved}/>)}</ul>}
  </section>;
}
function Card({finding:f,onAssessmentSaved}:{finding:Finding;onAssessmentSaved?:()=>void}){
  const [expanded,setExpanded]=useState(false);const title=f.title||f.owaspCategory;
  const recommendation=f.recommendation??'Sem recomendação registrada';
  return <li className="rounded-xl border border-white/10 bg-panel p-4">
    <div className="mb-2 flex items-start justify-between gap-3"><h3 className="break-words font-medium">{title}</h3><span className="shrink-0 text-xs">Risco ZAP <SeverityBadge severity={f.severity}/></span></div>
    <p className="mb-2 break-words text-sm text-slate-300">{f.description.length>240?f.description.slice(0,240)+'…':f.description}</p>
    <p className="mb-3 text-xs text-slate-400">Score aproximado ZAP: {f.cvssScore.toFixed(1)} — {recommendation.length>180?recommendation.slice(0,180)+'…':recommendation}</p>
    <button type="button" aria-label={`Detalhes de ${title}`} aria-expanded={expanded} aria-controls={`finding-details-${f.id}`} onClick={()=>setExpanded(v=>!v)} className="rounded border border-white/20 px-3 py-1.5 text-sm text-accent">{expanded?'Recolher detalhes':'Detalhes, evidências e CVSS'}</button>
    {expanded && <div id={`finding-details-${f.id}`} className="mt-4">
      <dl className="space-y-2 text-xs text-slate-400">{[['URL afetada',f.affectedUrl],['Parâmetro',f.affectedParameter],['Categoria OWASP',f.owaspCategory],['CWE',f.cweId],['WASC',f.wascId],['Confiança',f.confidence]].map(([label,value])=><div key={label}><dt className="font-medium text-slate-300">{label}</dt><dd className="break-all">{value||'Não informado'}</dd></div>)}</dl>
      {[['Descrição completa',f.description],['Evidência técnica',f.evidence],['Recomendação',f.recommendation],['Referência técnica',f.technicalReference]].map(([label,value])=><div key={label} className="mt-4"><h4 className="mb-1 text-sm font-medium">{label}</h4><pre tabIndex={0} aria-label={label??''} className="max-h-80 overflow-auto whitespace-pre-wrap break-all rounded bg-ink/60 p-3 font-mono text-xs text-slate-300">{value||'Não informado'}</pre></div>)}
      <CvssAssessmentPanel findingId={f.id} onSaved={onAssessmentSaved}/>
    </div>}
  </li>;
}
