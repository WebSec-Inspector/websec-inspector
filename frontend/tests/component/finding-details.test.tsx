import React from 'react';
import {afterEach,beforeEach,test,expect} from 'vitest';
import {render,screen,fireEvent} from '@testing-library/react';
import MockAdapter from 'axios-mock-adapter';
import {api,Finding} from '../../src/services/api';
import ScanFindings from '../../src/components/ScanFindings';

let http:MockAdapter;
const finding={id:1,owaspCategory:'A05',description:'Cabeçalho ausente',cvssScore:5.5,severity:'MEDIUM',recommendation:'Configurar',title:'Cabeçalho',
  confidence:'High',affectedUrl:'https://example.invalid',affectedParameter:'q',evidence:'<script>alert(1)</script>',cweId:'16',wascId:null,technicalReference:'javascript:alert(1)',executionTimestamp:null} as Finding;
beforeEach(()=>{http=new MockAdapter(api,{onNoMatch:'throwException'});http.onGet('/findings/1/cvss').reply(200,{canAssess:false,assessment:null,history:[]});});
afterEach(()=>http.restore());
test('evidence is expandable plain text and scanner risk is not labelled CVSS',async()=>{
  render(<ScanFindings findings={[finding]}/>);
  expect(screen.getByText(/Score aproximado ZAP: 5.5/)).toBeInTheDocument();
  expect(screen.queryByText('<script>alert(1)</script>')).not.toBeInTheDocument();
  const button=screen.getByRole('button',{name:'Detalhes de Cabeçalho'});
  fireEvent.click(button);expect(button).toHaveAttribute('aria-expanded','true');
  expect(screen.getByText('<script>alert(1)</script>')).toBeInTheDocument();
  expect(document.querySelector('script')).toBeNull();
  expect(document.querySelector('a[href^="javascript:"]')).toBeNull();
  expect(await screen.findByText(/CVSS ainda não avaliado/)).toBeInTheDocument();
});
test('severity filter distinguishes informational findings from an empty filter result',()=>{
  render(<ScanFindings findings={[finding,{...finding,id:2,severity:'INFORMATIONAL',title:'Informação'}]}/>);
  fireEvent.change(screen.getByLabelText('Filtrar risco ZAP'),{target:{value:'INFORMATIONAL'}});
  expect(screen.getByRole('button',{name:'Detalhes de Informação'})).toBeInTheDocument();
  expect(screen.queryByRole('button',{name:'Detalhes de Cabeçalho'})).not.toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('Filtrar risco ZAP'),{target:{value:'CRITICAL'}});
  expect(screen.getByText('Nenhum achado corresponde a este filtro.')).toBeInTheDocument();
});

test('legacy nullable recommendation does not crash results',()=>{
  render(<ScanFindings findings={[{...finding,recommendation:null} as unknown as Finding]}/>);
  expect(screen.getByRole('button',{name:'Detalhes de Cabeçalho'})).toBeInTheDocument();
  expect(screen.getByText(/Sem recomendação registrada/)).toBeInTheDocument();
});
