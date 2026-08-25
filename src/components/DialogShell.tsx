import type { ReactNode } from 'react';
import { Dialog } from '@base-ui/react/dialog';
import { X } from '@phosphor-icons/react';

export function DialogShell({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  size = 'md',
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl';
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Backdrop className="dialog-backdrop" />
        <Dialog.Viewport className="dialog-viewport">
          <Dialog.Popup className={`dialog dialog--${size}`}>
            <div className="dialog__header">
              <div>
                <Dialog.Title className="dialog__title">{title}</Dialog.Title>
                {description ? <Dialog.Description className="dialog__description">{description}</Dialog.Description> : null}
              </div>
              <Dialog.Close className="icon-button" aria-label="关闭"><X size={19} /></Dialog.Close>
            </div>
            <div className="dialog__content">{children}</div>
            {footer ? <div className="dialog__footer">{footer}</div> : null}
          </Dialog.Popup>
        </Dialog.Viewport>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
