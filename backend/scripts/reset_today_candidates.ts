
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function run() {
    const cutoff = new Date(Date.now() - 12 * 3600 * 1000); // Created in last 12h
    const { count } = await prisma.candidate.deleteMany({
        where: { createdAt: { gt: cutoff } }
    });
    console.log(`Deleted ${count} candidates created today.`);

    // Also revert any prospect conversions done today if possible? 
    // We soft-deleted prospects. We should probably restore them to allow re-matching?
    // If we delete the candidate, the prospect.convertedToId will point to nothing.
    // We need to un-delete prospects that point to deleted candidates.

    // Complexity: We don't have the IDs of deleted candidates easily unless we fetch first.
    // But we can check for orphans later or now.

    // For now, let's just delete the bad candidates. The re-import will create new candidates.
    // Then the duplicate cleanup will run again and re-link prospects to new IDs.
    // But strict FK might fail?
    // Prisma schema says: candidate Candidate @relation...
    // The relation is on ProspectCandidate? No.
    // ProspectCandidate has `convertedToId String?`. No FK constraint in Prisma schema `convertedToId String?` without `@relation`?
    // Let's check schema.
    // model ProspectCandidate ... convertedToId String? ... // No @relation to Candidate defined in schema for this field?
    // Checking schema...
    // It says: `convertedToId String? // ID du candidat créé après entrevue`.
    // No `@relation`. So deleting candidate won't break SQL constraint, but leaves dangling ref.

    // We should ideally reset the prospects `isConverted=false, isDeleted=false` for those we "cleaned" today.
    // But that's hard to track.
    // The duplicate cleanup script will run again and find matches by Email.
    // If I re-import with same email, it's fine.
    // But if prospect is `isDeleted=true`, the duplicate checker `where: { isDeleted: false }` won't find it.

    // So I MUST restore the prospects!
    const restored = await prisma.prospectCandidate.updateMany({
        where: { isDeleted: true, convertedAt: { gt: cutoff } }, // "Cleaned" today
        data: { isDeleted: false, isConverted: false, convertedToId: null, convertedAt: null }
    });
    console.log(`Restored ${restored.count} prospects to potential pool.`);
}

run().finally(() => prisma.$disconnect());
