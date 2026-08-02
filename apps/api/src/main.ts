import 'dotenv/config';
import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';

const app = await NestFactory.create(AppModule, { cors: true });
app.enableShutdownHooks();
const port = Number(process.env.API_PORT || 4000);
await app.listen(port, '0.0.0.0');
Logger.log(`GraphQL: http://localhost:${port}/graphql`, 'HerdPulse');
Logger.log(`Health:  http://localhost:${port}/health`, 'HerdPulse');
