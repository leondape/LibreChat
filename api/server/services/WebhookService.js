const { logger } = require('@librechat/data-schemas');

/**
 * Send a webhook notification
 * @param {string} webhookUrl - The webhook URL to send the notification to
 * @param {object} payload - The data to send in the webhook
 * @param {object} options - Additional options for the webhook
 * @returns {Promise<void>}
 */
async function sendWebhook(webhookUrl, payload, options = {}) {
  if (!webhookUrl) {
    logger.debug('[WebhookService] No webhook URL configured, skipping webhook');
    return;
  }

  const {
    timeout = 5000,
    retries = 0,
    headers = {},
  } = options;

  const defaultHeaders = {
    'Content-Type': 'application/json',
    'User-Agent': 'LibreChat-Webhook/1.0',
    ...headers,
  };

  let lastError;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);

      const response = await fetch(webhookUrl, {
        method: 'POST',
        headers: defaultHeaders,
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`Webhook HTTP error: ${response.status} ${response.statusText}`);
      }

      logger.info('[WebhookService] Webhook sent successfully', {
        url: webhookUrl,
        event: payload.event,
        attempt: attempt + 1,
      });
      return;
    } catch (error) {
      lastError = error;
      logger.warn('[WebhookService] Webhook attempt failed', {
        url: webhookUrl,
        event: payload.event,
        attempt: attempt + 1,
        error: error.message,
      });

      // If we have more retries, wait before retrying
      if (attempt < retries) {
        await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1)));
      }
    }
  }

  // If we exhausted all retries, log the final error
  logger.error('[WebhookService] Webhook failed after all retries', {
    url: webhookUrl,
    event: payload.event,
    retries: retries + 1,
    error: lastError.message,
  });
  throw lastError;
}

/**
 * Send TOS acceptance webhook notification
 * @param {object} data - The TOS acceptance data
 * @param {string} data.userId - The user ID
 * @param {string} data.email - The user email
 * @param {Date} data.timestamp - The timestamp of acceptance
 * @param {string} [webhookUrl] - Optional webhook URL (falls back to env var)
 * @param {string} [webhookSecret] - Optional webhook secret (falls back to env var)
 * @returns {Promise<void>}
 */
async function sendTOSAcceptanceWebhook(data, webhookUrl = null, webhookSecret = null) {
  const url = webhookUrl || process.env.WEBHOOK_TOS_ACCEPTANCE_URL;
  const secret = webhookSecret || process.env.WEBHOOK_SECRET;
  
  if (!url) {
    return;
  }

  const payload = {
    event: 'tos.accepted',
    timestamp: new Date().toISOString(),
    data: {
      userId: data.userId,
      email: data.email,
      acceptedAt: data.timestamp instanceof Date ? data.timestamp.toISOString() : data.timestamp,
    },
  };

  const headers = {};
  if (secret) {
    headers['X-Webhook-Secret'] = secret;
  }

  return sendWebhook(url, payload, {
    timeout: 10000,
    retries: 2,
    headers,
  });
}

module.exports = {
  sendWebhook,
  sendTOSAcceptanceWebhook,
};
