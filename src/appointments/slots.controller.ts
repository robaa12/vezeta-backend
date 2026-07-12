import { Controller, Get, Header, Param } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import {
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiProduces,
  ApiTags,
  ApiTooManyRequestsResponse,
} from '@nestjs/swagger';
import { AllowAnonymous } from '@thallesp/nestjs-better-auth';
import { AppointmentsService } from './appointments.service.js';
import type { SlotResponseDto } from './dto/slot-response.dto.js';

@ApiTags('slots')
@ApiProduces('application/json')
@Controller('api/doctors')
export class SlotsController {
  constructor(private readonly appointmentsService: AppointmentsService) {}

  /**
   * US1 — Patient-facing slot picker.
   * Anonymous (no auth). Returns AVAILABLE slots for an ACTIVE
   * doctor in an ACTIVE category, sorted ascending by start time.
   * 60s cache hint (slots are time-sensitive but don't change every
   * second).
   */
  @Get(':doctorId/slots')
  @AllowAnonymous()
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @Header('Cache-Control', 'public, max-age=60')
  @ApiOperation({
    summary: 'List AVAILABLE slots for a doctor (public)',
    description:
      'Anonymous-accessible list of AVAILABLE slots for an ACTIVE doctor in an ACTIVE category, sorted ascending by start time.',
  })
  @ApiParam({ name: 'doctorId', description: 'Doctor id (cuid)' })
  @ApiOkResponse({
    description: 'Available slots, sorted ascending.',
    schema: {
      type: 'object',
      properties: {
        slots: { type: 'array', items: { type: 'object' } },
      },
    },
  })
  @ApiNotFoundResponse({
    description:
      'Doctor not found, is DEACTIVATED, or is in a DEACTIVATED category.',
  })
  @ApiTooManyRequestsResponse({ description: 'Rate limit exceeded.' })
  listPublicSlots(
    @Param('doctorId') doctorId: string,
  ): Promise<{ slots: SlotResponseDto[] }> {
    return this.appointmentsService.listPublicSlots(doctorId);
  }
}
