import { useEffect } from 'react';

type Props = {
  open: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
  size?: 'sm' | 'md' | 'lg';
};

export default function Modal({ open, title, onClose, children, footer, size = 'md' }: Props) {
  useEffect(() => {
    document.body.classList.toggle('modal-open', open);
    return () => document.body.classList.remove('modal-open');
  }, [open]);

  if (!open) return null;

  const panelClass =
    size === 'lg' ? 'modal__panel modal__panel--lg' : size === 'sm' ? 'modal__panel modal__panel--sm' : 'modal__panel';

  return (
    <div className="modal is-open" role="dialog" aria-modal="true">
      <div className="modal__backdrop" onClick={onClose} aria-hidden="true" />
      <div className={panelClass}>
        <div className="modal__header">
          <h2 className="modal__title">{title}</h2>
          <button type="button" className="modal__close" onClick={onClose} aria-label="Đóng">
            ×
          </button>
        </div>
        <div className="modal__body">{children}</div>
        {footer && <div className="modal__footer modal__footer--actions">{footer}</div>}
      </div>
    </div>
  );
}
