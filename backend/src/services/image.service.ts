import fs from 'fs/promises';
import path from 'path';
import logger from '../config/logger';

let sharp: typeof import('sharp') | null = null;

(async () => {
  try {
    sharp = (await import('sharp')).default;
  } catch (error) {
    logger.warn('Sharp non disponible, l\'optimisation des images est desactivee', { error });
  }
})();

export async function optimizeImage(filePath: string) {
  if (!sharp) {
    return;
  }

  try {
    const image = sharp(filePath).rotate().resize({ width: 1920, withoutEnlargement: true });
    const metadata = await image.metadata();

    const buffer = await (metadata.format === 'png'
      ? image.png({ compressionLevel: 9, adaptiveFiltering: true }).toBuffer()
      : image.jpeg({ quality: 80, mozjpeg: true }).toBuffer()
    );

    await fs.writeFile(filePath, buffer);
  } catch (error) {
    logger.warn('Impossible d\'optimiser l\'image', { file: path.basename(filePath), error });
  }
}
