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
}

export interface CityOption {
    city: string;
    province: string;
    count: number;
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
};
