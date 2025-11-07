// User types
export type UserRole = 'ADMIN' | 'RH_RECRUITER' | 'SALES';

export interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: UserRole;
  isActive: boolean;
  lastLoginAt?: string;
  createdAt: string;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface LoginCredentials {
  email: string;
  password: string;
}

export interface RegisterData {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  role?: UserRole;
}

// Candidate types
export type CandidateStatus =
  | 'QUALIFIE'
  | 'BON'
  | 'TRES_BON'
  | 'EXCELLENT'
  | 'ELITE'
  | 'A_REVOIR'
  | 'EN_ATTENTE'
  | 'INACTIF';

export interface Candidate {
  id: string;
  firstName: string;
  lastName: string;
  email?: string;
  phone: string;
  address?: string;
  city: string;
  province: string;
  postalCode?: string;
  status: CandidateStatus;
  globalRating?: number;
  interviewDate?: string;
  hasVehicle: boolean;
  hasBSP: boolean;
  videoUrl?: string;
  createdAt: string;
  updatedAt: string;
}

// Catalogue types
export type CatalogueStatus = 'BROUILLON' | 'GENERE' | 'ENVOYE' | 'ACCEPTE' | 'REFUSE';

export interface Catalogue {
  id: string;
  title: string;
  clientId: string;
  status: CatalogueStatus;
  pdfUrl?: string;
  createdAt: string;
  updatedAt: string;
}

// Client types
export interface Client {
  id: string;
  name: string;
  companyName?: string;
  email: string;
  phone?: string;
  isActive: boolean;
  createdAt: string;
}

// API Response types
export interface ApiResponse<T> {
  data?: T;
  message?: string;
  error?: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}
