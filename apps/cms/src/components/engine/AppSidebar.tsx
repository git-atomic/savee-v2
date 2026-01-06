"use client";

import * as React from "react";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarRail,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";
import { Gauge, List, Settings, Home, Activity } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const pathname = usePathname();
  const { state } = useSidebar();

  const isActive = (path: string) => {
    return pathname === path || pathname.startsWith(path + "/");
  };

  return (
    <Sidebar collapsible="icon" {...props} className="border-r border-border/50 bg-background/50 backdrop-blur-xl overflow-visible">
      <SidebarHeader className="h-[52px] flex items-center justify-center border-b border-border/20 px-4">
          {/* Logo - Full (Hidden when collapsed) */}
          {/* <div className="group-data-[collapsible=icon]:hidden flex items-center gap-2 w-full transition-all duration-300">
             <svg className="w-[95.37px] text-foreground" viewBox="0 0 81 20" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M8.646.022c.14-.03.285-.03.425 0 .159.033.308.118.606.288L16.9 4.422c.298.17.447.255.556.374q.057.063.103.134L9.17 8.214a1 1 0 0 1-.229.086.5.5 0 0 1-.167 0 1 1 0 0 1-.229-.086L.16 4.93a1 1 0 0 1 .104-.134c.108-.12.257-.204.555-.374L8.04.31c.298-.17.448-.255.606-.288m-1.628 11.29c.09.07.136.106.172.152a.5.5 0 0 1 .077.134c.02.054.027.11.039.221l1.519 8.045a1 1 0 0 1-.179-.02c-.158-.034-.308-.119-.606-.289L.818 15.443c-.298-.17-.447-.255-.555-.373a1 1 0 0 1-.213-.364C0 14.554 0 14.384 0 14.045V5.82c0-.34 0-.51.05-.661q.03-.09.077-.174zM17.59 4.985a1 1 0 0 1 .077.174c.05.152.05.322.05.661v8.225c0 .34 0 .51-.05.661a1 1 0 0 1-.212.364c-.109.118-.258.203-.556.373l-7.222 4.112c-.298.17-.447.255-.606.288q-.088.019-.178.021l1.518-8.045a1 1 0 0 1 .04-.221.5.5 0 0 1 .076-.134 1 1 0 0 1 .173-.152zm12.764 1.382H24.57v2.745h5.415v1.715H24.57v3.093h5.83v1.716h-7.81V4.65h7.764zm4.608-1.624 3.754 5.852v.002q.495.786.787 1.306.27.47.577 1.14h.193a31 31 0 0 1-.153-1.785v-.004a68 68 0 0 1-.032-2.32V4.65h1.981v10.985h-2.401l-.06-.092-3.752-5.852-.002-.002q-.496-.788-.787-1.292v-.002q-.27-.48-.576-1.152h-.193q.106.964.137 1.785l.02.489q.027.779.027 1.835v4.283h-1.981V4.65h2.402zm14.791-.303q1.342 0 2.468.452c.752.293 1.353.726 1.794 1.302.456.583.677 1.274.666 2.062l-.003.197h-2.08l-.01-.19c-.04-.758-.286-1.24-.693-1.505l-.001-.002c-.43-.289-1.142-.45-2.173-.45-.927 0-1.608.106-2.06.301h-.002c-.42.185-.725.532-.912 1.063-.19.531-.292 1.356-.292 2.488 0 1.15.1 1.983.29 2.514l.08.183c.196.41.48.683.849.838.453.187 1.155.287 2.127.287.787 0 1.395-.085 1.832-.245.42-.164.715-.436.893-.819l.001-.002c.177-.368.27-.883.27-1.558h-3.212v-1.7h5.191v5.98h-1.57l-.025-.171-.134-.918h-.278q-.463.538-1.254.903c-.578.268-1.308.397-2.177.397-1.06 0-1.986-.218-2.767-.662q-1.173-.668-1.79-1.93-.613-1.276-.611-3.006c0-1.789.474-3.214 1.444-4.249.984-1.048 2.374-1.56 4.139-1.56m9.12 11.196h-1.997V4.65h1.997zm4.562-10.893 3.754 5.852v.002q.495.786.787 1.306.27.47.577 1.14h.192a31 31 0 0 1-.152-1.785v-.004a68 68 0 0 1-.032-2.32V4.65h1.981v10.985h-2.401l-.06-.092-3.753-5.852V9.69q-.498-.788-.788-1.292v-.002q-.27-.48-.576-1.152h-.194q.108.964.137 1.785l.02.489q.028.779.028 1.835v4.283h-1.981V4.65h2.402zm16.97 1.624h-5.782v2.745h5.415v1.715h-5.415v3.093h5.83v1.716h-7.811V4.65h7.763z" fill="currentColor"/></svg>
          </div> */}
          {/* Icon - (Visible when collapsed) */}
          {/* <div className="hidden group-data-[collapsible=icon]:block transition-all duration-300">
             <svg width="22" height="24" viewBox="0 0 22 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M8.48 13.668c.108.084.163.128.207.183a.7.7 0 0 1 .093.162c.024.065.033.133.047.267L10.662 24a1 1 0 0 1-.216-.024c-.19-.04-.372-.144-.732-.349L.988 18.66c-.36-.206-.54-.308-.67-.45a1.2 1.2 0 0 1-.258-.44c-.06-.185-.06-.392-.06-.8V7.032c0-.41 0-.616.06-.798q.038-.11.093-.21zm12.772-7.644q.055.1.093.21c.06.183.06.39.06.798v9.938c0 .41 0 .616-.06.798a1.2 1.2 0 0 1-.256.44c-.132.143-.312.245-.672.451l-8.725 4.968c-.36.205-.54.308-.733.348a1 1 0 0 1-.215.025l1.834-9.72a1.2 1.2 0 0 1 .049-.267.6.6 0 0 1 .092-.162q.09-.104.209-.183zM10.446.027c.17-.035.344-.036.513 0 .193.04.373.143.733.348l8.726 4.968c.36.206.54.308.672.452q.069.077.124.162L11.079 9.925a1.2 1.2 0 0 1-.277.104.6.6 0 0 1-.201 0 1.2 1.2 0 0 1-.277-.104L.194 5.957q.055-.085.125-.162c.13-.145.31-.246.671-.452L9.714.375c.36-.205.541-.308.732-.348" fill="currentColor"/></svg>
          </div> */}
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton 
                asChild 
                isActive={pathname === "/admin/engine"}
                tooltip="Dashboard"
              >
                <Link href="/admin/engine">
                  <Gauge className="size-4" />
                  <span>Dashboard</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
            
            <SidebarMenuItem>
              <SidebarMenuButton 
                asChild 
                isActive={pathname.startsWith("/admin/engine/jobs")}
                tooltip="Manage Jobs"
              >
                <Link href="/admin/engine/jobs">
                  <List className="size-4" />
                  <span>Jobs</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>

             <SidebarMenuItem>
              <SidebarMenuButton 
                asChild 
                isActive={pathname.startsWith("/admin/engine/metrics")}
                tooltip="Metrics"
              >
                <Link href="/admin/engine/metrics">
                  <Activity className="size-4" />
                  <span>Metrics</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarGroup>
      </SidebarContent>
      <SidebarRail className="peer/rail" />
      {/* Floating Toggle Button - Visible only on Rail hover */}
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="absolute right-[-12px] top-1/2 z-50 flex h-6 w-6 -translate-y-1/2 translate-x-0 cursor-pointer items-center justify-center rounded-md border bg-background opacity-0 transition-all duration-200 peer-hover/rail:opacity-100 hover:opacity-100">
            <SidebarTrigger className="h-4 w-4 cursor-pointer" />
          </div>
        </TooltipTrigger>
        <TooltipContent side="right" sideOffset={10}>
          Toggle Sidebar
        </TooltipContent>
      </Tooltip>
    </Sidebar>
  );
}
