import { ApolloDriver, type ApolloDriverConfig } from '@nestjs/apollo';
import { Module } from '@nestjs/common';
import { GraphQLModule } from '@nestjs/graphql';
import { createDatabase } from '@herdpulse/database';
import { join } from 'node:path';
import { AppController } from './app.controller.js';
import { AppResolver } from './app.resolver.js';
import { AuthService } from './auth.service.js';
import { DataService } from './data.service.js';
import { RealtimeService } from './pubsub.service.js';
import { DATABASE } from './tokens.js';

@Module({
  imports: [
    GraphQLModule.forRoot<ApolloDriverConfig>({
      driver: ApolloDriver,
      typePaths: [join(process.cwd(), 'src/schema.graphql')],
      playground: true,
      introspection: true,
      subscriptions: { 'graphql-ws': { path: '/graphql' } },
      context: ({ req, connectionParams, extra }: any) => ({
        authorization:
          req?.headers?.authorization ??
          connectionParams?.authorization ??
          connectionParams?.Authorization ??
          extra?.request?.headers?.authorization,
      }),
    }),
  ],
  controllers: [AppController],
  providers: [
    { provide: DATABASE, useFactory: () => createDatabase() },
    AuthService,
    DataService,
    RealtimeService,
    AppResolver,
  ],
})
export class AppModule {}
