import { extractTarget, checkHttp, checkFile, type CheckResult } from '../jest.setupTests';
import { ComponentDocs, LayoutDocs, ChartDocs, LocalReadmes, allDocTargets } from '../src/constants';

const buildTargets = (): { file: string; description: string }[] => {
  const listItems = [...ComponentDocs, ...LayoutDocs, ...ChartDocs];
  const listTargets = listItems.map(extractTarget).filter(Boolean);
  const all = allDocTargets(listTargets, [], [], LocalReadmes);
  const unique = Array.from(new Set(all));
  return unique.map(file => ({
    file,
    description: file.startsWith('http') ? 'HTTP(S) target' : 'Local file target',
  }));
};

describe('PatternFly docs references', () => {
  const cases = buildTargets();

  it('buildTargets returns a non-empty set', () => {
    expect(cases.length).toBeGreaterThan(0);
  });

  it.each(cases)('validates %s', async ({ file }) => {
    const result: CheckResult = file.startsWith('http://') || file.startsWith('https://')
      ? await checkHttp(file)
      : await checkFile(file);

    expect(result).toMatchSnapshot();
  });
});
