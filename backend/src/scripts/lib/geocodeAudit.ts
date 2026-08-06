/**
 * Outillage partagé des backfills de géocodage : compare l'AVANT et l'APRÈS de
 * chaque fiche, classe le changement, et imprime un rapport relisable avant
 * d'écrire quoi que ce soit.
 *
 * Raison d'être : un recalcul complet (--all) réécrit lat/lng de toute une table.
 * Deux incidents passés (base de prod vidée, fiches épinglées au pôle Nord) ont
 * montré qu'il ne faut jamais lancer ça à l'aveugle. D'où : dry-run par défaut
 * en mode --all, et garde-fou dur sur les bornes du Québec.
 */
import { isInQuebecBounds } from '../../services/cityGeocode.service';
import { haversineKm } from '../../utils/geo';

export interface GeoSnapshot {
  lat: number;
  lng: number;
  source: string | null;
}

export type Verdict =
  | 'inchangé'
  | 'amélioré'
  | 'déplacé'
  | 'nouveau'
  | 'perdu'
  | 'REJETÉ_HORS_QC';

export interface GeocodeDelta {
  id: string;
  label: string;
  city: string | null;
  postalCode: string | null;
  before: GeoSnapshot | null;
  after: GeoSnapshot | null;
  movedKm: number | null;
  verdict: Verdict;
}

/** Sous ce seuil, on considère que la fiche n'a pas bougé (bruit d'arrondi). */
const SAME_POINT_KM = 0.05;

/**
 * Au-delà de ce déplacement, on soupçonne un homonyme mal géocodé plutôt qu'une
 * vraie correction. Volontairement haut : certaines FSA du Nord (G0V, G0X, J0Y)
 * ont un centroïde à 200-450 km de leurs villages, et ces corrections-là sont
 * légitimes. Le seuil sert à faire RELIRE, pas à rejeter automatiquement.
 */
const SUSPECT_MOVE_KM = 150;

/**
 * Classe le passage de `before` à `after`.
 * « amélioré » = on quitte un centroïde de secteur postal pour un vrai centre-ville
 * (c'est l'effet attendu du correctif FSA rurale). « perdu » = la fiche était
 * placée et ne l'est plus : toujours à examiner. « REJETÉ_HORS_QC » ne doit
 * jamais apparaître — c'est le filet.
 */
export function classify(
  before: GeoSnapshot | null,
  after: GeoSnapshot | null,
  opts?: {
    /**
     * true quand le script SAUTE l'écriture si rien ne résout (prospects,
     * candidats) : la fiche garde alors sa position → « inchangé », pas « perdu ».
     * false quand le script écrit null (employés, mandats via geocode*ById).
     */
    keepsExistingWhenUnresolved?: boolean;
  }
): {
  verdict: Verdict;
  movedKm: number | null;
} {
  if (!after) {
    if (!before) return { verdict: 'inchangé', movedKm: null };
    return {
      verdict: opts?.keepsExistingWhenUnresolved ? 'inchangé' : 'perdu',
      movedKm: null,
    };
  }
  if (!isInQuebecBounds(after.lat, after.lng)) return { verdict: 'REJETÉ_HORS_QC', movedKm: null };
  if (!before) return { verdict: 'nouveau', movedKm: null };

  const movedKm = haversineKm(before, after);
  if (movedKm < SAME_POINT_KM && before.source === after.source) {
    return { verdict: 'inchangé', movedKm };
  }
  const amélioré = before.source === 'postal' && after.source !== 'postal';
  return { verdict: amélioré ? 'amélioré' : 'déplacé', movedKm };
}

const median = (xs: number[]): number | null => {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  return s[s.length >> 1];
};

const pad = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + '…' : s.padEnd(n));
const fmt = (g: GeoSnapshot | null) => (g ? `${g.lat.toFixed(4)},${g.lng.toFixed(4)}` : 'non placé');

/**
 * Imprime le rapport. Retourne le nombre de fiches REJETÉES hors Québec —
 * l'appelant doit refuser d'écrire si ce n'est pas 0.
 */
export function printAuditReport(rows: GeocodeDelta[], title: string, dryRun: boolean): number {
  const by = new Map<Verdict, GeocodeDelta[]>();
  for (const r of rows) {
    const list = by.get(r.verdict);
    if (list) list.push(r);
    else by.set(r.verdict, [r]);
  }
  const n = (v: Verdict) => by.get(v)?.length ?? 0;

  console.log(`\n${'═'.repeat(78)}`);
  console.log(`${dryRun ? 'AUDIT (DRY-RUN)' : 'APPLICATION'} — ${title}`);
  console.log('═'.repeat(78) + '\n');
  console.log(`   Fiches examinées   : ${rows.length}`);
  console.log(`     inchangé         : ${n('inchangé')}`);

  const amel = by.get('amélioré') ?? [];
  const med = median(amel.map((r) => r.movedKm!).filter((x) => x != null));
  console.log(
    `     amélioré         : ${amel.length}` +
      (med != null ? `   (secteur → ville, déplacement médian ${med.toFixed(1)} km)` : '')
  );
  console.log(`     déplacé          : ${n('déplacé')}`);
  console.log(`     nouveau          : ${n('nouveau')}   (était non placé)`);
  if (n('perdu') > 0) console.log(`  ⚠️  perdu            : ${n('perdu')}   ← À EXAMINER`);
  else console.log(`     perdu            : 0`);
  const rejected = n('REJETÉ_HORS_QC');
  console.log(`   ${rejected > 0 ? '⛔' : '  '} REJETÉ hors QC     : ${rejected}   ${rejected > 0 ? '← BLOQUANT' : '(doit être 0)'}`);

  // Un déplacement énorme trahit souvent un HOMONYME mal résolu (« Saint-Paul »,
  // « L'Ange-Gardien »… existent à plusieurs endroits au Québec). À relire à la
  // main : la bonne correction est une entrée manuelle dans city_geocodes.
  const suspects = rows
    .filter((r) => r.movedKm != null && r.movedKm > SUSPECT_MOVE_KM)
    .sort((a, b) => b.movedKm! - a.movedKm!);
  if (suspects.length > 0) {
    console.log(`\n   ⚠️  ${suspects.length} déplacement(s) de plus de ${SUSPECT_MOVE_KM} km — VÉRIFIER (homonyme ?) :\n`);
    for (const r of suspects) {
      console.log(
        `      ${pad(r.label, 26)} ${pad(r.city ?? '—', 24)} ${pad(r.postalCode ?? '—', 9)} ` +
          `→ ${fmt(r.after)}  ${r.movedKm!.toFixed(0)} km`
      );
    }
  }

  const movers = rows
    .filter((r) => r.movedKm != null && r.movedKm > 1)
    .sort((a, b) => b.movedKm! - a.movedKm!);
  if (movers.length > 0) {
    console.log(`\n   Plus gros déplacements (${movers.length} fiche(s) au-delà de 1 km) :\n`);
    for (const r of movers.slice(0, 20)) {
      console.log(
        `      ${pad(r.label, 26)} ${pad(r.city ?? '—', 24)} ${pad(r.postalCode ?? '—', 9)} ` +
          `${fmt(r.before)} → ${fmt(r.after)}  ${r.movedKm!.toFixed(1).padStart(6)} km  ` +
          `${r.before?.source ?? '—'}→${r.after?.source ?? '—'}`
      );
    }
    if (movers.length > 20) console.log(`      … et ${movers.length - 20} autre(s).`);
  }

  const perdus = by.get('perdu') ?? [];
  if (perdus.length > 0) {
    console.log(`\n   ⚠️  Fiches qui PERDENT leur position :\n`);
    for (const r of perdus.slice(0, 15)) {
      console.log(`      ${pad(r.label, 26)} ${pad(r.city ?? '—', 24)} ${pad(r.postalCode ?? '—', 9)} était à ${fmt(r.before)}`);
    }
    if (perdus.length > 15) console.log(`      … et ${perdus.length - 15} autre(s).`);
  }

  if (dryRun) {
    console.log('\n   Aucune écriture effectuée. Relancer avec --apply pour appliquer.\n');
  }
  return rejected;
}
