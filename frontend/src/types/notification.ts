export type NotificationType =
  | 'UNIFORM_RETURN_DAMAGED'
  | 'UNIFORM_WASH_BATCH_CREATED'
  | 'UNIFORM_WASH_BATCH_SENT'
  | 'UNIFORM_WASH_BATCH_RETURNED'
  | 'UNIFORM_WASH_BATCH_INSPECTED_DAMAGED'
  | 'UNIFORM_WASH_BATCH_STAGNANT'
  | 'UNIFORM_RETURN_DUE_SOON'
  | 'UNIFORM_RETURN_OVERDUE'
  | 'UNIFORM_TERMINATION_CLOSED'
  | 'UNIFORM_SETTLEMENT_RECORDED'
  | 'UNIFORM_DEBT_AGING'
  | 'UNIFORM_LOW_STOCK'
  | 'UNIFORM_STOCK_ZERO'
  | 'UNIFORM_LEDGER_DRIFT'
  | 'UNIFORM_SIGNATURE_EXPIRING'
  | 'UNIFORM_SIGNATURE_EXPIRED'
  | 'UNIFORM_EMPLOYER_SIGN_PENDING'
  | 'UNIFORM_BARCODE_UNKNOWN'
  | 'UNIFORM_INACTIVE_VARIANT_HAS_STOCK'
  | 'UNIFORM_DUPLICATE_ACTIVE_ISSUANCE';

export type NotificationChannel = 'IN_APP' | 'EMAIL' | 'SMS';
export type NotificationStatus = 'PENDING' | 'SENT' | 'FAILED' | 'READ';

export interface AppNotification {
  id: string;
  userId: string | null;
  type: NotificationType;
  channel: NotificationChannel;
  status: NotificationStatus;
  title: string;
  message: string;
  link: string | null;
  payload?: Record<string, unknown> | null;
  readAt: string | null;
  createdAt: string;
}

export interface NotificationListResponse {
  items: AppNotification[];
  unreadCount: number;
}
