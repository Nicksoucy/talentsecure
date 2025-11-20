import { PrismaClient, SkillCategory } from '@prisma/client';

const prisma = new PrismaClient();

interface SkillData {
  name: string;
  category: SkillCategory;
  description?: string;
  keywords: string[];
}

const commonSkills: SkillData[] = [
  // ========== CERTIFICATIONS ==========
  {
    name: 'BSP (Bureau de la Sécurité Privée)',
    category: 'CERTIFICATION',
    description: 'Permis obligatoire pour travailler comme agent de sécurité au Québec',
    keywords: ['bsp', 'bureau de la sécurité privée', 'permis bsp', 'carte bsp'],
  },
  {
    name: 'Premiers Soins',
    category: 'CERTIFICATION',
    description: 'Formation en premiers soins et RCR',
    keywords: ['premiers soins', 'first aid', 'rcr', 'rcp', 'secourisme'],
  },
  {
    name: 'RCR (Réanimation Cardio-Respiratoire)',
    category: 'CERTIFICATION',
    description: 'Certification en réanimation cardio-respiratoire',
    keywords: ['rcr', 'rcp', 'cpr', 'réanimation'],
  },
  {
    name: 'Formation SIMDUT',
    category: 'CERTIFICATION',
    description: 'Système d\'information sur les matières dangereuses utilisées au travail',
    keywords: ['simdut', 'whmis', 'matières dangereuses'],
  },
  {
    name: 'Permis de Conduire Classe 1',
    category: 'CERTIFICATION',
    description: 'Permis pour conduire des semi-remorques',
    keywords: ['classe 1', 'class 1', 'semi-remorque', 'camion lourd'],
  },
  {
    name: 'Permis de Conduire Classe 2',
    category: 'CERTIFICATION',
    description: 'Permis pour conduire des autobus',
    keywords: ['classe 2', 'class 2', 'autobus', 'bus'],
  },
  {
    name: 'Permis de Conduire Classe 3',
    category: 'CERTIFICATION',
    description: 'Permis pour conduire des camions porteurs',
    keywords: ['classe 3', 'class 3', 'camion porteur'],
  },
  {
    name: 'Permis de Conduire Classe 4A/4B',
    category: 'CERTIFICATION',
    description: 'Permis pour conduire un véhicule d\'urgence ou un taxi',
    keywords: ['classe 4', 'class 4', 'taxi', 'ambulance', 'urgence'],
  },
  {
    name: 'Permis de Conduire Classe 5',
    category: 'CERTIFICATION',
    description: 'Permis de conduire régulier',
    keywords: ['classe 5', 'class 5', 'permis de conduire', 'driver license'],
  },
  {
    name: 'Carte ASP Construction',
    category: 'CERTIFICATION',
    description: 'Carte de compétence pour travailler sur les chantiers de construction',
    keywords: ['asp construction', 'carte asp', 'ccq', 'construction'],
  },
  {
    name: 'Formation Chariot Élévateur',
    category: 'CERTIFICATION',
    description: 'Certification pour opérer un chariot élévateur',
    keywords: ['chariot élévateur', 'forklift', 'cariste'],
  },
  {
    name: 'Formation Nacelle',
    category: 'CERTIFICATION',
    description: 'Certification pour opérer une nacelle élévatrice',
    keywords: ['nacelle', 'plateforme élévatrice', 'boom lift'],
  },
  {
    name: 'SAAQ Examen Mécanique',
    category: 'CERTIFICATION',
    description: 'Certification pour effectuer des inspections mécaniques SAAQ',
    keywords: ['saaq', 'inspection mécanique', 'inspection'],
  },

  // ========== SOFT SKILLS ==========
  {
    name: 'Service à la Clientèle',
    category: 'SOFT_SKILL',
    description: 'Compétences en service client et relation client',
    keywords: ['service client', 'customer service', 'relation client'],
  },
  {
    name: 'Leadership',
    category: 'SOFT_SKILL',
    description: 'Capacité à diriger et motiver une équipe',
    keywords: ['leadership', 'gestion d\'équipe', 'chef d\'équipe', 'superviseur'],
  },
  {
    name: 'Communication',
    category: 'SOFT_SKILL',
    description: 'Excellentes compétences en communication verbale et écrite',
    keywords: ['communication', 'communication verbale', 'communication écrite'],
  },
  {
    name: 'Travail d\'Équipe',
    category: 'SOFT_SKILL',
    description: 'Capacité à travailler efficacement en équipe',
    keywords: ['travail d\'équipe', 'teamwork', 'collaboration'],
  },
  {
    name: 'Résolution de Problèmes',
    category: 'SOFT_SKILL',
    description: 'Capacité à identifier et résoudre des problèmes',
    keywords: ['résolution de problèmes', 'problem solving', 'analyse'],
  },
  {
    name: 'Gestion du Temps',
    category: 'SOFT_SKILL',
    description: 'Capacité à gérer son temps et ses priorités',
    keywords: ['gestion du temps', 'time management', 'organisation'],
  },
  {
    name: 'Adaptabilité',
    category: 'SOFT_SKILL',
    description: 'Capacité à s\'adapter aux changements',
    keywords: ['adaptabilité', 'flexibilité', 'adaptation'],
  },
  {
    name: 'Gestion du Stress',
    category: 'SOFT_SKILL',
    description: 'Capacité à gérer le stress et la pression',
    keywords: ['gestion du stress', 'stress management', 'pression'],
  },
  {
    name: 'Attention aux Détails',
    category: 'SOFT_SKILL',
    description: 'Souci du détail et rigueur',
    keywords: ['attention aux détails', 'rigueur', 'précision'],
  },
  {
    name: 'Autonomie',
    category: 'SOFT_SKILL',
    description: 'Capacité à travailler de manière autonome',
    keywords: ['autonomie', 'indépendant', 'auto-gestion'],
  },

  // ========== INDUSTRY: SÉCURITÉ ==========
  {
    name: 'Surveillance et Patrouille',
    category: 'INDUSTRY',
    description: 'Expérience en surveillance et patrouille de sécurité',
    keywords: ['surveillance', 'patrouille', 'ronde de sécurité', 'security patrol'],
  },
  {
    name: 'Contrôle d\'Accès',
    category: 'INDUSTRY',
    description: 'Gestion des accès et contrôle des entrées',
    keywords: ['contrôle d\'accès', 'access control', 'gestion des accès'],
  },
  {
    name: 'Gestion de Conflits',
    category: 'INDUSTRY',
    description: 'Résolution de conflits et gestion de situations difficiles',
    keywords: ['gestion de conflits', 'médiation', 'résolution de conflits'],
  },
  {
    name: 'Intervention d\'Urgence',
    category: 'INDUSTRY',
    description: 'Capacité à intervenir en situation d\'urgence',
    keywords: ['intervention d\'urgence', 'urgence', 'emergency response'],
  },
  {
    name: 'Rédaction de Rapports',
    category: 'INDUSTRY',
    description: 'Rédaction de rapports d\'incident et de surveillance',
    keywords: ['rédaction de rapports', 'rapport d\'incident', 'documentation'],
  },
  {
    name: 'Systèmes de Sécurité',
    category: 'INDUSTRY',
    description: 'Connaissance des systèmes de sécurité électroniques',
    keywords: ['systèmes de sécurité', 'alarme', 'caméra', 'vidéosurveillance'],
  },

  // ========== INDUSTRY: AUTOMOBILE ==========
  {
    name: 'Mécanique Automobile',
    category: 'INDUSTRY',
    description: 'Réparation et entretien de véhicules automobiles',
    keywords: ['mécanique automobile', 'mécanicien', 'réparation auto'],
  },
  {
    name: 'Carrosserie',
    category: 'INDUSTRY',
    description: 'Réparation de carrosserie et peinture automobile',
    keywords: ['carrosserie', 'débosselage', 'peinture auto'],
  },
  {
    name: 'Diagnostic Électronique',
    category: 'INDUSTRY',
    description: 'Diagnostic et réparation des systèmes électroniques automobiles',
    keywords: ['diagnostic', 'électronique auto', 'scanner', 'obd'],
  },
  {
    name: 'Entretien Préventif',
    category: 'INDUSTRY',
    description: 'Entretien préventif et changements d\'huile',
    keywords: ['entretien', 'maintenance', 'changement d\'huile'],
  },
  {
    name: 'Freins et Suspension',
    category: 'INDUSTRY',
    description: 'Réparation de freins et systèmes de suspension',
    keywords: ['freins', 'suspension', 'amortisseurs'],
  },
  {
    name: 'Pneus et Alignement',
    category: 'INDUSTRY',
    description: 'Installation de pneus et alignement de roues',
    keywords: ['pneus', 'alignement', 'balancement', 'tire'],
  },

  // ========== INDUSTRY: CONSTRUCTION/CHARPENTERIE ==========
  {
    name: 'Charpenterie',
    category: 'INDUSTRY',
    description: 'Travaux de charpenterie et menuiserie',
    keywords: ['charpentier', 'menuisier', 'charpenterie', 'menuiserie'],
  },
  {
    name: 'Lecture de Plans',
    category: 'INDUSTRY',
    description: 'Lecture et interprétation de plans de construction',
    keywords: ['lecture de plans', 'blueprint', 'plans', 'devis'],
  },
  {
    name: 'Coffrage',
    category: 'INDUSTRY',
    description: 'Installation et retrait de coffrages',
    keywords: ['coffrage', 'béton', 'formwork'],
  },
  {
    name: 'Finition Intérieure',
    category: 'INDUSTRY',
    description: 'Travaux de finition intérieure (gypse, peinture, etc.)',
    keywords: ['finition', 'gypse', 'drywall', 'peinture'],
  },
  {
    name: 'Toiture',
    category: 'INDUSTRY',
    description: 'Installation et réparation de toitures',
    keywords: ['toiture', 'couvreur', 'roofing', 'bardeaux'],
  },
  {
    name: 'Plomberie',
    category: 'INDUSTRY',
    description: 'Installation et réparation de systèmes de plomberie',
    keywords: ['plomberie', 'plumber', 'tuyauterie'],
  },
  {
    name: 'Électricité',
    category: 'INDUSTRY',
    description: 'Travaux électriques et installation',
    keywords: ['électricité', 'électricien', 'electrical', 'câblage'],
  },
  {
    name: 'Soudure',
    category: 'INDUSTRY',
    description: 'Soudure de métaux',
    keywords: ['soudure', 'welder', 'welding', 'soudeur'],
  },

  // ========== TECHNICAL: INFORMATIQUE ==========
  {
    name: 'Microsoft Office',
    category: 'TECHNICAL',
    description: 'Suite Microsoft Office (Word, Excel, PowerPoint)',
    keywords: ['microsoft office', 'word', 'excel', 'powerpoint', 'outlook'],
  },
  {
    name: 'Excel Avancé',
    category: 'TECHNICAL',
    description: 'Utilisation avancée d\'Excel (tableaux croisés, macros, VBA)',
    keywords: ['excel avancé', 'tableaux croisés', 'pivot table', 'vba', 'macros'],
  },
  {
    name: 'Saisie de Données',
    category: 'TECHNICAL',
    description: 'Saisie rapide et précise de données',
    keywords: ['saisie de données', 'data entry', 'frappe', 'typing'],
  },
  {
    name: 'Comptabilité',
    category: 'TECHNICAL',
    description: 'Connaissances en comptabilité et tenue de livres',
    keywords: ['comptabilité', 'accounting', 'bookkeeping', 'tenue de livres'],
  },
  {
    name: 'QuickBooks',
    category: 'TECHNICAL',
    description: 'Utilisation du logiciel QuickBooks',
    keywords: ['quickbooks', 'sage', 'comptabilité'],
  },
  {
    name: 'Réseaux Sociaux',
    category: 'TECHNICAL',
    description: 'Gestion de réseaux sociaux et marketing numérique',
    keywords: ['réseaux sociaux', 'social media', 'facebook', 'instagram', 'linkedin'],
  },

  // ========== TOOL_EQUIPMENT ==========
  {
    name: 'Chariot Élévateur',
    category: 'TOOL_EQUIPMENT',
    description: 'Opération de chariots élévateurs',
    keywords: ['chariot élévateur', 'forklift', 'cariste', 'lift'],
  },
  {
    name: 'Nacelle Élévatrice',
    category: 'TOOL_EQUIPMENT',
    description: 'Opération de nacelles et plateformes élévatrices',
    keywords: ['nacelle', 'plateforme élévatrice', 'boom lift', 'scissor lift'],
  },
  {
    name: 'Équipement Lourd',
    category: 'TOOL_EQUIPMENT',
    description: 'Opération d\'équipement lourd de construction',
    keywords: ['équipement lourd', 'excavatrice', 'bulldozer', 'heavy equipment'],
  },
  {
    name: 'Outils Électriques',
    category: 'TOOL_EQUIPMENT',
    description: 'Utilisation d\'outils électriques (perceuse, scie, etc.)',
    keywords: ['outils électriques', 'power tools', 'perceuse', 'scie'],
  },
  {
    name: 'Systèmes de Caméras',
    category: 'TOOL_EQUIPMENT',
    description: 'Installation et configuration de systèmes de vidéosurveillance',
    keywords: ['caméras', 'cctv', 'vidéosurveillance', 'surveillance camera'],
  },
  {
    name: 'Systèmes d\'Alarme',
    category: 'TOOL_EQUIPMENT',
    description: 'Installation et maintenance de systèmes d\'alarme',
    keywords: ['alarme', 'alarm system', 'système d\'alarme'],
  },
  {
    name: 'Contrôle d\'Accès Électronique',
    category: 'TOOL_EQUIPMENT',
    description: 'Systèmes de contrôle d\'accès par carte ou biométrie',
    keywords: ['contrôle d\'accès', 'badge', 'carte rfid', 'biométrie'],
  },

  // ========== ADDITIONAL SOFT SKILLS ==========
  {
    name: 'Ponctualité',
    category: 'SOFT_SKILL',
    description: 'Assiduité et ponctualité au travail',
    keywords: ['ponctualité', 'assiduité', 'reliability'],
  },
  {
    name: 'Esprit d\'Initiative',
    category: 'SOFT_SKILL',
    description: 'Capacité à prendre des initiatives',
    keywords: ['initiative', 'proactif', 'proactive'],
  },
  {
    name: 'Gestion de Priorités',
    category: 'SOFT_SKILL',
    description: 'Capacité à gérer et prioriser les tâches',
    keywords: ['priorités', 'prioritization', 'gestion des priorités'],
  },
  {
    name: 'Professionnalisme',
    category: 'SOFT_SKILL',
    description: 'Attitude professionnelle et éthique de travail',
    keywords: ['professionnalisme', 'professionalism', 'éthique'],
  },
  {
    name: 'Empathie',
    category: 'SOFT_SKILL',
    description: 'Capacité à comprendre et partager les sentiments d\'autrui',
    keywords: ['empathie', 'empathy', 'compassion'],
  },
  {
    name: 'Pensée Critique',
    category: 'SOFT_SKILL',
    description: 'Capacité d\'analyse et de pensée critique',
    keywords: ['pensée critique', 'critical thinking', 'analyse'],
  },
  {
    name: 'Créativité',
    category: 'SOFT_SKILL',
    description: 'Créativité et innovation',
    keywords: ['créativité', 'creativity', 'innovation'],
  },

  // ========== INDUSTRY: VENTE/COMMERCE ==========
  {
    name: 'Vente au Détail',
    category: 'INDUSTRY',
    description: 'Expérience en vente au détail',
    keywords: ['vente', 'retail', 'vente au détail', 'commis'],
  },
  {
    name: 'Caisse',
    category: 'INDUSTRY',
    description: 'Opération de caisse enregistreuse',
    keywords: ['caisse', 'cashier', 'caissier', 'pos'],
  },
  {
    name: 'Gestion d\'Inventaire',
    category: 'INDUSTRY',
    description: 'Gestion et contrôle des inventaires',
    keywords: ['inventaire', 'inventory', 'stock', 'gestion de stock'],
  },
  {
    name: 'Marchandisage',
    category: 'INDUSTRY',
    description: 'Présentation et mise en valeur de produits',
    keywords: ['marchandisage', 'merchandising', 'étalage', 'display'],
  },

  // ========== INDUSTRY: RESTAURATION ==========
  {
    name: 'Service en Salle',
    category: 'INDUSTRY',
    description: 'Service aux tables dans un restaurant',
    keywords: ['serveur', 'serveuse', 'service en salle', 'waiter'],
  },
  {
    name: 'Cuisine',
    category: 'INDUSTRY',
    description: 'Préparation et cuisson d\'aliments',
    keywords: ['cuisine', 'cuisinier', 'chef', 'cook'],
  },
  {
    name: 'Hygiène et Salubrité',
    category: 'INDUSTRY',
    description: 'Normes d\'hygiène et salubrité alimentaire',
    keywords: ['hygiène', 'salubrité', 'mapaq', 'food safety'],
  },
  {
    name: 'Barista',
    category: 'INDUSTRY',
    description: 'Préparation de café et boissons',
    keywords: ['barista', 'café', 'coffee', 'espresso'],
  },

  // ========== INDUSTRY: LOGISTIQUE ==========
  {
    name: 'Réception et Expédition',
    category: 'INDUSTRY',
    description: 'Réception et expédition de marchandises',
    keywords: ['réception', 'expédition', 'shipping', 'receiving'],
  },
  {
    name: 'Préparation de Commandes',
    category: 'INDUSTRY',
    description: 'Picking et préparation de commandes',
    keywords: ['picking', 'préparation de commandes', 'order picking'],
  },
  {
    name: 'Manutention',
    category: 'INDUSTRY',
    description: 'Manutention de marchandises',
    keywords: ['manutention', 'handling', 'chargement', 'déchargement'],
  },
  {
    name: 'Gestion d\'Entrepôt',
    category: 'INDUSTRY',
    description: 'Gestion et organisation d\'entrepôt',
    keywords: ['entrepôt', 'warehouse', 'gestion d\'entrepôt'],
  },

  // ========== INDUSTRY: SANTÉ ==========
  {
    name: 'Soins aux Patients',
    category: 'INDUSTRY',
    description: 'Soins et assistance aux patients',
    keywords: ['soins', 'patient care', 'pab', 'préposé aux bénéficiaires'],
  },
  {
    name: 'Aide à Domicile',
    category: 'INDUSTRY',
    description: 'Services d\'aide à domicile pour personnes âgées',
    keywords: ['aide à domicile', 'home care', 'maintien à domicile'],
  },
  {
    name: 'Soins Infirmiers',
    category: 'INDUSTRY',
    description: 'Compétences en soins infirmiers',
    keywords: ['infirmier', 'infirmière', 'nursing', 'soins infirmiers'],
  },

  // ========== INDUSTRY: NETTOYAGE ==========
  {
    name: 'Entretien Ménager',
    category: 'INDUSTRY',
    description: 'Entretien ménager résidentiel et commercial',
    keywords: ['entretien ménager', 'housekeeping', 'nettoyage', 'cleaning'],
  },
  {
    name: 'Entretien Industriel',
    category: 'INDUSTRY',
    description: 'Entretien de bâtiments industriels',
    keywords: ['entretien industriel', 'maintenance', 'concierge'],
  },

  // ========== INDUSTRY: TRANSPORT ==========
  {
    name: 'Livraison',
    category: 'INDUSTRY',
    description: 'Livraison de marchandises ou colis',
    keywords: ['livraison', 'delivery', 'chauffeur-livreur'],
  },
  {
    name: 'Transport de Personnes',
    category: 'INDUSTRY',
    description: 'Transport de personnes (taxi, covoiturage)',
    keywords: ['transport', 'taxi', 'uber', 'chauffeur'],
  },
  {
    name: 'Transport Longue Distance',
    category: 'INDUSTRY',
    description: 'Transport routier longue distance',
    keywords: ['transport longue distance', 'camionneur', 'trucker'],
  },

  // ========== ADDITIONAL CERTIFICATIONS ==========
  {
    name: 'Formation Travail en Hauteur',
    category: 'CERTIFICATION',
    description: 'Certification pour travail en hauteur',
    keywords: ['travail en hauteur', 'fall protection', 'harnais'],
  },
  {
    name: 'Formation Espace Clos',
    category: 'CERTIFICATION',
    description: 'Formation pour travail en espace clos',
    keywords: ['espace clos', 'confined space'],
  },
  {
    name: 'Cadenassage',
    category: 'CERTIFICATION',
    description: 'Procédures de cadenassage et étiquetage',
    keywords: ['cadenassage', 'lockout', 'tagout', 'loto'],
  },
  {
    name: 'Formation Extincteur',
    category: 'CERTIFICATION',
    description: 'Formation sur l\'utilisation d\'extincteurs',
    keywords: ['extincteur', 'fire extinguisher', 'prévention incendie'],
  },
  {
    name: 'Évacuation d\'Urgence',
    category: 'CERTIFICATION',
    description: 'Formation sur les procédures d\'évacuation',
    keywords: ['évacuation', 'emergency evacuation', 'drill'],
  },

  // ========== TECHNICAL: DESIGN/CRÉATIF ==========
  {
    name: 'Adobe Photoshop',
    category: 'TECHNICAL',
    description: 'Utilisation d\'Adobe Photoshop',
    keywords: ['photoshop', 'adobe', 'retouche photo'],
  },
  {
    name: 'Adobe Illustrator',
    category: 'TECHNICAL',
    description: 'Utilisation d\'Adobe Illustrator',
    keywords: ['illustrator', 'adobe', 'design graphique'],
  },
  {
    name: 'Design Graphique',
    category: 'TECHNICAL',
    description: 'Compétences en design graphique',
    keywords: ['design graphique', 'graphic design', 'graphiste'],
  },
  {
    name: 'Montage Vidéo',
    category: 'TECHNICAL',
    description: 'Montage et édition vidéo',
    keywords: ['montage vidéo', 'video editing', 'premiere', 'final cut'],
  },

  // ========== LANGUAGES (complément au model Language existant) ==========
  {
    name: 'Français Langue Maternelle',
    category: 'LANGUAGE',
    description: 'Français langue maternelle',
    keywords: ['français', 'french', 'langue maternelle'],
  },
  {
    name: 'Anglais Bilingue',
    category: 'LANGUAGE',
    description: 'Anglais niveau bilingue',
    keywords: ['anglais', 'english', 'bilingual', 'bilingue'],
  },
  {
    name: 'Espagnol',
    category: 'LANGUAGE',
    description: 'Espagnol parlé et écrit',
    keywords: ['espagnol', 'spanish'],
  },
];

async function seedSkills() {
  console.log('🌱 Starting skills seeding...\n');

  let created = 0;
  let skipped = 0;

  for (const skillData of commonSkills) {
    try {
      await prisma.skill.upsert({
        where: { name: skillData.name },
        update: {},
        create: {
          name: skillData.name,
          category: skillData.category,
          description: skillData.description,
          keywords: skillData.keywords,
          isActive: true,
        },
      });
      created++;
      console.log(`✅ Created: ${skillData.name} (${skillData.category})`);
    } catch (error) {
      skipped++;
      console.log(`⏭️  Skipped: ${skillData.name} (already exists)`);
    }
  }

  console.log(`\n📊 Summary:`);
  console.log(`   ✅ Created: ${created} skills`);
  console.log(`   ⏭️  Skipped: ${skipped} skills`);
  console.log(`   📦 Total: ${commonSkills.length} skills`);

  // Count by category
  console.log(`\n📁 Skills by category:`);
  const categoryCounts: Record<string, number> = {};
  commonSkills.forEach((skill) => {
    categoryCounts[skill.category] = (categoryCounts[skill.category] || 0) + 1;
  });

  Object.entries(categoryCounts)
    .sort((a, b) => b[1] - a[1])
    .forEach(([category, count]) => {
      console.log(`   ${category}: ${count} skills`);
    });

  console.log('\n✨ Skills seeding completed!\n');
}

seedSkills()
  .catch((error) => {
    console.error('❌ Error seeding skills:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
