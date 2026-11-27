import { createMockBillingProvider } from './mock.js';
import { createRazorpayProvider } from './razorpay.js';

export function createBillingProvider(config) {
  if (config.billing.razorpay) return createRazorpayProvider(config.billing.razorpay);
  return createMockBillingProvider({
    webhookSecret: config.billing.webhookSecret,
    appUrl: config.appUrl,
  });
}
