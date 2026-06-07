import jsPDF from "jspdf";
import QRCode from "qrcode";
import { format } from "date-fns";

export interface TicketPdfData {
  attendeeName: string;
  attendeeEmail: string;
  eventTitle: string;
  eventDate: string; // ISO
  venue?: string | null;
  location?: string | null;
  ticketType: string;
  qrCodeValue: string; // typically registration.qr_code
  registrationId: string;
  organizerName?: string | null;
}

/**
 * Build a single-page A6-ish ticket as a Blob. Used for both download and
 * (later) email attachment when the email domain is configured.
 */
export async function generateTicketPdf(data: TicketPdfData): Promise<Blob> {
  const doc = new jsPDF({ orientation: "portrait", unit: "pt", format: [420, 600] });

  // Header band
  doc.setFillColor(15, 23, 42);
  doc.rect(0, 0, 420, 70, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text((data.organizerName || "Event Ticket").toUpperCase(), 24, 30);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text("Present this QR at the door", 24, 50);

  // Title
  doc.setTextColor(15, 23, 42);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  const titleLines = doc.splitTextToSize(data.eventTitle, 372);
  doc.text(titleLines, 24, 110);

  // Meta
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(82, 82, 91);
  let y = 110 + titleLines.length * 22 + 8;
  doc.text(format(new Date(data.eventDate), "EEE, MMM d, yyyy · h:mm a"), 24, y);
  y += 16;
  const venue = [data.venue, data.location].filter(Boolean).join(" · ");
  if (venue) {
    doc.text(venue, 24, y);
    y += 16;
  }

  // Divider
  doc.setDrawColor(228, 228, 231);
  doc.line(24, y + 4, 396, y + 4);

  // QR
  const qrDataUrl = await QRCode.toDataURL(data.qrCodeValue, {
    margin: 1,
    width: 320,
    errorCorrectionLevel: "M",
  });
  const qrSize = 200;
  const qrX = (420 - qrSize) / 2;
  doc.addImage(qrDataUrl, "PNG", qrX, y + 24, qrSize, qrSize);

  // Footer / attendee
  const footerY = y + 24 + qrSize + 24;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(15, 23, 42);
  doc.text(data.attendeeName, 24, footerY);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(113, 113, 122);
  doc.text(data.attendeeEmail, 24, footerY + 14);
  doc.text(
    `${data.ticketType.toUpperCase()} · ID ${data.registrationId.slice(0, 8)}`,
    24,
    footerY + 28
  );

  return doc.output("blob");
}

/** Trigger a browser download of the ticket PDF. */
export async function downloadTicketPdf(data: TicketPdfData) {
  const blob = await generateTicketPdf(data);
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${data.eventTitle.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}-ticket.pdf`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}