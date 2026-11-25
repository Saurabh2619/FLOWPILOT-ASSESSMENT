// Mock email provider: the message is written to the server log instead of being
// sent. Replace with a real provider behind the same method before real use.
export function createConsoleEmailProvider(log = console.log) {
  return {
    async sendPasswordReset({ to, resetUrl }) {
      log(`[mock email] Password reset for ${to}: ${resetUrl}`);
    },
  };
}
