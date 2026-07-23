import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const defaultConfigPath = path.join(root, 'docs', 'community', 'recognition.json');
const defaultOutputPath = path.join(root, 'docs', 'community', 'LEADERBOARD.md');
const rejectedIssueLabels = new Set(['duplicate', 'invalid', 'wontfix']);

function accountIsEligible(login, maintainers) {
  return (
    typeof login === 'string' &&
    login.length > 0 &&
    !login.toLowerCase().endsWith('[bot]') &&
    !maintainers.has(login.toLowerCase())
  );
}

function recordFor(records, login) {
  const key = login.toLowerCase();
  if (!records.has(key)) {
    records.set(key, {
      login,
      commits: 0,
      mergedPullRequests: 0,
      acceptedIssues: 0,
      roadmapCompletions: new Set(),
    });
  }
  return records.get(key);
}

export function parseClosingIssueNumbers(body = '') {
  const issueNumbers = new Set();
  const pattern = /\b(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?)\s+#(\d+)\b/gi;
  for (const match of body.matchAll(pattern)) issueNumbers.add(Number(match[1]));
  return [...issueNumbers];
}

export function badgeFor(record) {
  if (record.mergedPullRequests >= 10) return 'Pathfinder';
  if (record.mergedPullRequests >= 5) return 'Navigator';
  if (record.mergedPullRequests >= 3) return 'Route Builder';
  if (record.mergedPullRequests >= 1) return 'First Flight';
  return 'Community Scout';
}

function displayWidth(value) {
  return [...value].reduce(
    (width, character) => width + (/\p{Extended_Pictographic}/u.test(character) ? 2 : 1),
    0,
  );
}

function padCell(value, width, alignment) {
  const padding = ' '.repeat(Math.max(0, width - displayWidth(value)));
  return alignment === 'right' ? `${padding}${value}` : `${value}${padding}`;
}

export function markdownTable(headers, rows, alignments) {
  const widths = headers.map((header, column) =>
    Math.max(3, displayWidth(header), ...rows.map((row) => displayWidth(row[column]))),
  );
  const line = (cells) =>
    `| ${cells
      .map((cell, column) => padCell(cell, widths[column], alignments[column]))
      .join(' | ')} |`;
  const separator = widths.map((width, column) =>
    alignments[column] === 'right' ? `${'-'.repeat(width - 1)}:` : '-'.repeat(width),
  );
  return [line(headers), line(separator), ...rows.map(line)].join('\n');
}

export function buildRecognition({
  contributors,
  pulls,
  issues,
  maintainerLogins = [],
  scoreWeights,
}) {
  const maintainers = new Set(maintainerLogins.map((login) => login.toLowerCase()));
  const records = new Map();
  const issueByNumber = new Map(
    issues.filter((issue) => !issue.pull_request).map((issue) => [issue.number, issue]),
  );

  for (const contributor of contributors) {
    const login = contributor.login;
    if (!accountIsEligible(login, maintainers)) continue;
    recordFor(records, login).commits = Number(contributor.contributions) || 0;
  }

  for (const issue of issueByNumber.values()) {
    const login = issue.user?.login;
    if (!accountIsEligible(login, maintainers)) continue;
    const labels = new Set(
      (issue.labels ?? []).map((label) =>
        String(typeof label === 'string' ? label : label.name).toLowerCase(),
      ),
    );
    if ([...rejectedIssueLabels].some((label) => labels.has(label))) continue;
    recordFor(records, login).acceptedIssues += 1;
  }

  for (const pull of pulls.filter((item) => item.merged_at)) {
    const login = pull.user?.login;
    if (!accountIsEligible(login, maintainers)) continue;
    const record = recordFor(records, login);
    record.mergedPullRequests += 1;

    if (pull.milestone?.title) {
      record.roadmapCompletions.add(`pull:${pull.number}:${pull.milestone.title}`);
    }
    for (const issueNumber of parseClosingIssueNumbers(pull.body)) {
      const issue = issueByNumber.get(issueNumber);
      if (issue?.milestone?.title) {
        record.roadmapCompletions.add(`issue:${issueNumber}:${issue.milestone.title}`);
      }
    }
  }

  return [...records.values()]
    .map((record) => {
      const roadmapCompletions = record.roadmapCompletions.size;
      return {
        ...record,
        roadmapCompletions,
        badge: badgeFor(record),
        score:
          record.mergedPullRequests * scoreWeights.mergedPullRequest +
          roadmapCompletions * scoreWeights.roadmapCompletion +
          record.acceptedIssues * scoreWeights.acceptedIssue +
          record.commits * scoreWeights.defaultBranchCommit,
      };
    })
    .sort(
      (left, right) =>
        right.score - left.score ||
        right.mergedPullRequests - left.mergedPullRequests ||
        left.login.localeCompare(right.login),
    );
}

export function renderLeaderboard(records, scoreWeights) {
  const rows =
    records.length === 0
      ? [['—', 'No community contributions recorded yet', '—', '0', '0', '0', '0', '**0**']]
      : records.map((record, index) => {
          const badge =
            record.roadmapCompletions > 0 ? `${record.badge} · 🏆 Roadmap Champion` : record.badge;
          return [
            String(index + 1),
            `[@${record.login}](https://github.com/${record.login})`,
            badge,
            String(record.mergedPullRequests),
            String(record.acceptedIssues),
            String(record.roadmapCompletions),
            String(record.commits),
            `**${record.score}**`,
          ];
        });
  const table = markdownTable(
    [
      'Rank',
      'Contributor',
      'Badge',
      'Merged PRs',
      'Accepted issues',
      'Roadmap completions',
      'Commits',
      'Score',
    ],
    rows,
    ['right', 'left', 'left', 'right', 'right', 'right', 'right', 'right'],
  );

  return `# Contributor leaderboard

> This file is generated by \`npm run community:recognition\`. Do not edit ranking rows manually.

The leaderboard celebrates accepted community work across code, tests, documentation,
accessibility, design, and issue research. Maintainers and automated accounts are intentionally
excluded.

${table}

## Scoring

- Merged pull request: **${scoreWeights.mergedPullRequest}** points
- Roadmap milestone completion: **${scoreWeights.roadmapCompletion}** bonus points
- Accepted issue report: **${scoreWeights.acceptedIssue}** points
- Default-branch commit: **${scoreWeights.defaultBranchCommit}** point

Badge tiers and eligibility are documented in the
[contributor recognition program](RECOGNITION.md).
`;
}

async function githubPage(repository, resource, page, token, fetchImplementation) {
  const separator = resource.includes('?') ? '&' : '?';
  const response = await fetchImplementation(
    `https://api.github.com/repos/${repository}/${resource}${separator}per_page=100&page=${page}`,
    {
      headers: {
        Accept: 'application/vnd.github+json',
        'User-Agent': 'MooNsConfig-contributor-recognition',
        'X-GitHub-Api-Version': '2022-11-28',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    },
  );
  if (!response.ok) {
    throw new Error(`GitHub API request failed with status ${response.status}`);
  }
  return response.json();
}

export async function fetchAll(repository, resource, token, fetchImplementation = fetch) {
  const results = [];
  for (let page = 1; page <= 20; page += 1) {
    const items = await githubPage(repository, resource, page, token, fetchImplementation);
    if (!Array.isArray(items)) throw new Error('GitHub API returned an unexpected response');
    results.push(...items);
    if (items.length < 100) return results;
  }
  throw new Error(`GitHub API pagination limit reached for ${resource}`);
}

export async function updateLeaderboard({
  configPath = defaultConfigPath,
  outputPath = defaultOutputPath,
  token = process.env.GITHUB_TOKEN,
  repository = process.env.GITHUB_REPOSITORY,
  fetchImplementation = fetch,
} = {}) {
  const config = JSON.parse(await readFile(configPath, 'utf8'));
  const selectedRepository = repository || config.repository;
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(selectedRepository)) {
    throw new Error('Repository must use the owner/name format');
  }

  const [contributors, pulls, issues] = await Promise.all([
    fetchAll(selectedRepository, 'contributors?anon=0', token, fetchImplementation),
    fetchAll(selectedRepository, 'pulls?state=closed', token, fetchImplementation),
    fetchAll(selectedRepository, 'issues?state=closed', token, fetchImplementation),
  ]);
  const records = buildRecognition({
    contributors,
    pulls,
    issues,
    maintainerLogins: config.maintainers.map((maintainer) => maintainer.login),
    scoreWeights: config.scoreWeights,
  });
  const markdown = renderLeaderboard(records, config.scoreWeights);
  await writeFile(outputPath, markdown, 'utf8');
  return { records, outputPath };
}

const invokedPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : '';
if (import.meta.url === invokedPath) {
  const result = await updateLeaderboard();
  console.info(`Contributor leaderboard updated for ${result.records.length} community members.`);
}
