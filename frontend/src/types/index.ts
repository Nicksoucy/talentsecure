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

export interface Availability {
  id: string;
  candidateId: string;
  type: string; // 'JOUR', 'SOIR', 'NUIT', 'WEEKEND'
  isAvailable: boolean;
}

export interface Language {
  id: string;
  candidateId: string;
  language: string;
  level: string; // 'DEBUTANT', 'INTERMEDIAIRE', 'AVANCE', 'BILINGUE', 'LANGUE_MATERNELLE'
}

export interface Experience {
  id: string;
  candidateId: string;
  companyName: string;
  position: string;
  startDate?: string;
  endDate?: string;
  isCurrent: boolean;
  durationMonths?: number;
  description?: string;
  responsibilities?: string;
}

export interface Certification {
  id: string;
  candidateId: string;
  name: string;
  issuingOrg?: string;
  issueDate?: string;
  expiryDate?: string;
  certificateUrl?: string;
}

export interface SituationTest {
  id: string;
  candidateId: string;
  question: string;
  answer: string;
  rating?: number;
  evaluatorNotes?: string;
}

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

  // Interview details (JSON) - Deprecated in favor of relations but kept for backward compat
  interviewDetails?: any;

  // Availability
  hasVehicle: boolean;
  canTravelKm?: number;
  vehicleType?: string;

  // Schedule Availability
  available24_7?: boolean;
  availableDays?: boolean;
  availableNights?: boolean;
  availableWeekends?: boolean;
  availableImmediately?: boolean;

  // Work Preferences
  preferredShiftType?: string;
  willingToRelocate?: boolean;
  maxCommuteMins?: number;

  // Licenses and certifications
  hasBSP: boolean;
  bspNumber?: string;
  bspExpiryDate?: string;
  bspStatus?: string;

  // Additional Certifications
  hasRCR?: boolean;
  rcrExpiryDate?: string;
  hasSSIAP?: boolean;
  ssiapExpiryDate?: string;

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

  // Relations
  availabilities?: Availability[];
  languages?: Language[];
  experiences?: Experience[];
  certifications?: Certification[];
  situationTests?: SituationTest[];
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
  isDeleted: boolean;
  deletedAt?: string;
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
