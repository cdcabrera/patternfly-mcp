import { escapeCsvField, formatCsv } from '../csv';

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
