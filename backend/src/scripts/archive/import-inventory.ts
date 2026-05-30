/**
 * Import du stock réel depuis l'Excel Inventaire.xlsx (XGuard).
 * - Crée les items manquants au catalogue.
 * - Étend les variantes XS → 5XL (et passe les pantalons en alpha).
 * - Met à jour les quantités via mouvements ADJUST (ledger préservé).
 * - Renseigne l'emplacement physique de chaque variante.
 *
 * Idempotent : ré-exécutable, applique les valeurs cibles.
 */
import { prisma } from '../config/database';
import { applyMovement } from '../services/uniform-stock.service';
import { generateUniqueBarcode } from '../services/uniform-barcode.service';

type Div = 'SECURITE' | 'SIGNALISATION';
type Ptype = 'UNIFORME' | 'EQUIPEMENT';

const SIZE_FULL = ['XS', 'S', 'M', 'L', 'XL', '2XL', '3XL', '4XL', '5XL'];

interface ImportItem {
  catalogueName: string; // nom de l'item dans le catalogue TalentSecure
  division: Div;
  type: Ptype;
  isOneSize?: boolean;
  cost: number; // coût de remplacement (formulaire papier)
  isNew?: boolean; // créer si absent
  // qty par taille; si isOneSize, mettre 'Unique'
  stock: Record<string, { qty: number; empl?: string }>;
}

const ITEMS: ImportItem[] = [
  // ===== SÉCURITÉ — UNIFORME (sized) =====
  {
    catalogueName: 'Chemise grise (MC)', division: 'SECURITE', type: 'UNIFORME', cost: 40,
    stock: {
      XS: { qty: 30, empl: 'B4' }, S: { qty: 173, empl: 'B4-B5' }, M: { qty: 146, empl: 'B3-B5' },
      L: { qty: 29, empl: 'Étagère' }, XL: { qty: 89, empl: 'B6' }, '2XL': { qty: 34, empl: 'Étagère' },
      '3XL': { qty: 11, empl: 'B6' }, '4XL': { qty: 38, empl: 'B6' }, '5XL': { qty: 8, empl: 'B6' },
    },
  },
  {
    catalogueName: 'Chemise grise (ML)', division: 'SECURITE', type: 'UNIFORME', cost: 40,
    stock: {
      XS: { qty: 24, empl: 'B1' }, S: { qty: 218, empl: 'A6-B1' }, M: { qty: 173, empl: 'B2' },
      L: { qty: 79, empl: 'A6-B3' }, XL: { qty: 61, empl: 'B3' }, '2XL': { qty: 17, empl: 'B3' },
      '3XL': { qty: 38, empl: 'B4' }, '4XL': { qty: 8, empl: 'B3' }, '5XL': { qty: 20, empl: 'B4' },
    },
  },
  {
    catalogueName: 'Chemise blanche (complet)', division: 'SECURITE', type: 'UNIFORME', cost: 45,
    stock: { M: { qty: 3, empl: 'A7' }, L: { qty: 2, empl: 'A7' }, XL: { qty: 1, empl: 'A7' } },
  },
  {
    catalogueName: 'Chemise blanche (superviseur)', division: 'SECURITE', type: 'UNIFORME', cost: 40, isNew: true,
    stock: {
      S: { qty: 34, empl: 'A7-A8' }, M: { qty: 51, empl: 'A7-A8' }, L: { qty: 54, empl: 'A7-A8' },
      XL: { qty: 48, empl: 'A7-A8' }, '2XL': { qty: 20, empl: 'A7-A8' }, '3XL': { qty: 10, empl: 'A7-A8' },
      '4XL': { qty: 3, empl: 'A7-A8' },
    },
  },
  {
    catalogueName: 'Pantalon noir (militaire)', division: 'SECURITE', type: 'UNIFORME', cost: 65,
    stock: {
      XS: { qty: 39, empl: 'A1' }, S: { qty: 179, empl: 'A1-A2' }, L: { qty: 2, empl: 'A3' },
      XL: { qty: 1, empl: 'A3' }, '2XL': { qty: 1, empl: 'A3' }, '3XL': { qty: 4, empl: 'A4' },
    },
  },
  {
    catalogueName: 'Polo noir', division: 'SECURITE', type: 'UNIFORME', cost: 35,
    stock: {
      S: { qty: 35, empl: 'Étagère' }, M: { qty: 49, empl: 'Étagère' }, L: { qty: 27, empl: 'Étagère' },
      XL: { qty: 20, empl: 'Étagère' }, '4XL': { qty: 9, empl: 'Étagère' },
    },
  },
  {
    catalogueName: 'Manteau (3 en 1)', division: 'SECURITE', type: 'UNIFORME', cost: 250,
    stock: {
      S: { qty: 24, empl: 'C1' }, M: { qty: 15, empl: 'C2' }, L: { qty: 2, empl: 'C2' },
      XL: { qty: 7, empl: 'N/A' }, '3XL': { qty: 3, empl: 'C5' }, '4XL': { qty: 6, empl: 'C6' },
    },
  },
  {
    catalogueName: 'Coupe-vent', division: 'SECURITE', type: 'UNIFORME', cost: 60, isNew: true,
    stock: {
      S: { qty: 1, empl: 'C3' }, M: { qty: 4, empl: 'C3' }, L: { qty: 2, empl: 'C3' },
      XL: { qty: 2, empl: 'C3' }, '5XL': { qty: 2, empl: 'C3' },
    },
  },
  {
    catalogueName: 'Ceinture', division: 'SECURITE', type: 'UNIFORME', cost: 25,
    // L'Excel a un format ambigu (XS=132, L=9, 3XL=58) — import tel quel, à corriger dans l'app au besoin.
    stock: { XS: { qty: 132 }, L: { qty: 9 }, '3XL': { qty: 58 } },
  },

  // ===== SÉCURITÉ — UNIFORME (taille unique) =====
  { catalogueName: 'Cravate', division: 'SECURITE', type: 'UNIFORME', isOneSize: true, cost: 10, stock: { Unique: { qty: 83 } } },
  { catalogueName: 'Tuque A3', division: 'SECURITE', type: 'UNIFORME', isOneSize: true, cost: 10, isNew: true, stock: { Unique: { qty: 13 } } },
  { catalogueName: 'Casquette A3', division: 'SECURITE', type: 'UNIFORME', isOneSize: true, cost: 15, isNew: true, stock: { Unique: { qty: 9 } } },

  // ===== SÉCURITÉ — ÉQUIPEMENT =====
  { catalogueName: 'Lunette de sécurité', division: 'SECURITE', type: 'EQUIPEMENT', isOneSize: true, cost: 10, stock: { Unique: { qty: 69 } } },
  { catalogueName: 'Dossard de sécurité', division: 'SECURITE', type: 'EQUIPEMENT', isOneSize: true, cost: 25, stock: { Unique: { qty: 0 } } }, // "Dossard orange" Excel = 0
  { catalogueName: 'Plaque aimanté – Sécurité (P7)', division: 'SECURITE', type: 'EQUIPEMENT', isOneSize: true, cost: 20, stock: { Unique: { qty: 6 } } },
  { catalogueName: 'Gyrophare', division: 'SECURITE', type: 'EQUIPEMENT', isOneSize: true, cost: 50, stock: { Unique: { qty: 4 } } },
  { catalogueName: 'Lampe de poche', division: 'SECURITE', type: 'EQUIPEMENT', isOneSize: true, cost: 15, stock: { Unique: { qty: 10 } } },
  { catalogueName: 'Keybox', division: 'SECURITE', type: 'EQUIPEMENT', isOneSize: true, cost: 0, isNew: true, stock: { Unique: { qty: 3 } } },
  { catalogueName: 'Radio - Sécurité', division: 'SECURITE', type: 'EQUIPEMENT', isOneSize: true, cost: 0, isNew: true, stock: { Unique: { qty: 8 } } },
  { catalogueName: 'Détecteur métal', division: 'SECURITE', type: 'EQUIPEMENT', isOneSize: true, cost: 0, isNew: true, stock: { Unique: { qty: 27 } } },
  { catalogueName: 'Micro - Sécurité', division: 'SECURITE', type: 'EQUIPEMENT', isOneSize: true, cost: 0, isNew: true, stock: { Unique: { qty: 0 } } },

  // ===== SIGNALISATION — UNIFORME (sized) =====
  {
    catalogueName: 'Pantalon haute visibilité (Été)', division: 'SIGNALISATION', type: 'UNIFORME', cost: 55,
    stock: { L: { qty: 11 }, XL: { qty: 10 }, '2XL': { qty: 11 }, '3XL': { qty: 8 }, '4XL': { qty: 2 } },
  },
  {
    catalogueName: 'Pantalon haute visibilité (Hiver)', division: 'SIGNALISATION', type: 'UNIFORME', cost: 95,
    stock: { M: { qty: 5 }, XL: { qty: 4 }, '2XL': { qty: 3 }, '4XL': { qty: 1 } },
  },
  {
    catalogueName: 'Pantalon haute visibilité (Imperméable)', division: 'SIGNALISATION', type: 'UNIFORME', cost: 55,
    stock: { S: { qty: 5 }, M: { qty: 14 }, L: { qty: 11 }, XL: { qty: 22 }, '2XL': { qty: 13 }, '3XL': { qty: 8 }, '4XL': { qty: 5 } },
  },
  {
    catalogueName: 'Manteau haute visibilité (Imperméable)', division: 'SIGNALISATION', type: 'UNIFORME', cost: 65,
    stock: { S: { qty: 10 }, M: { qty: 11 }, L: { qty: 13 }, XL: { qty: 17 }, '2XL': { qty: 8 }, '3XL': { qty: 12 }, '4XL': { qty: 3 } },
  },
  {
    catalogueName: 'Manteau haute visibilité (Hiver)', division: 'SIGNALISATION', type: 'UNIFORME', cost: 250,
    stock: { S: { qty: 3 }, M: { qty: 4 }, L: { qty: 2 }, XL: { qty: 1 } },
  },
  {
    catalogueName: 'Chandail haute visibilité (MC)', division: 'SIGNALISATION', type: 'UNIFORME', cost: 25,
    stock: { S: { qty: 13 }, M: { qty: 15 }, L: { qty: 21 }, XL: { qty: 25 }, '2XL': { qty: 8 }, '3XL': { qty: 8 }, '4XL': { qty: 1 } },
  },
  {
    catalogueName: 'Chandail haute visibilité (ML)', division: 'SIGNALISATION', type: 'UNIFORME', cost: 35,
    stock: { S: { qty: 10 }, M: { qty: 4 }, L: { qty: 5 }, '2XL': { qty: 17 }, '3XL': { qty: 6 }, '4XL': { qty: 8 } },
  },
  {
    catalogueName: 'Combinaison (one piece) d\'été', division: 'SIGNALISATION', type: 'UNIFORME', cost: 75, isNew: true,
    stock: { S: { qty: 6 }, M: { qty: 1 } },
  },

  // ===== SIGNALISATION — UNIFORME (taille unique) =====
  { catalogueName: 'Casque de sécurité', division: 'SIGNALISATION', type: 'UNIFORME', isOneSize: true, cost: 35, stock: { Unique: { qty: 17 } } },
  { catalogueName: 'Dossard de sécurité', division: 'SIGNALISATION', type: 'UNIFORME', isOneSize: true, cost: 25, stock: { Unique: { qty: 0 } } }, // Dossard orange
  { catalogueName: 'Dossard sécurité jaune', division: 'SIGNALISATION', type: 'UNIFORME', isOneSize: true, cost: 25, isNew: true, stock: { Unique: { qty: 27 } } },
  { catalogueName: 'Chapeau de pluie', division: 'SIGNALISATION', type: 'UNIFORME', isOneSize: true, cost: 15, stock: { Unique: { qty: 79 } } },
];

async function ensureItem(it: ImportItem) {
  const existing = await prisma.uniformItem.findFirst({
    where: { division: it.division, name: it.catalogueName },
  });
  if (existing) return existing;
  return prisma.uniformItem.create({
    data: {
      division: it.division, type: it.type, name: it.catalogueName,
      isOneSize: !!it.isOneSize, defaultReplacementCost: it.cost, sortOrder: 0,
    },
  });
}

async function ensureVariant(itemId: string, size: string, cost: number) {
  let v = await prisma.uniformVariant.findUnique({ where: { itemId_size: { itemId, size } } });
  if (v) return v;
  const barcode = await generateUniqueBarcode();
  v = await prisma.uniformVariant.create({
    data: { itemId, size, barcode, replacementCost: cost, quantityOnHand: 0 },
  });
  return v;
}

async function setStock(variantId: string, target: number, reason: string) {
  const v = await prisma.uniformVariant.findUnique({ where: { id: variantId } });
  if (!v) return;
  const delta = target - v.quantityOnHand;
  if (delta === 0) return;
  await prisma.$transaction((tx) => applyMovement(tx, {
    variantId, type: 'ADJUST', quantity: delta, reason,
  }));
}

(async () => {
  console.log('\n=== IMPORT INVENTAIRE EXCEL ===\n');
  const touchedVariantIds = new Set<string>();

  let createdItems = 0, createdVariants = 0, adjusted = 0;

  for (const it of ITEMS) {
    const item = await ensureItem(it);
    if (it.isNew) {
      const wasNew = await prisma.uniformItem.findFirst({ where: { id: item.id, createdAt: { gte: new Date(Date.now() - 5000) } } });
      if (wasNew) createdItems++;
    }

    // Pour les items sized, on s'assure que toutes les tailles XS→5XL existent
    const sizesNeeded = it.isOneSize ? ['Unique'] : SIZE_FULL;
    for (const sz of sizesNeeded) {
      const before = await prisma.uniformVariant.findUnique({ where: { itemId_size: { itemId: item.id, size: sz } } });
      const v = await ensureVariant(item.id, sz, it.cost);
      if (!before) createdVariants++;
      touchedVariantIds.add(v.id);

      const spec = it.stock[sz];
      const target = spec?.qty ?? 0;
      const empl = spec?.empl ?? null;

      await setStock(v.id, target, `Import inventaire Excel — ${it.catalogueName} ${sz}`);
      adjusted++;

      // Met à jour l'emplacement (et réactive si désactivée)
      await prisma.uniformVariant.update({
        where: { id: v.id },
        data: { emplacement: empl, isActive: true },
      });
    }
  }

  // Zéro pour toutes les autres variantes actives non touchées (et désactivation des pantalons numériques)
  const others = await prisma.uniformVariant.findMany({ where: { isActive: true, id: { notIn: [...touchedVariantIds] } }, include: { item: true } });
  let zeroed = 0, deactivatedNumeric = 0;
  for (const v of others) {
    if (v.quantityOnHand !== 0) {
      await setStock(v.id, 0, 'Reset stock — import inventaire Excel');
      zeroed++;
    }
    // Désactive les anciennes variantes numériques des pantalons (28-44)
    const isNumeric = /^\d+$/.test(v.size);
    const isPantalon = v.item.name.toLowerCase().includes('pantalon');
    if (isNumeric && isPantalon) {
      await prisma.uniformVariant.update({ where: { id: v.id }, data: { isActive: false } });
      deactivatedNumeric++;
    }
  }

  console.log(`Items créés cette exécution    : ${createdItems}`);
  console.log(`Variantes créées cette exécution: ${createdVariants}`);
  console.log(`Variantes ajustées (stock)     : ${adjusted}`);
  console.log(`Autres variantes mises à 0     : ${zeroed}`);
  console.log(`Variantes pantalon numériques désactivées : ${deactivatedNumeric}`);
  const total = await prisma.uniformVariant.aggregate({ where: { isActive: true }, _sum: { quantityOnHand: true } });
  console.log(`\nStock total (variantes actives) : ${total._sum.quantityOnHand}`);
  await prisma.$disconnect();
})().catch((e) => { console.error(e); process.exit(1); });
