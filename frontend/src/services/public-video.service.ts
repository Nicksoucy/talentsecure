import axios from 'axios';
import { uploadFileToSignedUrl } from './upload.util';

// Instance NON authentifiée : le candidat arrive depuis un lien du formulaire
// GoHighLevel (ou un SMS de rappel) et n'a évidemment pas de compte.
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';
const publicApi = axios.create({ baseURL: API_URL, headers: { 'Content-Type': 'application/json' } });

export interface VideoSession {
  firstName: string | null;
  alreadyUploaded: boolean;
  maxBytes: number;
}

interface InitiateResponse {
  uploadUrl: string;
  key: string;
  /** Type MIME normalisé — doit être renvoyé TEL QUEL dans le PUT. */
  contentType: string;
  expiresIn: number;
}

export const publicVideoService = {
  async getSession(contactId: string): Promise<VideoSession> {
    const r = await publicApi.get('/api/public/video/session', { params: { c: contactId } });
    return r.data as VideoSession;
  },

  /**
   * Téléverse une vidéo de bout en bout : URL présignée → PUT direct vers R2 →
   * confirmation côté serveur.
   *
   * `file` peut être un File (onglet « Téléverser ») ou un Blob issu de
   * MediaRecorder (onglet « Enregistrer ») — les deux exposent `size`.
   */
  async upload(
    contactId: string,
    file: Blob,
    filename: string,
    onProgress?: (progress: number) => void
  ): Promise<{ attached: boolean }> {
    const init = await publicApi.post('/api/public/video/initiate', {
      c: contactId,
      filename,
      contentType: file.type,
      sizeBytes: file.size,
    });
    const { uploadUrl, key, contentType } = init.data as InitiateResponse;

    // Le Content-Type et la taille sont figés dans la signature : on renvoie
    // exactement le type normalisé par le serveur, sinon R2 répond 403.
    await uploadFileToSignedUrl(uploadUrl, file, contentType, onProgress);

    const done = await publicApi.post('/api/public/video/complete', { c: contactId, key, filename });
    return { attached: Boolean((done.data as any)?.attached) };
  },
};
