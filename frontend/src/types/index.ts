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
  | 'INACTIF'
  | 'ABSENT';

export interface Candidate {
  id: string;

  // Personal information
  firstName: string;
  lastName: string;
  email?: string;
  phone: string;
  address?: string;
  city: string;
  province: string;
  postalCode?: string;

  // Status and evaluation
  status: CandidateStatus;
  globalRating?: number;
  interviewDate?: string;

  // Detailed ratings
  professionalismRating?: number;
  communicationRating?: number;
  appearanceRating?: number;
  motivationRating?: number;
  experienceRating?: number;

  // HR comments
  hrNotes?: string;
  strengths?: string;
  weaknesses?: string;

  // Interview details (JSON)
  interviewDetails?: any;

  // Availability
  hasVehicle: boolean;
  canTravelKm?: number;

  // Licenses and certifications
  hasBSP: boolean;
  bspNumber?: string;
  bspExpiryDate?: string;
  bspStatus?: string;

  hasDriverLicense?: boolean;
  driverLicenseNumber?: string;
  driverLicenseClass?: string;

  // 24h urgency
  urgency24hScore?: number;
  canWorkUrgent?: boolean;

  // Interview video
  videoUrl?: string;
  videoUploadedAt?: string;
  videoStoragePath?: string;

  // CV and documents
  cvUrl?: string;
  cvStoragePath?: string;
  documentsUrls?: string[];

  // LPRPDE consent
  hasConsent?: boolean;
  consentDate?: string;
  consentSignature?: string;

  // Archive
  isArchived: boolean;
  archivedAt?: string;
  archivedById?: string;

  // Metadata
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

// Prospect Candidate types (not yet interviewed)
export interface ProspectCandidate {
  id: string;
  firstName: string;
  lastName: string;
  email?: string;
  phone: string;
  streetAddress?: string;
  city?: string;
  province?: string;
  postalCode?: string;
  country?: string;
  fullAddress?: string;
  cvUrl?: string;
  cvStoragePath?: string;
  timezone?: string;
  submissionDate?: string;
  isContacted: boolean;
  contactedAt?: string;
  notes?: string;
  isConverted: boolean;
  convertedAt?: string;
  convertedToId?: string;
  createdAt: string;
  updatedAt: string;
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
