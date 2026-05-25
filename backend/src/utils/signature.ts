import { uploadBufferToR2 } from '../services/r2.service';

/**
 * Décode une signature PNG en base64 (data URL ou brut) et l'envoie dans R2.
 * Retourne la clé R2 stockée.
 */
export async function uploadSignaturePng(base64: string, key: string): Promise<string> {
  const data = base64.replace(/^data:image\/\w+;base64,/, '');
  const buffer = Buffer.from(data, 'base64');
  await uploadBufferToR2(buffer, key, 'image/png');
  return key;
}
