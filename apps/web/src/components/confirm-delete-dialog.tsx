'use client';

import { AlertDialog, Button } from '@heroui/react';
import { useState } from 'react';

/**
 * A destructive action behind a confirmation, shared by deleting a file and deleting a
 * meeting. Both are irreversible and take the bytes with them, so neither may happen on
 * a single stray click.
 *
 * `onConfirm` runs while the dialog stays open, and the dialog closes only once it
 * resolves — closing first would leave a failure with nowhere to be reported.
 */
export function ConfirmDeleteDialog({
  trigger,
  heading,
  body,
  confirmLabel,
  pendingLabel,
  onConfirm,
}: {
  trigger: React.ReactNode;
  heading: string;
  body: React.ReactNode;
  confirmLabel: string;
  pendingLabel: string;
  onConfirm: () => Promise<void>;
}) {
  const [isOpen, setOpen] = useState(false);
  const [isPending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleConfirm() {
    setPending(true);
    setError(null);
    try {
      await onConfirm();
      setOpen(false);
    } catch (err) {
      // Kept open: the user needs to see why, and closing would hide it.
      setError(err instanceof Error ? err.message : 'Не удалось удалить. Попробуйте ещё раз.');
    } finally {
      setPending(false);
    }
  }

  return (
    <AlertDialog
      isOpen={isOpen}
      onOpenChange={(open) => {
        setOpen(open);
        // A dismissed dialog must not reopen still showing the last failure.
        if (!open) setError(null);
      }}
    >
      {trigger}
      <AlertDialog.Backdrop>
        <AlertDialog.Container>
          <AlertDialog.Dialog className="sm:max-w-[420px]">
            <AlertDialog.CloseTrigger />
            <AlertDialog.Header>
              <AlertDialog.Icon status="danger" />
              <AlertDialog.Heading>{heading}</AlertDialog.Heading>
            </AlertDialog.Header>
            <AlertDialog.Body>
              {body}
              {error ? (
                <p className="text-danger mt-3 text-sm" role="alert">
                  {error}
                </p>
              ) : null}
            </AlertDialog.Body>
            <AlertDialog.Footer>
              {/* No `slot="close"` on the confirm: it must stay open until the request
                  finishes, so a failure has somewhere to appear. Cancel closes at once. */}
              <Button slot="close" variant="tertiary" isDisabled={isPending}>
                Отмена
              </Button>
              <Button
                variant="danger"
                isPending={isPending}
                isDisabled={isPending}
                onPress={() => void handleConfirm()}
              >
                {isPending ? pendingLabel : confirmLabel}
              </Button>
            </AlertDialog.Footer>
          </AlertDialog.Dialog>
        </AlertDialog.Container>
      </AlertDialog.Backdrop>
    </AlertDialog>
  );
}
