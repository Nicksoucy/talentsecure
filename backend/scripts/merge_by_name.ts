
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function run() {
    const all = await prisma.candidate.findMany();
    console.log(`Starting Merge on ${all.length} candidates...`);

    const nameMap = new Map<string, typeof all>();

    for (const c of all) {
        const key = (c.firstName + " " + c.lastName).toLowerCase().trim();
        if (!nameMap.has(key)) nameMap.set(key, []);
        nameMap.get(key)!.push(c);
    }

    let mergedCount = 0;

    for (const [key, group] of nameMap) {
        if (group.length < 2) continue;

        // Sort: Best record first. 
        // Criteria: has Email -> has Phone -> Created Earlier (Oldest = likely manual/prospect)
        group.sort((a, b) => {
            const aGood = (a.email ? 2 : 0) + (a.phone && a.phone !== '0000000000' ? 1 : 0);
            const bGood = (b.email ? 2 : 0) + (b.phone && b.phone !== '0000000000' ? 1 : 0);
            if (aGood !== bGood) return bGood - aGood; // High score first
            return a.createdAt.getTime() - b.createdAt.getTime(); // Oldest first
        });

        const target = group[0];
        const others = group.slice(1);

        console.log(`Merging group "${key}": Keeping ID ${target.id} (Email: ${target.email}). Deleting ${others.length} others.`);

        for (const source of others) {
            // Merge logic
            let newNotes = target.hrNotes || "";
            if (source.hrNotes && !newNotes.includes(source.hrNotes)) {
                newNotes += "\n[Merged Import]: " + source.hrNotes;
            }

            // Merge rating if target missing
            const newRating = target.globalRating || source.globalRating;
            const newStatus = (target.status === 'EN_ATTENTE' && source.status !== 'EN_ATTENTE') ? source.status : target.status;

            // Update Target
            await prisma.candidate.update({
                where: { id: target.id },
                data: {
                    hrNotes: newNotes,
                    globalRating: newRating,
                    status: newStatus,
                    interviewDetails: (source.interviewDetails as any) || (target.interviewDetails as any) // Keep the import details if target lacks them
                }
            });

            // Delete Source (soft delete prospects pointing to it? No, if source was "Bad", prospects pointed to... nothing/bad).
            // If source was linked to a prospect, we should relink prospect to Target?
            // We can check if any prospect convertedTo source.
            const prospects = await prisma.prospectCandidate.findMany({ where: { convertedToId: source.id } });
            for (const p of prospects) {
                await prisma.prospectCandidate.update({
                    where: { id: p.id },
                    data: { convertedToId: target.id }
                });
            }

            // Delete Source matches in Candidate (skills? etc. CASCADE usually handles relations, but let's just delete)
            try {
                await prisma.candidate.delete({ where: { id: source.id } });
                mergedCount++;
            } catch (e) {
                console.error(`Failed to delete ${source.id}:`, e);
            }
        }
    }

    console.log(`\n--- TERMINÉ ---`);
    console.log(`Merged & Deleted: ${mergedCount}`);
    const finalCount = await prisma.candidate.count();
    console.log(`Final Candidate Count: ${finalCount}`);
}

run().finally(() => prisma.$disconnect());
