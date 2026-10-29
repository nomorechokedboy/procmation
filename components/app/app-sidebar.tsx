"use client";

import { ChevronDown, Workflow } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { isActive, NAV_GROUPS, type NavItem } from "@/components/app/nav-items";
import { LanguageSwitcher } from "@/components/language-switcher";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "@/components/ui/sidebar";
import { useSidebar } from "@/components/ui/use-sidebar";
import { usePermissions } from "@/hooks/use-permissions";
import * as m from "@/paraglide/messages";

// The one navigation for every signed-in page, including the editor. It
// collapses to icons on wide screens and becomes a drawer on phones.
function NavMenu({ items, pathname }: { items: NavItem[]; pathname: string }) {
  return (
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
  );
}

// The one navigation for every signed-in page, including the editor. Groups
// fold away, the whole sidebar collapses to icons on wide screens, and it
// becomes a drawer on phones.
export function AppSidebar() {
  const pathname = usePathname();
  const { can } = usePermissions();
  const { state } = useSidebar();
  const collapsed = state === "collapsed";

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
          // Icons only: nothing to fold, so the items are always shown
          if (collapsed) {
            return (
              <SidebarGroup key={group.label()}>
                <NavMenu items={items} pathname={pathname} />
              </SidebarGroup>
            );
          }
          return (
            <Collapsible
              className="group/collapsible"
              defaultOpen
              key={group.label()}
            >
              <SidebarGroup>
                <SidebarGroupLabel asChild>
                  <CollapsibleTrigger>
                    {group.label()}
                    <ChevronDown className="ml-auto transition-transform group-data-[state=open]/collapsible:rotate-180" />
                  </CollapsibleTrigger>
                </SidebarGroupLabel>
                <CollapsibleContent>
                  <NavMenu items={items} pathname={pathname} />
                </CollapsibleContent>
              </SidebarGroup>
            </Collapsible>
          );
        })}
      </SidebarContent>
      <SidebarFooter className="group-data-[collapsible=icon]:hidden">
        <LanguageSwitcher />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
