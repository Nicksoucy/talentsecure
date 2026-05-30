// Analyse un PDF de prêt d'uniforme : champs de formulaire + texte brut.
import fs from 'fs';
import { PDFDocument, PDFTextField, PDFCheckBox } from 'pdf-lib';
import { PDFParse } from 'pdf-parse';

async function main() {
  const path = process.argv[2];
  if (!path) {
    console.error('Usage: ts-node analyze-pdf.ts <pdf-path>');
    process.exit(1);
  }
  if (!fs.existsSync(path)) {
    console.error(`Fichier introuvable: ${path}`);
    process.exit(1);
  }
  const buf = fs.readFileSync(path);
  console.log(`\n=== ${path}`);
  console.log(`Taille: ${(buf.length / 1024).toFixed(1)} KB`);

  // 1) Champs de formulaire (AcroForm) — si non aplati
  try {
    const doc = await PDFDocument.load(buf);
    console.log(`\n--- AcroForm (champs de formulaire) ---`);
    const form = doc.getForm();
    const fields = form.getFields();
    console.log(`Pages: ${doc.getPageCount()}, Champs: ${fields.length}`);
    if (fields.length > 0) {
      const filled: { name: string; value: string; type: string }[] = [];
      const checks: { name: string; checked: boolean }[] = [];
      for (const f of fields) {
        const name = f.getName();
        if (f instanceof PDFTextField) {
          const v = f.getText() || '';
          if (v.trim()) filled.push({ name, value: v, type: 'text' });
        } else if (f instanceof PDFCheckBox) {
          checks.push({ name, checked: f.isChecked() });
        }
      }
      console.log(`\nChamps texte non-vides (${filled.length}):`);
      for (const f of filled) console.log(`  • ${f.name} = "${f.value}"`);
      console.log(`\nCases à cocher (${checks.length}, cochées seulement):`);
      for (const f of checks.filter((x) => x.checked)) console.log(`  ☑ ${f.name}`);
    }
  } catch (e) {
    console.log(`AcroForm error: ${(e as Error).message}`);
  }

  // 2) Texte brut extrait
  try {
    const parser = new PDFParse({ data: new Uint8Array(buf) });
    const result = await parser.getText();
    const pages = result.pages || [];
    console.log(`\n--- Texte brut (${pages.length} pages) ---`);
    for (let i = 0; i < pages.length; i++) {
      const pageText = (pages[i] as any).text || '';
      console.log(`\n--- Page ${i + 1} ---`);
      console.log(pageText.trim() || '(vide)');
    }
  } catch (e) {
    console.log(`pdf-parse error: ${(e as Error).message}`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
