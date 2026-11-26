import { AuthProvider } from "@/lib/auth";
import "./globals.css";

export const metadata = {
  title: "FlowPilot",
  description: "Scheduled website audits with AI suggestions.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="flex min-h-full flex-col" suppressHydrationWarning>
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
