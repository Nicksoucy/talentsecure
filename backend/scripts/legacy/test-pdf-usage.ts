import fs from 'fs';
import path from 'path';

async function testPDFUsage() {
  console.log('Testing PDF usage...\n');

  const testFile = path.join(__dirname, 'uploads', 'cv', '022f6281-9452-4f90-832b-bc3791b9052f_gilbert_kambale mbeku.pdf');

  if (!fs.existsSync(testFile)) {
    console.log('Test file not found!');
    return;
  }

  const dataBuffer = fs.readFileSync(testFile);
  console.log(`Read ${dataBuffer.length} bytes from PDF\n`);

  // Try pdf-parse
  try {
    const pdf = require('pdf-parse');
    console.log('pdf module type:', typeof pdf);
    console.log('pdf.PDFParse type:', typeof pdf.PDFParse);

    // Try as function
    try {
      const result = await pdf(dataBuffer);
      console.log('✓ pdf(buffer) worked!');
      console.log('Text length:', result.text?.length || 0);
      console.log('First 200 chars:', result.text?.substring(0, 200));
    } catch (e: any) {
      console.log('pdf(buffer) failed:', e.message);
    }

    // Try with PDFParse class
    try {
      const parser = new pdf.PDFParse();
      const result = await parser.parse(dataBuffer);
      console.log('✓ PDFParse.parse() worked!');
      console.log('Text length:', result.text?.length || 0);
    } catch (e: any) {
      console.log('PDFParse.parse() failed:', e.message);
    }

  } catch (e: any) {
    console.log('Error:', e.message);
  }
}

testPDFUsage()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
