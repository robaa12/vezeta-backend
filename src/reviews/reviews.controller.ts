import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  HttpCode,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { AllowAnonymous } from '@thallesp/nestjs-better-auth';
import {
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiCookieAuth,
  ApiForbiddenResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiProduces,
  ApiTags,
  ApiTooManyRequestsResponse,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { Roles } from '../common/decorators/roles.decorator.js';
import { RolesGuard } from '../common/guards/roles.guard.js';
import type { SessionUser } from '../common/interfaces/session.interface.js';
import { ReviewsService } from './reviews.service.js';
import { CreateReviewDto } from './dto/create-review.dto.js';
import { ListReviewsDto } from './dto/list-reviews.dto.js';
import type {
  ListReviewsResult,
  ReviewResponseDto,
} from './dto/review-response.dto.js';

@ApiTags('reviews')
@ApiProduces('application/json')
@Controller('api')
export class ReviewsController {
  constructor(private readonly reviewsService: ReviewsService) {}

  /**
   * Patient submits a review for a COMPLETED appointment they own.
   * Enforced at the service layer: appointment must exist, belong to
   * the caller, be COMPLETED, and not already have a review.
   */
  @Post('appointments/:id/review')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @ApiCookieAuth('vezeta.session_token')
  @ApiOperation({ summary: 'Leave a review for a completed appointment' })
  @ApiParam({ name: 'id', description: 'Appointment id (cuid)' })
  @ApiOkResponse({ description: 'Review created.' })
  @ApiBadRequestResponse({ description: 'Validation error.' })
  @ApiUnauthorizedResponse({ description: 'No active session.' })
  @ApiForbiddenResponse({ description: 'Account is deactivated.' })
  @ApiNotFoundResponse({
    description:
      'Appointment does not exist or belongs to a different patient.',
  })
  @ApiConflictResponse({
    description:
      'Appointment is not COMPLETED, or a review already exists for it.',
  })
  createReview(
    @Param('id') id: string,
    @Body() body: CreateReviewDto,
    @CurrentUser() user: SessionUser,
  ): Promise<{ review: ReviewResponseDto }> {
    return this.reviewsService.createReview(user.id, id, body);
  }

  /**
   * Public paginated list of a doctor's reviews with the aggregate
   * rating inlined. Cache-Control + throttler hints similar to the
   * other public catalog endpoints.
   */
  @Get('doctors/:id/reviews')
  @AllowAnonymous()
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @Header('Cache-Control', 'public, max-age=60')
  @ApiOperation({
    summary: "List a doctor's reviews (public)",
    description:
      'Paginated list of reviews for a doctor, sorted newest-first, with the aggregate averageRating inlined.',
  })
  @ApiParam({ name: 'id', description: 'Doctor id (cuid)' })
  @ApiOkResponse({ description: 'Paginated reviews + aggregate rating.' })
  @ApiNotFoundResponse({ description: 'Doctor not found.' })
  @ApiTooManyRequestsResponse({ description: 'Rate limit exceeded.' })
  listDoctorReviews(
    @Param('id') id: string,
    @Query() query: ListReviewsDto,
  ): Promise<ListReviewsResult> {
    return this.reviewsService.listDoctorReviews(id, query);
  }
}

@ApiTags('admin')
@ApiProduces('application/json')
@ApiCookieAuth('vezeta.session_token')
@ApiUnauthorizedResponse({ description: 'No active session.' })
@ApiForbiddenResponse({ description: 'Requires the admin role.' })
@Controller('api/admin/reviews')
@UseGuards(RolesGuard)
@Roles('admin')
export class AdminReviewsController {
  constructor(private readonly reviewsService: ReviewsService) {}

  @Get()
  @ApiOperation({
    summary: 'List all reviews (admin moderation surface)',
    description:
      'Paginated list of all reviews. Optional filters: doctorId, userId.',
  })
  @ApiOkResponse({ description: 'Paginated list of reviews.' })
  listReviews(
    @Query()
    query: {
      doctorId?: string;
      userId?: string;
      page?: number;
      pageSize?: number;
    },
  ): Promise<ListReviewsResult> {
    return this.reviewsService.listAdminReviews(query);
  }

  @Delete(':id')
  @HttpCode(204)
  @ApiOperation({ summary: 'Delete a review (admin moderation)' })
  @ApiParam({ name: 'id', description: 'Review id (cuid)' })
  @ApiNoContentResponse({ description: 'Review deleted.' })
  @ApiNotFoundResponse({ description: 'Review not found.' })
  async deleteReview(@Param('id') id: string): Promise<void> {
    await this.reviewsService.deleteReview(id);
  }
}
