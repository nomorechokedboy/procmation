import type { ReactNode } from "react";
import { LanguageSwitcher } from "@/components/language-switcher";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

type AuthShellProps = {
  title: string;
  description?: string;
  children: ReactNode;
};

// Covers the persistent workflow canvas that the root layout renders behind pages
export function AuthShell({ title, description, children }: AuthShellProps) {
  return (
    <div className="pointer-events-auto fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-background p-4">
      <div className="absolute top-4 right-4">
        <LanguageSwitcher />
      </div>
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>{title}</CardTitle>
          {description ? (
            <CardDescription>{description}</CardDescription>
          ) : null}
        </CardHeader>
        <CardContent>{children}</CardContent>
      </Card>
    </div>
  );
}
