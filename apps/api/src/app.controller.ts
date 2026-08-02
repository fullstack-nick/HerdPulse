import { Controller, Get, Inject, Res } from '@nestjs/common';
import type { Database } from '@herdpulse/database';
import type { Response } from 'express';
import { sql, type Kysely } from 'kysely';
import { DATABASE } from './tokens.js';

@Controller()
export class AppController {
  private requests = 0;

  constructor(@Inject(DATABASE) private readonly db: Kysely<Database>) {}

  @Get('health')
  health() {
    this.requests += 1;
    return { status: 'ok', service: 'herdpulse-api', timestamp: new Date().toISOString() };
  }

  @Get('ready')
  async ready() {
    await sql`SELECT 1`.execute(this.db);
    return { status: 'ready', dependencies: { postgres: 'ok' } };
  }

  @Get('metrics')
  metrics(@Res() response: Response) {
    this.requests += 1;
    response
      .type('text/plain')
      .send(
        `# HELP herdpulse_health_requests_total Requests to local health endpoints\n# TYPE herdpulse_health_requests_total counter\nherdpulse_health_requests_total ${this.requests}\n`,
      );
  }
}
