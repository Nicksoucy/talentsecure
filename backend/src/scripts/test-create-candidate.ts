import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    try {
        // Simuler les données envoyées par le frontend
        const candidateData = {
            firstName: "Test",
            lastName: "User",
            email: "test.user@example.com",
            phone: "5141234567",
            city: "Montreal",
            postalCode: "H1H 1H1",
            interviewDate: new Date(), // Le frontend envoie une string, mais ici on teste Prisma direct
            status: "EN_ATTENTE",
            globalRating: 8,
            hasVehicle: true,
            hasBSP: true,
            bspNumber: "123456",
            // Nested data
            languages: {
                create: [
                    { language: "Français", level: "AVANCE" }
                ]
            },
            experiences: {
                create: [
                    {
                        companyName: "Test Corp",
                        position: "Agent",
                        startDate: new Date(),
                        isCurrent: true
                    }
                ]
            },
            situationTests: {
                create: [
                    { question: "Test Q", answer: "Test A" }
                ]
            },
            createdById: "user-id-placeholder" // On devra trouver un vrai ID
        };

        // Trouver un utilisateur pour createdById
        const user = await prisma.user.findFirst();
        if (!user) {
            console.error("Aucun utilisateur trouvé pour createdById");
            return;
        }
        candidateData.createdById = user.id;

        console.log("Tentative de création...");
        const candidate = await prisma.candidate.create({
            data: candidateData
        });

        console.log("Candidat créé avec succès:", candidate.id);
    } catch (error) {
        console.error("Erreur lors de la création:", error);
    } finally {
        await prisma.$disconnect();
    }
}

main();
