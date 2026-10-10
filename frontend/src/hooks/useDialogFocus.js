import { useEffect, useRef } from 'react';

/**
 * Focus guard for existing React dialogs.
 * Escape dismisses only when the operation is not busy; Tab stays in the
 * current dialog and focus returns to the control that opened it.
 */
export function useDialogFocus(open, onDismiss, busy = false) {
  const dialogRef = useRef(null);
  const dismissRef = useRef(onDismiss);
  const busyRef = useRef(busy);
  dismissRef.current = onDismiss;
  busyRef.current = busy;

  useEffect(() => {
    if (!open || !dialogRef.current) return;
    const dialog = dialogRef.current;
    const previouslyFocused = document.activeElement;

    const focusable = () => [...dialog.querySelectorAll(
      'a[href], button:not(:disabled), input:not([type="hidden"]):not(:disabled), ' +
      'select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])',
    )].filter(node => !node.hidden && node.getClientRects().length > 0);

    const first = dialog.querySelector('[autofocus]') || focusable()[0] || dialog;
    first.focus({ preventScroll: true });

    const onKeyDown = event => {
      if (event.key === 'Escape') {
        if (!busyRef.current) {
          event.preventDefault();
          event.stopPropagation();
          dismissRef.current?.();
        }
        return;
      }
      if (event.key !== 'Tab') return;
      const candidates = focusable();
      if (!candidates.length) {
        event.preventDefault();
        dialog.focus({ preventScroll: true });
        return;
      }
      const firstElement = candidates[0];
      const lastElement = candidates[candidates.length - 1];
      const current = document.activeElement;
      if (!dialog.contains(current) || (event.shiftKey && current === firstElement)) {
        event.preventDefault();
        (event.shiftKey ? lastElement : firstElement).focus();
      } else if (!event.shiftKey && current === lastElement) {
        event.preventDefault();
        firstElement.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      if (previouslyFocused?.isConnected &&
          typeof previouslyFocused.focus === 'function') {
        previouslyFocused.focus({ preventScroll: true });
      }
    };
  }, [open]);

  return dialogRef;
}
