import React from "react";
import {beforeEach,afterEach,test,expect,vi} from "vitest";
import {act,fireEvent,screen,waitFor} from "@testing-library/react";
import MockAdapter from "axios-mock-adapter";
import {api} from "../../src/services/api";
import VerificationTokenPage from "../../src/pages/VerificationTokenPage";
import SubmitScanPage from "../../src/pages/SubmitScanPage";
import {renderPage,scan} from "../helpers";

const challenge={id:"7113c33c-4807-4ca0-ae57-349557da284c",token:"websec-verify-prepared",createdAt:"2026-10-31T12:00:00Z",domainId:null,hostname:null};
let http:MockAdapter;
beforeEach(()=>{
  http=new MockAdapter(api,{onNoMatch:"throwException"});
  http.onGet("/domains").reply(200,[]);
  Object.defineProperty(navigator,"clipboard",{configurable:true,value:{writeText:vi.fn().mockResolvedValue(undefined)}});
});
afterEach(()=>http.restore());

test("gera e copia meta tag sem URL nem criacao de scan",async()=>{
  http.onGet("/verification-challenges/current").reply(204);
  http.onPost("/verification-challenges").reply(200,challenge);
  renderPage(<VerificationTokenPage/>,"/test");
  fireEvent.click(await screen.findByRole("button",{name:"Gerar token"}));
  await screen.findByText(challenge.token,{selector:"code"});
  expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button",{name:"Copiar meta tag"}));
  expect(navigator.clipboard.writeText).toHaveBeenCalledWith(`<meta name="websec-verification" content="${challenge.token}" />`);
  expect(http.history.post.map(r=>r.url)).toEqual(["/verification-challenges"]);
});

test("recupera desafio pendente sem emitir outro",async()=>{
  http.onGet("/verification-challenges/current").reply(200,challenge);
  renderPage(<VerificationTokenPage/>,"/test");
  await screen.findByText(challenge.token,{selector:"code"});
  expect(screen.getByRole("link",{name:"Usar este token em um site"})).toHaveAttribute("href",`/scans/novo?challenge=${challenge.id}`);
  expect(http.history.post).toHaveLength(0);
});

test("vincula desafio selecionado na submissao posterior",async()=>{
  http.onGet(`/verification-challenges/${challenge.id}`).reply(200,challenge);
  http.onPost("/scans").reply(200,{...scan,status:"PENDING_VERIFICATION",verificationToken:challenge.token});
  renderPage(<SubmitScanPage/>,`/test?challenge=${challenge.id}`);
  await screen.findByText(challenge.token,{selector:"code"});
  fireEvent.change(screen.getByRole("textbox"),{target:{value:"qa.example.invalid"}});
  fireEvent.submit(screen.getByRole("textbox").closest("form")!);
  await screen.findByRole("button",{name:"Já verifiquei, iniciar varredura"});
  expect(JSON.parse(http.history.post[0].data).verificationChallengeId).toBe(challenge.id);
});

test("dominio existente exige escolha explicita sem substituir prova",async()=>{
  http.onGet(`/verification-challenges/${challenge.id}`).reply(200,challenge);
  http.onPost("/scans").replyOnce(409,{code:"EXISTING_DOMAIN_TOKEN",error:"O site já tem token.",existingToken:"websec-verify-existing",domainId:7,hostname:"qa.example.invalid"});
  http.onPost("/scans").reply(200,{...scan,status:"PENDING_VERIFICATION",verificationToken:"websec-verify-existing"});
  renderPage(<SubmitScanPage/>,`/test?challenge=${challenge.id}`);
  await screen.findByText(challenge.token,{selector:"code"});
  fireEvent.change(screen.getByRole("textbox"),{target:{value:"qa.example.invalid"}});
  fireEvent.submit(screen.getByRole("textbox").closest("form")!);
  fireEvent.click(await screen.findByRole("button",{name:"Usar token existente"}));
  expect(http.history.post).toHaveLength(1);
  fireEvent.submit(screen.getByRole("textbox").closest("form")!);
  await screen.findByRole("button",{name:"Já verifiquei, iniciar varredura"});
  expect(JSON.parse(http.history.post[1].data).verificationChallengeId).toBeUndefined();
});

test("resposta atrasada nao aplica conflito a outro endereco editado durante envio",async()=>{
  let finish!:(response:[number,unknown])=>void;
  http.onGet(`/verification-challenges/${challenge.id}`).reply(200,challenge);
  http.onPost("/scans").replyOnce(()=>new Promise<[number,unknown]>(resolve=>{finish=resolve;}));
  renderPage(<SubmitScanPage/>,`/test?challenge=${challenge.id}`);
  await screen.findByText(challenge.token,{selector:"code"});
  const input=screen.getByRole("textbox");
  fireEvent.change(input,{target:{value:"qa.example.invalid"}});
  fireEvent.submit(input.closest("form")!);
  await waitFor(()=>expect(typeof finish).toBe("function"));
  expect(input).toBeDisabled();
  fireEvent.change(input,{target:{value:"other.example.invalid"}});
  expect(input).toHaveValue("qa.example.invalid");
  await act(async()=>finish([409,{code:"EXISTING_DOMAIN_TOKEN",existingToken:"existing",hostname:"qa.example.invalid"}]));
  await screen.findByRole("button",{name:"Usar token existente"});
  expect(input).toHaveValue("qa.example.invalid");
});

test("desafio invalido nao permite submissao sem a selecao pretendida",async()=>{
  http.onGet(`/verification-challenges/${challenge.id}`).reply(404,{error:"Desafio não encontrado"});
  renderPage(<SubmitScanPage/>,`/test?challenge=${challenge.id}`);
  await screen.findByRole("alert");
  fireEvent.change(screen.getByRole("textbox"),{target:{value:"qa.example.invalid"}});
  fireEvent.submit(screen.getByRole("textbox").closest("form")!);
  expect(screen.getByRole("button",{name:"Continuar"})).toBeDisabled();
  expect(http.history.post).toHaveLength(0);
});
