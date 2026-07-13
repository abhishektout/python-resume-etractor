export async function extractTextFromPdf(fileBuffer: Buffer): Promise<string> {
  try {
    const pdfParse = require('pdf-parse/lib/pdf-parse.js');
    const data = await pdfParse(fileBuffer);
    return data.text || '';
  } catch (err: any) {
    throw new Error(`Failed to parse PDF: ${err.message}`);
  }
}

export async function extractTextFromDocx(fileBuffer: Buffer): Promise<string> {
  try {
    const mammoth = require('mammoth');
    const result = await mammoth.extractRawText({ buffer: fileBuffer });
    return result.value || '';
  } catch (err: any) {
    throw new Error(`Failed to parse DOCX: ${err.message}`);
  }
}

export async function extractText(fileBuffer: Buffer, filename: string): Promise<string> {
  const ext = filename.split('.').pop()?.toLowerCase();
  if (ext === 'pdf') {
    return extractTextFromPdf(fileBuffer);
  } else if (ext === 'docx' || ext === 'doc') {
    return extractTextFromDocx(fileBuffer);
  } else {
    throw new Error(`Unsupported file type: .${ext}. Only PDF and DOCX are supported.`);
  }
}
