import {api} from './api';
import {invalidResponseError} from '../lib/apiError';

export interface CvssCalculation {version:'4.0';nomenclature:'CVSS-B';vector:string;score:number;severity:string}
export interface CvssAssessment extends CvssCalculation {justification:string;assessorName:string;assessedAt:string;revision:number}
export interface CvssView {canAssess:boolean;assessment:CvssAssessment|null;history:CvssAssessment[]}
function calculation(v:CvssCalculation){
  return v && v.version==='4.0' && v.nomenclature==='CVSS-B' && typeof v.vector==='string' && v.vector.startsWith('CVSS:4.0/') &&
    Number.isFinite(v.score) && v.score>=0 && v.score<=10 && ['NONE','LOW','MEDIUM','HIGH','CRITICAL'].includes(v.severity);
}
function assessment(v:CvssAssessment){return calculation(v) && typeof v.justification==='string' && typeof v.assessorName==='string' && typeof v.assessedAt==='string' && Number.isSafeInteger(v.revision) && v.revision>0;}
function view(d:CvssView){
  if(!d || typeof d.canAssess!=='boolean' || !(d.assessment===null || assessment(d.assessment)) || !Array.isArray(d.history) || !d.history.every(assessment))throw invalidResponseError('avaliação CVSS inválida');
  return d;
}
export async function getCvss(findingId:number,signal?:AbortSignal){return view((await api.get(`/findings/${findingId}/cvss`,{signal})).data);}
export async function previewCvss(vector:string,signal?:AbortSignal){
  const data=(await api.post('/cvss/v4/base/preview',{vector},{signal})).data as CvssCalculation;
  if(!calculation(data))throw invalidResponseError('cálculo CVSS inválido');return data;
}
export async function saveCvss(findingId:number,vector:string,justification:string,expectedRevision:number,signal?:AbortSignal){
  return view((await api.put(`/findings/${findingId}/cvss`,{vector,justification,expectedRevision},{signal})).data);
}

export const CVSS_METRICS=[
  {key:'AV',label:'Vetor de ataque',help:'De onde o ataque pode ser executado?',values:{N:'Rede',A:'Rede adjacente',L:'Local',P:'Físico'}},
  {key:'AC',label:'Complexidade do ataque',help:'Exige contornar condições específicas de segurança?',values:{L:'Baixa',H:'Alta'}},
  {key:'AT',label:'Requisitos do ataque',help:'Depende de condições adicionais de implantação ou execução?',values:{N:'Nenhum',P:'Presentes'}},
  {key:'PR',label:'Privilégios necessários',help:'Quais privilégios são exigidos antes do ataque?',values:{N:'Nenhum',L:'Baixos',H:'Altos'}},
  {key:'UI',label:'Interação do usuário',help:'Outra pessoa precisa interagir para o ataque funcionar?',values:{N:'Nenhuma',P:'Passiva',A:'Ativa'}},
  {key:'VC',label:'Confidencialidade do sistema vulnerável',help:'Impacto na confidencialidade do sistema afetado.',values:{H:'Alto',L:'Baixo',N:'Nenhum'}},
  {key:'VI',label:'Integridade do sistema vulnerável',help:'Impacto na integridade do sistema afetado.',values:{H:'Alto',L:'Baixo',N:'Nenhum'}},
  {key:'VA',label:'Disponibilidade do sistema vulnerável',help:'Impacto na disponibilidade do sistema afetado.',values:{H:'Alto',L:'Baixo',N:'Nenhum'}},
  {key:'SC',label:'Confidencialidade de sistemas subsequentes',help:'Impacto em outros sistemas após explorar o vulnerável.',values:{H:'Alto',L:'Baixo',N:'Nenhum'}},
  {key:'SI',label:'Integridade de sistemas subsequentes',help:'Impacto na integridade de outros sistemas.',values:{H:'Alto',L:'Baixo',N:'Nenhum'}},
  {key:'SA',label:'Disponibilidade de sistemas subsequentes',help:'Impacto na disponibilidade de outros sistemas.',values:{H:'Alto',L:'Baixo',N:'Nenhum'}},
] as const;
