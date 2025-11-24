import { PrismaClient } from '@prisma/client';
import { hashPassword } from '../utils/password';

const prisma = new PrismaClient();

async function seedTestData() {
    console.log('🌱 Seeding test data...');

    try {
        // Create some prospects (candidates potentiels)
        console.log('Creating prospects...');
        const prospects = await Promise.all([
            prisma.prospect.create({
                data: {
                    firstName: 'Jean',
                    lastName: 'Dupont',
                    email: 'jean.dupont@example.com',
                    phone: '514-555-0101',
                    city: 'Montreal',
                    cvUrl: 'https://example.com/cv1.pdf',
                    contacted: false,
                    isConverted: false,
                },
            }),
            prisma.prospect.create({
                data: {
                    firstName: 'Marie',
                    lastName: 'Tremblay',
                    email: 'marie.tremblay@example.com',
                    phone: '514-555-0102',
                    city: 'Quebec',
                    cvUrl: 'https://example.com/cv2.pdf',
                    contacted: true,
                    isConverted: false,
                },
            }),
            prisma.prospect.create({
                data: {
                    firstName: 'Pierre',
                    lastName: 'Gagnon',
                    email: 'pierre.gagnon@example.com',
                    phone: '514-555-0103',
                    city: 'Montreal',
                    contacted: false,
                    isConverted: false,
                },
            }),
        ]);
        console.log(`✅ Created ${prospects.length} prospects`);

        // Create some candidates
        console.log('Creating candidates...');
        const candidates = await Promise.all([
            prisma.candidate.create({
                data: {
                    firstName: 'Sophie',
                    lastName: 'Martin',
                    email: 'sophie.martin@example.com',
                    phone: '514-555-0201',
                    city: 'Montreal',
                    interviewDate: new Date('2024-01-15'),
                    rating: 9.5,
                    status: 'ELITE',
                    hasVideo: true,
                    videoUrl: 'https://example.com/video1.mp4',
                    experience: '10+',
                    situation: 'Disponible immédiatement',
                    certification: 'CCNP',
                },
            }),
            prisma.candidate.create({
                data: {
                    firstName: 'Thomas',
                    lastName: 'Roy',
                    email: 'thomas.roy@example.com',
                    phone: '514-555-0202',
                    city: 'Quebec',
                    interviewDate: new Date('2024-01-20'),
                    rating: 9.2,
                    status: 'EXCELLENT',
                    hasVideo: true,
                    videoUrl: 'https://example.com/video2.mp4',
                    experience: '5-10',
                    situation: 'Disponible dans 2 semaines',
                    certification: 'CCNA',
                },
            }),
            prisma.candidate.create({
                data: {
                    firstName: 'Isabelle',
                    lastName: 'Côté',
                    email: 'isabelle.cote@example.com',
                    phone: '514-555-0203',
                    city: 'Montreal',
                    interviewDate: new Date('2024-02-01'),
                    rating: 8.7,
                    status: 'TRES_BON',
                    hasVideo: false,
                    experience: '3-5',
                    situation: 'Disponible immédiatement',
                },
            }),
            prisma.candidate.create({
                data: {
                    firstName: 'François',
                    lastName: 'Leblanc',
                    email: 'francois.leblanc@example.com',
                    phone: '514-555-0204',
                    city: 'Laval',
                    interviewDate: new Date('2024-02-05'),
                    rating: 8.3,
                    status: 'BON',
                    hasVideo: false,
                    experience: '1-3',
                    situation: 'Disponible dans 1 mois',
                },
            }),
        ]);
        console.log(`✅ Created ${candidates.length} candidates`);

        // Create a client
        console.log('Creating client...');
        const hashedClientPassword = await hashPassword('Client123!');
        const client = await prisma.client.create({
            data: {
                name: 'Entreprise Test Inc.',
                email: 'client@test.com',
                password: hashedClientPassword,
                contactPerson: 'Robert Dubois',
                phone: '514-555-0300',
                isActive: true,
            },
        });
        console.log(`✅ Created client: ${client.name}`);

        console.log('\n🎉 Test data seeded successfully!');
        console.log(`\n📊 Summary:`);
        console.log(`   - ${prospects.length} prospects`);
        console.log(`   - ${candidates.length} candidates`);
        console.log(`   - 1 client`);
        console.log(`   - 1 admin user (already created)`);
    } catch (error) {
        console.error('❌ Error seeding test data:', error);
        throw error;
    } finally {
        await prisma.$disconnect();
    }
}

seedTestData();
