import {afterEach, beforeEach, expect, test, vi} from 'vitest';
import MockAdapter from 'axios-mock-adapter';

const adapters: MockAdapter[]=[];
const deferred = <T>() => {let resolve!: (v:T)=>void;const promise=new Promise<T>(r=>{resolve=r;});return {resolve,promise};};
async function tab() {vi.resetModules();const client=await import('../../src/services/api');const http=new MockAdapter(client.api,{onNoMatch:'throwException'});adapters.push(http);return {...client,http};}
beforeEach(()=>localStorage.setItem('websec_token','alice'));
afterEach(()=>{adapters.splice(0).forEach(a=>a.restore());localStorage.clear();});

test('a delayed mutation from Alice is never replayed with Bob credentials from another module context', async()=>{
  const a=await tab();const b=await tab();const delayed=deferred<[number,object]>();
  a.http.onPost('/domains').replyOnce(()=>delayed.promise);a.http.onPost('/domains').reply(200,{});
  b.http.onPost('/auth/logout').reply(204,{});b.http.onPost('/auth/login').reply(200,{token:'bob'});
  const mutation=a.api.post('/domains',{hostname:'alice.example.invalid'}).catch(e=>e);
  await vi.waitFor(()=>expect(a.http.history.post).toHaveLength(1));
  await b.login('bob@example.invalid','password');
  delayed.resolve([401,{}]);expect((await mutation).response.status).toBe(401);
  expect(a.http.history.post).toHaveLength(1);expect(localStorage.getItem('websec_token')).toBe('bob');
});

test('a refresh in one module cannot restore access after logout in another module without storage events', async()=>{
  const a=await tab();const b=await tab();const delayed=deferred<[number,object]>();
  a.http.onPost('/auth/refresh').reply(()=>delayed.promise);a.http.onGet('/private').reply(401,{});
  b.http.onPost('/auth/logout').reply(204,{});
  const request=a.api.get('/private').catch(e=>e);
  await vi.waitFor(()=>expect(a.http.history.post).toHaveLength(1));
  const out=b.logout();
  expect(localStorage.getItem('websec_token')).toBeNull();
  delayed.resolve([200,{token:'late-alice'}]);await request;await out;
  await vi.waitFor(()=>expect(b.http.history.post).toHaveLength(1));
  expect(localStorage.getItem('websec_token')).toBeNull();expect(a.http.history.get).toHaveLength(1);
});

test.each([403,409,503])('a renewed request preserves its actual %i error and the renewed session',async(status)=>{
  const a=await tab();a.http.onPost('/auth/refresh').reply(200,{token:'renewed'});
  a.http.onPost('/domains').replyOnce(401,{}).onPost('/domains').reply(status,{error:'actual failure'});
  await expect(a.api.post('/domains',{hostname:'example.invalid'})).rejects.toMatchObject({response:{status,data:{error:'actual failure'}}});
  expect(localStorage.getItem('websec_token')).toBe('renewed');expect(a.http.history.post).toHaveLength(3);
});

test.each(['offline','503'])('pending remote logout survives %s and reload and must finish before another login',async(failure)=>{
  const a=await tab();
  if(failure==='offline') a.http.onPost('/auth/logout').networkError();else a.http.onPost('/auth/logout').reply(503,{});
  await Promise.resolve(a.logout()).catch(()=>undefined);
  await vi.waitFor(()=>expect(a.http.history.post).toHaveLength(1));
  const reloaded=await tab();
  reloaded.http.onPost('/auth/logout').reply(503,{});reloaded.http.onPost('/auth/login').reply(200,{token:'bob'});
  await expect(reloaded.login('bob@example.invalid','password')).rejects.toBeTruthy();
  expect(reloaded.http.history.post.map(p=>p.url)).toEqual(['/auth/logout']);
  expect(localStorage.getItem('websec_token')).toBeNull();
  reloaded.http.onPost('/auth/logout').reply(204,{});
  await reloaded.login('bob@example.invalid','password');
  expect(reloaded.http.history.post.map(p=>p.url)).toEqual(['/auth/logout','/auth/logout','/auth/login']);
  expect(localStorage.getItem('websec_token')).toBe('bob');
});
