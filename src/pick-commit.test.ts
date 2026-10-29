import { describe, expect, it } from 'vitest';
import { type Commit, cutAtOtherClose, pickWorkCommit } from './pick-commit.ts';

function log(...subjects: string[]): Commit[] {
  return subjects.map((subject, at) => ({ sha: `c${at}`, subject }));
}

const BRANCH = { isDocument: false, ownBranch: true };

describe('the commit close picks', () => {
  it('takes the newest logic commit over the tests after it', () => {
    expect(pickWorkCommit(log('test: covers it', 'feat: the change'), BRANCH)).toBe('c1');
  });

  it('takes a build commit only when no logic commit is there', () => {
    expect(pickWorkCommit(log('build: bump it', 'fix: the bug'), BRANCH)).toBe('c1');
    expect(pickWorkCommit(log('test: x', 'build: the tooling'), BRANCH)).toBe('c1');
  });

  it('takes any commit but a docs one before falling back to docs', () => {
    expect(pickWorkCommit(log('docs: notes', 'chore: tidy'), BRANCH)).toBe('c1');
    expect(pickWorkCommit(log('docs: close ABC.1', 'docs: the guide'), BRANCH)).toBe('c1');
  });

  it('takes a docs commit first for a document task, and none on the base', () => {
    const commits = log('feat: on the way', 'docs: the guide');

    expect(pickWorkCommit(commits, { isDocument: true, ownBranch: true })).toBe('c1');
    expect(pickWorkCommit(log('docs: the plan'), { isDocument: true, ownBranch: false })).toBeNull();
  });

  it('gives none for no commits', () => {
    expect(pickWorkCommit([], BRANCH)).toBeNull();
  });
});

describe('a task own commits', () => {
  it('end at the newest close of another task, not its own', () => {
    const commits = log('feat: b', 'docs: close ABC.2', 'feat: a2', 'docs: close ABC.1', 'feat: a1');

    expect(cutAtOtherClose(commits, 'ABC.2').map((each) => each.sha)).toEqual(['c0', 'c1', 'c2']);
    expect(cutAtOtherClose(commits, 'ABC.3').map((each) => each.sha)).toEqual(['c0']);
  });
});
