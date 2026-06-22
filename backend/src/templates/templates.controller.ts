import {
  Controller, Get, Post, Patch, Delete, Body, Param, UseGuards,
} from '@nestjs/common';
import { TemplatesService } from './templates.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { CreateTemplateDto, UpdateTemplateDto } from './dto';

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('EXPERT', 'ADMIN')
@Controller('templates')
export class TemplatesController {
  constructor(private readonly templates: TemplatesService) {}

  @Get()
  list(@CurrentUser() user: any) {
    return this.templates.list(user.id);
  }

  @Post()
  create(@CurrentUser() user: any, @Body() dto: CreateTemplateDto) {
    return this.templates.create(user.id, dto);
  }

  @Patch(':id')
  update(@CurrentUser() user: any, @Param('id') id: string, @Body() dto: UpdateTemplateDto) {
    return this.templates.update(id, user.id, dto);
  }

  @Get(':id/dataset')
  dataset(@CurrentUser() user: any, @Param('id') id: string) {
    return this.templates.dataset(id, user.id);
  }

  @Delete(':id')
  remove(@CurrentUser() user: any, @Param('id') id: string) {
    return this.templates.remove(id, user.id);
  }
}
