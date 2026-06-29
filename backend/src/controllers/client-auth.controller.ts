import { Request, Response, NextFunction } from 'express';
import { prisma } from '../config/database';
import { comparePassword } from '../utils/password';
import { generateAccessToken, generateRefreshToken, verifyRefreshToken } from '../utils/jwt';
import { ApiError } from '../utils/apiError';

/**
 * Client login with email/password
 */
export const clientLogin = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      throw new ApiError(400, 'Email et mot de passe requis');
    }

    // Find client by email
    const client = await prisma.client.findUnique({
      where: { email: email.toLowerCase() },
    });

    if (!client) {
      throw new ApiError(401, 'Email ou mot de passe incorrect');
    }

    // Check if client has a password set
    if (!client.password) {
      throw new ApiError(401, 'Aucun mot de passe configuré pour ce compte');
    }

    // Verify password
    const isPasswordValid = await comparePassword(password, client.password);

    if (!isPasswordValid) {
      throw new ApiError(401, 'Email ou mot de passe incorrect');
    }

    // Generate tokens with clientId instead of userId
    const accessToken = generateAccessToken({
      userId: client.id, // We use userId field but it's actually clientId
      email: client.email,
      role: 'CLIENT', // Special role for clients
    });

    const refreshToken = generateRefreshToken({
      userId: client.id,
      email: client.email,
      role: 'CLIENT',
    });

    res.json({
      message: 'Connexion réussie',
      client: {
        id: client.id,
        name: client.name,
        companyName: client.companyName,
        email: client.email,
      },
      accessToken,
      refreshToken,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Refresh client access token
 */
export const clientRefreshToken = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      return res.status(400).json({ error: 'Refresh token requis' });
    }

    // Verify refresh token
    const payload = verifyRefreshToken(refreshToken);

    // Make sure it's a client token
    if (payload.role !== 'CLIENT') {
      return res.status(401).json({ error: 'Token invalide' });
    }

    // Check if client still exists
    const client = await prisma.client.findUnique({
      where: { id: payload.userId },
    });

    if (!client) {
      return res.status(401).json({ error: 'Client non trouvé' });
    }

    // Nouveau access token + ROTATION du refresh token (P2-C).
    const tokenPayload = {
      userId: client.id,
      email: client.email,
      role: 'CLIENT',
    };
    const newAccessToken = generateAccessToken(tokenPayload);
    const newRefreshToken = generateRefreshToken(tokenPayload);

    res.json({
      accessToken: newAccessToken,
      refreshToken: newRefreshToken,
    });
  } catch (error) {
    res.status(401).json({ error: 'Refresh token invalide ou expiré' });
  }
};

/**
 * Get current client profile
 */
export const getClientProfile = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    // req.user is set by the authenticateJWT middleware
    if (!req.user || req.user.role !== 'CLIENT') {
      throw new ApiError(401, 'Non authentifié');
    }

    const client = await prisma.client.findUnique({
      where: { id: req.user.id },
      select: {
        id: true,
        name: true,
        companyName: true,
        email: true,
        phone: true,
        address: true,
        city: true,
        province: true,
        postalCode: true,
        createdAt: true,
      },
    });

    if (!client) {
      throw new ApiError(404, 'Client non trouvé');
    }

    res.json({ client });
  } catch (error) {
    next(error);
  }
};

/**
 * Get client's catalogues
 */
export const getClientCatalogues = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    // req.user is set by the authenticateJWT middleware
    if (!req.user || req.user.role !== 'CLIENT') {
      throw new ApiError(401, 'Non authentifié');
    }

    const catalogues = await prisma.catalogue.findMany({
      where: {
        clientId: req.user.id,
      },
      include: {
        items: {
          include: {
            candidate: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                city: true,
                province: true,
                status: true,
                globalRating: true,
              },
            },
          },
          orderBy: {
            order: 'asc',
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    res.json(catalogues);
  } catch (error) {
    next(error);
  }
};

/**
 * Get single catalogue with full details (for client)
 */
export const getClientCatalogueById = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { id } = req.params;

    // req.user is set by the authenticateJWT middleware
    if (!req.user || req.user.role !== 'CLIENT') {
      throw new ApiError(401, 'Non authentifié');
    }

    const catalogue = await prisma.catalogue.findFirst({
      where: {
        id,
        clientId: req.user.id, // Make sure client can only see their own catalogues
      },
      include: {
        items: {
          include: {
            candidate: {
              include: {
                languages: true,
                experiences: true,
                availabilities: true,
                certifications: true,
              },
            },
          },
          orderBy: {
            order: 'asc',
          },
        },
      },
    });

    if (!catalogue) {
      throw new ApiError(404, 'Catalogue non trouvé');
    }

    // Update view tracking
    await prisma.catalogue.update({
      where: { id: catalogue.id },
      data: {
        viewedAt: catalogue.viewedAt || new Date(),
        lastViewedAt: new Date(),
        viewCount: {
          increment: 1,
        },
      },
    });

    const isContentRestricted = catalogue.requiresPayment && !catalogue.isPaid;

    // CONFIDENTIALITÉ CLIENT : jamais de CV, d'adresse complète ni de notes RH
    // internes. Masquage systématique + exclusion des candidats supprimés.
    catalogue.items = (catalogue.items || [])
      .filter(item => item.candidate && !(item.candidate as any).isDeleted)
      .map(item => ({
        ...item,
        candidate: {
          ...item.candidate,
          phone: null,
          email: null,
          address: null,
          fullAddress: null,
          postalCode: null,
          cvUrl: null,
          cvStoragePath: null,
          hrNotes: null,
          strengths: null,
          weaknesses: null,
          interviewDetails: null,
          ...(isContentRestricted
            ? { videoUrl: null, videoStoragePath: null }
            : {}),
        },
      })) as unknown as typeof catalogue.items;

    res.json({
      ...catalogue,
      isContentRestricted,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get catalogue statistics by city (for maps)
 */
export const getCatalogueStatsByCity = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { id } = req.params;

    // req.user is set by the authenticateJWT middleware
    if (!req.user || req.user.role !== 'CLIENT') {
      throw new ApiError(401, 'Non authentifié');
    }

    // Verify the catalogue belongs to this client
    const catalogue = await prisma.catalogue.findFirst({
      where: {
        id,
        clientId: req.user.id,
      },
      include: {
        items: {
          include: {
            candidate: {
              select: {
                city: true,
                province: true,
              },
            },
          },
        },
      },
    });

    if (!catalogue) {
      throw new ApiError(404, 'Catalogue non trouvé');
    }

    // Group candidates by city and count them
    const cityStats: { [key: string]: number } = {};

    catalogue.items.forEach((item) => {
      const city = item.candidate.city;
      if (city) {
        cityStats[city] = (cityStats[city] || 0) + 1;
      }
    });

    // Convert to array format
    const data = Object.entries(cityStats).map(([city, count]) => ({
      city,
      count,
    }));

    res.json({ data });
  } catch (error) {
    next(error);
  }
};

/**
 * Get all available candidates statistics by city (for prospects map)
 * Shows the entire talent pool available
 */
export const getAllCandidatesStatsByCity = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    // req.user is set by the authenticateJWT middleware
    if (!req.user || req.user.role !== 'CLIENT') {
      throw new ApiError(401, 'Non authentifié');
    }

    // Get all active candidates (entire talent pool)
    const candidates = await prisma.candidate.findMany({
      where: {
        isActive: true,
        isArchived: false,
        isDeleted: false,
      },
      select: {
        city: true,
        province: true,
      },
    });

    // Group candidates by city and count them
    const cityStats: { [key: string]: number } = {};

    candidates.forEach((candidate) => {
      const city = candidate.city;
      if (city) {
        cityStats[city] = (cityStats[city] || 0) + 1;
      }
    });

    // Convert to array format
    const data = Object.entries(cityStats).map(([city, count]) => ({
      city,
      count,
    }));

    res.json({ data });
  } catch (error) {
    next(error);
  }
};

/**
 * Get all prospects (CVs only, not yet evaluated) statistics by city
 * For the cheaper tier - clients interview themselves (5-10$ per CV)
 */
export const getProspectsOnlyStatsByCity = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    // req.user is set by the authenticateJWT middleware
    if (!req.user || req.user.role !== 'CLIENT') {
      throw new ApiError(401, 'Non authentifié');
    }

    // Get all prospects that haven't been converted to candidates yet
    const prospects = await prisma.prospectCandidate.findMany({
      where: {
        isDeleted: false,
        isConverted: false, // Only prospects not yet evaluated
      },
      select: {
        city: true,
        province: true,
      },
    });

    // Group prospects by city and count them
    const cityStats: { [key: string]: number } = {};

    prospects.forEach((prospect) => {
      const city = prospect.city;
      if (city) {
        cityStats[city] = (cityStats[city] || 0) + 1;
      }
    });

    // Convert to array format
    const data = Object.entries(cityStats).map(([city, count]) => ({
      city,
      count,
    }));

    res.json({ data });
  } catch (error) {
    next(error);
  }
};
