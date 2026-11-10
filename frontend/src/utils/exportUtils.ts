import { WorkloadRow } from '../types';
import { formatCpu, formatMem } from './formatters';
import { calculateDelta } from './krrCalculations';

export function exportToCsv(rows: WorkloadRow[], filename = 'kube-rightsizer-recommendations.csv') {
  const headers = [
    'Namespace',
    'Kind',
    'Workload Name',
    'Container',
    'Pods',
    'HPA',
    'Severity',
    'Current Req CPU',
    'Recommended Req CPU',
    'Delta Req CPU (Total Cores)',
    'Current Req Mem',
    'Recommended Req Mem',
    'Delta Req Mem (Total Bytes)',
    'Current Lim CPU',
    'Recommended Lim CPU',
    'Current Lim Mem',
    'Recommended Lim Mem',
    'Notes',
  ];

  const escapeCsv = (val: any) => {
    if (val === null || val === undefined) return '""';
    const s = String(val).replace(/"/g, '""');
    return `"${s}"`;
  };

  const csvRows = [headers.join(',')];

  for (const r of rows) {
    const dCpu = calculateDelta(r, 'req_cpu');
    const dMem = calculateDelta(r, 'req_mem');
    const notes = [
      ...Object.entries(r.info || {}).map(([k, v]) => `${k}: ${v}`),
      ...(r.warnings || []),
    ].join('; ');

    const line = [
      escapeCsv(r.ns),
      escapeCsv(r.kind),
      escapeCsv(r.name),
      escapeCsv(r.container),
      escapeCsv(r.pods),
      escapeCsv(r.hpa ? 'Yes' : 'No'),
      escapeCsv(r.severity),
      escapeCsv(formatCpu(r.cur.req_cpu)),
      escapeCsv(formatCpu(r.rec.req_cpu)),
      escapeCsv(dCpu !== null ? dCpu.toFixed(3) : ''),
      escapeCsv(formatMem(r.cur.req_mem)),
      escapeCsv(formatMem(r.rec.req_mem)),
      escapeCsv(dMem !== null ? Math.round(dMem) : ''),
      escapeCsv(formatCpu(r.cur.lim_cpu)),
      escapeCsv(formatCpu(r.rec.lim_cpu)),
      escapeCsv(formatMem(r.cur.lim_mem)),
      escapeCsv(formatMem(r.rec.lim_mem)),
      escapeCsv(notes),
    ];
    csvRows.push(line.join(','));
  }

  const blob = new Blob([csvRows.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function exportToJson(data: any, filename = 'kube-rightsizer-export.json') {
  const jsonStr = JSON.stringify(data, null, 2);
  const blob = new Blob([jsonStr], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
