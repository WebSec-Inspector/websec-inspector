import React from 'react';
import {afterEach, beforeEach, expect, test, vi} from 'vitest';
import {act, fireEvent, render, screen} from '@testing-library/react';
import MockAdapter from 'axios-mock-adapter';
import {api, login, logout} from '../../src/services/api';
import {AuthProvider, useAuth} from '../../src/context/AuthContext';

let http: MockAdapter;
beforeEach(() => { http = new MockAdapter(api, {onNoMatch: 'throwException'}); localStorage.setItem('websec_token','expired'); });
afterEach(() => {http.restore();});
function Session() { const auth=useAuth(); return <><output>{auth.token ?? 'signed out'}</output><button onClick={auth.logout}>Logout</button></>; }
const defer = <T,>() => {let resolve!: (v:T)=>void;const promise=new Promise<T>(r=>{resolve=r;});return {resolve,promise};};

test('401 refreshes with credentials and retries once using the rotated access token', async () => {
  render(<AuthProvider><Session /></AuthProvider>);
  http.onPost('/auth/refresh').reply(config => {expect(config.withCredentials).toBe(true);return [200,{token:'renewed'}];});
  http.onGet('/private').reply(config => config.headers?.Authorization==='Bearer renewed' ? [200,{ok:true}] : [401,{}]);
  await act(async () => {expect((await api.get('/private')).data.ok).toBe(true);});
  expect(screen.getByText('renewed')).toBeInTheDocument();
  expect(localStorage.getItem('websec_token')).toBe('renewed');
  expect(http.history.post).toHaveLength(1);
  expect(http.history.get).toHaveLength(2);
});

test('concurrent and delayed 401 share one refresh, including requests answered after rotation', async () => {
  const refresh=defer<[number,object]>(); const late=defer<[number,object]>();
  http.onPost('/auth/refresh').reply(()=>refresh.promise);
  http.onGet('/a').reply(config=>config.headers?.Authorization==='Bearer renewed' ? [200,{}] : [401,{}]);
  http.onGet('/b').reply(config=>config.headers?.Authorization==='Bearer renewed' ? [200,{}] : [401,{}]);
  http.onGet('/late').replyOnce(()=>late.promise);
  http.onGet('/late').reply(200,{});
  const pending=[api.get('/a'),api.get('/b'),api.get('/late')];
  await vi.waitFor(()=>expect(http.history.post).toHaveLength(1));
  refresh.resolve([200,{token:'renewed'}]);
  await Promise.all(pending.slice(0,2));
  late.resolve([401,{}]);await pending[2];
  expect(http.history.post).toHaveLength(1);
});

test('a retried 401 expires the session without a refresh loop; auth endpoints never refresh', async () => {
  http.onPost('/auth/refresh').reply(200,{token:'renewed'});
  http.onGet('/private').reply(401,{});
  await expect(api.get('/private')).rejects.toBeTruthy();
  expect(http.history.post).toHaveLength(1);expect(http.history.get).toHaveLength(2);
  expect(localStorage.getItem('websec_token')).toBeNull();
  for(const endpoint of ['login','register','refresh','logout']) {
    http.onPost(`/auth/${endpoint}`).reply(401,{});
    await expect(api.post(`/auth/${endpoint}`)).rejects.toBeTruthy();
  }
  // Pending revocation blocks login/register/refresh locally; logout remains
  // callable. None of these endpoints can recursively refresh.
  expect(http.history.post).toHaveLength(2);
});

test('logout clears locally immediately, fences late refresh and revokes after its response', async () => {
  const refresh=defer<[number,object]>();
  http.onPost('/auth/refresh').reply(()=>refresh.promise);
  http.onPost('/auth/logout').reply(config=>{expect(config.withCredentials).toBe(true);return [204,{}];});
  http.onGet('/private').reply(401,{});
  render(<AuthProvider><Session /></AuthProvider>);
  const result=api.get('/private').catch(()=>null);
  await vi.waitFor(()=>expect(http.history.post).toHaveLength(1));
  fireEvent.click(screen.getByText('Logout'));
  expect(screen.getByText('signed out')).toBeInTheDocument();
  expect(localStorage.getItem('websec_token')).toBeNull();
  await act(async()=>{refresh.resolve([200,{token:'too-late'}]);await result;});
  await vi.waitFor(()=>expect(http.history.post.filter(p=>p.url==='/auth/logout')).toHaveLength(1));
  expect(localStorage.getItem('websec_token')).toBeNull();expect(http.history.get).toHaveLength(1);
});

test('403 retains session and refresh failure clears it', async () => {
  http.onGet('/forbidden').reply(403,{});await expect(api.get('/forbidden')).rejects.toBeTruthy();
  expect(localStorage.getItem('websec_token')).toBe('expired');expect(http.history.post).toHaveLength(0);
  http.onPost('/auth/refresh').reply(401,{});http.onGet('/private').reply(401,{});
  await expect(api.get('/private')).rejects.toBeTruthy();expect(localStorage.getItem('websec_token')).toBeNull();
});

test('logout waits for a pending login response so its late cookie is revoked', async () => {
  localStorage.removeItem('websec_token');
  const response=defer<[number,object]>();
  http.onPost('/auth/login').reply(()=>response.promise);
  http.onPost('/auth/logout').reply(204,{});
  const attempt=login('qa@example.invalid','password').catch(()=>null);
  await vi.waitFor(()=>expect(http.history.post).toHaveLength(1));
  logout();
  await new Promise(resolve=>setTimeout(resolve,0));
  expect(http.history.post.map(p=>p.url)).toEqual(['/auth/login']);
  response.resolve([200,{token:'late-login'}]);await attempt;
  await vi.waitFor(()=>expect(http.history.post.map(p=>p.url)).toEqual(['/auth/login','/auth/logout']));
  expect(localStorage.getItem('websec_token')).toBeNull();
});

test('AuthContext updates on storage events from another tab',async()=>{
  render(<AuthProvider><Session /></AuthProvider>);
  act(()=>{localStorage.setItem('websec_token','another-tab');window.dispatchEvent(new StorageEvent('storage',{key:'websec_token'}));});
  expect(screen.getByText('another-tab')).toBeInTheDocument();
  act(()=>{localStorage.removeItem('websec_token');window.dispatchEvent(new StorageEvent('storage',{key:'websec_token'}));});
  expect(screen.getByText('signed out')).toBeInTheDocument();
});

test('local logout shows durable pending server revocation and offers retry after a failure',async()=>{
  http.onPost('/auth/logout').reply(503,{});
  const view=render(<AuthProvider><Session /></AuthProvider>);fireEvent.click(screen.getByText('Logout'));
  expect(screen.getByText('signed out')).toBeInTheDocument();
  expect(await screen.findByText(/revogação no servidor.*pendente/i)).toBeInTheDocument();
  await vi.waitFor(()=>expect(http.history.post).toHaveLength(1));
  view.unmount();render(<AuthProvider><Session /></AuthProvider>);
  expect(screen.getByText(/revogação no servidor.*pendente/i)).toBeInTheDocument();
  http.onPost('/auth/logout').reply(204,{});
  fireEvent.click(screen.getByRole('button',{name:/Tentar revogar sessão/i}));
  await vi.waitFor(()=>expect(screen.queryByText(/revogação no servidor.*pendente/i)).not.toBeInTheDocument());
  expect(http.history.post).toHaveLength(2);expect(localStorage.getItem('websec_token')).toBeNull();
});
