import Link from "next/link";
import type { ButtonHTMLAttributes, ComponentProps } from "react";
import { cn } from "@/lib/utils";

type Variant = "primary" | "brand" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md" | "icon";

const base =
  "inline-flex items-center justify-center gap-2 rounded-md font-semibold whitespace-nowrap cursor-pointer select-none " +
  "transition-[background-color,color,border-color,box-shadow,transform] duration-150 ease-elz " +
  "active:scale-98 disabled:opacity-50 disabled:pointer-events-none";

const variants: Record<Variant, string> = {
  primary: "bg-ink text-white hover:bg-primary-hover",
  brand: "bg-brand text-ink hover:bg-brand-hover",
  secondary: "border border-line-strong bg-surface text-fg hover:bg-hover",
  ghost: "text-fg-muted hover:bg-hover hover:text-fg",
  danger: "bg-danger text-white hover:brightness-90",
};

// No celular todo botão tem pelo menos 44px de altura (alvo de toque).
const sizes: Record<Size, string> = {
  sm: "h-8 px-3 text-label max-md:h-touch",
  md: "h-10 px-4 text-body max-md:h-touch",
  icon: "h-9 w-9 max-md:h-touch max-md:w-touch",
};

export function buttonClass(variant: Variant = "primary", size: Size = "md", className?: string): string {
  return cn(base, variants[variant], sizes[size], className);
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size };

export function Button({ variant, size, className, type = "button", ...props }: ButtonProps) {
  return <button type={type} className={buttonClass(variant, size, className)} {...props} />;
}

type LinkButtonProps = ComponentProps<typeof Link> & { variant?: Variant; size?: Size };

export function LinkButton({ variant, size, className, ...props }: LinkButtonProps) {
  return <Link className={buttonClass(variant, size, className)} {...props} />;
}
