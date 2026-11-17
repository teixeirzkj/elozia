import type { ReactNode } from "react";
import { AppShell } from "@/components/layout/app-shell";
import { requireMembership } from "@/lib/auth/session";
import { CAPABILITIES, can, ROLE_LABELS, type Capability } from "@/lib/permissions";
import { signOutAction } from "@/modules/auth/actions";

export default async function AppLayout({ children }: { children: ReactNode }) {
  const { user, membership } = await requireMembership();
  // Calculado no servidor: o cliente só recebe a lista para decidir o que exibir.
  const capabilities = (Object.keys(CAPABILITIES) as Capability[]).filter((capability) => can(membership.role, capability));
  return (
    <AppShell
      agencyName={membership.organization.name}
      userName={user.fullName}
      userEmail={user.email}
      roleLabel={ROLE_LABELS[membership.role]}
      signOut={signOutAction}
      capabilities={capabilities}
    >
      {children}
    </AppShell>
  );
}
