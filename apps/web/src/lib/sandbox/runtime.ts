import { createJudge0Sandbox } from './judge0';

export function createConfiguredSandbox() {
  const endpoint = process.env.JUDGE0_ENDPOINT;
  const token = process.env.JUDGE0_TOKEN;
  if (!endpoint || !token) throw new Error('Judge0 sandbox configuration is missing');

  return createJudge0Sandbox({
    endpoint,
    token,
    languageIds: {
      typescript: Number(process.env.JUDGE0_TYPESCRIPT_LANGUAGE_ID ?? 74),
      python: Number(process.env.JUDGE0_PYTHON_LANGUAGE_ID ?? 71),
    },
  });
}
