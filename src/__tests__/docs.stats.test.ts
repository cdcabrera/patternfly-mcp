import diagnostics_channel from 'node:diagnostics_channel';
import { healthReport, statsReport, createDocsStats } from '../docs.stats';
import { getStatsOptions } from '../options.context';

describe('healthReport', () => {
  const statsOptions = getStatsOptions();

  it('should generate a health report', () => {
    const type = 'health';
    const channelName = statsOptions.channels[type];
    const channel = diagnostics_channel.channel(channelName);
    const handler = jest.fn();

    channel.subscribe(handler);

    const report = healthReport(statsOptions);

    expect(Object.keys(handler.mock.calls[0][0])).toEqual(expect.arrayContaining(['timestamp', 'type', 'memory', 'uptime']));

    clearTimeout(report);
  });
});

describe('statsReport', () => {
  const statsOptions = getStatsOptions();

  it('should generate a docs stats report', () => {
    const report = statsReport(statsOptions);

    expect(Object.keys(report)).toEqual(expect.arrayContaining(['timestamp', 'reports']));
    expect(report.reports.health.channelId).toBe(statsOptions.channels.health);
    expect(report.reports.traffic.channelId).toBe(statsOptions.channels.traffic);
  });
});

describe('createDocsStats', () => {
  const statsOptions = getStatsOptions();

  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('should resolve stats promise immediately', async () => {
    const tracker = createDocsStats(statsOptions);

    const stats = await tracker.getStats();

    expect(stats.reports.health.channelId).toBe(statsOptions.channels.health);

    tracker.unsubscribe();
  });

  it('should correctly clean up timers on unsubscribe', () => {
    const tracker = createDocsStats();
    const spy = jest.spyOn(global, 'clearTimeout');

    tracker.unsubscribe();

    expect(spy).toHaveBeenCalledTimes(1);
  });
});
