import { Injectable, Logger } from '@nestjs/common';
import { Response } from 'express';
import { DocumentAccessService } from '../access/document-access.service';

const SCRAPER_URL = process.env.SCRAPER_URL || 'http://localhost:8001';

@Injectable()
export class AssistantService {
  private readonly logger = new Logger(AssistantService.name);

  constructor(private readonly access: DocumentAccessService) {}

  async streamChat(
    question: string,
    history: { role: string; content: string }[],
    user: { id: number; role: string },
    res: Response,
  ) {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    try {
      const allowedRefs = await this.access.getAccessibleRefs(user.id, user.role);

      const upstream = await fetch(`${SCRAPER_URL}/assistant/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question, history, allowed_refs: allowedRefs }),
      });

      if (!upstream.ok || !upstream.body) {
        res.write(`data: ${JSON.stringify({ token: 'Assistant service unavailable.' })}\n\n`);
        res.write(`data: ${JSON.stringify({ sources: [], done: true })}\n\n`);
        res.end();
        return;
      }

      const reader = (upstream.body as any).getReader();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        res.write(Buffer.from(value));
      }
    } catch (err) {
      this.logger.error(`Assistant stream error: ${err.message}`);
      res.write(`data: ${JSON.stringify({ token: 'Connection error.' })}\n\n`);
      res.write(`data: ${JSON.stringify({ sources: [], done: true })}\n\n`);
    } finally {
      res.end();
    }
  }

  async getStatus() {
    try {
      const res = await fetch(`${SCRAPER_URL}/assistant/status`);
      return res.json();
    } catch {
      return { ollama: 'down' };
    }
  }
}
