import { STATUS_LABEL, type ReadingStatus } from '../types';

export function StatusPicker({ value, onChange }: { value: ReadingStatus; onChange: (s: ReadingStatus) => void }) {
  return (
    <div className="segmented" role="radiogroup" aria-label="Status da leitura">
      {(Object.keys(STATUS_LABEL) as ReadingStatus[]).map((s) => (
        <button key={s} type="button" role="radio" aria-checked={value === s} className={value === s ? 'active' : ''} onClick={() => onChange(s)}>
          {STATUS_LABEL[s]}
        </button>
      ))}
    </div>
  );
}
