import { Circle } from 'lucide-react';
import type { GradeKey } from '../types';
import { GRADE_COLOR_CLASS, GRADE_LABEL_ES, GRADE_KEYS } from '../utils/triangulation/gradeScale';

interface TrafficButtonProps {
  value: GradeKey | null;
  onChange: (next: GradeKey) => void;
  disabled?: boolean;
}

export default function TrafficButton({ value, onChange, disabled }: TrafficButtonProps) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
      {GRADE_KEYS.map((k) => {
        const active = value === k;
        return (
          <button
            key={k}
            type="button"
            disabled={disabled}
            onClick={() => onChange(k)}
            className={
              `flex flex-col items-center justify-center rounded-lg px-3 py-3 sm:px-2 sm:py-2 border ` +
              (active ? 'border-gray-900' : 'border-gray-200') +
              (disabled ? ' opacity-60 cursor-not-allowed' : ' hover:border-gray-400')
            }
            aria-label={GRADE_LABEL_ES[k]}
          >
            <span className={`inline-flex items-center justify-center w-10 h-10 sm:w-8 sm:h-8 rounded-full ${GRADE_COLOR_CLASS[k]}`}>
              <Circle className="w-5 h-5 sm:w-4 sm:h-4 text-white" />
            </span>
            <span className="text-[11px] text-gray-700 mt-1 text-center leading-tight">
              {GRADE_LABEL_ES[k]}
            </span>
          </button>
        );
      })}
    </div>
  );
}
