import "./globals.css";
import { Providers } from "./provider";
import { NuqsAdapter } from "nuqs/adapters/next/app";
import { Toaster } from "@/components/ui/sonner";

export { metadata } from "./metadata";
export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Load heading font and preconnect external domains */}
        <link rel="preconnect" href="https://fonts.cdnfonts.com" />
        <link rel="stylesheet" href="https://fonts.cdnfonts.com/css/satoshi" />
        <link rel="preconnect" href="https://assets.sandipsarkar.dev" />
        <link rel="preconnect" href="https://api.producthunt.com" />
        <link rel="dns-prefetch" href="https://assets.sandipsarkar.dev" />
        <link rel="dns-prefetch" href="https://api.producthunt.com" />
      </head>

      <body>
        <NuqsAdapter>
          <Providers>
            {children}
            <Toaster />
          </Providers>
        </NuqsAdapter>
      </body>
    </html>
  );
}
