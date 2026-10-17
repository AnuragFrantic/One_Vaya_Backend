import PDFDocument from "pdfkit";

/** Branded quote PDF (navy / ivory / champagne). Returns the file as a Buffer. */
export function renderQuotePdf(q: {
  ref: string;
  title: string;
  customerName?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  travellers?: string | null;
  itinerary: { date?: string | null; title?: string | null; items: { time?: string | null; text?: string | null }[] }[];
  items: { description: string; qty?: number | null; unitPrice?: number | null }[];
  notes?: string | null;
  validUntil?: Date | null;
}): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 48 });
    const chunks: Buffer[] = [];
    doc.on("data", (c: Buffer) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const NAVY = "#101C2C", CHAMP = "#A48F60", MUTED = "#5D6878";
    const money = (n: number) => `AED ${n.toLocaleString("en-US")}`;

    // Header band
    doc.rect(0, 0, doc.page.width, 110).fill(NAVY);
    doc.fillColor("#F5F0E7").font("Times-Roman").fontSize(28).text("OneVaya", 48, 38);
    doc.fontSize(9).font("Helvetica").fillColor("#C9B58A").text("TRAVEL & TOURISM", 48, 72, { characterSpacing: 3 });
    doc.fillColor("#F5F0E7").fontSize(10).text(`Quote ${q.ref}`, 0, 44, { align: "right", width: doc.page.width - 48 });

    doc.moveDown(5).fillColor(NAVY).font("Times-Roman").fontSize(22).text(q.title, 48, 140);
    doc.font("Helvetica").fontSize(10).fillColor(MUTED)
      .text([q.customerName && `Prepared for ${q.customerName}`, q.startDate && `${q.startDate} – ${q.endDate ?? ""}`, q.travellers].filter(Boolean).join("  ·  "));

    // Itinerary
    if (q.itinerary?.length) {
      doc.moveDown(1.2).fillColor(CHAMP).fontSize(9).text("DAY-BY-DAY ITINERARY", { characterSpacing: 2 });
      q.itinerary.forEach((d, i) => {
        doc.moveDown(0.6).fillColor(NAVY).font("Helvetica-Bold").fontSize(11).text(`Day ${i + 1}${d.date ? ` · ${d.date}` : ""}  ${d.title ?? ""}`);
        doc.font("Helvetica").fontSize(10).fillColor(MUTED);
        d.items.forEach((it) => doc.text(`${it.time ?? ""}   ${it.text ?? ""}`, { indent: 12 }));
      });
    }

    // Price table
    doc.moveDown(1.2).fillColor(CHAMP).fontSize(9).text("YOUR QUOTE", { characterSpacing: 2 });
    let total = 0;
    doc.moveDown(0.4);
    q.items.forEach((it) => {
      const line = (it.qty ?? 1) * (it.unitPrice ?? 0);
      total += line;
      const y = doc.y;
      doc.fillColor(NAVY).font("Helvetica").fontSize(10).text(`${it.description}${(it.qty ?? 1) > 1 ? ` × ${it.qty}` : ""}`, 48, y, { width: 360 });
      doc.text(money(line), 410, y, { width: doc.page.width - 458, align: "right" });
      doc.moveDown(0.3);
    });
    doc.moveTo(48, doc.y + 4).lineTo(doc.page.width - 48, doc.y + 4).strokeColor("#DDD2BF").stroke();
    doc.moveDown(0.8).font("Helvetica-Bold").fontSize(12).text("Total", 48, doc.y, { continued: true }).text(money(total), { align: "right" });

    if (q.notes) doc.moveDown(1).font("Helvetica").fontSize(9).fillColor(MUTED).text(q.notes);
    doc.moveDown(1).fontSize(8).fillColor(MUTED).text(
      `${q.validUntil ? `Valid until ${q.validUntil.toDateString()}. ` : ""}Prices are subject to availability at the time of booking. Payments are recorded by OneVaya; online payment is not available.`,
    );
    doc.end();
  });
}
