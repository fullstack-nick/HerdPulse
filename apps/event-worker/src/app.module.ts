import { Module } from '@nestjs/common';
import { createDatabase } from '@herdpulse/database';
import { DATABASE } from './tokens.js';
import { WorkerService } from './worker.service.js';

@Module({
  providers: [{ provide: DATABASE, useFactory: () => createDatabase() }, WorkerService],
})
export class AppModule {}
