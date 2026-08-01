import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Method — Think before syntax",
  description: "A pseudocode-first practice workspace for algorithms and system design.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full">{children}</body>
    </html>
  );
}
