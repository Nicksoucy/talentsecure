import { uniformService } from '@/services/uniform.service';

export interface SendDraftResult {
  /** La remise a été finalisée (statut ISSUED, stock décrémenté). */
  finalized: boolean;
  /** Le SMS de signature a bien été envoyé à l'agent. */
  smsSent: boolean;
  /** Message d'erreur si le SMS a échoué après une finalisation réussie. */
  smsError?: string;
}

/**
 * Envoi rapide d'un brouillon de remise : finalise (décrémente le stock,
 * génère le lien + le PDF) PUIS envoie le SMS de signature à l'agent.
 *
 * - Si la finalisation échoue (ex. stock insuffisant à l'emplacement par
 *   défaut), la fonction *throw* : la remise reste un brouillon, l'appelant
 *   affiche l'erreur.
 * - Si la finalisation réussit mais que le SMS échoue (téléphone manquant,
 *   GHL indisponible…), on NE throw PAS : la remise est déjà « Remis » et le
 *   SMS pourra être renvoyé via « Renvoyer le SMS ». On remonte l'échec dans
 *   le résultat pour que l'appelant prévienne l'utilisateur.
 *
 * L'employeur peut signer après coup (bouton « Signer employeur » de la fiche).
 */
export async function sendDraftIssuance(id: string): Promise<SendDraftResult> {
  await uniformService.finalizeIssuance(id);
  try {
    await uniformService.sendIssuanceSms(id);
    return { finalized: true, smsSent: true };
  } catch (e: any) {
    const smsError = e?.response?.data?.message || e?.response?.data?.error || e?.message;
    return { finalized: true, smsSent: false, smsError };
  }
}
