export type AuditLog = {
  id: string;
  timestamp: string;
  actorId: string;        // uid of person who performed action
  actorEmail: string;     // email for display
  actionType: string;     // 'client_edited', 'quote_created', 'rota_changed', etc.
  entityType: string;     // 'client', 'quote', 'rota', 'payment'
  entityId: string;       // ID of affected record
  entityName?: string;    // Display name (client name, quote address, etc.)
  description: string;    // "Changed Client details", "Added quote", etc.
  ownerId: string;        // For scoping to account
};

export type AuditActionType = 
  | 'client_created'
  | 'client_edited' 
  | 'client_archived'
  | 'client_round_order_changed'
  | 'quote_created'
  | 'quote_edited'
  | 'quote_progressed'
  | 'quote_deleted'
  | 'rota_availability_changed'
  | 'payment_created'
  | 'payment_edited'
  | 'payment_deleted'
  | 'member_permissions_changed'
  | 'member_daily_rate_changed'
  | 'job_created'
  | 'job_price_changed'
  | 'job_deleted'
  | 'job_completed'
  | 'runsheet_note_added'
  | 'recurring_service_added'
  | 'gocardless_payments_processed';

export type AuditEntityType = 'client' | 'quote' | 'rota' | 'payment' | 'member' | 'job'; 