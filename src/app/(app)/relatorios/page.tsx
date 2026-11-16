import { Construction } from "lucide-react";
import { EmptyState, PageHeader } from "@/components/ui/primitives";

export default function Page() {
  return (
    <>
      <PageHeader title="Relatórios" />
      <EmptyState icon={Construction} title="Módulo ainda não disponível" description="Este módulo será liberado em uma próxima etapa do desenvolvimento." />
    </>
  );
}
