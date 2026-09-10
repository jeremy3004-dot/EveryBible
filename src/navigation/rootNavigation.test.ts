import test, { mock } from 'node:test';
import assert from 'node:assert/strict';

import { mockModule } from '../testing/mockModules';
import type { AuthScreenMode } from './types';

/**
 * rootNavigation owns the app-wide navigation ref and the one imperative entry
 * point that uses it. @react-navigation/native cannot load under Node, so its
 * container ref is replaced with a fake that records navigate calls and lets a
 * test flip readiness — the two states the module actually branches on.
 */

type NavigateCall = { name: string; params: unknown };

const navigateCalls: NavigateCall[] = [];
let ready = false;
let createRefCalls = 0;

const containerRef = {
  isReady: () => ready,
  navigate: (name: string, params: unknown) => {
    navigateCalls.push({ name, params });
  },
};

mockModule(mock, '@react-navigation/native', {
  createNavigationContainerRef: () => {
    createRefCalls += 1;
    return containerRef;
  },
});

const load = async () => import('./rootNavigation');

const reset = () => {
  navigateCalls.length = 0;
  ready = false;
};

test('the module exports the single container ref it created', async () => {
  const { rootNavigationRef } = await load();
  assert.equal(rootNavigationRef, containerRef);
  assert.equal(createRefCalls, 1, 'the ref is created once at module scope');
});

test('openAuthFlow does nothing while the navigator is not ready', async () => {
  reset();
  const { openAuthFlow } = await load();
  openAuthFlow('signUp');
  assert.deepEqual(
    navigateCalls,
    [],
    'a navigate before onReady would be dropped by the container'
  );
});

test('openAuthFlow opens the Auth screen inside the More tab once ready', async () => {
  reset();
  const { openAuthFlow } = await load();
  ready = true;
  openAuthFlow('signUp');
  assert.deepEqual(navigateCalls, [
    {
      name: 'More',
      params: {
        screen: 'Auth',
        params: { screen: 'AuthScreen', params: { initialMode: 'signUp' } },
      },
    },
  ]);
});

test('openAuthFlow defaults to sign-in when no mode is given', async () => {
  reset();
  const { openAuthFlow } = await load();
  ready = true;
  openAuthFlow();
  assert.equal(navigateCalls.length, 1);
  assert.deepEqual(navigateCalls[0].params, {
    screen: 'Auth',
    params: { screen: 'AuthScreen', params: { initialMode: 'signIn' } },
  });
});

test('every auth mode is forwarded verbatim to the auth screen', async () => {
  reset();
  const { openAuthFlow } = await load();
  ready = true;
  const modes: AuthScreenMode[] = ['signIn', 'signUp'];
  for (const mode of modes) {
    openAuthFlow(mode);
  }
  assert.deepEqual(
    navigateCalls.map(
      (call) =>
        (call.params as { params: { params: { initialMode: AuthScreenMode } } }).params.params
          .initialMode
    ),
    modes
  );
});

test('readiness is re-checked on every call, so a link that arrives early is simply ignored', async () => {
  reset();
  const { openAuthFlow } = await load();
  openAuthFlow('signIn');
  ready = true;
  openAuthFlow('signIn');
  ready = false;
  openAuthFlow('signIn');
  assert.equal(navigateCalls.length, 1, 'only the call made while ready should navigate');
});
