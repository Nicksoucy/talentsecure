
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function run() {
    const all = await prisma.candidate.findMany({
        select: { id: true, firstName: true, lastName: true, email: true, phone: true }
    });

    console.log(`Total Candidates: ${all.length}`);

    const nameMap = new Map<string, typeof all>();
    let duplicateGroups = 0;
    let redundantRecords = 0;

    for (const c of all) {
        const key = (c.firstName + " " + c.lastName).toLowerCase().trim();
        if (!nameMap.has(key)) nameMap.set(key, []);
        nameMap.get(key)!.push(c);
    }

    console.log(`Unique Names: ${nameMap.size}`);

    for (const [key, group] of nameMap) {
        if (group.length > 1) {
            duplicateGroups++;
            redundantRecords += (group.length - 1);
            if (duplicateGroups <= 10) {
                console.log(`[DUP] "${key}" x ${group.length}`);
                group.forEach(m => console.log(`   - ID: ${m.id} | Email: ${m.email} | Phone: ${m.phone}`));
            }
        }
    }

    console.log(`\n--- RESULTS ---`);
    console.log(`Duplicate Groups (Same Name): ${duplicateGroups}`);
    console.log(`Excess Records (to delete/merge): ${redundantRecords}`);
    console.log(`Estimated Unique Candidates: ${all.length - redundantRecords}`);
}

run().finally(() => prisma.$disconnect());
