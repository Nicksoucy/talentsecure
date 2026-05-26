export type UniformDivision = 'SECURITE' | 'SIGNALISATION';
export type UniformPieceType = 'UNIFORME' | 'EQUIPEMENT';
export type UniformMovementType = 'IN' | 'OUT' | 'ADJUST' | 'LOST' | 'DAMAGED';
export type UniformItemCondition = 'GOOD' | 'DAMAGED' | 'LOST' | 'NOT_RETURNED';
export type UniformIssuanceStatus =
  | 'DRAFT'
  | 'ISSUED'
  | 'PARTIALLY_RETURNED'
  | 'RETURNED'
  | 'CLOSED_TERMINATION'
  | 'CANCELLED';
export type UniformSignatureStatus = 'PENDING' | 'SENT' | 'SIGNED' | 'SKIPPED';
export type UniformSignatureMethod = 'REMOTE_SMS' | 'COUNTER';

export interface UniformVariant {
  id: string;
  itemId: string;
  size: string;
  sku?: string | null;
  barcode: string;
  replacementCost: string | number;
  quantityOnHand: number;
  reorderThreshold?: number | null;
  isActive: boolean;
  item?: UniformItem;
}

export interface UniformItem {
  id: string;
  division: UniformDivision;
  type: UniformPieceType;
  name: string;
  isOneSize: boolean;
  defaultReplacementCost: string | number;
  sortOrder: number;
  isActive: boolean;
  variants?: UniformVariant[];
}

export interface UniformMovement {
  id: string;
  variantId: string;
  type: UniformMovementType;
  quantity: number;
  reason?: string | null;
  createdAt: string;
  variant?: UniformVariant;
}

export interface UniformIssuanceLine {
  id: string;
  variantId?: string | null;
  customItemName?: string | null;
  quantity: number;
  unitCostSnapshot: string | number;
  variant?: UniformVariant;
}

export interface UniformIssuance {
  id: string;
  employeeId: string;
  employeeName?: string;
  division: UniformDivision;
  status: UniformIssuanceStatus;
  notes?: string | null;
  issuedAt?: string | null;
  dueReturnAt?: string | null;
  totalLoanCost: string | number;
  signatureStatus: UniformSignatureStatus;
  signatureMethod?: UniformSignatureMethod | null;
  signedAt?: string | null;
  smsSentAt?: string | null;
  employeeSignatureStoragePath?: string | null;
  employerSignatureStoragePath?: string | null;
  formPdfStoragePath?: string | null;
  itemsCount?: number;
  createdAt: string;
  lines?: UniformIssuanceLine[];
  employee?: any;
}

export interface UniformReturnLine {
  id: string;
  variantId?: string | null;
  customItemName?: string | null;
  quantity: number;
  condition: UniformItemCondition;
  unitReplacementCost: string | number;
  variant?: UniformVariant;
}

export interface UniformReturn {
  id: string;
  issuanceId: string;
  employeeId: string;
  status: UniformIssuanceStatus;
  returnedAt?: string | null;
  signatureStatus: UniformSignatureStatus;
  createdAt: string;
  lines?: UniformReturnLine[];
}

export interface Holding {
  variantId: string;
  itemId: string;
  itemName: string;
  division: string;
  type: string;
  size: string;
  barcode: string;
  replacementCost: number;
  quantity: number;
}

export interface AmountOwed {
  charged: number;
  settled: number;
  owed: number;
}

export interface SignPayload {
  kind: 'pret' | 'retour';
  alreadySigned: boolean;
  employeeFirstName: string | null;
  division: UniformDivision | null;
  lines: { name: string; size: string; quantity: number; condition?: string; unitCost?: number; lineTotal?: number }[];
  total?: number;
  consents: { payroll: string; policy: string | null; fit: string | null };
}
