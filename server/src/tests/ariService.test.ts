import { describe, expect, it, vi } from 'vitest';
import { AriService } from '../voice/ariService.js';
import { env } from '../config/env.js';

function createClient() {
  const originate = vi.fn().mockResolvedValue(undefined);
  return {
    client: {
      on: vi.fn(),
      Channel: vi.fn(() => ({ originate })),
    },
    originate,
  };
}

describe('AriService modern client adapter', () => {
  it('connects directly to the configured Stasis application', async () => {
    const { client } = createClient();
    const connector = vi.fn().mockResolvedValue(client);
    const service = new AriService(connector, false);

    await service.init();

    expect(connector).toHaveBeenCalledWith(
      expect.objectContaining({
        app: 'moonsconfig_voice',
        url: expect.stringMatching(/^https?:\/\//),
      }),
    );
    expect(client.on).toHaveBeenCalledWith('StasisStart', expect.any(Function));
    expect(client.on).toHaveBeenCalledWith('StasisEnd', expect.any(Function));
  });

  it('originates outbound calls through the promise-based channel API', async () => {
    const { client, originate } = createClient();
    const service = new AriService(vi.fn().mockResolvedValue(client), false);
    await service.init();

    await expect(service.dialOutbound('919999999999')).resolves.toBe(true);
    expect(originate).toHaveBeenCalledWith({
      endpoint: `PJSIP/919999999999@${env.asteriskAri.outboundEndpoint}`,
      app: 'moonsconfig_voice',
      appArgs: 'dialed',
      callerId: 'MooNs Travel',
    });
  });
});
