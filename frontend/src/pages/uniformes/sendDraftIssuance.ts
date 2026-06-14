import { uniformService } from '@/services/uniform.service';

export interface SendDraftResult {
  /** La remise a été finalisée (statut ISSUED, stock décrémenté). */
  finalized: boolean;
  /** La signature employeur a été demandée ET enregistrée. */
  employerSigned: boolean;
  /** Message d'erreur si la signature employeur (demandée) a échoué. */
  employerSignError?: string;
  /** Le SMS de signature a bien été envoyé à l'agent. */
  smsSent: boolean;
  /** Message d'erreur si le SMS a échoué après une finalisation réussie. */
  smsError?: string;
}

/**
 * Envoi rapide d'un brouillon de remise. Séquence (mirroir du wizard) :
 *   1. finalise (décrémente le stock, génère le lien + le PDF)
 *   2. si une signature employeur est fournie → l'enregistre (régénère le PDF)
 *   3. envoie le SMS de signature à l'agent
 *
 * Tolérance aux pannes — la finalisation est le seul point bloquant :
 * - finalisation KO (ex. stock insuffisant) → *throw* : la remise reste un
 *   brouillon, l'appelant affiche l'erreur.
 * - finalisation OK mais signature employeur KO → on continue (la remise est
 *   « Remis ») et on remonte `employerSignError` ; l'employeur pourra
 *   re-signer via « Signer employeur ».
 * - finalisation OK mais SMS KO → on remonte `smsError` ; le SMS pourra être
 *   renvoyé via « Renvoyer le SMS ».
 *
 * @param employerSignatureBase64 signature employeur (PNG base64) à enregistrer
 *        tout de suite. Omis = l'employeur signera plus tard.
 */
export async function sendDraftIssuance(id: string, employerSignatureBase64?: string): Promise<SendDraftResult> {
  await uniformService.finalizeIssuance(id);

  let employerSigned = false;
  let employerSignError: string | undefined;
  if (employerSignatureBase64) {
    try {
      await uniformService.counterSignIssuance(id, { employerSignatureBase64 });
      employerSigned = true;
    } catch (e: any) {
      employerSignError = e?.response?.data?.error || e?.message;
    }
  }

  try {
    await uniformService.sendIssuanceSms(id);
    return { finalized: true, employerSigned, employerSignError, smsSent: true };
  } catch (e: any) {
    const smsError = e?.response?.data?.message || e?.response?.data?.error || e?.message;
    return { finalized: true, employerSigned, employerSignError, smsSent: false, smsError };
  }
}
