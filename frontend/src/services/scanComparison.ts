import {api} from './api';
import {invalidResponseError} from '../lib/apiError';

export interface ComparisonChange {
  ruleId:string;url:string;parameter:string;method:string;title:string;
  baselineSeverity:string|null;comparedSeverity:string|null;
  baselineOccurrences:number;comparedOccurrences:number;severityChanged:boolean;
}
interface Snapshot {id:number;createdAt:string;finishedAt:string|null}
export interface ScanComparison {
  domainId:number;hostname:string;baseline:Snapshot;compared:Snapshot;complete:boolean;limitations:string[];
  unidentifiedBaseline:number;unidentifiedCompared:number;duplicateBaseline:number;duplicateCompared:number;
  added:ComparisonChange[];removed:ComparisonChange[];persistent:ComparisonChange[];
  unmatchedBaseline:ComparisonChange[];unmatchedCompared:ComparisonChange[];
}
const count=(v:unknown)=>Number.isSafeInteger(v) && (v as number)>=0;
const severity=(v:unknown)=>v===null || ['LOW','MEDIUM','HIGH','CRITICAL','INFORMATIONAL'].includes(v as string);
function validChange(c:ComparisonChange) {
  return c && [c.ruleId,c.url,c.parameter,c.method,c.title].every(v=>typeof v==='string') &&
    severity(c.baselineSeverity) && severity(c.comparedSeverity) && count(c.baselineOccurrences) &&
    count(c.comparedOccurrences) && typeof c.severityChanged==='boolean';
}
function snapshot(s:Snapshot) {
  return s && count(s.id) && s.id>0 && typeof s.createdAt==='string' &&
    (s.finishedAt===null || typeof s.finishedAt==='string');
}
export async function compareScans(baseline:number,compared:number,signal?:AbortSignal):Promise<ScanComparison> {
  const d=(await api.get(`/scans/${baseline}/compare/${compared}`,{signal})).data as ScanComparison;
  if(!d || !count(d.domainId) || d.domainId<1 || typeof d.hostname!=='string' || !snapshot(d.baseline) || !snapshot(d.compared) ||
      d.baseline.id!==baseline || d.compared.id!==compared || typeof d.complete!=='boolean' ||
      !Array.isArray(d.limitations) || !d.limitations.every(v=>typeof v==='string') || d.complete!==(d.limitations.length===0) ||
      ![d.unidentifiedBaseline,d.unidentifiedCompared,d.duplicateBaseline,d.duplicateCompared].every(count) ||
      ![d.added,d.removed,d.persistent,d.unmatchedBaseline,d.unmatchedCompared].every(rows=>Array.isArray(rows) && rows.every(validChange)) ||
      (!d.complete && (d.added.length>0 || d.removed.length>0)))throw invalidResponseError('comparação inválida');
  return d;
}
