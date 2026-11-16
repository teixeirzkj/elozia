import Image from "next/image";
import { cn } from "@/lib/utils";

/** Logo da Elozia. `onDark` usa a versão com letras brancas. */
export function Logo({ onDark = false, className }: { onDark?: boolean; className?: string }) {
  return (
    <Image
      src={onDark ? "/logo-elozia-claro.png" : "/logo-elozia.png"}
      alt="Elozia — CRM inteligente para agências de viagens"
      width={640}
      height={192}
      priority
      className={cn("h-auto w-36", className)}
    />
  );
}
