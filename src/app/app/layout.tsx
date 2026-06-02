import { ThemeProvider } from "@/components/theme-provider";
import React from "react";

interface RootLayoutProps {
  children: React.ReactNode;
}

const AppLayout = ({ children }: RootLayoutProps) => {
  return (
    <div className="min-h-screen">
      <ThemeProvider attribute="class" defaultTheme="light" enableSystem>
        <div className="h-full">{children}</div>
      </ThemeProvider>
    </div>
  );
};

export default AppLayout;
