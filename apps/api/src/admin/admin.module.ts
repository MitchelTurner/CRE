import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller';
import { DigestModule } from '../digest/digest.module';
import { JobsModule } from '../jobs/jobs.module';

@Module({
  imports: [JobsModule, DigestModule],
  controllers: [AdminController],
})
export class AdminModule {}