import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function checkData() {
    try {
        const candidatesCount = await prisma.candidate.count();
        const prospectsCount = await prisma.prospect.count();
        const usersCount = await prisma.user.count();
        const clientsCount = await prisma.client.count();

        console.log('\n📊 Database Status:');
        console.log('==================');
        console.log(`👥 Candidates: ${candidatesCount}`);
        console.log(`🔍 Prospects: ${prospectsCount}`);
        console.log(`🔑 Users: ${usersCount}`);
        console.log(`🏢 Clients: ${clientsCount}`);
        console.log('==================\n');

        if (candidatesCount === 0 && prospectsCount === 0) {
            console.log('⚠️  WARNING: No data found! Database might be empty.');
        } else {
            console.log('✅ Data is present in the database!');
        }

        // Check if admin exists
        const admin = await prisma.user.findUnique({
            where: { email: 'admin@xguard.ca' }
        });

        if (admin) {
            console.log('✅ Admin user exists');
        } else {
            console.log('⚠️  Admin user NOT found - needs to be created');
        }

    } catch (error) {
        console.error('❌ Error checking database:', error);
    } finally {
        await prisma.$disconnect();
    }
}

checkData();
