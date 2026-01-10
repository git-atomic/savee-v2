import React from "react";
import localFont from "next/font/local";
import { ThemeProvider } from "@/components/providers/ThemeProvider";
import { ModeToggle } from "@/components/engine/layout/ModeToggle";
import "../../../globals.css";
import { cn } from "@/lib/utils";
import { SidebarProvider, SidebarInset, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/engine/AppSidebar";
import { Toaster } from "@/components/ui/toaster";

const inter = localFont({
  src: [
    {
      path: "../../../public/fonts/Inter-4.1/web/Inter-Regular.woff2",
      weight: "400",
      style: "normal",
    },
    {
      path: "../../../public/fonts/Inter-4.1/web/Inter-Medium.woff2",
      weight: "500",
      style: "normal",
    },
    {
      path: "../../../public/fonts/Inter-4.1/web/Inter-SemiBold.woff2",
      weight: "600",
      style: "normal",
    },
    {
      path: "../../../public/fonts/Inter-4.1/web/Inter-Bold.woff2",
      weight: "700",
      style: "normal",
    },
    {
      path: "../../../public/fonts/Inter-4.1/web/Inter-Italic.woff2",
      weight: "400",
      style: "italic",
    },
    {
      path: "../../../public/fonts/Inter-4.1/web/Inter-MediumItalic.woff2",
      weight: "500",
      style: "italic",
    },
    {
      path: "../../../public/fonts/Inter-4.1/web/Inter-SemiBoldItalic.woff2",
      weight: "600",
      style: "italic",
    },
    {
      path: "../../../public/fonts/Inter-4.1/web/Inter-BoldItalic.woff2",
      weight: "700",
      style: "italic",
    },
  ],
  variable: "--font-sans",
  display: "swap",
  preload: true,
  fallback: ["system-ui", "sans-serif"],
});


export const metadata = {
  title: "ScrapeSavee Engine",
  description: "Engine Dashboard",
};

export default function EngineRootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html 
      lang="en" 
      suppressHydrationWarning 
      className={cn(inter.variable, inter.className)}
    >
      <body
        className={cn(
          "min-h-screen bg-background font-sans antialiased text-foreground transition-colors duration-300"
        )}
      >
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <SidebarProvider style={{"--sidebar-width": "16rem"} as React.CSSProperties}>
            <div className="flex flex-col w-full h-svh overflow-hidden">
              {/* Header - Part of the flex flow */}
              <header className="flex h-[52px] w-full items-center justify-between border-b border-border bg-background/80 px-4 backdrop-blur-md shrink-0 z-50">
                  <div className="flex items-center gap-2">
                   <svg className="w-[88px] lg:w-[88px] text-foreground" viewBox="0 0 81 20" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M8.646.022c.14-.03.285-.03.425 0 .159.033.308.118.606.288L16.9 4.422c.298.17.447.255.556.374q.057.063.103.134L9.17 8.214a1 1 0 0 1-.229.086.5.5 0 0 1-.167 0 1 1 0 0 1-.229-.086L.16 4.93a1 1 0 0 1 .104-.134c.108-.12.257-.204.555-.374L8.04.31c.298-.17.448-.255.606-.288m-1.628 11.29c.09.07.136.106.172.152a.5.5 0 0 1 .077.134c.02.054.027.11.039.221l1.519 8.045a1 1 0 0 1-.179-.02c-.158-.034-.308-.119-.606-.289L.818 15.443c-.298-.17-.447-.255-.555-.373a1 1 0 0 1-.213-.364C0 14.554 0 14.384 0 14.045V5.82c0-.34 0-.51.05-.661q.03-.09.077-.174zM17.59 4.985a1 1 0 0 1 .077.174c.05.152.05.322.05.661v8.225c0 .34 0 .51-.05.661a1 1 0 0 1-.212.364c-.109.118-.258.203-.556.373l-7.222 4.112c-.298.17-.447.255-.606.288q-.088.019-.178.021l1.518-8.045a1 1 0 0 1 .04-.221.5.5 0 0 1 .076-.134 1 1 0 0 1 .173-.152zm12.764 1.382H24.57v2.745h5.415v1.715H24.57v3.093h5.83v1.716h-7.81V4.65h7.764zm4.608-1.624 3.754 5.852v.002q.495.786.787 1.306.27.47.577 1.14h.193a31 31 0 0 1-.153-1.785v-.004a68 68 0 0 1-.032-2.32V4.65h1.981v10.985h-2.401l-.06-.092-3.752-5.852-.002-.002q-.496-.788-.787-1.292v-.002q-.27-.48-.576-1.152h-.193q.106.964.137 1.785l.02.489q.027.779.027 1.835v4.283h-1.981V4.65h2.402zm14.791-.303q1.342 0 2.468.452c.752.293 1.353.726 1.794 1.302.456.583.677 1.274.666 2.062l-.003.197h-2.08l-.01-.19c-.04-.758-.286-1.24-.693-1.505l-.001-.002c-.43-.289-1.142-.45-2.173-.45-.927 0-1.608.106-2.06.301h-.002c-.42.185-.725.532-.912 1.063-.19.531-.292 1.356-.292 2.488 0 1.15.1 1.983.29 2.514l.08.183c.196.41.48.683.849.838.453.187 1.155.287 2.127.287.787 0 1.395-.085 1.832-.245.42-.164.715-.436.893-.819l.001-.002c.177-.368.27-.883.27-1.558h-3.212v-1.7h5.191v5.98h-1.57l-.025-.171-.134-.918h-.278q-.463.538-1.254.903c-.578.268-1.308.397-2.177.397-1.06 0-1.986-.218-2.767-.662q-1.173-.668-1.79-1.93-.613-1.276-.611-3.006c0-1.789.474-3.214 1.444-4.249.984-1.048 2.374-1.56 4.139-1.56m9.12 11.196h-1.997V4.65h1.997zm4.562-10.893 3.754 5.852v.002q.495.786.787 1.306.27.47.577 1.14h.192a31 31 0 0 1-.152-1.785v-.004a68 68 0 0 1-.032-2.32V4.65h1.981v10.985h-2.401l-.06-.092-3.753-5.852V9.69q-.498-.788-.788-1.292v-.002q-.27-.48-.576-1.152h-.194q.108.964.137 1.785l.02.489q.028.779.028 1.835v4.283h-1.981V4.65h2.402zm16.97 1.624h-5.782v2.745h5.415v1.715h-5.415v3.093h5.83v1.716h-7.811V4.65h7.763z" fill="currentColor"/></svg>                 </div>
                  <div className="flex items-center gap-2">
                     <ModeToggle />
                  </div>
              </header>
              
              <div className="flex flex-1 overflow-hidden">
                <AppSidebar />
                <SidebarInset className="flex-1 overflow-hidden w-full relative">
                        {children}
                </SidebarInset>
              </div>
            </div>
          </SidebarProvider>
        </ThemeProvider>
        <Toaster />
      </body>

    </html>
  );
}
