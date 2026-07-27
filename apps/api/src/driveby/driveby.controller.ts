import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { ApiTokenGuard } from '../auth/api-token.guard';
import { DrivebyService } from './driveby.service';

@Controller('drive-by')
@UseGuards(ApiTokenGuard)
export class DrivebyController {
  constructor(private readonly driveby: DrivebyService) {}

  @Get()
  list(@Query('limit') limit?: string) {
    return this.driveby.list(limit ? parseInt(limit, 10) : 50);
  }

  @Get('nearest')
  nearest(
    @Query('lat') lat?: string,
    @Query('lng') lng?: string,
    @Query('maxMeters') maxMeters?: string,
  ) {
    const latitude = Number(lat);
    const longitude = Number(lng);
    return this.driveby
      .findNearestParcel(latitude, longitude, maxMeters ? Number(maxMeters) : 250)
      .then((hit) => ({ nearest: hit }));
  }

  @Post()
  create(
    @Body()
    body: {
      latitude: number;
      longitude: number;
      note?: string;
      tags?: string[];
      imageBase64?: string;
      mediaType?: string;
      pin?: string;
    },
  ) {
    return this.driveby.create(body);
  }
}
