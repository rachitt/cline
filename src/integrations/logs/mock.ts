import type { LogSource } from "./types.js";
import type { LogQuery, LogResult } from "../../types.js";

/**
 * Mock log source for demo/hackathon use.
 * Returns realistic-looking logs and stack traces for testing the pipeline.
 */
export class MockLogSource implements LogSource {
  name = "mock";

  async fetchLogs(query: LogQuery): Promise<LogResult> {
    const timestamp = new Date().toISOString();
    const logs = `[${timestamp}] ERROR [${query.service}] Request processing failed
[${timestamp}] ERROR [${query.service}] NullPointerException: Cannot read property 'billingAddress' of undefined
[${timestamp}] ERROR [${query.service}] at PaymentProcessor.processPayment (src/processors/PaymentProcessor.ts:142:23)
[${timestamp}] ERROR [${query.service}] at OrderService.checkout (src/services/OrderService.ts:89:15)
[${timestamp}] ERROR [${query.service}] at Router.handle (node_modules/express/lib/router/index.js:174:3)
[${timestamp}] FATAL [${query.service}] Service health check failed - downstream payment processing errors exceeding threshold
[${timestamp}] ERROR [${query.service}] Rate of 5xx responses: 45% (threshold: 5%)
[${timestamp}] ERROR [${query.service}] Affected endpoint: POST /api/v1/orders/checkout
[${timestamp}] ERROR [${query.service}] Last successful deployment: v2.3.1 (2 hours ago)
[${timestamp}] ERROR [${query.service}] Suspect commit: abc123f "Add billing address validation"`;

    const stackTraces = [
      `NullPointerException: Cannot read property 'billingAddress' of undefined
    at PaymentProcessor.processPayment (src/processors/PaymentProcessor.ts:142:23)
    at PaymentProcessor.validateBilling (src/processors/PaymentProcessor.ts:98:12)
    at OrderService.checkout (src/services/OrderService.ts:89:15)
    at OrderController.handleCheckout (src/controllers/OrderController.ts:45:22)
    at Router.handle (node_modules/express/lib/router/index.js:174:3)`,

      `TypeError: Cannot destructure property 'street' of 'customer.billingAddress' as it is undefined
    at formatBillingAddress (src/utils/billing.ts:23:10)
    at PaymentProcessor.processPayment (src/processors/PaymentProcessor.ts:145:18)
    at OrderService.checkout (src/services/OrderService.ts:89:15)`,
    ];

    return {
      logs,
      stackTraces,
      rawLines: 10,
      truncated: false,
    };
  }
}
