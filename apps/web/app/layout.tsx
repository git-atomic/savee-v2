import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import localFont from "next/font/local";
import "./globals.css";
import { Navigation } from "@/components/Navigation";
import { LayoutSettingsProvider } from "@/components/LayoutSettingsContext";
import { ThemeProvider } from "@/components/ThemeProvider";
import { FeedSortProvider } from "@/components/FeedSortContext";

const inter = localFont({
  src: [
    {
      path: "../public/fonts/Inter-4.1/web/Inter-Regular.woff2",
      weight: "400",
      style: "normal",
    },
    {
      path: "../public/fonts/Inter-4.1/web/Inter-Medium.woff2",
      weight: "500",
      style: "normal",
    },
    {
      path: "../public/fonts/Inter-4.1/web/Inter-SemiBold.woff2",
      weight: "600",
      style: "normal",
    },
    {
      path: "../public/fonts/Inter-4.1/web/Inter-Bold.woff2",
      weight: "700",
      style: "normal",
    },
    {
      path: "../public/fonts/Inter-4.1/web/Inter-Italic.woff2",
      weight: "400",
      style: "italic",
    },
    {
      path: "../public/fonts/Inter-4.1/web/Inter-MediumItalic.woff2",
      weight: "500",
      style: "italic",
    },
    {
      path: "../public/fonts/Inter-4.1/web/Inter-SemiBoldItalic.woff2",
      weight: "600",
      style: "italic",
    },
    {
      path: "../public/fonts/Inter-4.1/web/Inter-BoldItalic.woff2",
      weight: "700",
      style: "italic",
    },
  ],
  variable: "--font-sans",
});

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Flow",
  description: "Flow is a platform for inspiration",
};

export default function RootLayout({
  children,
  modal,
}: Readonly<{
  children: React.ReactNode;
  modal: React.ReactNode;
}>) {
  return (
    <html lang="en" className={inter.variable} suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background`}
      >
        <ThemeProvider
          attribute="class"
          defaultTheme="dark"
          enableSystem={false}
          disableTransitionOnChange
        >
          <LayoutSettingsProvider>
            <FeedSortProvider>
              <Navigation />
              {children}
              {modal}
            </FeedSortProvider>
          </LayoutSettingsProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
