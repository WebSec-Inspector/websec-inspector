import React from 'react';
import {afterEach,beforeEach,test,expect} from 'vitest';
import {screen,fireEvent,waitFor,act} from '@testing-library/react';
import MockAdapter from 'axios-mock-adapter';
import {api} from '../../src/services/api';
import {renderPage,scan} from '../helpers';
import ScanComparisonPage from '../../src/pages/ScanComparisonPage';

let http:MockAdapter;
const change={ruleId:'10020',url:'https://example.invalid/',parameter:'',method:'GET',title:'<script>evidence</script>',baselineSeverity:null,comparedSeverity:'HIGH',baselineOccurrences:0,comparedOccurrences:1,severityChanged:false};
const comparison={domainId:7,hostname:'example.invalid',baseline:{id:42,createdAt:scan.createdAt,finishedAt:scan.createdAt},compared:{id:43,createdAt:scan.createdAt,finishedAt:scan.createdAt},complete:true,limitations:[],unidentifiedBaseline:0,unidentifiedCompared:0,duplicateBaseline:0,duplicateCompared:0,added:[change],removed:[],persistent:[],unmatchedBaseline:[],unmatchedCompared:[]};
beforeEach(()=>{
  localStorage.setItem('websec_token','comparison-token');
  http=new MockAdapter(api,{onNoMatch:'throwException'});
  http.onGet('/scans/domain/7/history').reply(200,[{...scan,id:43,status:'COMPLETED'},{...scan,id:42,status:'COMPLETED'}]);
});
afterEach(()=>http.restore());

test('requires an explicit selection and renders untrusted finding titles as text',async()=>{
  http.onGet('/scans/42/compare/43').reply(200,comparison);
  renderPage(<ScanComparisonPage/>,'/test?dominio=7');
  const button=await screen.findByRole('button',{name:'Comparar varreduras'});
  await waitFor(()=>expect(button).toBeEnabled());
  expect(http.history.get.filter(r=>r.url?.includes('/compare/'))).toHaveLength(0);
  fireEvent.click(button);
  expect(await screen.findByText('<script>evidence</script>')).toBeInTheDocument();
  expect(document.querySelector('script')).toBeNull();
  expect(screen.getByText(/Ausência de um achado não comprova/)).toBeInTheDocument();
});

test('legacy data shows uncertainty instead of claiming zero new findings or a correction',async()=>{
  http.onGet('/scans/42/compare/43').reply(200,{...comparison,complete:false,limitations:['Regra ausente em achados legados.'],unidentifiedBaseline:1,added:[],unmatchedCompared:[change]});
  renderPage(<ScanComparisonPage/>,'/test?dominio=7');
  const button=await screen.findByRole('button',{name:'Comparar varreduras'});
  await waitFor(()=>expect(button).toBeEnabled());fireEvent.click(button);
  expect(await screen.findByText('Comparação limitada')).toBeInTheDocument();
  expect(screen.getAllByText('Indeterminado')).toHaveLength(2);
  expect(screen.getByText('Regra ausente em achados legados.')).toBeInTheDocument();
  expect(screen.queryByText('Ausente na base')).not.toBeInTheDocument();
  expect(screen.getByText('Correspondência indeterminada na base')).toBeInTheDocument();
});

test('changing selection cancels the old comparison and discards its late response',async()=>{
  let resolve!:(value:[number,unknown])=>void;
  http.onGet('/scans/42/compare/43').reply(()=>new Promise(r=>{resolve=r;}));
  renderPage(<ScanComparisonPage/>,'/test?dominio=7');
  const button=await screen.findByRole('button',{name:'Comparar varreduras'});
  await waitFor(()=>expect(button).toBeEnabled());fireEvent.click(button);
  await waitFor(()=>expect(resolve).toBeDefined());
  fireEvent.change(screen.getByLabelText('Varredura base'),{target:{value:'43'}});
  await act(async()=>{resolve([200,comparison]);});
  expect(screen.queryByText('<script>evidence</script>')).not.toBeInTheDocument();
});
