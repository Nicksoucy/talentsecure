import path from 'path';
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config();

/**
 * Get the Excel file path from environment variables or command line arguments
 * Priority: Environment variable > Command line argument > Default fallback
 */
export function getExcelFilePath(): string {
  return (
    process.env.EXCEL_FILE_PATH ||
    process.argv[2] ||
    path.join(process.cwd(), '../Grille d\'entretiens xguard.security (1).xlsx')
  );
}

/**
 * Get the CV source directory from environment variables or command line arguments
 * Priority: Environment variable > Command line argument > Default fallback
 */
export function getCVSourceDir(): string {
  return (
    process.env.CV_SOURCE_DIR ||
    process.argv[2] ||
    path.join(process.cwd(), '../cv candidats')
  );
}

/**
 * Get configuration with helpful error messages
 */
export function getConfig() {
  const excelPath = getExcelFilePath();
  const cvDir = getCVSourceDir();

  console.log('\n📋 Configuration:');
  console.log(`  Excel file: ${excelPath}`);
  console.log(`  CV directory: ${cvDir}`);
  console.log('\n💡 Tip: Set EXCEL_FILE_PATH and CV_SOURCE_DIR in .env to customize these paths\n');

  return {
    excelPath,
    cvDir,
  };
}
