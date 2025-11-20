import { Request, Response, NextFunction } from 'express';
import { prisma } from '../config/database';
import { Decimal } from '@prisma/client/runtime/library';

/**
 * Get pricing for a specific city
 */
export const getCityPricing = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { city } = req.params;

    let pricing = await prisma.cityPricing.findUnique({
      where: { city },
    });

    // If no pricing found, return default values
    if (!pricing) {
      pricing = {
        id: 'default',
        city,
        province: 'QC',
        evaluatedCandidateMinPrice: new Decimal(15),
        evaluatedCandidateMaxPrice: new Decimal(45),
        evaluatedCandidatePrice: new Decimal(30),
        cvOnlyMinPrice: new Decimal(5),
        cvOnlyMaxPrice: new Decimal(10),
        cvOnlyPrice: new Decimal(7.50),
        priceMultiplier: new Decimal(1.0),
        createdAt: new Date(),
        updatedAt: new Date(),
      };
    }

    res.json({ pricing });
  } catch (error) {
    next(error);
  }
};

/**
 * Get current client's active wishlist (DRAFT status)
 */
export const getCurrentWishlist = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!req.user || req.user.role !== 'CLIENT') {
      return res.status(401).json({ error: 'Non authentifié' });
    }

    // Find or create draft wishlist
    let wishlist = await prisma.clientWishlist.findFirst({
      where: {
        clientId: req.user.id,
        status: 'DRAFT',
      },
      include: {
        items: {
          orderBy: {
            createdAt: 'asc',
          },
        },
      },
    });

    // Create new wishlist if none exists
    if (!wishlist) {
      wishlist = await prisma.clientWishlist.create({
        data: {
          clientId: req.user.id,
          status: 'DRAFT',
          totalAmount: 0,
        },
        include: {
          items: true,
        },
      });
    }

    res.json({ wishlist });
  } catch (error) {
    next(error);
  }
};

/**
 * Add item to wishlist
 */
export const addWishlistItem = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!req.user || req.user.role !== 'CLIENT') {
      return res.status(401).json({ error: 'Non authentifié' });
    }

    const { city, province, type, quantity, notes } = req.body;

    // Validation
    if (!city || !type || !quantity || quantity < 1) {
      return res.status(400).json({
        error: 'Ville, type et quantité valide requis'
      });
    }

    if (type !== 'EVALUATED' && type !== 'CV_ONLY') {
      return res.status(400).json({
        error: 'Type invalide. Doit être EVALUATED ou CV_ONLY'
      });
    }

    // Get pricing for the city
    let cityPricing = await prisma.cityPricing.findUnique({
      where: { city },
    });

    // Use default pricing if not found
    const unitPrice = cityPricing
      ? (type === 'EVALUATED'
          ? cityPricing.evaluatedCandidatePrice
          : cityPricing.cvOnlyPrice)
      : (type === 'EVALUATED' ? new Decimal(30) : new Decimal(7.50));

    const totalPrice = unitPrice.mul(quantity);

    // Find or create draft wishlist
    let wishlist = await prisma.clientWishlist.findFirst({
      where: {
        clientId: req.user.id,
        status: 'DRAFT',
      },
    });

    if (!wishlist) {
      wishlist = await prisma.clientWishlist.create({
        data: {
          clientId: req.user.id,
          status: 'DRAFT',
          totalAmount: 0,
        },
      });
    }

    // Check if item already exists for this city + type
    const existingItem = await prisma.wishlistItem.findFirst({
      where: {
        wishlistId: wishlist.id,
        city,
        type,
      },
    });

    let item;
    if (existingItem) {
      // Update existing item
      const newQuantity = existingItem.quantity + quantity;
      const newTotalPrice = unitPrice.mul(newQuantity);

      item = await prisma.wishlistItem.update({
        where: { id: existingItem.id },
        data: {
          quantity: newQuantity,
          totalPrice: newTotalPrice,
          notes: notes || existingItem.notes,
        },
      });
    } else {
      // Create new item
      item = await prisma.wishlistItem.create({
        data: {
          wishlistId: wishlist.id,
          city,
          province: province || 'QC',
          type,
          quantity,
          unitPrice,
          totalPrice,
          notes,
        },
      });
    }

    // Update wishlist total
    const allItems = await prisma.wishlistItem.findMany({
      where: { wishlistId: wishlist.id },
    });

    const newTotalAmount = allItems.reduce(
      (sum, item) => sum.add(item.totalPrice),
      new Decimal(0)
    );

    await prisma.clientWishlist.update({
      where: { id: wishlist.id },
      data: { totalAmount: newTotalAmount },
    });

    // Return updated wishlist
    const updatedWishlist = await prisma.clientWishlist.findUnique({
      where: { id: wishlist.id },
      include: {
        items: {
          orderBy: {
            createdAt: 'asc',
          },
        },
      },
    });

    res.json({
      message: 'Item ajouté au panier',
      wishlist: updatedWishlist,
      item,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Update wishlist item quantity
 */
export const updateWishlistItem = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!req.user || req.user.role !== 'CLIENT') {
      return res.status(401).json({ error: 'Non authentifié' });
    }

    const { id } = req.params;
    const { quantity } = req.body;

    if (!quantity || quantity < 1) {
      return res.status(400).json({ error: 'Quantité invalide' });
    }

    // Find item and verify ownership
    const item = await prisma.wishlistItem.findUnique({
      where: { id },
      include: {
        wishlist: true,
      },
    });

    if (!item) {
      return res.status(404).json({ error: 'Item non trouvé' });
    }

    if (item.wishlist.clientId !== req.user.id) {
      return res.status(403).json({ error: 'Non autorisé' });
    }

    if (item.wishlist.status !== 'DRAFT') {
      return res.status(400).json({
        error: 'Impossible de modifier une demande déjà soumise'
      });
    }

    // Update item
    const newTotalPrice = item.unitPrice.mul(quantity);
    const updatedItem = await prisma.wishlistItem.update({
      where: { id },
      data: {
        quantity,
        totalPrice: newTotalPrice,
      },
    });

    // Update wishlist total
    const allItems = await prisma.wishlistItem.findMany({
      where: { wishlistId: item.wishlistId },
    });

    const newTotalAmount = allItems.reduce(
      (sum, item) => sum.add(item.totalPrice),
      new Decimal(0)
    );

    await prisma.clientWishlist.update({
      where: { id: item.wishlistId },
      data: { totalAmount: newTotalAmount },
    });

    // Return updated wishlist
    const updatedWishlist = await prisma.clientWishlist.findUnique({
      where: { id: item.wishlistId },
      include: {
        items: {
          orderBy: {
            createdAt: 'asc',
          },
        },
      },
    });

    res.json({
      message: 'Item mis à jour',
      wishlist: updatedWishlist,
      item: updatedItem,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Remove item from wishlist
 */
export const removeWishlistItem = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!req.user || req.user.role !== 'CLIENT') {
      return res.status(401).json({ error: 'Non authentifié' });
    }

    const { id } = req.params;

    // Find item and verify ownership
    const item = await prisma.wishlistItem.findUnique({
      where: { id },
      include: {
        wishlist: true,
      },
    });

    if (!item) {
      return res.status(404).json({ error: 'Item non trouvé' });
    }

    if (item.wishlist.clientId !== req.user.id) {
      return res.status(403).json({ error: 'Non autorisé' });
    }

    if (item.wishlist.status !== 'DRAFT') {
      return res.status(400).json({
        error: 'Impossible de modifier une demande déjà soumise'
      });
    }

    // Delete item
    await prisma.wishlistItem.delete({
      where: { id },
    });

    // Update wishlist total
    const allItems = await prisma.wishlistItem.findMany({
      where: { wishlistId: item.wishlistId },
    });

    const newTotalAmount = allItems.reduce(
      (sum, item) => sum.add(item.totalPrice),
      new Decimal(0)
    );

    await prisma.clientWishlist.update({
      where: { id: item.wishlistId },
      data: { totalAmount: newTotalAmount },
    });

    // Return updated wishlist
    const updatedWishlist = await prisma.clientWishlist.findUnique({
      where: { id: item.wishlistId },
      include: {
        items: {
          orderBy: {
            createdAt: 'asc',
          },
        },
      },
    });

    res.json({
      message: 'Item supprimé du panier',
      wishlist: updatedWishlist,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Clear wishlist (remove all items)
 */
export const clearWishlist = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!req.user || req.user.role !== 'CLIENT') {
      return res.status(401).json({ error: 'Non authentifié' });
    }

    // Find draft wishlist
    const wishlist = await prisma.clientWishlist.findFirst({
      where: {
        clientId: req.user.id,
        status: 'DRAFT',
      },
    });

    if (!wishlist) {
      return res.status(404).json({ error: 'Panier non trouvé' });
    }

    // Delete all items
    await prisma.wishlistItem.deleteMany({
      where: { wishlistId: wishlist.id },
    });

    // Update total
    await prisma.clientWishlist.update({
      where: { id: wishlist.id },
      data: { totalAmount: 0 },
    });

    // Return empty wishlist
    const updatedWishlist = await prisma.clientWishlist.findUnique({
      where: { id: wishlist.id },
      include: {
        items: true,
      },
    });

    res.json({
      message: 'Panier vidé',
      wishlist: updatedWishlist,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Submit wishlist (change status to SUBMITTED)
 */
export const submitWishlist = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!req.user || req.user.role !== 'CLIENT') {
      return res.status(401).json({ error: 'Non authentifié' });
    }

    // Find draft wishlist
    const wishlist = await prisma.clientWishlist.findFirst({
      where: {
        clientId: req.user.id,
        status: 'DRAFT',
      },
      include: {
        items: true,
      },
    });

    if (!wishlist) {
      return res.status(404).json({ error: 'Panier non trouvé' });
    }

    if (wishlist.items.length === 0) {
      return res.status(400).json({ error: 'Le panier est vide' });
    }

    // Update status to SUBMITTED
    const updatedWishlist = await prisma.clientWishlist.update({
      where: { id: wishlist.id },
      data: {
        status: 'SUBMITTED',
        submittedAt: new Date(),
      },
      include: {
        items: {
          orderBy: {
            createdAt: 'asc',
          },
        },
        client: {
          select: {
            id: true,
            name: true,
            companyName: true,
            email: true,
          },
        },
      },
    });

    // TODO: Send notification to admin

    res.json({
      message: 'Demande soumise avec succès',
      wishlist: updatedWishlist,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get available candidates count for a city (excluding already purchased)
 */
export const getAvailableCandidatesCount = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!req.user || req.user.role !== 'CLIENT') {
      return res.status(401).json({ error: 'Non authentifié' });
    }

    const { city } = req.params;

    // Count evaluated candidates
    const evaluatedCount = await prisma.candidate.count({
      where: {
        city,
        isActive: true,
        isArchived: false,
        isDeleted: false,
        NOT: {
          purchases: {
            some: {
              clientId: req.user.id,
            },
          },
        },
      },
    });

    // Count CV-only prospects
    const cvOnlyCount = await prisma.prospectCandidate.count({
      where: {
        city,
        isDeleted: false,
        isConverted: false,
        NOT: {
          purchases: {
            some: {
              clientId: req.user.id,
            },
          },
        },
      },
    });

    res.json({
      city,
      available: {
        evaluated: evaluatedCount,
        cvOnly: cvOnlyCount,
      },
    });
  } catch (error) {
    next(error);
  }
};

// =============================================================================
// ADMIN ENDPOINTS
// =============================================================================

/**
 * Get all wishlists (Admin only)
 * Supports filtering by status, client, and date range
 */
export const getAllWishlists = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!req.user || req.user.role !== 'ADMIN') {
      return res.status(403).json({ error: 'Accès interdit - Admin uniquement' });
    }

    const { status, clientId, startDate, endDate } = req.query;

    // Build filter
    const where: any = {};

    if (status) {
      where.status = status;
    }

    if (clientId) {
      where.clientId = clientId;
    }

    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) {
        where.createdAt.gte = new Date(startDate as string);
      }
      if (endDate) {
        where.createdAt.lte = new Date(endDate as string);
      }
    }

    const wishlists = await prisma.clientWishlist.findMany({
      where,
      include: {
        client: {
          select: {
            id: true,
            name: true,
            companyName: true,
            email: true,
            phone: true,
          },
        },
        items: {
          include: {
            _count: true,
          },
        },
        _count: {
          select: {
            items: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    // Calculate summary stats
    const stats = {
      total: wishlists.length,
      draft: wishlists.filter(w => w.status === 'DRAFT').length,
      submitted: wishlists.filter(w => w.status === 'SUBMITTED').length,
      approved: wishlists.filter(w => w.status === 'APPROVED').length,
      paid: wishlists.filter(w => w.status === 'PAID').length,
      delivered: wishlists.filter(w => w.status === 'DELIVERED').length,
      cancelled: wishlists.filter(w => w.status === 'CANCELLED').length,
      totalRevenue: wishlists
        .filter(w => w.status === 'PAID' || w.status === 'DELIVERED')
        .reduce((sum, w) => sum + Number(w.totalAmount), 0),
      pendingRevenue: wishlists
        .filter(w => w.status === 'APPROVED')
        .reduce((sum, w) => sum + Number(w.totalAmount), 0),
    };

    res.json({
      wishlists,
      stats,
      count: wishlists.length,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get single wishlist by ID (Admin only)
 */
export const getWishlistById = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!req.user || req.user.role !== 'ADMIN') {
      return res.status(403).json({ error: 'Accès interdit - Admin uniquement' });
    }

    const { id } = req.params;

    const wishlist = await prisma.clientWishlist.findUnique({
      where: { id },
      include: {
        client: {
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
            billingEmail: true,
            defaultPricePerCandidate: true,
            discountPercent: true,
          },
        },
        items: true,
      },
    });

    if (!wishlist) {
      return res.status(404).json({ error: 'Wishlist non trouvée' });
    }

    res.json({ wishlist });
  } catch (error) {
    next(error);
  }
};

/**
 * Update wishlist status (Admin only)
 * Allows admin to approve, reject, mark as paid, or deliver
 */
export const updateWishlistStatus = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!req.user || req.user.role !== 'ADMIN') {
      return res.status(403).json({ error: 'Accès interdit - Admin uniquement' });
    }

    const { id } = req.params;
    const { status, adminNotes } = req.body;

    // Validate status
    const validStatuses = ['DRAFT', 'SUBMITTED', 'APPROVED', 'PAID', 'DELIVERED', 'CANCELLED'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ error: 'Status invalide' });
    }

    // Get existing wishlist
    const existingWishlist = await prisma.clientWishlist.findUnique({
      where: { id },
    });

    if (!existingWishlist) {
      return res.status(404).json({ error: 'Wishlist non trouvée' });
    }

    // Update wishlist
    const wishlist = await prisma.clientWishlist.update({
      where: { id },
      data: {
        status,
        adminNotes,
        updatedAt: new Date(),
      },
      include: {
        client: {
          select: {
            id: true,
            name: true,
            companyName: true,
            email: true,
          },
        },
        items: true,
      },
    });

    res.json({
      message: `Wishlist mise à jour avec succès - Status: ${status}`,
      wishlist,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Delete/Cancel wishlist (Admin only)
 */
export const deleteWishlist = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!req.user || req.user.role !== 'ADMIN') {
      return res.status(403).json({ error: 'Accès interdit - Admin uniquement' });
    }

    const { id } = req.params;

    // Check if wishlist exists
    const existingWishlist = await prisma.clientWishlist.findUnique({
      where: { id },
    });

    if (!existingWishlist) {
      return res.status(404).json({ error: 'Wishlist non trouvée' });
    }

    // Instead of deleting, mark as cancelled
    const wishlist = await prisma.clientWishlist.update({
      where: { id },
      data: {
        status: 'CANCELLED',
        updatedAt: new Date(),
      },
    });

    res.json({
      message: 'Wishlist annulée avec succès',
      wishlist,
    });
  } catch (error) {
    next(error);
  }
};
