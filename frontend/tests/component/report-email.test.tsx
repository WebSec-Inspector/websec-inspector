import React from 'react';
import {beforeEach,afterEach,test,expect} from 'vitest';
import {render,screen,fireEvent} from '@testing-library/react';
import MockAdapter from 'axios-mock-adapter';
import {api} from '../../src/services/api';
import ReportEmail from '../../src/components/ReportEmail';

let http:MockAdapter;
const state={enabled:true,status:'FAILED',attemptCount:3,sentAt:null,nextAttemptAt:null,failureCode:'SMTP_UNAVAILABLE'};
beforeEach(()=>{http=new MockAdapter(api,{onNoMatch:'throwException'});});
afterEach(()=>http.restore());
test('SMTP disabled leaves PDF available and offers no send action',async()=>{
  http.onGet('/scans/42/report/email').reply(200,{...state,enabled:false,status:'NOT_REQUESTED'});
  render(<ReportEmail scanId={42}/>);
  expect(await screen.findByText(/Envio por e-mail indisponível/)).toBeInTheDocument();
  expect(screen.queryByRole('button',{name:/Enviar|Tentar envio/})).not.toBeInTheDocument();
});
test('failed delivery retries without regeneration or arbitrary recipient',async()=>{
  http.onGet('/scans/42/report/email').replyOnce(200,state).onGet('/scans/42/report/email').reply(200,{...state,status:'PENDING',attemptCount:0});
  http.onPost('/scans/42/report/email').reply(202,{...state,status:'PENDING',attemptCount:0});
  render(<ReportEmail scanId={42}/>);
  fireEvent.click(await screen.findByRole('button',{name:'Tentar envio novamente'}));
  expect(await screen.findByText(/E-mail aguardando envio/)).toBeInTheDocument();
  expect(http.history.post.map(x=>x.url)).toEqual(['/scans/42/report/email']);
  expect(JSON.parse(http.history.post[0].data)).toEqual({});
});
