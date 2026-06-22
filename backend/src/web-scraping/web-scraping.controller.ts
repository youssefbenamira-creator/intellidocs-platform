import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  UseGuards,
  ParseIntPipe,
} from '@nestjs/common';
import { WebScrapingService } from './web-scraping.service';
import { CreateUrlJobDto } from './dto/create-url-job.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@UseGuards(JwtAuthGuard)
@Controller('scraping-jobs')
export class WebScrapingController {
  constructor(private readonly webScrapingService: WebScrapingService) {}

  @UseGuards(RolesGuard)
  @Roles('EXPERT', 'ADMIN')
  @Post()
  createJob(@Body() dto: CreateUrlJobDto, @CurrentUser() user: any) {
    return this.webScrapingService.createJob(dto, user.id);
  }

  @Get()
  findAllJobs(@CurrentUser() user: any) {
    return this.webScrapingService.findAllJobs(user.id, user.role);
  }

  // Static sub-resource route MUST come before the dynamic :id route
  @Get('documents/:docId')
  findDocument(@Param('docId', ParseIntPipe) docId: number) {
    return this.webScrapingService.findDocumentById(docId);
  }

  @Get(':id')
  findJobById(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: any,
  ) {
    return this.webScrapingService.findJobById(id, user.id, user.role);
  }

  @Get(':id/documents')
  findDocuments(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: any,
  ) {
    return this.webScrapingService.findDocumentsByJob(id, user.id, user.role);
  }

  @UseGuards(RolesGuard)
  @Roles('EXPERT', 'ADMIN')
  @Delete(':id')
  deleteJob(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: any) {
    return this.webScrapingService.deleteJob(id, user.id, user.role);
  }
}
