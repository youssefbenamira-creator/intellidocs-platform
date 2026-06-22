import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Body,
  UseGuards,
  ParseIntPipe,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { DocumentsService } from './documents.service';

interface MulterFile {
  fieldname: string;
  originalname: string;
  encoding: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50 MB

@UseGuards(JwtAuthGuard)
@Controller('documents')
export class DocumentsController {
  constructor(private readonly documentsService: DocumentsService) {}

  @UseGuards(RolesGuard)
  @Roles('EXPERT', 'ADMIN')
  @Post('upload')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: MAX_FILE_SIZE },
    }),
  )
  upload(
    @UploadedFile() file: MulterFile,
    @CurrentUser() user: any,
    @Body() body: { templateId?: string; columns?: string },
  ) {
    if (!file) throw new BadRequestException('No file provided');
    const templateId = body?.templateId || undefined;
    const columns = body?.columns
      ? String(body.columns).split(',').map((c) => c.trim()).filter(Boolean)
      : undefined;
    return this.documentsService.upload(file, user.id, { templateId, columns });
  }

  @Get()
  findAll(@CurrentUser() user: any) {
    return this.documentsService.findAll(user.id, user.role);
  }

  @Get(':id')
  findOne(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: any,
  ) {
    return this.documentsService.findOne(id, user.id, user.role);
  }

  @UseGuards(RolesGuard)
  @Roles('EXPERT', 'ADMIN')
  @Delete(':id')
  delete(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: any,
  ) {
    return this.documentsService.delete(id, user.id, user.role);
  }
}
