import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function checkData() {
    console.log('🔍 Vérification des données restantes...\n');

    try {
        // Check candidates
        const candidates = await prisma.candidate.count();
        console.log(`👥 Candidats: ${candidates}`);

        // Check prospects
        const prospects = await prisma.prospectCandidate.count();
        console.log(`📋 Prospects: ${prospects}`);

        // Check catalogues
        const catalogues = await prisma.catalogue.count();
        console.log(`📚 Catalogues: ${catalogues}`);

        // Check placements
        const placements = await prisma.placement.count();
        console.log(`📊 Placements: ${placements}`);

        // Check users
        const users = await prisma.user.count();
        console.log(`👤 Utilisateurs: ${users}`);

        // Check skills
        const skills = await prisma.skill.count();
        console.log(`🎯 Compétences: ${skills}`);

        // Check candidate skills
        const candidateSkills = await prisma.candidateSkill.count();
        console.log(`🔗 Compétences candidats: ${candidateSkills}`);

        console.log('\n✅ Vérification terminée');
    } catch (error) {
        console.error('❌ Erreur:', error);
    } finally {
        await prisma.$disconnect();
    }
}

checkData();
