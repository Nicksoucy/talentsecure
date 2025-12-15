import request from 'supertest';
import express, { Express } from 'express';
import { prisma, cleanDatabase } from './setup';
import candidateRoutes from '../routes/candidate.routes';
import { hashPassword } from '../utils/password';
import { generateAccessToken } from '../utils/jwt';
import '../config/passport'; // Register passport strategies

// Create a test app
function createTestApp(): Express {
  const app = express();
  app.use(express.json());
  app.use('/api/candidates', candidateRoutes);

  // Error handler
  app.use((err: any, req: any, res: any, next: any) => {
    console.error('Test error:', err);
    res.status(err.statusCode || err.status || 500).json({
      error: err.message || 'Internal server error',
      details: err.details
    });
  });

  return app;
}

describe('Candidate CRUD', () => {
  let app: Express;
  let adminUser: any;
  let rhUser: any;
  let salesUser: any;
  let adminToken: string;
  let rhToken: string;
  let salesToken: string;
  let testCandidate: any;

  beforeAll(async () => {
    app = createTestApp();
    await cleanDatabase();

    const hashedPassword = await hashPassword('Test123456');

    // Create test users with different roles
    adminUser = await prisma.user.create({
      data: {

        email: 'admin@test.com',
        password: hashedPassword,
        firstName: 'Admin',
        lastName: 'Test',
        role: 'ADMIN',
        isActive: true,
      },
    });

    rhUser = await prisma.user.create({
      data: {

        email: 'rh@test.com',
        password: hashedPassword,
        firstName: 'RH',
        lastName: 'Test',
        role: 'RH_RECRUITER',
        isActive: true,
      },
    });

    salesUser = await prisma.user.create({
      data: {

        email: 'sales@test.com',
        password: hashedPassword,
        firstName: 'Sales',
        lastName: 'Test',
        role: 'SALES',
        isActive: true,
      },
    });

    adminToken = generateAccessToken({
      userId: adminUser.id,
      email: adminUser.email,
      role: adminUser.role,
    });

    rhToken = generateAccessToken({
      userId: rhUser.id,
      email: rhUser.email,
      role: rhUser.role,
    });

    salesToken = generateAccessToken({
      userId: salesUser.id,
      email: salesUser.email,
      role: salesUser.role,
    });

    // Create a test candidate
    testCandidate = await prisma.candidate.create({
      data: {
        createdById: adminUser.id,
        firstName: 'Test',
        lastName: 'Candidate',
        email: 'test.candidate@example.com',
        phone: '514-123-4567',
        address: '123 Test St',
        city: 'Montreal',
        postalCode: 'H1A 1A1',
        status: 'EN_ATTENTE',

      },
    });
  });

  afterAll(async () => {
    await cleanDatabase();
  });

  describe('POST /api/candidates', () => {
    it('should create a candidate as ADMIN', async () => {
      const candidateData = {
        firstName: 'New',
        lastName: 'Candidate',
        email: 'new.candidate@example.com',
        phone: '514-987-6543',
        address: '456 New St',
        city: 'Montreal',
        postalCode: 'H2B 2B2',
        status: 'EN_ATTENTE',

      };

      const response = await request(app)
        .post('/api/candidates')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(candidateData);

      expect(response.status).toBe(201);
      expect(response.body.data).toMatchObject(candidateData);
    });

    it('should create a candidate as RH_RECRUITER', async () => {
      const candidateData = {
        firstName: 'RH',
        lastName: 'Created',
        email: 'rh.created@example.com',
        phone: '514-111-2222',
        address: '789 RH St',
        city: 'Montreal',
        postalCode: 'H3C 3C3',
        status: 'EN_ATTENTE',

      };

      const response = await request(app)
        .post('/api/candidates')
        .set('Authorization', `Bearer ${rhToken}`)
        .send(candidateData);

      expect(response.status).toBe(201);
    });

    it('should reject creation by SALES user', async () => {
      const candidateData = {
        firstName: 'Sales',
        lastName: 'Rejected',
        email: 'sales.rejected@example.com',
        phone: '514-333-4444',
        address: '101 Sales St',
        city: 'Montreal',
        postalCode: 'H4D 4D4',
        status: 'EN_ATTENTE',

      };

      const response = await request(app)
        .post('/api/candidates')
        .set('Authorization', `Bearer ${salesToken}`)
        .send(candidateData);

      expect(response.status).toBe(403);
    });

    it('should validate required fields', async () => {
      const response = await request(app)
        .post('/api/candidates')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          firstName: 'Missing',
          // Missing required fields
        });

      expect(response.status).toBe(400);
    });

    it('should validate email format', async () => {
      const response = await request(app)
        .post('/api/candidates')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          firstName: 'Invalid',
          lastName: 'Email',
          email: 'invalid-email',
          phone: '514-555-6666',
          address: '123 Test',
          city: 'Montreal',
          postalCode: 'H1A 1A1',
          status: 'EN_ATTENTE',

        });

      expect(response.status).toBe(400);
    });

    it('should validate postal code format', async () => {
      const response = await request(app)
        .post('/api/candidates')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          firstName: 'Invalid',
          lastName: 'Postal',
          email: 'invalid.postal@example.com',
          phone: '514-777-8888',
          address: '123 Test',
          city: 'Montreal',
          postalCode: 'INVALID',
          status: 'EN_ATTENTE',

        });

      expect(response.status).toBe(400);
    });

    it('should accept and format messy postal code', async () => {
      const candidateData = {
        firstName: 'Messy',
        lastName: 'Postal',
        email: 'messy.postal@example.com',
        phone: '514-111-2222',
        address: '123 Test',
        city: 'Montreal',
        postalCode: ' h3z  2y7 ', // Messy input
        status: 'EN_ATTENTE',
      };

      const response = await request(app)
        .post('/api/candidates')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(candidateData);

      expect(response.status).toBe(201);
      expect(response.body.data.postalCode).toBe('H3Z 2Y7');
    });

    it('should create candidate with experience dates', async () => {
      const candidateData = {
        firstName: 'Experience',
        lastName: 'Test',
        email: 'exp.test@example.com',
        phone: '514-222-3333',
        city: 'Montreal',
        experiences: [
          {
            companyName: 'Test Corp',
            position: 'Developer',
            startDate: '2022-01-01',
            endDate: '2022-12-31',
            description: 'Coding'
          }
        ]
      };

      const response = await request(app)
        .post('/api/candidates')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(candidateData);

      expect(response.status).toBe(201);
      const createdExp = response.body.data.experiences[0];
      expect(new Date(createdExp.startDate).toISOString()).toContain('2022-01-01');
      expect(new Date(createdExp.endDate).toISOString()).toContain('2022-12-31');
    });
  });

  describe('GET /api/candidates', () => {
    it('should get all candidates with authentication', async () => {
      const response = await request(app)
        .get('/api/candidates')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(200);
      expect(response.body.data).toBeInstanceOf(Array);
      expect(response.body.data.length).toBeGreaterThan(0);
    });

    it('should reject unauthenticated requests', async () => {
      const response = await request(app)
        .get('/api/candidates');

      expect(response.status).toBe(401);
    });

    it('should filter by status', async () => {
      const response = await request(app)
        .get('/api/candidates?status=NEW')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(200);
      expect(response.body.data).toBeInstanceOf(Array);
    });

    it('should filter by city', async () => {
      const response = await request(app)
        .get('/api/candidates?city=Montreal')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(200);
      expect(response.body.data).toBeInstanceOf(Array);
    });

    it('should search by name', async () => {
      const response = await request(app)
        .get('/api/candidates?search=Test')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(200);
      expect(response.body.data).toBeInstanceOf(Array);
    });

    it('should paginate results', async () => {
      const response = await request(app)
        .get('/api/candidates?page=1&limit=10')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(200);
      expect(response.body.data).toBeInstanceOf(Array);
      expect(response.body.data.length).toBeLessThanOrEqual(10);
    });
  });

  describe('GET /api/candidates/:id', () => {
    it('should get a candidate by ID', async () => {
      const response = await request(app)
        .get(`/api/candidates/${testCandidate.id}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(200);
      expect(response.body.data).toMatchObject({
        id: testCandidate.id,
        firstName: 'Test',
        lastName: 'Candidate',
      });
    });

    it('should return 404 for non-existent candidate', async () => {
      const fakeId = '00000000-0000-0000-0000-000000000000';
      const response = await request(app)
        .get(`/api/candidates/${fakeId}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(404);
    });
  });

  describe('PUT /api/candidates/:id', () => {
    it('should update a candidate as ADMIN', async () => {
      const updateData = {
        phone: '514-999-0000',
        status: 'QUALIFIE',
      };

      const response = await request(app)
        .put(`/api/candidates/${testCandidate.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send(updateData);

      expect(response.status).toBe(200);
      expect(response.body.data.phone).toBe('514-999-0000');
      expect(response.body.data.status).toBe('QUALIFIE');
    });

    it('should update a candidate as RH_RECRUITER', async () => {
      const updateData = {
        notes: 'RH updated notes',
      };

      const response = await request(app)
        .put(`/api/candidates/${testCandidate.id}`)
        .set('Authorization', `Bearer ${rhToken}`)
        .send(updateData);


      expect(response.status).toBe(403);
    });

    it('should validate update data', async () => {
      const updateData = {
        email: 'invalid-email',
      };

      const response = await request(app)
        .put(`/api/candidates/${testCandidate.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send(updateData);

      expect(response.status).toBe(400);
    });
  });

  describe('DELETE /api/candidates/:id', () => {
    let candidateToDelete: any;

    beforeAll(async () => {
      candidateToDelete = await prisma.candidate.create({
        data: {
          createdById: adminUser.id,
          firstName: 'To',
          lastName: 'Delete',
          email: 'to.delete@example.com',
          phone: '514-000-1111',
          address: '999 Delete St',
          city: 'Montreal',
          postalCode: 'H9Z 9Z9',
          status: 'EN_ATTENTE',

        },
      });
    });

    it('should soft delete a candidate as ADMIN', async () => {
      const response = await request(app)
        .delete(`/api/candidates/${candidateToDelete.id}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(200);

      // Verify soft delete
      const deletedCandidate = await prisma.candidate.findUnique({
        where: { id: candidateToDelete.id },
      });

      expect(deletedCandidate).not.toBeNull();
      expect(deletedCandidate?.isDeleted).toBe(true);
    });

    it('should reject delete by RH_RECRUITER', async () => {
      const candidateToTryDelete = await prisma.candidate.create({
        data: {
          createdById: adminUser.id,
          firstName: 'Cannot',
          lastName: 'Delete',
          email: 'cannot.delete@example.com',
          phone: '514-222-3333',
          address: '888 Safe St',
          city: 'Montreal',
          postalCode: 'H8Y 8Y8',
          status: 'EN_ATTENTE',

        },
      });

      const response = await request(app)
        .delete(`/api/candidates/${candidateToTryDelete.id}`)
        .set('Authorization', `Bearer ${rhToken}`);

      expect(response.status).toBe(403);
    });

    it('should reject delete by SALES user', async () => {
      const candidateToTryDelete = await prisma.candidate.create({
        data: {
          createdById: adminUser.id,
          firstName: 'Also Cannot',
          lastName: 'Delete',
          email: 'also.cannot.delete@example.com',
          phone: '514-444-5555',
          address: '777 Protected St',
          city: 'Montreal',
          postalCode: 'H7X 7X7',
          status: 'EN_ATTENTE',

        },
      });

      const response = await request(app)
        .delete(`/api/candidates/${candidateToTryDelete.id}`)
        .set('Authorization', `Bearer ${salesToken}`);

      expect(response.status).toBe(403);
    });
  });
});
