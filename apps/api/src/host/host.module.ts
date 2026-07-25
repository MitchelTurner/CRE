import { Module } from '@nestjs/common';
import { InviteListService } from './invite-list.service';

@Module({
  providers: [InviteListService],
  exports: [InviteListService],
})
export class HostModule {}
