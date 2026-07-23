import assert from 'node:assert/strict';
import test from 'node:test';

import {
  badgeFor,
  buildRecognition,
  markdownTable,
  parseClosingIssueNumbers,
  renderLeaderboard,
} from './update-contributor-recognition.mjs';

const weights = {
  mergedPullRequest: 10,
  roadmapCompletion: 5,
  acceptedIssue: 3,
  defaultBranchCommit: 1,
};

test('parses and deduplicates GitHub closing references', () => {
  assert.deepEqual(
    parseClosingIssueNumbers('Closes #21, fixes #22 and RESOLVED #21. Mentions #99.'),
    [21, 22],
  );
});

test('ranks community work while excluding maintainers and bots', () => {
  const records = buildRecognition({
    contributors: [
      { login: 'MFA-G', contributions: 1 },
      { login: 'schowdary75', contributions: 50 },
      { login: 'dependabot[bot]', contributions: 20 },
    ],
    pulls: [
      {
        number: 22,
        merged_at: '2026-07-23T08:00:48Z',
        user: { login: 'MFA-G' },
        body: 'Closes #21',
      },
      {
        number: 23,
        merged_at: '2026-07-23T09:00:48Z',
        user: { login: 'schowdary75' },
        body: '',
      },
    ],
    issues: [
      {
        number: 21,
        user: { login: 'schowdary75' },
        milestone: { title: 'Community Upgrade Roadmap' },
        labels: [],
      },
      { number: 24, user: { login: 'MFA-G' }, milestone: null, labels: [] },
      {
        number: 25,
        user: { login: 'MFA-G' },
        milestone: null,
        labels: [{ name: 'duplicate' }],
      },
    ],
    maintainerLogins: ['schowdary75'],
    scoreWeights: weights,
  });

  assert.equal(records.length, 1);
  assert.deepEqual(
    {
      login: records[0].login,
      badge: records[0].badge,
      mergedPullRequests: records[0].mergedPullRequests,
      acceptedIssues: records[0].acceptedIssues,
      roadmapCompletions: records[0].roadmapCompletions,
      commits: records[0].commits,
      score: records[0].score,
    },
    {
      login: 'MFA-G',
      badge: 'First Flight',
      mergedPullRequests: 1,
      acceptedIssues: 1,
      roadmapCompletions: 1,
      commits: 1,
      score: 19,
    },
  );
});

test('assigns cumulative badge tiers and renders Roadmap Champion status', () => {
  assert.equal(badgeFor({ mergedPullRequests: 0 }), 'Community Scout');
  assert.equal(badgeFor({ mergedPullRequests: 3 }), 'Route Builder');
  assert.equal(badgeFor({ mergedPullRequests: 10 }), 'Pathfinder');

  const markdown = renderLeaderboard(
    [
      {
        login: 'MFA-G',
        badge: 'First Flight',
        mergedPullRequests: 1,
        acceptedIssues: 0,
        roadmapCompletions: 1,
        commits: 1,
        score: 16,
      },
    ],
    weights,
  );
  assert.match(markdown, /\[@MFA-G\]\(https:\/\/github\.com\/MFA-G\)/);
  assert.match(markdown, /🏆 Roadmap Champion/);
  assert.match(markdown, /\*\*16\*\*/);
});

test('formats generated Markdown tables deterministically', () => {
  assert.equal(
    markdownTable(
      ['Name', 'Score'],
      [
        ['MFA-G', '**16**'],
        ['A', '**3**'],
      ],
      ['left', 'right'],
    ),
    ['| Name  |  Score |', '| ----- | -----: |', '| MFA-G | **16** |', '| A     |  **3** |'].join(
      '\n',
    ),
  );
});
