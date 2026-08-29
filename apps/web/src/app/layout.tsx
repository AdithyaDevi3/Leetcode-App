import type { Metadata, Viewport } from "next";
import "./globals.css";
import { ServiceWorkerRegistration } from '@/components/service-worker-registration';

export const metadata: Metadata = {
  title: "Method — Think before syntax",
  description: "A pseudocode-first practice workspace for algorithms and system design.",
  applicationName: 'Method',
  manifest: '/manifest.webmanifest',
};

export const viewport: Viewport = {
  themeColor: '#0f172a',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full"><ServiceWorkerRegistration />{children}</body>
    </html>
  );
}
