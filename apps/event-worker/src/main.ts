import 'dotenv/config';
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { createServer } from 'node:http';
import { AppModule } from './app.module.js';
import { WorkerService } from './worker.service.js';

const app = await NestFactory.createApplicationContext(AppModule);
app.enableShutdownHooks();
const worker = app.get(WorkerService);
const port = Number(process.env.WORKER_HEALTH_PORT || 4001);
const server = createServer((request, response) => {
  const stats = worker.stats();
  if (request.url === '/metrics') {
    response.setHeader('content-type', 'text/plain');
    response.end(
      Object.entries(stats)
        .map(([name, value]) => `herdpulse_worker_${name}_total ${value}`)
        .join('\n') + '\n',
    );
    return;
  }
  response.setHeader('content-type', 'application/json');
  response.end(JSON.stringify({ status: 'ok', service: 'herdpulse-worker', ...stats }));
});
server.listen(port, '0.0.0.0');
process.on('SIGTERM', () => server.close());
