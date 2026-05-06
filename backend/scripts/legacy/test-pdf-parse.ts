// Test pdf-parse import
console.log('Testing pdf-parse import...\n');

// Try different import methods
try {
  const pdf1 = require('pdf-parse');
  console.log('require("pdf-parse"):', typeof pdf1, pdf1);
} catch (e: any) {
  console.log('require failed:', e.message);
}

try {
  const pdf2 = require('pdf-parse').default;
  console.log('require("pdf-parse").default:', typeof pdf2);
} catch (e: any) {
  console.log('require().default failed:', e.message);
}

// Try import
import('pdf-parse').then((module) => {
  console.log('import("pdf-parse"):', typeof module, module);
  console.log('import().default:', typeof module.default);
}).catch((e) => {
  console.log('import failed:', e.message);
});
