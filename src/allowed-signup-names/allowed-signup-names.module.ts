import { Module } from '@nestjs/common';
import { AllowedSignupNamesService } from './allowed-signup-names.service.js';
import { AdminAllowedSignupNamesController } from './admin-allowed-signup-names.controller.js';
import { AuditModule } from '../common/audit/audit.module.js';

// Admin-only: there is deliberately no public controller. An anonymous
// endpoint that confirmed whether a name is on the list would let anyone
// enumerate approved names, so a visitor only learns the outcome by
// attempting to register.
@Module({
  imports: [AuditModule],
  controllers: [AdminAllowedSignupNamesController],
  providers: [AllowedSignupNamesService],
  exports: [AllowedSignupNamesService],
})
export class AllowedSignupNamesModule {}
