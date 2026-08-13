import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

export type SelectOption = { value: string; label: string };

type Props = {
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  placeholder?: string;
  disabled?: boolean;
  style?: React.CSSProperties;
  className?: string;
};

function normalizeSearch(value: string) {
  return String(value || '')
    .toLowerCase()
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function matches(haystack: string, needle: string) {
  if (!needle) return true;
  return normalizeSearch(haystack).includes(normalizeSearch(needle));
}

export default function SelectAutocomplete({
  value,
  onChange,
  options,
  placeholder = 'Gõ để tìm...',
  disabled = false,
  style,
  className = '',
}: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const instanceId = useRef(`ac-${Math.random().toString(36).slice(2, 8)}`).current;
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const [listStyle, setListStyle] = useState<React.CSSProperties>({});

  const selected = options.find((o) => o.value === value);
  const selectedLabel = selected?.label ?? '';

  const filtered = useMemo(() => {
    const q = open ? query : '';
    return options.filter((o) => matches(o.label, q) || matches(o.value, q));
  }, [options, open, query]);

  const positionList = () => {
    const input = inputRef.current;
    if (!input) return;
    const rect = input.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom - 8;
    const spaceAbove = rect.top - 8;
    const maxH = Math.min(240, Math.max(spaceBelow, spaceAbove, 120));
    const openUp = spaceBelow < 140 && spaceAbove > spaceBelow;
    setListStyle({
      position: 'fixed',
      left: Math.round(rect.left),
      width: Math.round(rect.width),
      maxHeight: Math.round(maxH),
      zIndex: 1300,
      ...(openUp
        ? { top: 'auto', bottom: Math.round(window.innerHeight - rect.top + 4) }
        : { bottom: 'auto', top: Math.round(rect.bottom + 4) }),
    });
  };

  const close = () => {
    setOpen(false);
    setQuery('');
    setActiveIndex(0);
  };

  const pick = (next: string) => {
    onChange(next);
    close();
  };

  useEffect(() => {
    if (!open) return;
    positionList();
    const onReposition = () => positionList();
    window.addEventListener('resize', onReposition);
    window.addEventListener('scroll', onReposition, true);
    return () => {
      window.removeEventListener('resize', onReposition);
      window.removeEventListener('scroll', onReposition, true);
    };
  }, [open, filtered.length, query]);

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: MouseEvent) => {
      const target = e.target as Node;
      if (wrapRef.current?.contains(target)) return;
      const list = document.getElementById(`${instanceId}-list`);
      if (list?.contains(target)) return;
      close();
    };
    document.addEventListener('mousedown', onPointer);
    return () => document.removeEventListener('mousedown', onPointer);
  }, [open]);

  return (
    <div
      ref={wrapRef}
      className={`autocomplete${disabled ? ' is-disabled' : ''}${open ? ' is-open' : ''} ${className}`.trim()}
      style={style}
    >
      <input
        ref={inputRef}
        type="search"
        className="input autocomplete__input"
        autoComplete="off"
        spellCheck={false}
        disabled={disabled}
        placeholder={placeholder}
        value={open ? query : selectedLabel}
        aria-expanded={open}
        aria-controls={`${instanceId}-list`}
        onFocus={() => {
          if (disabled) return;
          setQuery('');
          setActiveIndex(0);
          setOpen(true);
          requestAnimationFrame(() => inputRef.current?.select());
        }}
        onChange={(e) => {
          setQuery(e.target.value);
          setActiveIndex(0);
          if (!open) setOpen(true);
        }}
        onKeyDown={(e) => {
          if (disabled) return;
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            if (!open) setOpen(true);
            else setActiveIndex((i) => Math.min(i + 1, Math.max(filtered.length - 1, 0)));
            return;
          }
          if (e.key === 'ArrowUp') {
            e.preventDefault();
            if (open) setActiveIndex((i) => Math.max(i - 1, 0));
            return;
          }
          if (e.key === 'Enter' && open) {
            e.preventDefault();
            const item = filtered[activeIndex];
            if (item) pick(item.value);
            return;
          }
          if (e.key === 'Escape') {
            e.preventDefault();
            close();
          }
        }}
        onBlur={() => {
          setTimeout(() => {
            if (!wrapRef.current?.contains(document.activeElement)) close();
          }, 120);
        }}
      />
      {open &&
        createPortal(
          <div
            id={`${instanceId}-list`}
            className="autocomplete__list"
            role="listbox"
            style={listStyle}
          >
            {filtered.length === 0 ? (
              <div className="autocomplete__empty">Không có kết quả</div>
            ) : (
              filtered.map((opt, i) => (
                <button
                  key={`${opt.value}-${i}`}
                  type="button"
                  role="option"
                  className={`autocomplete__item${i === activeIndex ? ' is-active' : ''}${opt.value === value ? ' is-selected' : ''}`}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    pick(opt.value);
                  }}
                  onMouseEnter={() => setActiveIndex(i)}
                >
                  {opt.label}
                </button>
              ))
            )}
          </div>,
          document.body
        )}
    </div>
  );
}
