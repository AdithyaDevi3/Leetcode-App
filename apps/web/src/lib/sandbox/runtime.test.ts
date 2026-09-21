import { beforeEach, describe, expect, it, vi } from 'vitest';

const judge0 = { execute: vi.fn() };
const vercel = { execute: vi.fn() };

vi.mock('./judge0', () => ({ createJudge0Sandbox: vi.fn(() => judge0) }));
vi.mock('./vercel', () => ({ createVercelSandbox: vi.fn(() => vercel) }));

describe('configured code execution provider', () => {
  beforeEach(() => {
    delete process.env.CODE_EXECUTION_PROVIDER;
    delete process.env.VERCEL;
    delete process.env.JUDGE0_ENDPOINT;
    delete process.env.JUDGE0_TOKEN;
  });

  it('uses Vercel Sandbox automatically in a Vercel deployment', async () => {
    process.env.VERCEL = '1';
    const { createConfiguredSandbox } = await import('./runtime');
    expect(createConfiguredSandbox()).toBe(vercel);
  });

  it('allows Vercel Sandbox to be selected explicitly', async () => {
    process.env.CODE_EXECUTION_PROVIDER = 'vercel-sandbox';
    const { createConfiguredSandbox } = await import('./runtime');
    expect(createConfiguredSandbox()).toBe(vercel);
  });

  it('keeps Judge0 as a configured fallback', async () => {
    process.env.CODE_EXECUTION_PROVIDER = 'judge0';
    process.env.JUDGE0_ENDPOINT = 'https://judge.example';
    process.env.JUDGE0_TOKEN = 'secret';
    const { createConfiguredSandbox } = await import('./runtime');
    expect(createConfiguredSandbox()).toBe(judge0);
  });

  it('rejects unknown providers', async () => {
    process.env.CODE_EXECUTION_PROVIDER = 'other';
    const { createConfiguredSandbox } = await import('./runtime');
    expect(() => createConfiguredSandbox()).toThrow('Unsupported code execution provider');
  });
});
