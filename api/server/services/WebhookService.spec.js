const {
  sendWebhook,
  sendTOSAcceptanceWebhook,
} = require('./WebhookService');

// Mock logger to avoid console output during tests
jest.mock('@librechat/data-schemas', () => ({
  logger: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

// Mock fetch globally
global.fetch = jest.fn();

describe('WebhookService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch.mockReset();
  });

  describe('sendWebhook', () => {
    it('should send webhook successfully', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        statusText: 'OK',
      });

      const payload = { event: 'test.event', data: { foo: 'bar' } };
      await sendWebhook('https://example.com/webhook', payload);

      expect(global.fetch).toHaveBeenCalledWith(
        'https://example.com/webhook',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
            'User-Agent': 'LibreChat-Webhook/1.0',
          }),
          body: JSON.stringify(payload),
        }),
      );
    });

    it('should not send webhook if URL is not provided', async () => {
      await sendWebhook(null, { event: 'test' });
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it('should retry on failure', async () => {
      global.fetch
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          statusText: 'OK',
        });

      const payload = { event: 'test.event' };
      await sendWebhook('https://example.com/webhook', payload, { retries: 1 });

      expect(global.fetch).toHaveBeenCalledTimes(2);
    });

    it('should throw error after all retries exhausted', async () => {
      global.fetch.mockRejectedValue(new Error('Network error'));

      const payload = { event: 'test.event' };
      await expect(
        sendWebhook('https://example.com/webhook', payload, { retries: 2 }),
      ).rejects.toThrow('Network error');

      expect(global.fetch).toHaveBeenCalledTimes(3); // initial + 2 retries
    });

    it('should handle HTTP errors', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
      });

      const payload = { event: 'test.event' };
      await expect(sendWebhook('https://example.com/webhook', payload)).rejects.toThrow(
        'Webhook HTTP error: 500 Internal Server Error',
      );
    });
  });

  describe('sendTOSAcceptanceWebhook', () => {
    beforeEach(() => {
      delete process.env.WEBHOOK_TOS_ACCEPTANCE_URL;
      delete process.env.WEBHOOK_SECRET;
    });

    it('should send TOS acceptance webhook with correct payload', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        statusText: 'OK',
      });

      const data = {
        userId: '123456',
        email: 'test@example.com',
        timestamp: new Date('2026-02-03T12:00:00Z'),
      };

      await sendTOSAcceptanceWebhook(data, 'https://example.com/tos-webhook');

      expect(global.fetch).toHaveBeenCalledWith(
        'https://example.com/tos-webhook',
        expect.objectContaining({
          method: 'POST',
          body: expect.stringContaining('"event":"tos.accepted"'),
        }),
      );

      const callBody = JSON.parse(global.fetch.mock.calls[0][1].body);
      expect(callBody.event).toBe('tos.accepted');
      expect(callBody.data.userId).toBe('123456');
      expect(callBody.data.email).toBe('test@example.com');
      expect(callBody.data.acceptedAt).toBe('2026-02-03T12:00:00.000Z');
    });

    it('should include X-Webhook-Secret header when secret is provided', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
      });

      const data = {
        userId: '123456',
        email: 'test@example.com',
        timestamp: new Date(),
      };

      await sendTOSAcceptanceWebhook(
        data,
        'https://example.com/tos-webhook',
        'my-secret-key',
      );

      const callHeaders = global.fetch.mock.calls[0][1].headers;
      expect(callHeaders['X-Webhook-Secret']).toBe('my-secret-key');
    });

    it('should use environment variable for webhook secret', async () => {
      process.env.WEBHOOK_SECRET = 'env-secret-key';
      global.fetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
      });

      const data = {
        userId: '123456',
        email: 'test@example.com',
        timestamp: new Date(),
      };

      await sendTOSAcceptanceWebhook(data, 'https://example.com/webhook');

      const callHeaders = global.fetch.mock.calls[0][1].headers;
      expect(callHeaders['X-Webhook-Secret']).toBe('env-secret-key');
    });

    it('should not include secret header if no secret is configured', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
      });

      const data = {
        userId: '123456',
        email: 'test@example.com',
        timestamp: new Date(),
      };

      await sendTOSAcceptanceWebhook(data, 'https://example.com/webhook');

      const callHeaders = global.fetch.mock.calls[0][1].headers;
      expect(callHeaders['X-Webhook-Secret']).toBeUndefined();
    });

    it('should use environment variable for webhook URL', async () => {
      process.env.WEBHOOK_TOS_ACCEPTANCE_URL = 'https://env-webhook.com/tos';
      global.fetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
      });

      const data = {
        userId: '123456',
        email: 'test@example.com',
        timestamp: new Date(),
      };

      await sendTOSAcceptanceWebhook(data);

      expect(global.fetch).toHaveBeenCalledWith(
        'https://env-webhook.com/tos',
        expect.anything(),
      );
    });

    it('should not send webhook if no URL is configured', async () => {
      const data = {
        userId: '123456',
        email: 'test@example.com',
        timestamp: new Date(),
      };

      await sendTOSAcceptanceWebhook(data);

      expect(global.fetch).not.toHaveBeenCalled();
    });
  });

});

