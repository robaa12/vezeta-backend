// Domain event payloads (Constitution Principle II — Domain-Event
// Decoupling). Side-effecty modules (notifications) listen to these
// instead of being called directly. Events are emitted after a
// successful state transition in the owning service.

export interface AppointmentEventPayload {
  appointmentId: string;
  userId: string;
  doctorId: string;
  doctorName: string;
  categoryName: string;
  scheduledAt: Date;
  status: string;
}

export interface AppointmentCancelledPayload extends AppointmentEventPayload {
  cancelledBy: 'USER' | 'ADMIN';
}

export interface ReviewPostedPayload {
  reviewId: string;
  appointmentId: string;
  userId: string;
  doctorId: string;
  doctorName: string;
  rating: number;
  comment: string | null;
}

export interface MedicalRecordEventPayload {
  medicalRecordId: string;
  appointmentId: string;
  patientId: string;
  doctorId: string;
  doctorName: string;
  createdById: string;
}

export const APPOINTMENT_CREATED = 'appointment.created';
export const APPOINTMENT_CONFIRMED = 'appointment.confirmed';
export const APPOINTMENT_CANCELLED = 'appointment.cancelled';
export const APPOINTMENT_COMPLETED = 'appointment.completed';
export const REVIEW_POSTED = 'review.posted';
export const MEDICAL_RECORD_CREATED = 'medical.record.created';
export const MEDICAL_RECORD_UPDATED = 'medical.record.updated';
