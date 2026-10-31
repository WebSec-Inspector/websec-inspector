import React from "react";
import {beforeEach,afterEach,test,expect,vi} from "vitest";
import {act,fireEvent,screen,waitFor} from "@testing-library/react";
import MockAdapter from "axios-mock-adapter";
import {api} from "../../src/services/api";
import SubmitScanPage from "../../src/pages/SubmitScanPage";
import {renderPage,scan} from "../helpers";

let http:MockAdapter;
const cancelled={...scan,status:"CANCELLED",finishedAt:"2026-10-31T12:00:00Z"};
beforeEach(()=>{localStorage.setItem("websec_token","qa-token");http=new MockAdapter(api,{onNoMatch:"throwException"});http.onGet("/domains").reply(200,[]);});
afterEach(()=>{http.restore();vi.useRealTimers();vi.unstubAllEnvs();});
async function open(){
  http.onPost("/scans").reply(200,{...scan,status:"PENDING_VERIFICATION",verificationToken:"websec-verify-stable"});
  renderPage(<SubmitScanPage/>,"/test");
  fireEvent.change(screen.getByRole("textbox"),{target:{value:"qa.example.invalid"}});
  fireEvent.submit(screen.getByRole("textbox").closest("form")!);
  await screen.findByText("websec-verify-stable",{selector:"code"});
}

test("cancelamento durante consulta lenta aborta cliente e descarta sucesso atrasado",async()=>{
  let finish!:(response:[number,unknown])=>void;
  http.onPost("/scans/42/confirm-verification").reply(()=>new Promise<[number,unknown]>(resolve=>{finish=resolve;}));
  http.onPost("/scans/42/cancel-verification").reply(200,cancelled);
  http.onGet("/scans/42").reply(200,cancelled);
  await open();
  fireEvent.click(screen.getByRole("button",{name:"Já verifiquei, iniciar varredura"}));
  await waitFor(()=>expect(typeof finish).toBe("function"));
  fireEvent.click(screen.getByRole("button",{name:"Cancelar verificação"}));
  await screen.findByText("Cancelada");
  expect(http.history.post.find(r=>r.url?.endsWith("confirm-verification"))?.signal?.aborted).toBe(true);
  await act(async()=>finish([200,{...scan,status:"QUEUED"}]));
  vi.useFakeTimers();await act(async()=>vi.advanceTimersByTimeAsync(60000));
  expect(screen.getByText("Cancelada")).toBeInTheDocument();
  expect(http.history.post.filter(r=>r.url?.endsWith("confirm-verification"))).toHaveLength(1);
  expect(http.history.get.filter(r=>r.url==="/scans/42")).toHaveLength(1);
});

test("limite de tentativas interrompe automatico e tentativa manual nao reinicia ciclo",async()=>{
  vi.stubEnv("VITE_VERIFICATION_MAX_ATTEMPTS","2");
  http.onPost("/scans/42/confirm-verification").reply(409,{code:"VERIFICATION_PENDING",error:"DNS pendente"});
  await open();vi.useFakeTimers();
  await act(async()=>fireEvent.click(screen.getByRole("button",{name:"Já verifiquei, iniciar varredura"})));
  await act(async()=>vi.advanceTimersByTimeAsync(60000));
  expect(http.history.post.filter(r=>r.url?.endsWith("confirm-verification"))).toHaveLength(2);
  expect(screen.getByText(/Limite de tentativas automáticas atingido/)).toBeInTheDocument();
  await act(async()=>fireEvent.click(screen.getByRole("button",{name:"Tentar verificação manual"})));
  await act(async()=>vi.advanceTimersByTimeAsync(60000));
  expect(http.history.post.filter(r=>r.url?.endsWith("confirm-verification"))).toHaveLength(3);
});

test("prazo total interrompe ate consulta em andamento",async()=>{
  vi.stubEnv("VITE_VERIFICATION_TIMEOUT_SECONDS","5");
  let finish!:(response:[number,unknown])=>void;
  http.onPost("/scans/42/confirm-verification").reply(()=>new Promise<[number,unknown]>(resolve=>{finish=resolve;}));
  await open();vi.useFakeTimers();
  await act(async()=>fireEvent.click(screen.getByRole("button",{name:"Já verifiquei, iniciar varredura"})));
  await act(async()=>vi.advanceTimersByTimeAsync(5000));
  expect(screen.getByText(/Limite de tentativas automáticas atingido/)).toBeInTheDocument();
  expect(http.history.post.find(r=>r.url?.endsWith("confirm-verification"))?.signal?.aborted).toBe(true);
  await act(async()=>finish([409,{code:"VERIFICATION_PENDING"}]));
  expect(screen.getByRole("button",{name:"Tentar verificação manual"})).toBeEnabled();
});

test("se enfileiramento venceu nao anuncia cancelamento",async()=>{
  http.onPost("/scans/42/cancel-verification").reply(409,{code:"SCAN_STATE_CHANGED",status:"QUEUED",error:"Já enfileirada"});
  await open();
  fireEvent.click(screen.getByRole("button",{name:"Cancelar verificação"}));
  await screen.findByText(/não foi cancelada/);
  expect(screen.queryByText("Cancelada")).not.toBeInTheDocument();
  expect(screen.getByRole("link",{name:"Ver estado da varredura"})).toHaveAttribute("href","/scans/42");
  expect(http.history.post.filter(r=>r.url?.endsWith("confirm-verification"))).toHaveLength(0);
});

test("falha de rede nao afirma cancelamento nem retoma confirmacoes",async()=>{
  http.onPost("/scans/42/cancel-verification").networkError();
  await open();
  fireEvent.click(screen.getByRole("button",{name:"Cancelar verificação"}));
  await screen.findByText(/Cancelamento não confirmado/);
  expect(screen.getByRole("button",{name:"Tentar cancelar novamente"})).toBeEnabled();
  expect(screen.getByRole("button",{name:"Já verifiquei, iniciar varredura"})).toBeDisabled();
  vi.useFakeTimers();await act(async()=>vi.advanceTimersByTimeAsync(60000));
  expect(http.history.post.filter(r=>r.url?.endsWith("confirm-verification"))).toHaveLength(0);
  expect(screen.queryByText("Cancelada")).not.toBeInTheDocument();
});

test("reiniciar ciclo automatico exige acao explicita e renova somente o orcamento",async()=>{
  vi.stubEnv("VITE_VERIFICATION_MAX_ATTEMPTS","2");
  http.onPost("/scans/42/confirm-verification").reply(409,{code:"VERIFICATION_PENDING",error:"DNS pendente"});
  await open();vi.useFakeTimers();
  await act(async()=>fireEvent.click(screen.getByRole("button",{name:"Já verifiquei, iniciar varredura"})));
  await act(async()=>vi.advanceTimersByTimeAsync(60000));
  expect(http.history.post.filter(r=>r.url?.endsWith("confirm-verification"))).toHaveLength(2);
  await act(async()=>fireEvent.click(screen.getByRole("button",{name:"Reiniciar tentativas automáticas"})));
  await act(async()=>vi.advanceTimersByTimeAsync(60000));
  expect(http.history.post.filter(r=>r.url?.endsWith("confirm-verification"))).toHaveLength(4);
  expect(http.history.post.filter(r=>r.url==="/scans")).toHaveLength(1);
});
