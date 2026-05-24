import clientApi from './clientApi';

export interface TalentPreview {
    id: string;
    firstName: string;
    city: string;
    province: string;
    globalRating: number;
    status: string;

    // Availability
    available24_7: boolean;
    availableDays: boolean;
    availableNights: boolean;
    availableWeekends: boolean;
    availableImmediately: boolean;

    // Certifications
    hasBSP: boolean;
    bspExpiryDate: string | null;
    hasDriverLicense: boolean;
    hasVehicle: boolean;
    vehicleType: string | null;
    hasRCR: boolean;

    // Experience
    experiences: Array<{
        position: string;
        companyName: string;
        durationMonths: number | null;
        isCurrent: boolean;
    }>;

    // Languages
    languages: Array<{
        language: string;
        level: string;
    }>;

    // Skills
    skills: Array<{
        level: string;
        skill: {
            name: string;
            category: string;
        };
    }>;

    // Marketplace flags
    clientNote?: string | null;
    hasVideo?: boolean;
    purchased?: boolean;
}

export interface CityOption {
    city: string;
    province: string;
    count: number;
}

export interface TalentDetail extends TalentPreview {
    clientNote?: string | null;
    hasVideo?: boolean;
    purchased?: boolean;
    // Coordonnées : présentes UNIQUEMENT après achat
    lastName?: string;
    email?: string;
    phone?: string;
}

export interface PurchasedCandidate {
    id: string;
    price: number;
    city: string;
    purchasedAt: string;
    candidate: {
        id: string;
        firstName: string;
        lastName: string;
        email: string | null;
        phone: string;
        city: string;
        province: string;
        globalRating: number | null;
        clientNote: string | null;
    };
}

export const talentMarketplaceService = {
    /**
     * Search talents by city
     */
    searchByCity: async (params: {
        city: string;
        mode?: 'evaluated' | 'cvonly';
        minRating?: number;
        hasVehicle?: boolean;
        available24_7?: boolean;
        availableDays?: boolean;
        availableNights?: boolean;
        availableWeekends?: boolean;
    }): Promise<{ data: TalentPreview[]; total: number; city: string }> => {
        const response = await clientApi.get('/api/marketplace/talents', { params });
        return response.data;
    },

    /**
     * Get available cities with candidate counts
     */
    getAvailableCities: async (): Promise<{ data: CityOption[] }> => {
        const response = await clientApi.get('/api/marketplace/cities');
        return response.data;
    },

    /** Détail d'un candidat (coordonnées seulement si acheté). */
    getTalentDetail: async (id: string): Promise<{ data: TalentDetail }> => {
        const response = await clientApi.get(`/api/marketplace/talents/${id}`);
        return response.data;
    },

    /** URL signée de la vidéo de présentation. */
    getTalentVideoUrl: async (id: string): Promise<{ success: boolean; data: { videoUrl: string } }> => {
        const response = await clientApi.get(`/api/marketplace/talents/${id}/video`);
        return response.data;
    },

    /** Démarre l'achat Stripe → renvoie l'URL de paiement. */
    checkout: async (id: string): Promise<{ url: string }> => {
        const response = await clientApi.post(`/api/marketplace/talents/${id}/checkout`);
        return response.data;
    },

    /** Candidats achetés par le client (avec coordonnées). */
    getPurchases: async (): Promise<{ data: PurchasedCandidate[] }> => {
        const response = await clientApi.get('/api/marketplace/purchases');
        return response.data;
    },
};
