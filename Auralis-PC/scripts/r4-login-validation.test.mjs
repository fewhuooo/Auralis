import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  normalizeFieldErrors,
  summarizeFieldErrors,
} from '../src/api/problemFieldErrors.ts';
import { createApiProblemError } from '../src/api/httpError.ts';

const loginSource = readFileSync(
  fileURLToPath(new URL('../src/views/Login/index.vue', import.meta.url)),
  'utf8',
);

test('login maps RFC Problem Details fieldErrors instead of the removed errors shape', () => {
  assert.match(loginSource, /normalizeFieldErrors\(problem\.fieldErrors\)/);
  assert.match(loginSource, /summarizeFieldErrors\(problem\.fieldErrors\)/);
  assert.doesNotMatch(loginSource, /problem\.errors/);
});

test('normalizes server field errors for form controls', () => {
  assert.deepEqual(
    normalizeFieldErrors([
      { field: ' username ', message: 'required' },
      { field: 'username', message: 'required' },
      { field: 'password', message: 'too short' },
      { field: '', message: 'ignored' },
      { field: 'displayName', message: '' },
      null,
    ]),
    {
      username: ['required'],
      password: ['too short'],
    },
  );
  assert.deepEqual(normalizeFieldErrors(undefined), {});
});

test('summarizes RFC fieldErrors so generic validation details do not hide the actionable message', () => {
  assert.equal(
    summarizeFieldErrors([
      { field: 'username', message: '用户名不能为空' },
      { field: 'password', message: '密码长度不足' },
    ]),
    '用户名不能为空；密码长度不足',
  );
  assert.equal(summarizeFieldErrors([]), '');
});

test('keeps fieldErrors when the HTTP boundary creates the login problem', () => {
  const error = createApiProblemError({
    response: {
      status: 400,
      data: {
        title: 'Bad Request',
        status: 400,
        detail: 'Request validation failed',
        fieldErrors: [{ field: 'username', message: '用户名不能为空' }],
      },
    },
  });

  assert.equal(error.problem.detail, 'Request validation failed');
  assert.deepEqual(error.problem.fieldErrors, [{ field: 'username', message: '用户名不能为空' }]);
  assert.equal(summarizeFieldErrors(error.problem.fieldErrors), '用户名不能为空');
});
