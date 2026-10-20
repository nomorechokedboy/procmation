"use client";

import {
  FilePlus,
  Inbox,
  Key,
  Languages,
  ListChecks,
  LogOut,
  Moon,
  Plug,
  Settings,
  Sun,
  Users,
} from "lucide-react";
import Link from "next/link";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import { ApiKeysOverlay } from "@/components/overlays/api-keys-overlay";
import { IntegrationsOverlay } from "@/components/overlays/integrations-overlay";
import { useOverlay } from "@/components/overlays/overlay-provider";
import { SettingsOverlay } from "@/components/overlays/settings-overlay";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { usePermissions } from "@/hooks/use-permissions";
import { useStableCallback } from "@/hooks/use-stable-callback";
import { api } from "@/lib/api-client";
import { signOut, useSession } from "@/lib/auth-client";
import { SHOW_GENERIC_WORKFLOW_TOOLS } from "@/lib/bpma-features";
import { LOCALE_NAMES } from "@/lib/i18n/locale-names";
import * as m from "@/paraglide/messages";
import {
  getLocale,
  type Locale,
  locales,
  setLocale,
} from "@/paraglide/runtime";

function handleLocaleChange(value: string) {
  setLocale(value as Locale);
}

export const UserMenu = () => {
  const { data: session, isPending } = useSession();
  const { can } = usePermissions();
  const { theme, setTheme } = useTheme();
  const { open: openOverlay } = useOverlay();
  const [providerId, setProviderId] = useState<string | null>(null);

  // Fetch provider info when session is available
  useEffect(() => {
    if (session?.user) {
      api.user
        .get()
        .then((user) => setProviderId(user.providerId))
        .catch(() => setProviderId(null));
    }
  }, [session?.user]);

  const handleLogout = useStableCallback(async () => {
    await signOut();
  });
  const openSettings = useStableCallback(() => openOverlay(SettingsOverlay));
  const openIntegrations = useStableCallback(() =>
    openOverlay(IntegrationsOverlay)
  );
  const openApiKeys = useStableCallback(() => openOverlay(ApiKeysOverlay));

  // OAuth users can't edit their profile
  const isOAuthUser =
    providerId === "vercel" ||
    providerId === "github" ||
    providerId === "google";

  const getUserInitials = () => {
    if (session?.user?.name) {
      return session.user.name
        .split(" ")
        .map((n) => n[0])
        .join("")
        .toUpperCase()
        .slice(0, 2);
    }
    if (session?.user?.email) {
      return session.user.email.slice(0, 2).toUpperCase();
    }
    return "U";
  };

  // Don't render anything while session is loading to prevent flash
  if (isPending) {
    return (
      <div className="h-9 w-9" /> // Placeholder to maintain layout
    );
  }

  // Every page requires a session, so this only shows if it expires mid-use
  if (!session?.user) {
    return (
      <Button asChild className="h-9" size="sm" variant="default">
        <Link href="/login">{m.user_menu_sign_in()}</Link>
      </Button>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          className="relative h-9 w-9 rounded-full border p-0"
          variant="ghost"
        >
          <Avatar className="h-9 w-9">
            <AvatarImage
              alt={session?.user?.name || ""}
              src={session?.user?.image || ""}
            />
            <AvatarFallback>{getUserInitials()}</AvatarFallback>
          </Avatar>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>
          <div className="flex flex-col space-y-1">
            <p className="font-medium text-sm leading-none">
              {session?.user?.name || m.user_menu_user()}
            </p>
            <p className="text-muted-foreground text-xs leading-none">
              {session?.user?.email}
            </p>
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {!isOAuthUser && (
          <DropdownMenuItem onClick={openSettings}>
            <Settings className="size-4" />
            <span>{m.user_menu_settings()}</span>
          </DropdownMenuItem>
        )}
        {SHOW_GENERIC_WORKFLOW_TOOLS ? (
          <DropdownMenuItem onClick={openIntegrations}>
            <Plug className="size-4" />
            <span>{m.user_menu_connections()}</span>
          </DropdownMenuItem>
        ) : null}
        <DropdownMenuItem onClick={openApiKeys}>
          <Key className="size-4" />
          <span>{m.user_menu_api_keys()}</span>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="/tasks">
            <Inbox className="size-4" />
            <span>{m.nav_my_tasks()}</span>
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="/cases/new">
            <FilePlus className="size-4" />
            <span>{m.nav_start_case()}</span>
          </Link>
        </DropdownMenuItem>
        {can("processes.manage") && (
          <DropdownMenuItem asChild>
            <Link href="/admin/processes">
              <ListChecks className="size-4" />
              <span>{m.processes_title()}</span>
            </Link>
          </DropdownMenuItem>
        )}
        {can("members.manage") && (
          <DropdownMenuItem asChild>
            <Link href="/admin/members">
              <Users className="size-4" />
              <span>{m.members_title()}</span>
            </Link>
          </DropdownMenuItem>
        )}
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            <Sun className="size-4 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
            <Moon className="absolute size-4 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
            <span>{m.user_menu_theme()}</span>
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            <DropdownMenuRadioGroup onValueChange={setTheme} value={theme}>
              <DropdownMenuRadioItem value="light">
                {m.user_menu_theme_light()}
              </DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="dark">
                {m.user_menu_theme_dark()}
              </DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="system">
                {m.user_menu_theme_system()}
              </DropdownMenuRadioItem>
            </DropdownMenuRadioGroup>
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            <Languages className="size-4" />
            <span>{m.language_label()}</span>
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            <DropdownMenuRadioGroup
              onValueChange={handleLocaleChange}
              value={getLocale()}
            >
              {locales.map((locale) => (
                <DropdownMenuRadioItem key={locale} value={locale}>
                  {LOCALE_NAMES[locale]}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={handleLogout}>
          <LogOut className="size-4" />
          <span>{m.user_menu_logout()}</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
