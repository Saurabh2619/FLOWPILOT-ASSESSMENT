export function createConsoleEmailProvider(log = console.log) {
  return {
    async sendPasswordReset({ to, resetUrl }) {
      log(`[mock email] Password reset for ${to}: ${resetUrl}`);
    },
  };
}
