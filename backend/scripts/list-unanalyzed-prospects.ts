/**
 * Lists prospects that have no analysis yet (or all of them with --force),
 * with their CV text already extracted, as a JSON array on stdout.
 *
 * This script is the data-feed for the /analyze-prospects Claude Code
 * slash command — Claude reads stdout, scores each entry against the
 * rubric in-conversation, then pipes the result to save-prospect-analysis.ts.
 *
 * Usage:
 *   npx ts-node scripts/list-unanalyzed-prospects.ts [limit] [--force]
 *
 *   limit    max number of prospects to return (default 20, max 200)
 *   --force  include prospects that already have an analysis (for re-scoring)
 */
import { PrismaClient } from '@prisma/client';
import { cvExtractionService } from '../src/services/cv-extraction.service';

const prisma = new PrismaClient();

interface ProspectForAnalysis {
    id: string;
    firstName: string;
    lastName: string;
    email: string | null;
    phone: string;
    city: string | null;
    province: string | null;
    cvUrl: string | null;
    cvStoragePath: string | null;
    submissionDate: Date | null;
    cvText: string;
    cvTextError?: string;
}

async function main() {
    const limitArg = process.argv.find((a) => /^\d+$/.test(a));
    const limit = Math.min(limitArg ? parseInt(limitArg, 10) : 20, 200);
    const force = process.argv.includes('--force');

    const prospects = await prisma.prospectCandidate.findMany({
        where: {
            isDeleted: false,
            ...(force ? {} : { analysis: { is: null } }),
        },
        select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            phone: true,
            city: true,
            province: true,
            cvUrl: true,
            cvStoragePath: true,
            submissionDate: true,
        },
        orderBy: { createdAt: 'desc' },
        take: limit,
    });

    const enriched: ProspectForAnalysis[] = [];
    for (const p of prospects) {
        let cvText = '';
        let cvTextError: string | undefined;
        try {
            cvText = await cvExtractionService.getCandidateText(p.id, true);
        } catch (e: any) {
            cvTextError = e?.message || 'erreur d\'extraction';
        }
        enriched.push({ ...p, cvText, ...(cvTextError ? { cvTextError } : {}) });
    }

    process.stdout.write(JSON.stringify(enriched, null, 2));
    await prisma.$disconnect();
}

main().catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
});
