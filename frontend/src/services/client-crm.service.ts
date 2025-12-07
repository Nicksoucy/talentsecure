import api from './api';

export interface Contact {
    id: string;
    clientId: string;
    firstName: string;
    lastName: string;
    role?: string;
    email?: string;
    phone?: string;
    isPrimary: boolean;
    isActive: boolean;
    notes?: string;
    createdAt: string;
    updatedAt: string;
}

export interface Interaction {
    id: string;
    clientId: string;
    type: string; // EMAIL, CALL, MEETING, NOTE
    direction: string; // INBOUND, OUTBOUND
    subject?: string;
    content?: string;
    createdAt: string;
    user?: {
        id: string;
        firstName: string;
        lastName: string;
    };
}

export const clientCrmService = {
    // CONTACTS
    getContacts: async (clientId: string): Promise<Contact[]> => {
        const response = await api.get(`/api/clients/${clientId}/contacts`);
        return response.data.data;
    },

    createContact: async (clientId: string, data: Partial<Contact>): Promise<Contact> => {
        const response = await api.post(`/api/clients/${clientId}/contacts`, data);
        return response.data.data;
    },

    updateContact: async (clientId: string, contactId: string, data: Partial<Contact>): Promise<Contact> => {
        const response = await api.put(`/api/clients/${clientId}/contacts/${contactId}`, data);
        return response.data.data;
    },

    deleteContact: async (clientId: string, contactId: string): Promise<void> => {
        await api.delete(`/api/clients/${clientId}/contacts/${contactId}`);
    },

    // INTERACTIONS
    getInteractions: async (clientId: string): Promise<Interaction[]> => {
        const response = await api.get(`/api/clients/${clientId}/interactions`);
        return response.data.data;
    },

    createInteraction: async (clientId: string, data: Partial<Interaction>): Promise<Interaction> => {
        const response = await api.post(`/api/clients/${clientId}/interactions`, data);
        return response.data.data;
    },

    deleteInteraction: async (clientId: string, interactionId: string): Promise<void> => {
        await api.delete(`/api/clients/${clientId}/interactions/${interactionId}`);
    },
};
