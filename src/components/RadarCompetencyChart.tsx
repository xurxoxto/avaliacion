import { useMemo } from 'react';
import { Radar } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  RadialLinearScale,
  PointElement,
  LineElement,
  Filler,
  Tooltip,
  Legend,
  type ChartOptions,
} from 'chart.js';

ChartJS.register(RadialLinearScale, PointElement, LineElement, Filler, Tooltip, Legend);

const LABELS = ['CCL', 'CP', 'STEM', 'CD', 'CPSAA', 'CC', 'CE', 'CCEC'] as const;
export type CompetencyLabel = (typeof LABELS)[number];

function getTextColorFromTailwindClass(className: string, fallback: string): string {
  try {
    const el = document.createElement('span');
    el.style.position = 'absolute';
    el.style.left = '-9999px';
    el.style.top = '-9999px';
    el.className = className;
    el.textContent = 'x';
    document.body.appendChild(el);
    const color = window.getComputedStyle(el).color;
    document.body.removeChild(el);
    return color || fallback;
  } catch {
    return fallback;
  }
}

function parseRgb(color: string): { r: number; g: number; b: number } | null {
  const m = /^rgba?\((\d+)\s*,\s*(\d+)\s*,\s*(\d+)(?:\s*,\s*([\d.]+))?\)$/.exec(String(color || '').trim());
  if (!m) return null;
  return { r: Number(m[1]), g: Number(m[2]), b: Number(m[3]) };
}

function withAlpha(color: string, alpha: number, fallback: string): string {
  const rgb = parseRgb(color);
  if (!rgb) return fallback;
  const a = Math.min(1, Math.max(0, alpha));
  return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${a})`;
}

export interface RadarCompetencyChartProps {
  studentData: Partial<Record<CompetencyLabel, number>>;
  groupData: Partial<Record<CompetencyLabel, number>>;
  groupLabel: string;
}

export default function RadarCompetencyChart({ studentData, groupData, groupLabel }: RadarCompetencyChartProps) {
  const primary = getTextColorFromTailwindClass('text-primary-600', 'rgb(2, 132, 199)');
  const gray = getTextColorFromTailwindClass('text-gray-400', 'rgb(156, 163, 175)');

  const data = useMemo(() => {
    return {
      labels: [...LABELS],
      datasets: [
        {
          label: 'Progreso individual',
          data: LABELS.map((l) => Number(studentData[l] ?? 0) || 0),
          backgroundColor: withAlpha(primary, 0.18, 'rgba(2, 132, 199, 0.18)'),
          borderColor: primary,
          borderWidth: 2,
          pointBackgroundColor: primary,
        },
        {
          label: groupLabel,
          data: LABELS.map((l) => Number(groupData[l] ?? 0) || 0),
          backgroundColor: withAlpha(gray, 0.16, 'rgba(156, 163, 175, 0.16)'),
          borderColor: gray,
          borderDash: [5, 5],
          borderWidth: 1,
          pointBackgroundColor: gray,
        },
      ],
    };
  }, [studentData, groupData, groupLabel, primary, gray]);

  const options: ChartOptions<'radar'> = useMemo(() => {
    return {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        r: {
          angleLines: { display: true },
          suggestedMin: 1,
          suggestedMax: 4,
          ticks: { stepSize: 1 },
        },
      },
      plugins: {
        legend: { position: 'top' },
      },
    };
  }, []);

  return (
    <div className="h-64">
      <Radar data={data} options={options} />
    </div>
  );
}
