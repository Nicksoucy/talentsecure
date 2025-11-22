import { PrismaClient, SkillCategory } from '@prisma/client';

const prisma = new PrismaClient();

const SECURITY_KEYWORDS = [
    'bsp', 'gardien', 'securite', 'security', 'surveillance', 'patrouille',
    'camera', 'cctv', 'secourisme', 'rcr', 'dea', 'premiers soins', 'first aid',
    'intervention', 'ssiap', 'agent de prevention', 'garde du corps', 'bodyguard',
    'controle acces', 'fouille', 'detecteur', 'alarme', 'vigile', 'portier'
];

const LANGUAGE_KEYWORDS = [
    'francais', 'french', 'anglais', 'english', 'espagnol', 'spanish',
    'arabe', 'arabic', 'mandarin', 'chinois', 'portugais', 'portuguese',
    'italien', 'italian', 'allemand', 'german', 'russe', 'russian',
    'bilingue', 'bilingual', 'trilingue', 'langue', 'language'
];

const EQUIPMENT_KEYWORDS = [
    'chariot', 'forklift', 'cariste', 'grue', 'crane', 'nacelle',
    'machinerie lourde', 'heavy machinery', 'excavatrice', 'bulldozer',
    'camion', 'truck', 'classe 1', 'classe 3', 'classe 5', 'permis de conduire'
];

const MANUAL_TECHNICAL_KEYWORDS = [
    'soudure', 'welding', 'tig', 'mig', 'arc', 'construction', 'peinture',
    'plomberie', 'plumber', 'electricite', 'electrician', 'mecanique', 'mechanic',
    'menuiserie', 'carpentry', 'charpenterie', 'beton', 'concrete', 'ciment',
    'paysagement', 'landscaping', 'deneigement', 'usine', 'factory', 'assemblage',
    'montage', 'cnc', 'outil', 'tool', 'maintenance'
];

const CHILDCARE_KEYWORDS = [
    'cpe', 'garderie', 'daycare', 'petite enfance', 'early childhood',
    'educatrice', 'educator', 'enfant', 'child', 'bambin', 'toddler',
    'prescolaire', 'preschool', 'aec petite enfance', 'dec petite enfance'
];

const IT_KEYWORDS = [
    'programmation', 'programming', 'java', 'python', 'javascript', 'c++',
    'sql', 'database', 'reseau', 'network', 'cisco', 'linux', 'windows server',
    'cybersecurite', 'cybersecurity', 'developpeur', 'developer', 'web',
    'html', 'css', 'react', 'angular', 'node'
];

const ADMIN_KEYWORDS = [
    'excel', 'word', 'office', 'outlook', 'powerpoint', 'administration',
    'secretaire', 'secretary', 'reception', 'receptionist', 'classement',
    'facturation', 'billing', 'comptabilite', 'accounting', 'data entry',
    'saisie', 'gestion', 'management', 'planification', 'organisation',
    'bureau', 'clerical'
];

const CERTIFICATION_KEYWORDS = [
    'certification', 'certified', 'diplome', 'degree', 'formation', 'training',
    'permis', 'license', 'carte', 'card', 'accréditation', 'accreditation'
];

async function main() {
    console.log('Starting skill categorization...');

    const skills = await prisma.skill.findMany();
    console.log(`Found ${skills.length} skills to process.`);

    let updatedCount = 0;

    for (const skill of skills) {
        const lowerName = skill.name.toLowerCase();
        const lowerKeywords = skill.keywords.map(k => k.toLowerCase()).join(' ');
        const searchText = `${lowerName} ${lowerKeywords}`;

        let category: SkillCategory = 'OTHER';
        let isSecurityRelated = false;

        // Priority 1: Check if it's a SECURITY skill
        if (SECURITY_KEYWORDS.some(k => searchText.includes(k))) {
            isSecurityRelated = true;
            // Determine if it's a certification or general security skill
            if (CERTIFICATION_KEYWORDS.some(k => searchText.includes(k)) ||
                ['bsp', 'ssiap', 'rcr', 'dea'].some(k => searchText.includes(k))) {
                category = 'CERTIFICATION';
            } else {
                category = 'INDUSTRY';
            }
        }
        // Priority 2: LANGUAGES (very important for non-security)
        else if (LANGUAGE_KEYWORDS.some(k => searchText.includes(k))) {
            category = 'LANGUAGE';
        }
        // Priority 3: EQUIPMENT (chariot, machinerie)
        else if (EQUIPMENT_KEYWORDS.some(k => searchText.includes(k))) {
            category = 'TOOL_EQUIPMENT';
        }
        // Priority 4: CHILDCARE (CPE, garderie)
        else if (CHILDCARE_KEYWORDS.some(k => searchText.includes(k))) {
            category = 'INDUSTRY'; // or could be OTHER
        }
        // Priority 5: IT/Programming
        else if (IT_KEYWORDS.some(k => searchText.includes(k))) {
            category = 'TECHNICAL';
        }
        // Priority 6: Manual/Technical trades
        else if (MANUAL_TECHNICAL_KEYWORDS.some(k => searchText.includes(k))) {
            category = 'TECHNICAL';
        }
        // Priority 7: Admin/Office
        else if (ADMIN_KEYWORDS.some(k => searchText.includes(k))) {
            category = 'TECHNICAL'; // Office software is technical
        }
        // Priority 8: Certifications (non-security)
        else if (CERTIFICATION_KEYWORDS.some(k => searchText.includes(k))) {
            category = 'CERTIFICATION';
        }

        // Update if changed
        if (skill.category !== category || skill.isSecurityRelated !== isSecurityRelated) {
            await prisma.skill.update({
                where: { id: skill.id },
                data: {
                    category,
                    isSecurityRelated
                }
            });
            updatedCount++;
            process.stdout.write('.');
        }
    }

    console.log(`\nDone! Updated ${updatedCount} skills.`);
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
