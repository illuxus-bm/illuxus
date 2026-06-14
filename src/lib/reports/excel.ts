/**
 * Excel (.xlsx) workbook builder for the Reports page.
 *
 * This module pulls in `exceljs` (~900 KB minified) and is intentionally
 * imported via dynamic `import()` from the consumer so the main bundle
 * stays light. Open it via:
 *
 *     const { downloadWorkbook } = await import("@/lib/reports/excel");
 *     await downloadWorkbook("file.xlsx", sheets);
 *
 * Vite + Rollup splits this into its own chunk on build.
 */

import ExcelJS from "exceljs";

export interface SheetColumn {
  header: string;
  /** Property name on each row object. */
  key: string;
  /** Width in characters. */
  width?: number;
  /** ExcelJS number format string (e.g. `"yyyy-mm-dd hh:mm"`). */
  numFmt?: string;
}

export interface Sheet {
  name: string;
  columns: SheetColumn[];
  rows: Record<string, unknown>[];
}

const XLSX_MIME =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

/** Build a workbook with one or more sheets and trigger a browser download. */
export async function downloadWorkbook(filename: string, sheets: Sheet[]): Promise<void> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "illuxus";
  wb.created = new Date();
  wb.modified = new Date();

  for (const sheet of sheets) {
    const ws = wb.addWorksheet(sheet.name.slice(0, 31)); // Excel limits sheet names to 31 chars
    ws.columns = sheet.columns.map((c) => ({
      header: c.header,
      key: c.key,
      width: c.width ?? 18,
      style: c.numFmt ? { numFmt: c.numFmt } : undefined,
    }));
    if (sheet.rows.length > 0) {
      ws.addRows(sheet.rows);
    }
    // Header row formatting
    const headerRow = ws.getRow(1);
    headerRow.font = { bold: true };
    headerRow.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FFF1F1F4" },
    };
    headerRow.alignment = { vertical: "middle" };
    // Freeze the header so scrolling stays readable
    ws.views = [{ state: "frozen", ySplit: 1 }];
    // Auto-filter on the data range so users can sort/filter in Excel
    if (sheet.rows.length > 0) {
      ws.autoFilter = {
        from: { row: 1, column: 1 },
        to: { row: sheet.rows.length + 1, column: sheet.columns.length },
      };
    }
  }

  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: XLSX_MIME });
  triggerDownload(blob, filename);
}

function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  // Defer revoke so the browser has time to read the blob
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
