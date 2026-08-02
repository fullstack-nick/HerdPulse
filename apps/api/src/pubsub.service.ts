import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PubSub } from 'graphql-subscriptions';
import { Redis } from 'ioredis';

@Injectable()
export class RealtimeService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RealtimeService.name);
  private readonly pubsub = new PubSub();
  private readonly publisher = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');
  private readonly subscriber = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
    enableReadyCheck: false,
  });

  async onModuleInit() {
    this.publisher.on('error', (error) => this.logger.warn(`Redis publisher: ${error.message}`));
    this.subscriber.on('error', (error) => this.logger.warn(`Redis subscriber: ${error.message}`));
    await this.subscriber.psubscribe('herdpulse:*');
    this.subscriber.on('pmessage', (_pattern: string, channel: string, raw: string) => {
      try {
        void this.pubsub.publish(channel, JSON.parse(raw));
      } catch {
        // A malformed realtime packet must not take the API down.
      }
    });
  }

  channel(kind: 'case' | 'task' | 'device', organizationId: string) {
    return `herdpulse:${kind}:${organizationId}`;
  }

  subscribe(kind: 'case' | 'task' | 'device', organizationId: string) {
    return this.pubsub.asyncIterableIterator(this.channel(kind, organizationId));
  }

  async emit(kind: 'case' | 'task' | 'device', organizationId: string, value: unknown) {
    const candidate = value as { id?: string; entityId?: string; changeType?: string };
    const notice = {
      entityId: candidate.entityId ?? candidate.id,
      organizationId,
      changeType: candidate.changeType ?? 'UPDATED',
    };
    await this.publisher.publish(this.channel(kind, organizationId), JSON.stringify(notice));
  }

  async onModuleDestroy() {
    await Promise.all([this.publisher.quit(), this.subscriber.quit()]);
  }
}
