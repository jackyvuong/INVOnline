import { truncateText } from '../utils/format';

export default function NoteCell({ note, max = 36 }: { note?: string; max?: number }) {
  const text = String(note || '').trim();
  if (!text) return <span className="muted">—</span>;
  const short = truncateText(text, max);
  return (
    <span className="note-cell" title={text} data-tooltip={text}>
      {short}
    </span>
  );
}
