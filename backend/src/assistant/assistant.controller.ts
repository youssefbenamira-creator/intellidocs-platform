import {
  Controller,
  Post,
  Get,
  Body,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { IsString, IsArray, IsOptional, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { AssistantService } from './assistant.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';

class HistoryMessageDto {
  @IsString()
  role: string;

  @IsString()
  content: string;
}

class ChatDto {
  @IsString()
  question: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => HistoryMessageDto)
  @IsOptional()
  history: HistoryMessageDto[] = [];
}

@UseGuards(JwtAuthGuard)
@Controller('assistant')
export class AssistantController {
  constructor(private readonly assistantService: AssistantService) {}

  @Post('chat')
  chat(@Body() body: ChatDto, @CurrentUser() user: any, @Res() res: Response) {
    return this.assistantService.streamChat(
      body.question, body.history ?? [], user, res,
    );
  }

  @Get('status')
  status() {
    return this.assistantService.getStatus();
  }
}
