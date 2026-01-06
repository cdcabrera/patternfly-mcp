import {
  getOptions,
  getSessionOptions
} from './options.context';
import { type HttpServerHandle } from './server.http';
import { publishStat, getStatChannelId } from './stats';
import { type ServerStats } from './server';

/**
 * Creates a telemetry tracker for a server instance.
 *
 * @param {HttpServerHandle} [httpHandle] - Handle for the HTTP server (if applicable).
 * @param options - Global server options.
 * @param session - Session options.
 */
const createServerStats = (httpHandle?: HttpServerHandle | null, options = getOptions(), session = getSessionOptions()) => {
  const { publicSessionId: sessionHash } = session;

  // Transport Heartbeat (30s)
  const transportTimer = setInterval(() => {
    publishStat('transport', sessionHash, {
      method: options.isHttp ? 'http' : 'stdio',
      port: httpHandle?.port
    });
  }, 30000).unref();

  // Health Monitoring (10s)
  const healthTimer = setInterval(() => {
    publishStat('health', sessionHash, {
      memory: process.memoryUsage(),
      uptime: process.uptime()
    });
  }, 10000).unref();

  return {

    /**
     * Returns the "Lazy Manifest" containing hashed channel IDs for discovery.
     */
    getStats: (): ServerStats => ({
      timestamp: new Date().toISOString(),
      reports: {
        transport: {
          type: 'transport',
          timestamp: new Date().toISOString(),
          method: options.isHttp ? 'http' : 'stdio',
          ...(httpHandle?.port ? { port: httpHandle.port } : {}),
          channelId: getStatChannelId('transport', sessionHash)
        },
        health: { channelId: getStatChannelId('health', sessionHash) },
        traffic: { channelId: getStatChannelId('traffic', sessionHash) }
      }
    }),

    /**
     * Records an event-driven traffic metric (e.g., tool/resource execution).
     *
     * @param data
     * @param data.tool
     * @param data.resource
     * @param data.duration
     */
    recordTraffic: (data: { tool?: string; resource?: string; duration: number }) => {
      publishStat('traffic', sessionHash, data);
    },

    /**
     * Cleans up timers and resources.
     */
    unsubscribe: () => {
      clearInterval(transportTimer);
      clearInterval(healthTimer);
    }
  };
};

export { createServerStats };
