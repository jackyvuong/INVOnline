import { useEffect, useState } from 'react';
import { formatDate, toApiDate } from '../utils/format';

type Props = {
  value: string;
  onChange: (value: string) => void;
  title?: string;
  id?: string;
  className?: string;
};

export default function DateInput({ value, onChange, title, id, className = '' }: Props) {
  const [text, setText] = useState(() => (value ? formatDate(value) : ''));

  useEffect(() => {
    setText(value ? formatDate(value) : '');
  }, [value]);

  const commit = (raw: string) => {
    const trimmed = raw.trim();
    if (!trimmed) {
      onChange('');
      setText('');
      return;
    }
    const iso = toApiDate(trimmed);
    if (iso) {
      onChange(iso);
      setText(formatDate(iso));
      return;
    }
    setText(value ? formatDate(value) : '');
  };

  return (
    <div className={`date-input ${className}`.trim()} title={title}>
      <input
        id={id}
        className="input"
        type="text"
        inputMode="numeric"
        placeholder="dd/mm/yyyy"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={(e) => commit(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            commit((e.target as HTMLInputElement).value);
          }
        }}
      />
      <input
        type="date"
        className="date-input__native"
        value={value || ''}
        onChange={(e) => onChange(e.target.value)}
        tabIndex={-1}
        aria-label={title || 'Chọn ngày'}
      />
    </div>
  );
}
