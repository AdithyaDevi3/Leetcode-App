import { createJudge0Sandbox } from './judge0';
import { createVercelSandbox } from './vercel';

export type CodeExecutionProvider = 'judge0' | 'vercel-sandbox';

export function configuredCodeExecutionProvider(): CodeExecutionProvider {
  const provider = process.env.CODE_EXECUTION_PROVIDER ?? (process.env.VERCEL ? 'vercel-sandbox' : 'judge0');
  if (provider === 'judge0' || provider === 'vercel-sandbox') return provider;
  throw new Error(`Unsupported code execution provider: ${provider}`);
}

export function createConfiguredSandbox() {
  if (configuredCodeExecutionProvider() === 'vercel-sandbox') return createVercelSandbox();

  const endpoint = process.env.JUDGE0_ENDPOINT;
  const token = process.env.JUDGE0_TOKEN;
  if (!endpoint || !token) throw new Error('Judge0 sandbox configuration is missing');

  return createJudge0Sandbox({
    endpoint,
    token,
    languageIds: {
      typescript: Number(process.env.JUDGE0_TYPESCRIPT_LANGUAGE_ID ?? 74),
      python: Number(process.env.JUDGE0_PYTHON_LANGUAGE_ID ?? 71),
      cpp: Number(process.env.JUDGE0_CPP_LANGUAGE_ID ?? 54),
    },
  });
}
