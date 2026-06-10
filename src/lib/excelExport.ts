import * as XLSX from 'xlsx';

export function getExportFileName(pageName: string, jobName?: string): string {
  const date = new Date().toISOString().split('T')[0];
  const sanitized = (jobName || 'Project').replace(/[^a-zA-Z0-9]/g, '');
  return `CPQ_${pageName}_${sanitized}_${date}.xlsx`;
}

export function applySheetFormatting(
  ws: XLSX.WorkSheet,
  headers: string[],
  opts?: { currencyCols?: number[]; hoursCols?: number[] }
) {
  const range = XLSX.utils.decode_range(ws['!ref'] || 'A1');

  // Column widths
  ws['!cols'] = headers.map(h => ({ wch: Math.max(h.length + 2, 14) }));

  // Bold header + number formats
  for (let C = range.s.c; C <= range.e.c; C++) {
    const headerAddr = XLSX.utils.encode_cell({ r: 0, c: C });
    if (ws[headerAddr]) {
      ws[headerAddr].s = { font: { bold: true }, fill: { fgColor: { rgb: 'F3F4F6' } } };
    }

    const hdr = headers[C] || '';
    const isCurrency = opts?.currencyCols?.includes(C) ??
      (hdr.includes('Wage') || hdr.includes('Allow') || hdr.includes('Total') || hdr.includes('Cost') || hdr.includes('$') || hdr.includes('Rate') || hdr.includes('Value') || hdr.includes('Price'));
    const isHours = opts?.hoursCols?.includes(C) ??
      (hdr.includes('Hrs') || hdr.includes('Hours'));

    for (let R = 1; R <= range.e.r; R++) {
      const addr = XLSX.utils.encode_cell({ r: R, c: C });
      if (ws[addr] && typeof ws[addr].v === 'number') {
        if (isCurrency) ws[addr].z = '$#,##0.00';
        else if (isHours) ws[addr].z = '0.00';
      }
    }
  }

  // Freeze top row
  if (!ws['!views']) ws['!views'] = [{}];
  (ws['!views'] as Record<string, unknown>[])[0] = { state: 'frozen', ySplit: 1 };
}

export function boldLastRow(ws: XLSX.WorkSheet) {
  const range = XLSX.utils.decode_range(ws['!ref'] || 'A1');
  for (let C = range.s.c; C <= range.e.c; C++) {
    const addr = XLSX.utils.encode_cell({ r: range.e.r, c: C });
    if (ws[addr]) ws[addr].s = { font: { bold: true } };
  }
}

export function downloadWorkbook(wb: XLSX.WorkBook, filename: string) {
  XLSX.writeFile(wb, filename);
}
