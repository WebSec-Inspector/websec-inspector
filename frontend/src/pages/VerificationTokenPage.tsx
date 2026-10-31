import React,{useEffect,useState} from "react";
import {Link} from "react-router-dom";
import {getCurrentVerificationChallenge,issueVerificationChallenge,VerificationChallenge} from "../services/api";
import {toApiError} from "../lib/apiError";

export default function VerificationTokenPage() {
  const [challenge,setChallenge]=useState<VerificationChallenge|null>(null);
  const [loading,setLoading]=useState(true);
  const [saving,setSaving]=useState(false);
  const [error,setError]=useState<string|null>(null);
  const [copied,setCopied]=useState<string|null>(null);
  useEffect(()=>{
    let active=true;
    getCurrentVerificationChallenge().then(value=>{if(active)setChallenge(value);})
      .catch(err=>{if(active)setError(toApiError(err).message);})
      .finally(()=>{if(active)setLoading(false);});
    return ()=>{active=false;};
  },[]);
  async function issue() {
    if(saving)return;
    setSaving(true);setError(null);
    try {setChallenge(await issueVerificationChallenge());}
    catch(err){setError(toApiError(err).message);}
    finally {setSaving(false);}
  }
  async function copy(value:string,label:string) {
    try {await navigator.clipboard.writeText(value);setCopied(label);}
    catch {setError("Não foi possível copiar automaticamente. Selecione e copie o texto exibido.");}
  }
  const tag=challenge?`<meta name="websec-verification" content="${challenge.token}" />`:"";
  return <div className="mx-auto max-w-xl px-6 py-10">
    <Link to="/scans/novo" className="text-sm text-slate-400">← Nova varredura</Link>
    <h1 className="my-6 text-xl font-semibold">Prepare a verificação do seu site</h1>
    <p className="mb-5 text-sm text-slate-300">Gere a prova agora e informe o endereço do site depois. Gerar o token não verifica o domínio nem inicia uma varredura.</p>
    {error&&<p role="alert" className="mb-4 text-sm text-risk-high">{error}</p>}
    {loading?<p>Recuperando seu token pendente...</p>:challenge?<section className="space-y-5 rounded-xl border border-white/10 bg-panel p-5">
      <h2 className="font-medium">Token disponível</h2>
      <p className="text-sm text-slate-400">Este token fica salvo na sua conta até ser vinculado a um domínio. Após o vínculo, serve apenas para esse domínio.</p>
      <code className="block break-all select-all rounded bg-ink p-3 text-sm text-accent">{challenge.token}</code>
      <button type="button" onClick={()=>copy(challenge.token,"token")} className="rounded border border-white/20 px-3 py-2 text-sm">Copiar token</button>
      <p className="text-sm">Publique o token como registro DNS TXT ou coloque esta meta tag no &lt;head&gt; do HTML entregue pelo servidor. Inserir a tag apenas via JavaScript no navegador não atende ao verificador.</p>
      <pre className="overflow-x-auto whitespace-pre-wrap break-all rounded bg-ink p-3 text-xs select-all">{tag}</pre>
      <button type="button" onClick={()=>copy(tag,"tag")} className="rounded border border-white/20 px-3 py-2 text-sm">Copiar meta tag</button>
      {copied&&<p role="status" className="text-sm text-accent">{copied==="tag"?"Meta tag copiada.":"Token copiado."}</p>}
      <Link to={`/scans/novo?challenge=${challenge.id}`} className="block rounded bg-accent px-4 py-3 text-center font-medium text-ink">Usar este token em um site</Link>
    </section>:<button type="button" disabled={saving} onClick={issue} className="rounded bg-accent px-5 py-3 font-medium text-ink disabled:opacity-50">{saving?"Gerando...":"Gerar token"}</button>}
  </div>;
}
