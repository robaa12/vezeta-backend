import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiCookieAuth,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiProduces,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { CreateAllowedSignupNameDto } from './dto/create-allowed-signup-name.dto.js';
import { ListAllowedSignupNamesDto } from './dto/list-allowed-signup-names.dto.js';
import { UpdateAllowedSignupNameDto } from './dto/update-allowed-signup-name.dto.js';
import {
  AllowedSignupNamesService,
  type ListAllowedSignupNamesResult,
} from './allowed-signup-names.service.js';
import { Roles } from '../common/decorators/roles.decorator.js';
import { RolesGuard } from '../common/guards/roles.guard.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { AuditService } from '../common/audit/audit.service.js';
import type { AllowedSignupNameResponseDto } from './dto/allowed-signup-name-response.dto.js';
import type { SessionUser } from '../common/interfaces/session.interface.js';

@ApiTags('admin')
@ApiProduces('application/json')
@ApiCookieAuth('vezeta.session_token')
@ApiUnauthorizedResponse({ description: 'No active session.' })
@ApiForbiddenResponse({ description: 'Requires the admin role.' })
@Controller('api/admin/allowed-signup-names')
@UseGuards(RolesGuard)
@Roles('admin')
export class AdminAllowedSignupNamesController {
  constructor(
    private readonly allowedSignupNamesService: AllowedSignupNamesService,
    private readonly audit: AuditService,
  ) {}

  @Get()
  @ApiOperation({
    summary: 'List allowed signup names (admin)',
    description:
      'Returns allowlist entries with optional status + search filters and pagination. Admin-only.',
  })
  @ApiOkResponse({ description: 'Paginated list of allowed names.' })
  list(
    @Query() query: ListAllowedSignupNamesDto,
  ): Promise<ListAllowedSignupNamesResult> {
    return this.allowedSignupNamesService.listAllowedSignupNames(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get an allowed name by id (admin)' })
  @ApiParam({ name: 'id', description: 'Allowed name id (cuid)' })
  @ApiOkResponse({ description: 'Allowed name found.' })
  @ApiNotFoundResponse({ description: 'Allowed name not found.' })
  getOne(@Param('id') id: string): Promise<AllowedSignupNameResponseDto> {
    return this.allowedSignupNamesService.getAllowedSignupName(id);
  }

  @Post()
  @ApiOperation({
    summary: 'Allow a name to register (admin)',
    description:
      'The name must be exactly four words. It admits exactly one account, after which it becomes USED.',
  })
  @ApiCreatedResponse({ description: 'Allowed name created.' })
  @ApiBadRequestResponse({
    description: 'Validation error, or the name is not exactly four words.',
  })
  @ApiConflictResponse({ description: 'This name is already on the allowlist.' })
  create(
    @Body() body: CreateAllowedSignupNameDto,
    @CurrentUser() admin: SessionUser,
  ): Promise<AllowedSignupNameResponseDto> {
    return this.allowedSignupNamesService
      .createAllowedSignupName(body)
      .then((entry) => {
        void this.audit.record({
          actorId: admin.id,
          action: 'allowedSignupName.create',
          entityType: 'allowedSignupName',
          entityId: entry.id,
          details: { name: entry.name },
        });
        return entry;
      });
  }

  @Patch(':id')
  @ApiOperation({
    summary: 'Update an allowed name (partial)',
    description:
      'Setting status back to ACTIVE releases a consumed entry so it can admit another account.',
  })
  @ApiParam({ name: 'id', description: 'Allowed name id (cuid)' })
  @ApiOkResponse({ description: 'Allowed name updated.' })
  @ApiNotFoundResponse({ description: 'Allowed name not found.' })
  @ApiBadRequestResponse({
    description: 'No fields to update, or the name is not exactly four words.',
  })
  @ApiConflictResponse({
    description: 'Another ACTIVE entry already holds this name.',
  })
  update(
    @Param('id') id: string,
    @Body() body: UpdateAllowedSignupNameDto,
    @CurrentUser() admin: SessionUser,
  ): Promise<AllowedSignupNameResponseDto> {
    return this.allowedSignupNamesService
      .updateAllowedSignupName(id, body)
      .then((entry) => {
        void this.audit.record({
          actorId: admin.id,
          action: 'allowedSignupName.update',
          entityType: 'allowedSignupName',
          entityId: id,
          details: { changedFields: Object.keys(body) },
        });
        return entry;
      });
  }

  @Patch(':id/deactivate')
  @ApiOperation({ summary: 'Soft-deactivate an allowed name' })
  @ApiParam({ name: 'id', description: 'Allowed name id (cuid)' })
  @ApiOkResponse({ description: 'Allowed name deactivated (idempotent).' })
  @ApiNotFoundResponse({ description: 'Allowed name not found.' })
  deactivate(
    @Param('id') id: string,
    @CurrentUser() admin: SessionUser,
  ): Promise<AllowedSignupNameResponseDto> {
    return this.allowedSignupNamesService
      .deactivateAllowedSignupName(id)
      .then((entry) => {
        void this.audit.record({
          actorId: admin.id,
          action: 'allowedSignupName.deactivate',
          entityType: 'allowedSignupName',
          entityId: id,
        });
        return entry;
      });
  }

  @Delete(':id')
  @HttpCode(204)
  @ApiOperation({ summary: 'Hard-delete an allowed name' })
  @ApiParam({ name: 'id', description: 'Allowed name id (cuid)' })
  @ApiNoContentResponse({ description: 'Allowed name deleted.' })
  @ApiNotFoundResponse({ description: 'Allowed name not found.' })
  async delete(
    @Param('id') id: string,
    @CurrentUser() admin: SessionUser,
  ): Promise<void> {
    await this.allowedSignupNamesService.deleteAllowedSignupName(id);
    void this.audit.record({
      actorId: admin.id,
      action: 'allowedSignupName.delete',
      entityType: 'allowedSignupName',
      entityId: id,
    });
  }
}
