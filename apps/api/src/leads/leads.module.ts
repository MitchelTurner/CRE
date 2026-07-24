import { Module } from '@nestjs/common';
import { LeadsController } from './leads.controller';
import { LeadsService } from './leads.service';
import { OutreachService } from './outreach.service';
import { CrmSyncService } from './crm-sync.service';

@Module({
  controllers: [LeadsController],
  providers: [LeadsService, OutreachService, CrmSyncService],
  exports: [LeadsService, OutreachService, CrmSyncService],
})
export class LeadsModule {}
