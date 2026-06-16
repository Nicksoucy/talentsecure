import type { UniformDivision, UniformItem, UniformVariant } from '@/types/uniform';

/** Normalise : minuscules, sans accents, espaces compactés. */
export const norm = (s: string) =>
  (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();

export interface ParsedOrderLine {
  /** Texte original de l'article, ex. « Chemise à manches longue ». */
  raw: string;
  /** Texte original de la grandeur, ex. « XLarge ». */
  rawSize: string;
  qty: number;
}

export interface ParsedOrder {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  division: UniformDivision | null;
  /** « Date et heure de la collecte » → va dans les notes du brouillon. */
  collecte: string;
  /** Lignes de la section « Uniforme requis et grandeur ». */
  lines: ParsedOrderLine[];
  /** Items de la ligne « Autre » (dossard, lunettes…). */
  others: string[];
}

/** Valeur après le séparateur. Gère « Autre (exemple: …): valeur » (le « : »
 *  dans les parenthèses ne doit pas être pris) en privilégiant le « ): » / « ) ; ». */
function valueOf(line: string): string {
  const afterParen = line.match(/\)\s*[:;]\s*(.*)$/);
  if (afterParen) return afterParen[1].trim();
  const m = line.match(/[:;]\s*(.*)$/);
  return m ? m[1].trim() : '';
}

/** Détecte « rien / aucun / pas de … » pour ignorer les lignes vides. */
const isNone = (s: string) => /^(aucun|aucune|n\/?a|pas\b|non\b|néant|neant|-+)$/.test(norm(s));

/**
 * Parse une commande d'uniforme collée depuis Teams. Tolère « : » ou « ; » comme
 * séparateur et de légères variations de libellés. Déterministe (pas d'IA).
 */
export function parseUniformOrder(text: string): ParsedOrder {
  const out: ParsedOrder = {
    firstName: '', lastName: '', email: '', phone: '', division: null, collecte: '', lines: [], others: [],
  };
  const rawLines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  let fullName = '';

  for (const line of rawLines) {
    const n = norm(line);

    if (n.startsWith('nom de l') || n.startsWith('nom employe') || n.startsWith("nom de l'employe") || /^nom\b/.test(n)) {
      fullName = valueOf(line); continue;
    }
    if (n.startsWith('courriel') || n.startsWith('email') || n.startsWith('e-mail') || n.startsWith('e mail')) {
      const m = line.match(/[\w.+-]+@[\w-]+\.[\w.-]+/);
      out.email = m ? m[0] : valueOf(line);
      continue;
    }
    if (n.startsWith('numero de tel') || n.startsWith('telephone') || n.startsWith('no de tel') || n.startsWith('tel ') || n.startsWith('tel:')) {
      out.phone = valueOf(line); continue;
    }
    if (n.startsWith('division')) {
      const v = norm(valueOf(line));
      out.division = v.includes('signal') ? 'SIGNALISATION' : v.includes('secur') ? 'SECURITE' : null;
      continue;
    }
    if (n.startsWith('date et heure') || n.startsWith('date de la collecte') || n.startsWith('collecte') || n.startsWith('lieu')) {
      out.collecte = valueOf(line); continue;
    }
    if (n.startsWith('uniforme requis') || n.startsWith('uniforme et grandeur')) {
      continue; // simple marqueur de section
    }
    if (n.startsWith('autre')) {
      const v = valueOf(line);
      out.others = v.split(/[;,]/).map((s) => s.trim()).filter((s) => s && !isNone(s));
      continue;
    }

    // Ligne d'article : « Nom (qté): grandeur ». qté 0 (« Manteau (0) ») ignorée.
    const m = line.match(/^(.+?)\s*\((\d+)\)\s*[:;]?\s*(.*)$/);
    if (m) {
      const qty = parseInt(m[2], 10);
      if (qty > 0) {
        const rawSize = m[3].trim();
        out.lines.push({ raw: m[1].trim(), rawSize: isNone(rawSize) ? '' : rawSize, qty });
      }
      continue;
    }
  }

  const parts = fullName.split(/\s+/).filter(Boolean);
  out.firstName = parts[0] || '';
  out.lastName = parts.slice(1).join(' ');
  return out;
}

// ---------------------------------------------------------------------------
// Correspondance au catalogue
// ---------------------------------------------------------------------------

const SIZE_ALIASES: Record<string, string> = {
  'xsmall': 'XS', 'x-small': 'XS', 'tres petit': 'XS', 'xs': 'XS',
  'small': 'S', 'petit': 'S', 's': 'S',
  'medium': 'M', 'moyen': 'M', 'm': 'M',
  'large': 'L', 'grand': 'L', 'l': 'L',
  'xlarge': 'XL', 'x-large': 'XL', 'tres grand': 'XL', 'tg': 'XL', 'xl': 'XL',
  '2xlarge': '2XL', 'xxlarge': '2XL', 'xx-large': '2XL', 'xxl': '2XL', '2xl': '2XL',
  '3xlarge': '3XL', 'xxxlarge': '3XL', 'xxxl': '3XL', '3xl': '3XL',
};

/** « XLarge » → « XL », « Large » → « L », « 34 » → « 34 ». */
export function normalizeSize(sizeText: string): string {
  const n = norm(sizeText);
  if (!n) return '';
  if (SIZE_ALIASES[n]) return SIZE_ALIASES[n];
  const num = n.match(/\d{2,3}(\.5)?/);
  if (num) return num[0];
  return sizeText.trim().toUpperCase();
}

/**
 * Meilleure correspondance d'un libellé d'article au catalogue. Renvoie l'item
 * et un indicateur de confiance. Imparfait par nature (ex. couleur de chemise
 * non précisée) → l'aperçu permet à l'utilisateur de corriger.
 */
/**
 * Règles d'alias : on ASSUME la pièce standard par défaut (ex. chemise → grise,
 * pantalon → militaire) quand la commande n'est pas précise. La personne qui
 * donne les uniformes peut toujours changer dans l'aperçu. Chaque règle :
 *  - `when` : matche le libellé de la commande (texte normalisé) ;
 *  - `must` : tous ces motifs doivent être dans le nom de l'article ;
 *  - `prefer` : départage (ex. « gris » plutôt que « blanc »).
 */
/** Mots trop communs dans les noms d'articles → exclus du repli flou. */
const STOPWORDS = new Set([
  'securite', 'securites', 'signalisation', 'haute', 'visibilite', 'des', 'pour',
  'avec', 'taille', 'unique', 'grandeur', 'noir', 'noire', 'gris', 'grise', 'blanc', 'blanche',
]);

interface AliasRule { when: RegExp; must: RegExp[]; prefer?: RegExp }
const ALIAS_RULES: AliasRule[] = [
  // Chemises — défaut GRISE
  { when: /chemise.*(manches?\s*longue|\bml\b)/, must: [/chemise/, /\(ml\)/], prefer: /gris/ },
  { when: /chemise.*(manches?\s*courte|\bmc\b)/, must: [/chemise/, /\(mc\)/], prefer: /gris/ },
  { when: /chandail.*(longue|\bml\b)/, must: [/chandail/, /\(ml\)/] },
  { when: /chandail.*(courte|\bmc\b)/, must: [/chandail/, /\(mc\)/] },
  // Pantalon — défaut MILITAIRE
  { when: /pantalon/, must: [/pantalon/], prefer: /militaire/ },
  { when: /ceinture/, must: [/ceinture/] },
  { when: /manteau/, must: [/manteau/] },
  { when: /veston/, must: [/veston/] },
  { when: /\bpolo\b/, must: [/polo/] },
  { when: /cravate/, must: [/cravate/] },
  // Équipement / « Autre »
  { when: /dossard/, must: [/dossard/] },
  { when: /lunette/, must: [/lunette/] },
  { when: /\bgant/, must: [/gant/] },
  { when: /lampe|flashlight/, must: [/lampe/] },
  { when: /casque/, must: [/casque/] },
  { when: /gyrophare/, must: [/gyrophare/] },
  { when: /chapeau/, must: [/chapeau/] },
  { when: /plaque/, must: [/plaque/] },
];

export function matchItem(rawName: string, items: UniformItem[]): { item: UniformItem | null; confident: boolean } {
  const t = norm(rawName);
  if (!t) return { item: null, confident: false };

  // 1. Égalité normalisée.
  const exact = items.find((it) => norm(it.name) === t);
  if (exact) return { item: exact, confident: true };

  // 2. Règles d'alias : on assume la pièce standard.
  for (const rule of ALIAS_RULES) {
    if (!rule.when.test(t)) continue;
    const candidates = items.filter((it) => rule.must.every((m) => m.test(norm(it.name))));
    if (candidates.length === 0) continue;
    const picked = (rule.prefer && candidates.find((it) => rule.prefer!.test(norm(it.name)))) || candidates[0];
    return { item: picked, confident: true };
  }

  // 3. Recouvrement de mots-clés (le plus de tokens communs gagne). On ignore
  //    les mots trop communs (« sécurité », « haute visibilité »…) qui sinon
  //    feraient matcher n'importe quel « … de sécurité » sur le premier article.
  const tokens = t.split(' ').filter((w) => w.length > 2 && !STOPWORDS.has(w));
  let best: { it: UniformItem; score: number } | null = null;
  for (const it of items) {
    const inm = norm(it.name);
    const score = tokens.filter((w) => inm.includes(w)).length;
    if (score > 0 && (!best || score > best.score)) best = { it, score };
  }
  if (best) return { item: best.it, confident: false };

  return { item: null, confident: false };
}

/** Variante (grandeur) d'un item correspondant au texte de grandeur. */
export function matchVariant(item: UniformItem, sizeText: string): UniformVariant | null {
  const variants = (item.variants || []).filter((v) => v.isActive !== false);
  if (variants.length === 0) return null;
  if (item.isOneSize || variants.length === 1) return variants[0];
  const target = normalizeSize(sizeText);
  return variants.find((v) => norm(v.size) === norm(target)) || null;
}
