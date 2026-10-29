"use client";

import { Workflow } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { isActive, NAV_GROUPS } from "@/components/app/nav-items";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "@/components/ui/sidebar";
import { usePermissions } from "@/hooks/use-permissions";
import * as m from "@/paraglide/messages";

// The one navigation for every signed-in page, including the editor. It
// collapses to icons on wide screens and becomes a drawer on phones.
export function AppSidebar() {
  const pathname = usePathname();
  const { can } = usePermissions();

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild size="lg" tooltip={m.app_name()}>
              <Link href="/">
                <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
                  <Workflow className="size-4" />
                </div>
                <div className="grid flex-1 text-left text-sm leading-tight">
                  <span className="truncate font-semibold">{m.app_name()}</span>
                  <span className="truncate text-xs">{m.app_tagline()}</span>
                </div>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        {NAV_GROUPS.map((group) => {
          const items = group.items.filter(
            (item) => !item.permission || can(item.permission)
          );
          if (items.length === 0) {
            return null;
          }
          return (
            <SidebarGroup key={group.label()}>
              <SidebarGroupLabel>{group.label()}</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {items.map((item) => (
                    <SidebarMenuItem key={item.href}>
                      <SidebarMenuButton
                        asChild
                        isActive={isActive(pathname, item.href)}
                        tooltip={item.label()}
                      >
                        <Link href={item.href}>
                          <item.icon />
                          <span>{item.label()}</span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          );
        })}
      </SidebarContent>
      <SidebarRail />
    </Sidebar>
  );
}
