import React from "react";
import localFont from "next/font/local";
import { ThemeProvider } from "@/components/providers/ThemeProvider";
import { ModeToggle } from "@/components/engine/layout/ModeToggle";
import "../../../globals.css";
import { cn } from "@/lib/utils";

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
          <div className="relative flex min-h-screen flex-col">
            {/* Header */}
            <header className="sticky top-0 z-50 w-full border-b border-border/40 bg-background/80 backdrop-blur-md">
              <div className="container flex h-[52px] max-w-screen-2xl items-center justify-between px-8 mx-auto">
                <a href="/admin/engine" className="flex items-center hover:opacity-80 transition-opacity">
                  {/* <svg className="w-[95.37px] lg:w-[95.75px] text-foreground" viewBox="0 0 132 36" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M15.606.04c.253-.053.515-.053.768 0 .286.06.555.214 1.093.52l13.036 7.446c.538.307.807.46 1.003.675q.103.114.186.244l-15.138 5.944c-.201.092-.302.139-.413.156a1 1 0 0 1-.301 0c-.112-.017-.213-.064-.414-.156L.288 8.925q.083-.13.186-.244c.196-.215.465-.368 1.003-.675L14.513.56c.537-.306.807-.46 1.093-.52m-2.939 20.438c.164.127.247.192.311.275a1 1 0 0 1 .138.243c.038.097.049.198.071.4L15.93 35.96a2 2 0 0 1-.323-.038c-.286-.06-.555-.214-1.093-.521L1.477 27.956C.94 27.65.67 27.496.474 27.28a1.8 1.8 0 0 1-.384-.658C0 26.348 0 26.04 0 25.426V10.537c0-.614 0-.922.09-1.197q.054-.165.139-.315zM31.75 9.024q.086.15.14.315c.09.275.09.583.09 1.197v14.89c0 .614 0 .922-.09 1.197a1.8 1.8 0 0 1-.384.657c-.196.215-.465.369-1.003.676l-13.036 7.445c-.538.307-.807.46-1.093.52a2 2 0 0 1-.323.039l2.742-14.564c.022-.202.033-.303.07-.4a1 1 0 0 1 .139-.243c.064-.083.147-.147.311-.275zM131.784 27h-12.275V9.5h12.225v3.1h-8.475v3.975h7.875v3.05h-7.875V23.9h8.525zm-31.22 0V9.5h4.75l4.375 7.65q.725 1.35 1.15 2.3.45.926.925 2.1h.95a26 26 0 0 1-.275-2.7q-.05-1.474-.05-3.6V9.5h3.675V27h-4.725l-4.4-7.675a62 62 0 0 1-1.15-2.225 72 72 0 0 1-.925-2.175h-.95q.2 1.275.25 2.75.075 1.475.075 3.7V27zm-3.45 0h-3.825V9.5h3.825zm-15.703.35q-2.45 0-4.175-1.1-1.7-1.1-2.6-3.1-.875-2-.875-4.675 0-4.375 2.275-6.85t6.45-2.475q2.226 0 4 .775 1.8.75 2.8 2.175 1 1.4.975 3.325h-4.125q-.1-1.65-.95-2.275-.825-.65-2.8-.65-1.75 0-2.65.45t-1.3 1.7q-.375 1.225-.375 3.725t.375 3.725q.4 1.226 1.325 1.65.925.425 2.8.425 1.55 0 2.425-.325.9-.35 1.3-1.15.426-.8.4-2.275h-3.925v-2.9h7.7V27h-2.875l-.2-1.725h-.925q-.7.926-1.975 1.5-1.25.575-3.075.575M55.69 27V9.5h4.75l4.376 7.65q.725 1.35 1.15 2.3.45.926.925 2.1h.95a26 26 0 0 1-.275-2.7q-.05-1.474-.05-3.6V9.5h3.675V27h-4.725l-4.4-7.675a63 63 0 0 1-1.15-2.225 72 72 0 0 1-.925-2.175h-.95q.2 1.275.25 2.75.075 1.475.075 3.7V27zM53 27H40.725V9.5H52.95v3.1h-8.475v3.975h7.875v3.05h-7.875V23.9H53z" fill="currentColor"/>
                  </svg> */}
                  <svg className="w-[95.37px] lg:w-[95.75px] text-foreground" viewBox="0 0 81 20" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M8.646.022c.14-.03.285-.03.425 0 .159.033.308.118.606.288L16.9 4.422c.298.17.447.255.556.374q.057.063.103.134L9.17 8.214a1 1 0 0 1-.229.086.5.5 0 0 1-.167 0 1 1 0 0 1-.229-.086L.16 4.93a1 1 0 0 1 .104-.134c.108-.12.257-.204.555-.374L8.04.31c.298-.17.448-.255.606-.288m-1.628 11.29c.09.07.136.106.172.152a.5.5 0 0 1 .077.134c.02.054.027.11.039.221l1.519 8.045a1 1 0 0 1-.179-.02c-.158-.034-.308-.119-.606-.289L.818 15.443c-.298-.17-.447-.255-.555-.373a1 1 0 0 1-.213-.364C0 14.554 0 14.384 0 14.045V5.82c0-.34 0-.51.05-.661q.03-.09.077-.174zM17.59 4.985a1 1 0 0 1 .077.174c.05.152.05.322.05.661v8.225c0 .34 0 .51-.05.661a1 1 0 0 1-.212.364c-.109.118-.258.203-.556.373l-7.222 4.112c-.298.17-.447.255-.606.288q-.088.019-.178.021l1.518-8.045a1 1 0 0 1 .04-.221.5.5 0 0 1 .076-.134 1 1 0 0 1 .173-.152zm12.764 1.382H24.57v2.745h5.415v1.715H24.57v3.093h5.83v1.716h-7.81V4.65h7.764zm4.608-1.624 3.754 5.852v.002q.495.786.787 1.306.27.47.577 1.14h.193a31 31 0 0 1-.153-1.785v-.004a68 68 0 0 1-.032-2.32V4.65h1.981v10.985h-2.401l-.06-.092-3.752-5.852-.002-.002q-.496-.788-.787-1.292v-.002q-.27-.48-.576-1.152h-.193q.106.964.137 1.785l.02.489q.027.779.027 1.835v4.283h-1.981V4.65h2.402zm14.791-.303q1.342 0 2.468.452c.752.293 1.353.726 1.794 1.302.456.583.677 1.274.666 2.062l-.003.197h-2.08l-.01-.19c-.04-.758-.286-1.24-.693-1.505l-.001-.002c-.43-.289-1.142-.45-2.173-.45-.927 0-1.608.106-2.06.301h-.002c-.42.185-.725.532-.912 1.063-.19.531-.292 1.356-.292 2.488 0 1.15.1 1.983.29 2.514l.08.183c.196.41.48.683.849.838.453.187 1.155.287 2.127.287.787 0 1.395-.085 1.832-.245.42-.164.715-.436.893-.819l.001-.002c.177-.368.27-.883.27-1.558h-3.212v-1.7h5.191v5.98h-1.57l-.025-.171-.134-.918h-.278q-.463.538-1.254.903c-.578.268-1.308.397-2.177.397-1.06 0-1.986-.218-2.767-.662q-1.173-.668-1.79-1.93-.613-1.276-.611-3.006c0-1.789.474-3.214 1.444-4.249.984-1.048 2.374-1.56 4.139-1.56m9.12 11.196h-1.997V4.65h1.997zm4.562-10.893 3.754 5.852v.002q.495.786.787 1.306.27.47.577 1.14h.192a31 31 0 0 1-.152-1.785v-.004a68 68 0 0 1-.032-2.32V4.65h1.981v10.985h-2.401l-.06-.092-3.753-5.852V9.69q-.498-.788-.788-1.292v-.002q-.27-.48-.576-1.152h-.194q.108.964.137 1.785l.02.489q.028.779.028 1.835v4.283h-1.981V4.65h2.402zm16.97 1.624h-5.782v2.745h5.415v1.715h-5.415v3.093h5.83v1.716h-7.811V4.65h7.763z" fill="currentColor"/></svg>
                </a>
                <ModeToggle />
              </div>
            </header>

            {/* Main Content */}
            <main className="flex-1">{children}</main>
          </div>
        </ThemeProvider>
      </body>
    </html>
  );
}
