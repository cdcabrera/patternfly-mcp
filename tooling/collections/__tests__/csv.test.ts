import { jest } from '@jest/globals';

const mockMkdir = jest.fn();
const mockWriteFile = jest.fn();

jest.unstable_mockModule('node:fs/promises', () => ({
  mkdir: mockMkdir,
  writeFile: mockWriteFile
}));

const { escapeCsvField, formatCsv, generateDiffCsv, saveCsvReport } = await import('../csv');

describe('escapeCsvField', () => {
  it('should correctly escape plain strings, numbers, null, and undefined', () => {
    expect(escapeCsvField('normal')).toBe('normal');
    expect(escapeCsvField(123)).toBe('123');
    expect(escapeCsvField(0)).toBe('0');
    expect(escapeCsvField(true)).toBe('true');
    expect(escapeCsvField(false)).toBe('false');
    expect(escapeCsvField(null)).toBe('');
    expect(escapeCsvField(undefined)).toBe('');
  });

  it('should wrap fields containing commas, double quotes, or newlines in double quotes', () => {
    expect(escapeCsvField('with,comma')).toBe('"with,comma"');
    expect(escapeCsvField('with "quotes"')).toBe('"with ""quotes"""');
    expect(escapeCsvField('with\nnewline')).toBe('"with\nnewline"');
    expect(escapeCsvField('with\rreturn')).toBe('"with\rreturn"');
    expect(escapeCsvField('with\r\nboth')).toBe('"with\r\nboth"');
    expect(escapeCsvField('all "in, one"\nline')).toBe('"all ""in, one""\nline"');
  });

  it('should sanitize formula injection characters by default', () => {
    expect(escapeCsvField('=SUM(1+1)')).toBe("'=SUM(1+1)");
    expect(escapeCsvField('+123')).toBe("'+123");
    expect(escapeCsvField('-456')).toBe("'-456");
    expect(escapeCsvField('@lookup')).toBe("'@lookup");
    expect(escapeCsvField('\ttabPrefix')).toBe("'\ttabPrefix");
    expect(escapeCsvField('\rreturnPrefix')).toBe('"\'\rreturnPrefix"');
  });

  it('should preserve raw formula characters when sanitizeFormulas is set to false', () => {
    expect(escapeCsvField('=SUM(1+1)', false)).toBe('=SUM(1+1)');
    expect(escapeCsvField('+123', false)).toBe('+123');
    expect(escapeCsvField('-456', false)).toBe('-456');
    expect(escapeCsvField('@lookup', false)).toBe('@lookup');
    expect(escapeCsvField('\ttabPrefix', false)).toBe('\ttabPrefix');
  });
});

describe('formatCsv', () => {
  it('should format header and row lines into standard CSV', () => {
    const headers = ['col1', 'col2'];
    const rows = [
      ['val1', 'val2'],
      ['val3,with,comma', 'val4 "quoted"']
    ];

    const result = formatCsv(headers, rows);

    expect(result).toBe('col1,col2\nval1,val2\n"val3,with,comma","val4 ""quoted"""\n');
  });

  it('should handle empty rows and headers correctly', () => {
    expect(formatCsv(['header1'], [])).toBe('header1\n');
    expect(formatCsv([], [])).toBe('\n');
  });

  it('should handle rows with mixed types including numbers, nulls, and undefined', () => {
    const headers = ['id', 'name', 'score', 'active'];
    const rows = [
      [1, 'Alice', 98.5, true],
      [2, 'Bob, Jr.', null, undefined]
    ];

    const result = formatCsv(headers, rows);

    expect(result).toBe('id,name,score,active\n1,Alice,98.5,true\n2,"Bob, Jr.",,\n');
  });
});

describe('generateDiffCsv', () => {
  it('should format all diff categories with status column prepended', () => {
    const diff = {
      added: [{ id: 'a1', val: 'Added Item' }],
      removed: [{ id: 'r1', val: 'Removed Item' }],
      modified: [{ id: 'm1', val: 'Modified Item' }],
      unchanged: [{ id: 'u1', val: 'Unchanged Item' }]
    };

    const csv = generateDiffCsv(diff, {
      headers: ['status', 'id', 'val'],
      added: item => [item.id, item.val],
      removed: item => [item.id, item.val],
      modified: item => [item.id, item.val],
      unchanged: item => [item.id, item.val]
    });

    const lines = csv.trim().split('\n');

    expect(lines[0]).toBe('status,id,val');
    expect(lines[1]).toBe('ADDED,a1,Added Item');
    expect(lines[2]).toBe('REMOVED,r1,Removed Item');
    expect(lines[3]).toBe('MODIFIED,m1,Modified Item');
    expect(lines[4]).toBe('UNCHANGED,u1,Unchanged Item');
  });
});

describe('saveCsvReport', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('should recursively create directories, write CSV content to disk, and log completion', async () => {
    mockMkdir.mockResolvedValue(undefined as never);
    mockWriteFile.mockResolvedValue(undefined as never);
    const mockLog = jest.spyOn(console, 'log').mockImplementation(() => {});

    const targetPath = '/path/to/nested/reports/summary.csv';
    const csvContent = 'status,id,name\nADDED,1,Button\n';

    await saveCsvReport(targetPath, csvContent);

    expect(mockMkdir).toHaveBeenCalledWith('/path/to/nested/reports', { recursive: true });
    expect(mockWriteFile).toHaveBeenCalledWith(targetPath, csvContent, 'utf-8');
    expect(mockLog).toHaveBeenCalledWith(`📄 Exported full CSV report: ${targetPath}`);
  });
});
