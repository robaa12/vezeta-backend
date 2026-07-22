import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { NotificationsService } from '../notifications.service.js';
import {
  MEDICAL_RECORD_CREATED,
  REVIEW_POSTED,
  type MedicalRecordEventPayload,
  type ReviewPostedPayload,
} from '../../common/events/domain-events.js';

@Injectable()
export class FeedbackListener {
  constructor(private readonly notifications: NotificationsService) {}

  /**
   * Patient → confirm a review was submitted. Mirrors the
   * appointment.completed "you can leave a review now" message;
   * we send this confirmation so the patient trusts the submission
   * landed.
   */
  @OnEvent(REVIEW_POSTED)
  async handleReviewPosted(payload: ReviewPostedPayload): Promise<void> {
    await this.notifications.enqueue({
      userId: payload.userId,
      title: 'Review submitted',
      body: `Thank you for reviewing ${payload.doctorName}. Your ${payload.rating}-star rating helps other patients.`,
      metadata: { kind: 'review.posted', reviewId: payload.reviewId },
    });
  }

  /**
   * Patient → notify that a medical record (clinic notes / visit
   * summary) has been added to their completed appointment. The
   * patient owns this data (constitution §VI) so they get told
   * immediately when it's written.
   */
  @OnEvent(MEDICAL_RECORD_CREATED)
  async handleMedicalRecord(payload: MedicalRecordEventPayload): Promise<void> {
    await this.notifications.enqueue({
      userId: payload.patientId,
      title: 'Medical record added',
      body: `A medical record from your visit with ${payload.doctorName} has been added to your history.`,
      metadata: {
        kind: 'medical.record.created',
        medicalRecordId: payload.medicalRecordId,
        appointmentId: payload.appointmentId,
      },
    });
  }
}
