import type { Metadata, Viewport } from "next";
import "./globals.css";
import { AuthProvider } from "@/lib/auth-context";

export const metadata: Metadata = {
  title: "Laiza Admin",
  description: "Admin panel for Laiza Bags",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Laiza Admin",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  themeColor: "#F7F9FC",
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
