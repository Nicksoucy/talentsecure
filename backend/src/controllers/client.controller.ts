import { Request, Response, NextFunction } from 'express';
import { prisma } from '../config/database';
import { getCache, setCache, deleteCache, invalidateCacheByPrefix } from '../config/cache';
import { buildCacheKey } from '../utils/cache';

const CLIENT_LIST_CACHE_PREFIX = 'clients:list';
const CLIENT_DETAIL_CACHE_PREFIX = 'clients:detail';

const invalidateClientCaches = async (clientId?: string) => {
  const tasks = [invalidateCacheByPrefix(CLIENT_LIST_CACHE_PREFIX)];
  if (clientId) {
    tasks.push(deleteCache(`${CLIENT_DETAIL_CACHE_PREFIX}:${clientId}`));
  }

  await Promise.all(tasks);
};

/**
 * Get all clients with filters
 */
export const getClients = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const {
      search,
      isActive,
      page = 1,
      limit = 20,
      sortBy = 'createdAt',
      sortOrder = 'desc',
    } = req.query;

    const skip = (Number(page) - 1) * Number(limit);
    const cacheKey = buildCacheKey(CLIENT_LIST_CACHE_PREFIX, req.query);
    const cachedResponse = await getCache<{ data: any; pagination: any }>(cacheKey);

    if (cachedResponse) {
      return res.json(cachedResponse);
    }

    // Build filter conditions
    const where: any = {};

    if (search) {
      where.OR = [
        { name: { contains: search as string, mode: 'insensitive' } },
        { companyName: { contains: search as string, mode: 'insensitive' } },
        { email: { contains: search as string, mode: 'insensitive' } },
      ];
    }

    if (isActive !== undefined) {
      where.isActive = isActive === 'true';
    }

    const [total, clients] = await prisma.$transaction([
      prisma.client.count({ where }),
      prisma.client.findMany({
        where,
        skip,
        take: Number(limit),
        orderBy: { [sortBy as string]: sortOrder },
        include: {
          _count: {
            select: {
              catalogues: true,
              placements: true,
            },
          },
        },
      }),
    ]);

    const responsePayload = {
      data: clients,
      pagination: {
        total,
        page: Number(page),
        limit: Number(limit),
        totalPages: Math.ceil(total / Number(limit)),
      },
    };

    await setCache(cacheKey, responsePayload, 300);

    res.json(responsePayload);
  } catch (error) {
    next(error);
  }
};

/**
 * Get single client by ID
 */
export const getClientById = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { id } = req.params;

    const cacheKey = `${CLIENT_DETAIL_CACHE_PREFIX}:${id}`;
    const cachedClient = await getCache<{ data: any }>(cacheKey);
    if (cachedClient) {
      return res.json(cachedClient);
    }

    const client = await prisma.client.findUnique({
      where: { id },
      include: {
        catalogues: {
          orderBy: { createdAt: 'desc' },
          take: 10,
        },
        _count: {
          select: {
            catalogues: true,
            placements: true,
          },
        },
      },
    });

    if (!client) {
      return res.status(404).json({ error: 'Client non trouvé' });
    }

    const payload = { data: client };
    await setCache(cacheKey, payload, 300);

    res.json(payload);
  } catch (error) {
    next(error);
  }
};

/**
 * Create new client
 */
export const createClient = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const {
      name,
      companyName,
      email,
      phone,
      address,
      city,
      province,
      postalCode,
      notes,
    } = req.body;

    // Check if email already exists
    const existingClient = await prisma.client.findUnique({
      where: { email },
    });

    if (existingClient) {
      return res.status(400).json({ error: 'Un client avec cet email existe déjà' });
    }

    // Create client
    const client = await prisma.client.create({
      data: {
        name,
        companyName,
        email,
        phone,
        address,
        city,
        province: province || 'QC',
        postalCode,
        notes,
      },
    });

    // Log audit
    const userId = req.user!.id;
    await prisma.auditLog.create({
      data: {
        userId,
        action: 'CREATE',
        resource: 'Client',
        resourceId: client.id,
        details: `Client créé: ${name} (${companyName || 'N/A'})`,
      },
    });

    await invalidateClientCaches(client.id);

    res.status(201).json({
      message: 'Client créé avec succès',
      data: client,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Update client
 */
export const updateClient = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { id } = req.params;
    const updateData = req.body;
    const userId = req.user!.id;

    // Check if client exists
    const existingClient = await prisma.client.findUnique({
      where: { id },
    });

    if (!existingClient) {
      return res.status(404).json({ error: 'Client non trouvé' });
    }

    // If email is being changed, check if it's already taken
    if (updateData.email && updateData.email !== existingClient.email) {
      const emailTaken = await prisma.client.findUnique({
        where: { email: updateData.email },
      });

      if (emailTaken) {
        return res.status(400).json({ error: 'Cet email est déjà utilisé par un autre client' });
      }
    }

    // Update client
    const client = await prisma.client.update({
      where: { id },
      data: updateData,
    });

    // Log audit
    await prisma.auditLog.create({
      data: {
        userId,
        action: 'UPDATE',
        resource: 'Client',
        resourceId: id,
        details: `Client modifié: ${client.name}`,
      },
    });

    await invalidateClientCaches(id);

    res.json({
      message: 'Client mis à jour avec succès',
      data: client,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Delete client (soft delete by setting isActive to false)
 */
export const deleteClient = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { id } = req.params;
    const userId = req.user!.id;

    const client = await prisma.client.update({
      where: { id },
      data: {
        isActive: false,
      },
    });

    // Log audit
    await prisma.auditLog.create({
      data: {
        userId,
        action: 'DELETE',
        resource: 'Client',
        resourceId: id,
        details: `Client désactivé: ${client.name}`,
      },
    });

    await invalidateClientCaches(id);

    res.json({ message: 'Client désactivé avec succès' });
  } catch (error) {
    next(error);
  }
};

/**
 * Reactivate client
 */
export const reactivateClient = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { id } = req.params;
    const userId = req.user!.id;

    const client = await prisma.client.update({
      where: { id },
      data: {
        isActive: true,
      },
    });

    // Log audit
    await prisma.auditLog.create({
      data: {
        userId,
        action: 'UPDATE',
        resource: 'Client',
        resourceId: id,
        details: `Client réactivé: ${client.name}`,
      },
    });

    await invalidateClientCaches(id);

    res.json({
      message: 'Client réactivé avec succès',
      data: client,
    });
  } catch (error) {
    next(error);
  }
};
