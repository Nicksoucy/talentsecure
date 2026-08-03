/**
 * Téléversement direct vers une URL présignée (R2).
 *
 * Volontairement sans authentification et sans dépendance à `api.ts` : les
 * octets vont du navigateur au stockage objet, sans jamais transiter par notre
 * backend. C'est ce qui permet de dépasser la limite de 32 Mio par requête de
 * Cloud Run — et c'est pourquoi ce helper est partagé entre l'écran staff
 * (candidate.service) et la page publique du candidat (public-video.service).
 *
 * XMLHttpRequest plutôt que fetch : c'est la seule API qui expose la
 * progression du téléversement (`upload.onprogress`).
 */
export function uploadFileToSignedUrl(
  url: string,
  file: Blob,
  contentType: string,
  onProgress?: (progress: number) => void
): Promise<void> {
  // Contournement CORS en développement : on repasse par le proxy Vite
  // (/r2-proxy), qui retire les en-têtes Origin/Referer. Nécessite
  // `forcePathStyle: true` côté backend pour garder le bucket dans le chemin.
  if (window.location.hostname === 'localhost' && url.includes('r2.cloudflarestorage.com')) {
    url = url.replace(/https:\/\/.*\.r2\.cloudflarestorage\.com/, '/r2-proxy');
    console.log('Using R2 Development Proxy:', url);
  }

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', url, true);
    xhr.setRequestHeader('Content-Type', contentType);

    if (onProgress) {
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) {
          onProgress(Math.round((e.loaded / e.total) * 100));
        }
      };
    }

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve();
      } else {
        // Un 403 ici signifie presque toujours que le Content-Type ou la taille
        // envoyés ne correspondent pas à ceux figés dans la signature.
        reject(new Error(`Upload failed with status ${xhr.status} (Proxy/Network)`));
      }
    };

    xhr.onerror = () => reject(new Error('Network error during upload'));
    xhr.send(file);
  });
}
