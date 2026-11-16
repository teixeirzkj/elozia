import { Compass } from "lucide-react";
import { LinkButton } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/primitives";

export default function NotFound() {
  return (
    <div className="flex min-h-dvh items-center justify-center">
      <EmptyState
        icon={Compass}
        title="Página não encontrada"
        description="O endereço acessado não existe ou você não tem acesso a ele."
        action={<LinkButton href="/dashboard">Ir para o dashboard</LinkButton>}
      />
    </div>
  );
}
