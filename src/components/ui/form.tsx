"use client";

import { Eye, EyeOff, Loader2 } from "lucide-react";
import {
  createContext,
  useActionState,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
  useTransition,
  type FormEvent,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from "react";
import { initialState, type ActionState } from "@/lib/action";
import { cn } from "@/lib/utils";
import { Alert } from "./alert";
import { Button } from "./button";

type FormContextValue = { state: ActionState; pending: boolean };
const FormContext = createContext<FormContextValue>({ state: initialState, pending: false });

export type FormAction = (prev: ActionState, formData: FormData) => Promise<ActionState>;

type ActionFormProps = {
  action: FormAction;
  children: ReactNode;
  className?: string;
  /** Chamado quando a ação termina com sucesso. */
  onSuccess?: (state: ActionState) => void;
  resetOnSuccess?: boolean;
  /** Oculta a mensagem de sucesso (quando o chamador mostra outro retorno). */
  hideSuccess?: boolean;
};

/**
 * Formulário ligado a uma Server Action. Mostra erro geral, erros por campo e
 * estado de envio. O envio é feito manualmente para preservar o que o usuário
 * digitou quando a validação falha.
 */
export function ActionForm({ action, children, className, onSuccess, resetOnSuccess, hideSuccess }: ActionFormProps) {
  const [state, dispatch] = useActionState(action, initialState);
  const [pending, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);
  const onSuccessRef = useRef(onSuccess);
  useEffect(() => {
    onSuccessRef.current = onSuccess;
  });

  useEffect(() => {
    if (!state.ok) return;
    if (resetOnSuccess) formRef.current?.reset();
    onSuccessRef.current?.(state);
  }, [state, resetOnSuccess]);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    // O botão que enviou entra nos dados (permite mais de um botão de envio por formulário).
    const submitter = (event.nativeEvent as SubmitEvent).submitter;
    const formData = new FormData(event.currentTarget, submitter instanceof HTMLButtonElement && submitter.name ? submitter : undefined);
    startTransition(() => dispatch(formData));
  }

  return (
    <FormContext value={{ state, pending }}>
      <form ref={formRef} onSubmit={handleSubmit} className={cn("space-y-4", className)} noValidate>
        {state.error ? <Alert tone="danger">{state.error}</Alert> : null}
        {state.ok && state.message && !hideSuccess ? <Alert tone="success">{state.message}</Alert> : null}
        {children}
      </form>
    </FormContext>
  );
}

export function useFormState(): FormContextValue {
  return useContext(FormContext);
}

type FieldProps = {
  name: string;
  label: string;
  hint?: string;
  required?: boolean;
  className?: string;
  children: (props: { id: string; name: string; "aria-invalid": boolean; "aria-describedby": string | undefined }) => ReactNode;
};

/** Rótulo + controle + dica + erro do campo, com as ligações de acessibilidade. */
export function Field({ name, label, hint, required, className, children }: FieldProps) {
  const id = useId();
  const { state } = useContext(FormContext);
  const errors = state.fieldErrors?.[name];
  const hasError = Boolean(errors?.length);
  const describedBy = hasError ? `${id}-erro` : hint ? `${id}-dica` : undefined;
  return (
    <div className={cn("space-y-1.5", className)}>
      <label htmlFor={id} className="block text-label font-semibold text-fg">
        {label}
        {required ? <span className="text-danger" aria-hidden="true"> *</span> : null}
      </label>
      {children({ id, name, "aria-invalid": hasError, "aria-describedby": describedBy })}
      {hasError ? (
        <p id={`${id}-erro`} className="text-label text-danger" role="alert">
          {errors?.[0]}
        </p>
      ) : hint ? (
        <p id={`${id}-dica`} className="text-label text-fg-subtle">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

type Common = { name: string; label: string; hint?: string; fieldClassName?: string };

export function TextField({
  name,
  label,
  hint,
  fieldClassName,
  required,
  className,
  ...props
}: Common & InputHTMLAttributes<HTMLInputElement>) {
  return (
    <Field name={name} label={label} hint={hint} required={required} className={fieldClassName}>
      {(field) => <input {...props} {...field} required={required} className={cn("elz-field", className)} />}
    </Field>
  );
}

/** Campo de senha com botão para mostrar e ocultar o que foi digitado. */
export function PasswordField({
  name,
  label,
  hint,
  fieldClassName,
  required,
  className,
  ...props
}: Common & Omit<InputHTMLAttributes<HTMLInputElement>, "type">) {
  const [visible, setVisible] = useState(false);
  return (
    <Field name={name} label={label} hint={hint} required={required} className={fieldClassName}>
      {(field) => (
        <div className="relative">
          <input
            {...props}
            {...field}
            type={visible ? "text" : "password"}
            required={required}
            autoCapitalize="none"
            spellCheck={false}
            className={cn("elz-field pr-11", className)}
          />
          <button
            type="button"
            onClick={() => setVisible((value) => !value)}
            // Botão alternado: rótulo FIXO e o estado em aria-pressed. Trocar o
            // rótulo junto faria o leitor anunciar "Ocultar senha, pressionado".
            aria-label="Mostrar senha"
            aria-pressed={visible}
            aria-controls={field.id}
            className="absolute inset-y-0 right-0 flex w-11 cursor-pointer items-center justify-center rounded-r-md text-fg-subtle transition-colors hover:text-fg"
          >
            {visible ? <EyeOff className="h-4 w-4" aria-hidden="true" /> : <Eye className="h-4 w-4" aria-hidden="true" />}
          </button>
        </div>
      )}
    </Field>
  );
}

export function TextAreaField({
  name,
  label,
  hint,
  fieldClassName,
  required,
  className,
  rows = 3,
  ...props
}: Common & TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <Field name={name} label={label} hint={hint} required={required} className={fieldClassName}>
      {(field) => (
        <textarea {...props} {...field} rows={rows} required={required} className={cn("elz-field resize-y", className)} />
      )}
    </Field>
  );
}

export function SelectField({
  name,
  label,
  hint,
  fieldClassName,
  required,
  className,
  children,
  ...props
}: Common & SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <Field name={name} label={label} hint={hint} required={required} className={fieldClassName}>
      {(field) => (
        <select {...props} {...field} required={required} className={cn("elz-field", className)}>
          {children}
        </select>
      )}
    </Field>
  );
}

type SubmitProps = {
  children: ReactNode;
  variant?: "primary" | "brand" | "secondary" | "danger";
  className?: string;
  size?: "sm" | "md";
  /** Identificam qual botão enviou o formulário. */
  name?: string;
  value?: string;
};

export function SubmitButton({ children, variant = "primary", className, size, name, value }: SubmitProps) {
  const { pending } = useContext(FormContext);
  return (
    <Button type="submit" name={name} value={value} variant={variant} size={size} className={className} disabled={pending} aria-busy={pending}>
      {pending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
      {children}
    </Button>
  );
}
