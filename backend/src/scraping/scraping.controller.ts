import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  ParseIntPipe,
} from '@nestjs/common';
import { ScrapingService } from './scraping.service';
import { CreateJobDto } from './dto/create-job.dto';
import { UpdateJobDto } from './dto/update-job.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@UseGuards(JwtAuthGuard)
@Controller('scraping')
export class ScrapingController {
  constructor(private readonly scrapingService: ScrapingService) {}

  @UseGuards(RolesGuard)
  @Roles('EXPERT', 'ADMIN')
  @Post('jobs')
  createJob(@Body() dto: CreateJobDto, @CurrentUser() user: any) {
    return this.scrapingService.createJob(dto, user.id);
  }

  @Get('jobs')
  findAllJobs(@CurrentUser() user: any) {
    return this.scrapingService.findAllJobs(user.id, user.role);
  }

  @UseGuards(RolesGuard)
  @Roles('EXPERT', 'ADMIN')
  @Patch('jobs/:id')
  updateJob(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateJobDto,
    @CurrentUser() user: any,
  ) {
    return this.scrapingService.updateJob(id, dto, user.id, user.role);
  }

  @UseGuards(RolesGuard)
  @Roles('EXPERT', 'ADMIN')
  @Delete('jobs/:id')
  deleteJob(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: any) {
    return this.scrapingService.deleteJob(id, user.id, user.role);
  }

  @Get('results')
  findResults(
    @Query('coin') coin?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.scrapingService.findResults(coin, from, to);
  }

  @Get('results/:jobId')
  findResultsByJob(@Param('jobId', ParseIntPipe) jobId: number) {
    return this.scrapingService.findResultsByJob(jobId);
  }
}
