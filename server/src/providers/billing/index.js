import { createMockBillingProvider } from './mock.js';

export function createBillingProvider(config) {
  return createMockBillingProvider({
    webhookSecret: config.billing.webhookSecret,
    appUrl: config.appUrl,
  });
}
