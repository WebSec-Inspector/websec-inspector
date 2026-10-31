import {useEffect,useRef,useState} from "react";
import {cancelVerification,confirmVerification,ScanResponse} from "../services/api";
import {toApiError} from "../lib/apiError";
import {isKnownStatus,ScanStatus} from "../lib/scanStatus";

function bounded(value:unknown,fallback:number,max:number){
  const number=Number(value);return Number.isSafeInteger(number)&&number>0&&number<=max?number:fallback;
}
function limits(){return {
  attempts:bounded(import.meta.env.VITE_VERIFICATION_MAX_ATTEMPTS,20,1000),
  duration:bounded(import.meta.env.VITE_VERIFICATION_TIMEOUT_SECONDS,300,86400)*1000,
  interval:bounded(import.meta.env.VITE_VERIFICATION_RETRY_SECONDS,15,3600)*1000,
};}

/** One bounded cycle; late replies cannot revive a cancelled verification. */
export function useVerification(scanId:number|null,onResolved:(scan:ScanResponse)=>void){
  const [checking,setChecking]=useState(false),[pendingMessage,setPendingMessage]=useState<string|null>(null);
  const [nextRetryIn,setNextRetryIn]=useState<number|null>(null),[error,setError]=useState<string|null>(null);
  const [paused,setPaused]=useState(false),[limitReached,setLimitReached]=useState(false);
  const [cancelling,setCancelling]=useState(false),[cancelRequested,setCancelRequested]=useState(false);
  const [cancelError,setCancelError]=useState<string|null>(null),[stateChanged,setStateChanged]=useState<ScanStatus|null>(null);
  const alive=useRef(true),epoch=useRef(0),currentId=useRef(scanId),resolved=useRef(onResolved);
  currentId.current=scanId;resolved.current=onResolved;
  const busy=useRef(false),cancelBusy=useRef(false),cancelledCycle=useRef(false),manualOnly=useRef(false);
  const retry=useRef<ReturnType<typeof setTimeout>|null>(null),countdown=useRef<ReturnType<typeof setInterval>|null>(null);
  const deadlineTimer=useRef<ReturnType<typeof setTimeout>|null>(null);
  const request=useRef<AbortController|null>(null),cancelRequest=useRef<AbortController|null>(null);
  const budget=useRef<{deadline:number;attempts:number;max:number;interval:number}|null>(null);
  const runRef=useRef<(generation:number,automatic:boolean)=>Promise<void>>(async()=>{});
  function clearRetry(){
    if(retry.current!==null)clearTimeout(retry.current);
    if(countdown.current!==null)clearInterval(countdown.current);
    retry.current=null;countdown.current=null;
  }
  function invalidate(){
    epoch.current++;clearRetry();
    if(deadlineTimer.current!==null)clearTimeout(deadlineTimer.current);
    deadlineTimer.current=null;request.current?.abort();request.current=null;busy.current=false;
    return epoch.current;
  }
  function valid(generation:number){return alive.current&&currentId.current===scanId&&epoch.current===generation;}
  function expire(generation:number){
    if(!valid(generation))return;
    invalidate();budget.current=null;manualOnly.current=true;
    setChecking(false);setNextRetryIn(null);setPendingMessage(null);setLimitReached(true);setPaused(true);
  }
  useEffect(()=>{
    alive.current=true;invalidate();budget.current=null;manualOnly.current=false;cancelledCycle.current=false;cancelBusy.current=false;
    setChecking(false);setCancelling(false);setPendingMessage(null);setNextRetryIn(null);setError(null);
    setPaused(false);setLimitReached(false);setCancelRequested(false);setCancelError(null);setStateChanged(null);
    return()=>{alive.current=false;invalidate();cancelRequest.current?.abort();};
  },[scanId]);
  function schedule(generation:number){
    const cycle=budget.current;
    if(!valid(generation)||!cycle)return;
    if(cycle.attempts>=cycle.max||Date.now()>=cycle.deadline){expire(generation);return;}
    clearRetry();const delay=Math.min(cycle.interval,cycle.deadline-Date.now()),due=Date.now()+delay;
    setNextRetryIn(Math.ceil(delay/1000));
    countdown.current=setInterval(()=>{if(valid(generation))setNextRetryIn(Math.max(0,Math.ceil((due-Date.now())/1000)));},1000);
    retry.current=setTimeout(()=>{clearRetry();void runRef.current(generation,true);},delay);
  }
  async function run(generation:number,automatic:boolean){
    if(scanId===null||!valid(generation)||busy.current||cancelledCycle.current)return;
    const cycle=budget.current;
    if(automatic&&(!cycle||cycle.attempts>=cycle.max||Date.now()>=cycle.deadline)){expire(generation);return;}
    if(automatic&&cycle)cycle.attempts++;
    busy.current=true;clearRetry();setNextRetryIn(null);setChecking(true);setError(null);
    const controller=new AbortController();request.current=controller;
    const pending=(message:string)=>{setPendingMessage(message);if(automatic)schedule(generation);};
    try{
      const scan=await confirmVerification(scanId,controller.signal,automatic&&cycle?cycle.deadline-Date.now():20000);
      if(!valid(generation))return;
      if(scan.status==="PENDING_VERIFICATION"){pending("A prova ainda não foi encontrada.");return;}
      invalidate();setChecking(false);setPendingMessage(null);setNextRetryIn(null);resolved.current(scan);
    }catch(err){
      if(!valid(generation))return;
      const data=(err as {response?:{data?:{code?:string;error?:string}}})?.response?.data;
      if(data?.code==="VERIFICATION_PENDING")pending(data.error??"A prova ainda não foi encontrada.");
      else{invalidate();budget.current=null;manualOnly.current=true;setChecking(false);setPaused(true);setNextRetryIn(null);setError(toApiError(err).message);}
    }finally{if(valid(generation)){busy.current=false;request.current=null;setChecking(false);}}
  }
  runRef.current=run;
  function restart(){
    if(scanId===null||busy.current||cancelledCycle.current)return;
    const generation=invalidate(),config=limits();
    budget.current={deadline:Date.now()+config.duration,attempts:0,max:config.attempts,interval:config.interval};
    manualOnly.current=false;setPaused(false);setLimitReached(false);setError(null);setPendingMessage(null);setNextRetryIn(null);
    deadlineTimer.current=setTimeout(()=>expire(generation),config.duration);void run(generation,true);
  }
  function confirm(){
    if(scanId===null||busy.current||cancelledCycle.current)return;
    if(manualOnly.current){const generation=invalidate();void run(generation,false);}
    else if(budget.current)void run(epoch.current,true);else restart();
  }
  function pause(){
    if(cancelledCycle.current)return;
    invalidate();budget.current=null;manualOnly.current=true;setChecking(false);setPaused(true);setPendingMessage(null);setNextRetryIn(null);
  }
  async function cancel(){
    if(scanId===null||cancelBusy.current)return;
    const generation=invalidate();cancelledCycle.current=true;cancelBusy.current=true;budget.current=null;
    setCancelRequested(true);setCancelling(true);setCancelError(null);setError(null);setChecking(false);setPendingMessage(null);setNextRetryIn(null);
    const controller=new AbortController();cancelRequest.current=controller;
    try{
      const scan=await cancelVerification(scanId,controller.signal);
      if(!valid(generation))return;
      if(scan.status==="CANCELLED")resolved.current(scan);else setStateChanged(scan.status);
    }catch(err){
      if(!valid(generation))return;
      const data=(err as {response?:{data?:{code?:string;status?:unknown}}})?.response?.data;
      if(data?.code==="SCAN_STATE_CHANGED"&&isKnownStatus(data.status))setStateChanged(data.status);
      else setCancelError("Cancelamento não confirmado. Tente cancelar novamente ou consulte o estado. "+toApiError(err).message);
    }finally{if(valid(generation)){cancelBusy.current=false;cancelRequest.current=null;setCancelling(false);}}
  }
  return {checking,pendingMessage,nextRetryIn,error,paused,limitReached,cancelling,cancelRequested,cancelError,stateChanged,confirm,pause,restart,cancel};
}
