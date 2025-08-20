import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AddiApp",
  description: "Yet another get things done application",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="font-nunito antialiased">{children}</body>
    </html>
  );
}
