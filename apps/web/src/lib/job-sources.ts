import 'server-only';

export type JobSource = {
  description: string;
  href: string;
  id: string;
  kind: 'internship' | 'new_grad' | 'general';
  name: string;
  note: string;
  updatedAt: string | null;
};

type GitHubRepository = { pushed_at?: unknown };

const githubSources = [
  {
    description: 'Software engineering, data, AI, quant, product, and hardware internships.',
    href: 'https://github.com/SimplifyJobs/Summer2027-Internships',
    id: 'simplify-internships',
    kind: 'internship' as const,
    name: 'Simplify internships',
    repository: 'SimplifyJobs/Summer2027-Internships',
  },
  {
    description: 'Full-time software engineering, quant, and product roles for new graduates.',
    href: 'https://github.com/SimplifyJobs/New-Grad-Positions',
    id: 'simplify-new-grad',
    kind: 'new_grad' as const,
    name: 'Simplify new-grad roles',
    repository: 'SimplifyJobs/New-Grad-Positions',
  },
];

const validDate = (value: unknown): string | null => {
  if (typeof value !== 'string') return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.valueOf()) ? null : parsed.toISOString();
};

async function githubUpdatedAt(repository: string): Promise<string | null> {
  try {
    const response = await fetch(`https://api.github.com/repos/${repository}`, {
      headers: { Accept: 'application/vnd.github+json' },
      next: { revalidate: 600 },
      signal: AbortSignal.timeout(5_000),
    });
    if (!response.ok) return null;
    return validDate((await response.json() as GitHubRepository).pushed_at);
  } catch {
    return null;
  }
}

/** Read only public source metadata. Job listings always open at their original source. */
export async function readJobSources(): Promise<JobSource[]> {
  const github = await Promise.all(githubSources.map(async source => ({
    ...source,
    note: 'Open the maintained source list. Confirm the employer listing before you apply.',
    updatedAt: await githubUpdatedAt(source.repository),
  })));
  return [...github, {
    description: 'Search current roles and role collections from Simplify.',
    href: 'https://simplify.jobs/latest-jobs',
    id: 'simplify-latest',
    kind: 'general',
    name: 'Simplify latest jobs',
    note: 'Open the source site for the current posting and application details.',
    updatedAt: null,
  }];
}
