import { useEffect, useRef, type ReactNode } from "react";
import { X } from "lucide-react";

export function StudioDialog({
  children,
  title,
  onClose,
  className = "",
}: {
  children: ReactNode;
  title: string;
  onClose?: (() => void) | undefined;
  className?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- The native modal dialog owns focus trapping, escape, and inert background behavior.
  useEffect(() => {
    const dialog = ref.current;
    dialog?.showModal();
    return () => dialog?.close();
  }, []);
  return (
    <dialog
      ref={ref}
      className={`tsci-dialog ${className}`}
      aria-label={title}
      onCancel={(event) => {
        event.preventDefault();
        onClose?.();
      }}
    >
      {onClose ? (
        <button
          type="button"
          className="tsci-icon-button tsci-dialog-close"
          onClick={onClose}
          aria-label="Close dialog"
        >
          <X size={18} />
        </button>
      ) : null}
      {children}
    </dialog>
  );
}
