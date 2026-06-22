import { Module } from '@nestjs/common';
import { AssistantService } from './assistant.service';
import { AssistantController } from './assistant.controller';
import { AccessModule } from '../access/access.module';

@Module({
  imports: [AccessModule],
  controllers: [AssistantController],
  providers: [AssistantService],
})
export class AssistantModule {}
