import React from 'react';
import {beforeEach,afterEach,test,expect,vi} from 'vitest';
import {render,screen,fireEvent,waitFor} from '@testing-library/react';
import MockAdapter from 'axios-mock-adapter';
import {api} from '../../src/services/api';
import CvssAssessmentPanel from '../../src/components/CvssAssessmentPanel';
let http:MockAdapter;
const vector='CVSS:4.0/AV:N/AC:L/AT:N/PR:N/UI:N/VC:H/VI:H/VA:H/SC:N/SI:N/SA:N';
const preview={version:'4.0',nomenclature:'CVSS-B',vector,score:9.3,severity:'CRITICAL'};
beforeEach(()=>{http=new MockAdapter(api,{onNoMatch:'throwException'});});afterEach(()=>http.restore());
test('requires all metrics and saves server-calculated score with revision and justification',async()=>{
  http.onGet('/findings/1/cvss').reply(200,{canAssess:true,assessment:null,history:[]});
  http.onPost('/cvss/v4/base/preview').reply(200,preview);
  const assessment={...preview,justification:'Impacto validado',assessorName:'Avaliador',assessedAt:'2026-11-04T12:00:00Z',revision:1};
  http.onPut('/findings/1/cvss').reply(200,{canAssess:true,assessment,history:[assessment]});
  const saved=vi.fn();render(<CvssAssessmentPanel findingId={1} onSaved={saved}/>);
  const calculate=await screen.findByRole('button',{name:'Calcular CVSS 4.0'});expect(calculate).toBeDisabled();
  for(const [key,value] of Object.entries({AV:'N',AC:'L',AT:'N',PR:'N',UI:'N',VC:'H',VI:'H',VA:'H',SC:'N',SI:'N',SA:'N'}))
    fireEvent.change(screen.getByTestId(`cvss-metric-${key}`),{target:{value}});
  fireEvent.click(calculate);expect(await screen.findByText(/9.3/)).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('Justificativa da avaliação'),{target:{value:'Impacto validado'}});
  fireEvent.click(screen.getByRole('button',{name:'Registrar avaliação'}));
  await waitFor(()=>expect(saved).toHaveBeenCalledOnce());
  expect(JSON.parse(http.history.put[0].data)).toEqual({vector,justification:'Impacto validado',expectedRevision:0});
});
