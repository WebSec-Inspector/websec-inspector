import React from 'react';
import {beforeEach,afterEach,test,expect} from 'vitest';
import {render,screen,fireEvent,waitFor} from '@testing-library/react';
import MockAdapter from 'axios-mock-adapter';
import {api} from '../../src/services/api';
import ReportDownload from '../../src/components/ReportDownload';

let http:MockAdapter;
beforeEach(()=>{http=new MockAdapter(api,{onNoMatch:'throwException'});});
afterEach(()=>http.restore());

test('failed PDF can retry independently without confirming or submitting a scan',async()=>{
  http.onGet('/scans/42/report').reply(200,{status:'FAILED',generatedAt:null,generationVersion:1,failureCode:'PDF_GENERATION_FAILED'});
  http.onPost('/scans/42/report').reply(202,{status:'PENDING',generatedAt:null,generationVersion:1,failureCode:null});
  render(<ReportDownload scanId={42}/>);
  fireEvent.click(await screen.findByRole('button',{name:'Gerar PDF novamente'}));
  expect(await screen.findByText('PDF aguardando geração.')).toBeInTheDocument();
  expect(http.history.post.map(x=>x.url)).toEqual(['/scans/42/report']);
});

test('ready PDF offers authenticated download and failed metadata lookup offers explicit retry',async()=>{
  http.onGet('/scans/42/report').replyOnce(503,{});
  render(<ReportDownload scanId={42}/>);
  expect(await screen.findByRole('button',{name:'Consultar PDF novamente'})).toBeInTheDocument();
  http.onGet('/scans/42/report').reply(200,{status:'READY',generatedAt:'2026-10-31T12:00:00Z',generationVersion:1,failureCode:null});
  fireEvent.click(screen.getByRole('button',{name:'Consultar PDF novamente'}));
  expect(await screen.findByRole('button',{name:'Baixar PDF'})).toBeEnabled();
  await waitFor(()=>expect(http.history.get).toHaveLength(2));
});
