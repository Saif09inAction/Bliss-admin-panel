import type { Metadata, Viewport } from "next";
import "./globals.css";
import { AuthProvider } from "@/lib/auth-context";

export const metadata: Metadata = {
  title: "Bliss Bombay Admin",
  description: "Admin panel for Bliss Bombay",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Bliss Admin",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  themeColor: "#0A0A0A",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="m-0 p-0">
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
