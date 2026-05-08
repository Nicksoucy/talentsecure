/**
 * Persists a prospect analysis produced by Claude Code (rubric v1).
 *
 * The analysis JSON is read from stdin. The prospectId is the only CLI arg.
 * cvHash is recomputed here from the current CV text so we don't trust the
 * caller; analyzedAt / updatedAt are set by Prisma.
 *
 * Usage:
 *   echo '<analysis-json>' | npx ts-node scripts/save-prospect-analysis.ts <prospectId>
 *
 * Expected JSON shape (matches the rubric tool schema):
 *   {
 *     "score": 0-100,
 *     "tier": "gold" | "silver" | "bronze" | "reject",
 *     "recommendation": "INTERVIEW_PRIORITY" | "INTERVIEW" | "REVIEW" | "REJECT",
 *     "summary": "...",
 *     "strengths": [...],
 *     "redFlags": [...],
 *     "workEnvironments": [{ type, label, yearsApprox, employer }, ...],
 *     "reasoning": "..."
 *   }
 */
import { PrismaClient } from '@prisma/client';
import { createHash } from 'crypto';
import { cvExtractionService } from '../src/services/cv-extraction.service';

const prisma = new PrismaClient();

const RUBRIC_VERSION = 'v1';
const MODEL_TAG = 'claude-code-cli';

const VALID_TIERS = ['gold', 'silver', 'bronze', 'reject'] as const;
const VALID_RECOMMENDATIONS = ['INTERVIEW_PRIORITY', 'INTERVIEW', 'REVIEW', 'REJECT'] as const;

async function readStdin(): Promise<string> {
    return new Promise((resolve, reject) => {
        let data = '';
        process.stdin.setEncoding('utf8');
        process.stdin.on('data', (chunk) => {
            data += chunk;
        });
        process.stdin.on('end', () => resolve(data));
        process.stdin.on('error', reject);
    });
}

async function main() {
    const prospectId = process.argv[2];
    if (!prospectId) {
        console.error('Usage: save-prospect-analysis.ts <prospectId> < analysis.json');
        process.exit(1);
    }

    const raw = await readStdin();
    if (!raw.trim()) {
        console.error('Aucune donnée reçue sur stdin');
        process.exit(1);
    }

    let parsed: any;
    try {
        parsed = JSON.parse(raw);
    } catch (e: any) {
        console.error('JSON invalide sur stdin:', e.message);
        process.exit(1);
    }

    // Minimal shape validation — surface obvious mistakes early rather than
    // silently writing garbage into the DB.
    const required = ['score', 'tier', 'recommendation', 'summary', 'strengths', 'redFlags', 'workEnvironments', 'reasoning'];
    for (const field of required) {
        if (!(field in parsed)) {
            console.error(`Champ requis manquant: ${field}`);
            process.exit(1);
        }
    }
    if (typeof parsed.score !== 'number' || parsed.score < 0 || parsed.score > 100) {
        console.error('score doit être un nombre entre 0 et 100');
        process.exit(1);
    }
    if (!VALID_TIERS.includes(parsed.tier)) {
        console.error(`tier doit être un de: ${VALID_TIERS.join(', ')}`);
        process.exit(1);
    }
    if (!VALID_RECOMMENDATIONS.includes(parsed.recommendation)) {
        console.error(`recommendation doit être un de: ${VALID_RECOMMENDATIONS.join(', ')}`);
        process.exit(1);
    }

    // Recompute cvHash server-side so we don't trust the caller — this is the
    // gate we use later to detect whether a CV changed and the analysis needs
    // to be re-run.
    let cvHash: string | null = null;
    try {
        const cvText = await cvExtractionService.getCandidateText(prospectId, true);
        if (cvText && cvText.length > 0) {
            cvHash = createHash('sha256').update(cvText).digest('hex');
        }
    } catch {
        // CV unavailable — analysis still saved, cvHash stays null
    }

    const persisted = {
        score: Math.round(parsed.score),
        tier: parsed.tier as string,
        recommendation: parsed.recommendation as string,
        summary: String(parsed.summary),
        strengths: Array.isArray(parsed.strengths) ? parsed.strengths.map(String) : [],
        redFlags: Array.isArray(parsed.redFlags) ? parsed.redFlags.map(String) : [],
        workEnvironments: parsed.workEnvironments,
        reasoning: String(parsed.reasoning),
        rubricVersion: RUBRIC_VERSION,
        model: MODEL_TAG,
        cvHash,
        promptTokens: 0,
        completionTokens: 0,
        totalCost: 0,
        processingTimeMs: 0,
    };

    await prisma.prospectAnalysis.upsert({
        where: { prospectId },
        create: { prospectId, ...persisted },
        update: persisted,
    });

    process.stdout.write(`OK ${prospectId} ${parsed.tier} ${parsed.score}\n`);
    await prisma.$disconnect();
}

main().catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
});
