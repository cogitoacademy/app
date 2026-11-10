import { PDFDocument } from "pdf-lib";
export async function testPdf(title = "test") {
  const doc = await PDFDocument.create();
  doc.setTitle(title);
  doc.addPage();
  return doc.save();
}
