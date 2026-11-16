import type { ReactNode } from "react";
import { NavTabs } from "@/components/ui/tabs";

export default function ViagensLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <NavTabs
        label="Seções de viagens"
        items={[
          { href: "/viagens", label: "Pacotes", exact: true },
          { href: "/viagens/reservas", label: "Reservas" },
        ]}
      />
      {children}
    </>
  );
}
