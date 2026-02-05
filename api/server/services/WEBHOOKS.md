# LibreChat Webhooks

This document describes the webhook functionality available in LibreChat for notifying external systems about important user events.

## Overview

Webhooks allow you to receive real-time notifications when specific events occur in LibreChat. Currently supported:

- **Terms of Service Acceptance** - When a user accepts the TOS

## Configuration

Configure webhooks by setting the environment variables in your `.env` file:

```bash
# TOS Acceptance Webhook URL
WEBHOOK_TOS_ACCEPTANCE_URL=https://your-webhook-endpoint.com/tos-accepted

# Webhook Shared Secret (for security)
# Generate a secure random string: openssl rand -hex 32
WEBHOOK_SECRET=your-secure-random-secret-here
```

## Webhook Behavior

- **Timeout**: 10 seconds per request
- **Retries**: 2 automatic retries with exponential backoff (1s, 2s delays)
- **Failure Handling**: Webhook failures are logged but do not prevent the TOS acceptance from completing
- **Content-Type**: `application/json`
- **Method**: `POST`

## Event Payload

### TOS Acceptance Event

**Event Name**: `tos.accepted`

**When Triggered**: Immediately after a user accepts the Terms of Service and it's written to the database

**Payload Structure**:
```json
{
  "event": "tos.accepted",
  "timestamp": "2026-02-03T12:34:56.789Z",
  "data": {
    "userId": "507f1f77bcf86cd799439011",
    "email": "user@example.com",
    "acceptedAt": "2026-02-03T12:34:56.789Z"
  }
}
```

**Fields**:
- `event` (string): Event type identifier
- `timestamp` (string): ISO 8601 timestamp when webhook was sent
- `data.userId` (string): The user's MongoDB ObjectId
- `data.email` (string): The user's email address
- `data.acceptedAt` (string): ISO 8601 timestamp when TOS was accepted

## Implementation Details

### Location of Webhook Logic

- **Service**: `api/server/services/WebhookService.js`
- **TOS Controller**: `api/server/controllers/UserController.js` - `acceptTermsController()`

### Request Headers

All webhook requests include:
```
Content-Type: application/json
User-Agent: LibreChat-Webhook/1.0
X-Webhook-Secret: your-configured-secret (if WEBHOOK_SECRET is set)
```

**Security**: The `X-Webhook-Secret` header contains the shared secret configured in your environment. Your webhook endpoint should validate this header to ensure requests are authentic and coming from your LibreChat instance.

### Error Handling

Webhook failures are logged with different severity levels:
- **Warning**: Individual attempt failures
- **Error**: All retries exhausted

Example log entry:
```
[WebhookService] Webhook failed after all retries {
  url: 'https://example.com/webhook',
  event: 'tos.accepted',
  retries: 3,
  error: 'Request timeout'
}
```

## Testing Your Webhook Endpoint

Your webhook endpoint should:

1. **Accept POST requests** with JSON payload
2. **Respond within 10 seconds**
3. **Return 2xx status code** for success
4. **Handle retries idempotently** (same event may be sent multiple times on failure)

### Example Webhook Handler (Node.js/Express)

```javascript
app.post('/tos-accepted', express.json(), async (req, res) => {
  const { event, timestamp, data } = req.body;
  const receivedSecret = req.headers['x-webhook-secret'];
  
  // Validate shared secret
  const expectedSecret = process.env.WEBHOOK_SECRET;
  if (expectedSecret && receivedSecret !== expectedSecret) {
    return res.status(401).json({ error: 'Unauthorized - Invalid webhook secret' });
  }
  
  // Validate event type
  if (event !== 'tos.accepted') {
    return res.status(400).json({ error: 'Invalid event type' });
  }
  
  // Process the event
  try {
    await yourDatabase.recordTOSAcceptance({
      userId: data.userId,
      email: data.email,
      acceptedAt: new Date(data.acceptedAt),
    });
    
    res.status(200).json({ success: true });
  } catch (error) {
    console.error('Failed to process webhook:', error);
    res.status(500).json({ error: 'Processing failed' });
  }
});
```

### Example Test Request

```bash
curl -X POST https://your-webhook-endpoint.com/tos-accepted \
  -H "Content-Type: application/json" \
  -H "User-Agent: LibreChat-Webhook/1.0" \
  -H "X-Webhook-Secret: your-secret-here" \
  -d '{
    "event": "tos.accepted",
    "timestamp": "2026-02-03T12:34:56.789Z",
    "data": {
      "userId": "507f1f77bcf86cd799439011",
      "email": "user@example.com",
      "acceptedAt": "2026-02-03T12:34:56.789Z"
    }
  }'
```

### Testing with webhook.site

1. Go to https://webhook.site
2. Copy your unique URL
3. Set it as `WEBHOOK_TOS_ACCEPTANCE_URL` in `.env`
4. Accept TOS in your LibreChat instance
5. View the received payload on webhook.site

## Security Considerations

1. **Shared Secret**: Always set `WEBHOOK_SECRET` in production and validate it in your webhook endpoint
   ```bash
   # Generate a secure secret
   openssl rand -hex 32
   ```

2. **HTTPS Only**: Use HTTPS endpoints for webhooks in production

3. **Secret Validation**: Your webhook endpoint must validate the `X-Webhook-Secret` header:
   ```javascript
   if (req.headers['x-webhook-secret'] !== process.env.EXPECTED_SECRET) {
     return res.status(401).json({ error: 'Unauthorized' });
   }
   ```

4. **IP Allowlisting**: Consider restricting webhook endpoints to your LibreChat server IPs

5. **Request Validation**: Validate the webhook payload structure

6. **Idempotency**: Handle duplicate webhooks gracefully (network retries may cause duplicates)

7. **Secret Rotation**: Periodically rotate your webhook secret and update both LibreChat and your webhook endpoint

## Troubleshooting

### Webhooks Not Being Sent

1. Check if the environment variable is set correctly: `echo $WEBHOOK_TOS_ACCEPTANCE_URL`
2. Review server logs for webhook-related errors
3. Verify the webhook URL is accessible from your LibreChat server

### Webhook Timeouts

- Default timeout is 10 seconds
- Ensure your endpoint responds quickly
- Consider processing webhook data asynchronously

### Debugging

Enable debug logging to see detailed webhook activity:
```bash
DEBUG_LOGGING=true
```

Then check logs for entries prefixed with `[WebhookService]`.

## Flow Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                         LibreChat                           │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌──────────────────┐                                      │
│  │  TOS Acceptance  │                                      │
│  │    Controller    │                                      │
│  └────────┬─────────┘                                      │
│           │                                                 │
│           │  DB Write: termsAccepted = true                │
│           ▼                                                 │
│  ┌────────────────────────────────────────────────┐       │
│  │         WebhookService.js                      │       │
│  │  • sendTOSAcceptanceWebhook()                  │       │
│  │  • Retry logic (2 retries)                     │       │
│  │  • Timeout handling (10s)                      │       │
│  │  • Error logging                               │       │
│  └────────────────────┬───────────────────────────┘       │
│                       │                                    │
│                       │ HTTP POST                          │
└───────────────────────┼────────────────────────────────────┘
                        │
                        ▼
         ┌──────────────────────────────┐
         │   Your Webhook Endpoint      │
         │  (External Service)          │
         │                              │
         │  • Receives JSON payload     │
         │  • Processes TOS acceptance  │
         │  • Returns 200 OK            │
         └──────────────────────────────┘
```

## Future Enhancements

Potential future additions:
- Additional event types (user registration, password changes, etc.)
- Webhook signature verification (HMAC)
- Configurable timeout and retry settings
- Webhook delivery dashboard/monitoring
- Batch webhook delivery
- Custom headers configuration
