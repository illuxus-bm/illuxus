/**
 * PDF report builder for the Reports page.
 *
 * Uses `jspdf` (already in the main bundle for ticket / badge PDFs) and
 * `jspdf-autotable` for structured table rendering. The full report is
 * generated as a single multi-page A4 PDF with a title block, summary
 * KPIs, and one autotable per data section.
 */

import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

export interface KpiRow {
  label: string;
  value: string;
}

export interface PdfTable {
  title: string;
  /** Column headers in render order. */
  head: string[];
  /** Each entry is one row of cells (must align with `head` length). */
  body: (string | number)[][];
}

export interface ReportPdfOptions {
  /** Document title shown at the top. */
  title: string;
  /** Optional subtitle (org name, date range, etc.). */
  subtitle?: string;
  /** Generation context lines printed under the subtitle. */
  meta?: string[];
  /** KPI summary block at the top of the report. */
  kpis?: KpiRow[];
  /** Tables rendered in order, each on its own paragraph. */
  tables?: PdfTable[];
  /** Pre-generated filename, defaults to `report-<date>.pdf`. */
  filename?: string;
}

const PAGE_MARGIN = 14; // mm

export function downloadReportPdf(opts: ReportPdfOptions): void {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const contentWidth = pageWidth - PAGE_MARGIN * 2;

  let y = PAGE_MARGIN;

  // ── Title ────────────────────────────────────────────────────────────────
  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.setTextColor(11, 11, 26); // brand navy
  doc.text(opts.title, PAGE_MARGIN, y);
  y += 8;

  if (opts.subtitle) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(11);
    doc.setTextColor(90, 90, 100);
    doc.text(opts.subtitle, PAGE_MARGIN, y);
    y += 6;
  }

  if (opts.meta && opts.meta.length > 0) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(120, 120, 130);
    for (const line of opts.meta) {
      doc.text(line, PAGE_MARGIN, y);
      y += 4.2;
    }
    y += 2;
  }

  // ── KPI summary block ───────────────────────────────────────────────────
  if (opts.kpis && opts.kpis.length > 0) {
    autoTable(doc, {
      startY: y,
      head: [["Metric", "Value"]],
      body: opts.kpis.map((k) => [k.label, k.value]),
      theme: "plain",
      styles: { fontSize: 10, cellPadding: { top: 2, right: 4, bottom: 2, left: 4 } },
      headStyles: {
        fillColor: [241, 241, 244],
        textColor: [60, 60, 70],
        fontStyle: "bold",
        fontSize: 9,
      },
      columnStyles: {
        0: { cellWidth: contentWidth * 0.5, textColor: [60, 60, 70] },
        1: { cellWidth: contentWidth * 0.5, fontStyle: "bold", textColor: [11, 11, 26] },
      },
      margin: { left: PAGE_MARGIN, right: PAGE_MARGIN },
    });
    // autoTable updates `lastAutoTable` on the doc instance.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    y = ((doc as any).lastAutoTable?.finalY ?? y) + 8;
  }

  // ── Each table ──────────────────────────────────────────────────────────
  for (const table of opts.tables ?? []) {
    if (y > doc.internal.pageSize.getHeight() - 30) {
      doc.addPage();
      y = PAGE_MARGIN;
    }

    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.setTextColor(11, 11, 26);
    doc.text(table.title, PAGE_MARGIN, y);
    y += 5;

    if (table.body.length === 0) {
      doc.setFont("helvetica", "italic");
      doc.setFontSize(9);
      doc.setTextColor(140, 140, 150);
      doc.text("No data.", PAGE_MARGIN, y);
      y += 8;
      continue;
    }

    autoTable(doc, {
      startY: y,
      head: [table.head],
      body: table.body,
      theme: "striped",
      styles: { fontSize: 9, cellPadding: 2.2, overflow: "linebreak" },
      headStyles: {
        fillColor: [11, 11, 26],
        textColor: [245, 245, 247],
        fontStyle: "bold",
        fontSize: 9,
      },
      alternateRowStyles: { fillColor: [248, 248, 250] },
      margin: { left: PAGE_MARGIN, right: PAGE_MARGIN },
      didDrawPage: () => {
        // Footer with page number
        const pageCount = doc.getNumberOfPages();
        const currentPage = doc.getCurrentPageInfo().pageNumber;
        doc.setFont("helvetica", "normal");
        doc.setFontSize(8);
        doc.setTextColor(160, 160, 170);
        doc.text(
          `${currentPage} / ${pageCount}`,
          pageWidth - PAGE_MARGIN,
          doc.internal.pageSize.getHeight() - 6,
          { align: "right" },
        );
      },
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    y = ((doc as any).lastAutoTable?.finalY ?? y) + 8;
  }

  const filename = opts.filename ?? `report-${new Date().toISOString().slice(0, 10)}.pdf`;
  doc.save(filename);
}
