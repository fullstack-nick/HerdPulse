import { Inject } from '@nestjs/common';
import { Args, Context, Mutation, Query, Resolver, Subscription } from '@nestjs/graphql';
import type { HealthCaseStatus, Priority, TaskStatus } from '@herdpulse/domain';
import { AuthService } from './auth.service.js';
import { DataService } from './data.service.js';
import { RealtimeService } from './pubsub.service.js';

interface GraphqlContext {
  authorization?: string;
}

@Resolver()
export class AppResolver {
  constructor(
    @Inject(AuthService) private readonly auth: AuthService,
    @Inject(DataService) private readonly data: DataService,
    @Inject(RealtimeService) private readonly realtime: RealtimeService,
  ) {}

  private user(context: GraphqlContext) {
    return this.auth.authenticate(context.authorization);
  }

  @Query('viewer')
  async viewer(@Context() context: GraphqlContext) {
    return this.data.viewer(await this.user(context));
  }

  @Query('dashboard')
  async dashboard(
    @Context() context: GraphqlContext,
    @Args('organizationId') organizationId: string,
  ) {
    return this.data.dashboard(await this.user(context), organizationId);
  }

  @Query('healthCases')
  async healthCases(
    @Context() context: GraphqlContext,
    @Args('organizationId') organizationId: string,
    @Args('status') status?: HealthCaseStatus,
    @Args('priority') priority?: Priority,
    @Args('limit') limit = 50,
  ) {
    return this.data.healthCases(await this.user(context), organizationId, status, priority, limit);
  }

  @Query('healthCase')
  async healthCase(
    @Context() context: GraphqlContext,
    @Args('organizationId') organizationId: string,
    @Args('id') id: string,
  ) {
    return this.data.healthCase(await this.user(context), organizationId, id);
  }

  @Query('animals')
  async animals(
    @Context() context: GraphqlContext,
    @Args('organizationId') organizationId: string,
    @Args('search') search?: string,
    @Args('limit') limit = 100,
  ) {
    return this.data.animals(await this.user(context), organizationId, search, limit);
  }

  @Query('animal')
  async animal(
    @Context() context: GraphqlContext,
    @Args('organizationId') organizationId: string,
    @Args('id') id: string,
  ) {
    return this.data.animal(await this.user(context), organizationId, id);
  }

  @Query('telemetry')
  async telemetry(
    @Context() context: GraphqlContext,
    @Args('organizationId') organizationId: string,
    @Args('animalId') animalId: string,
    @Args('metric') metric?: string,
    @Args('hours') hours = 24,
  ) {
    return this.data.telemetry(await this.user(context), organizationId, animalId, metric, hours);
  }

  @Query('tasks')
  async tasks(
    @Context() context: GraphqlContext,
    @Args('organizationId') organizationId: string,
    @Args('status') status?: TaskStatus,
    @Args('mine') mine = false,
    @Args('limit') limit = 100,
  ) {
    return this.data.tasks(await this.user(context), organizationId, status, mine, limit);
  }

  @Mutation('acknowledgeCase')
  async acknowledgeCase(
    @Context() context: GraphqlContext,
    @Args('organizationId') organizationId: string,
    @Args('id') id: string,
    @Args('expectedVersion') expectedVersion: number,
  ) {
    return this.data.acknowledgeCase(await this.user(context), organizationId, id, expectedVersion);
  }

  @Mutation('claimTask')
  async claimTask(
    @Context() context: GraphqlContext,
    @Args('organizationId') organizationId: string,
    @Args('id') id: string,
    @Args('expectedVersion') expectedVersion: number,
  ) {
    return this.data.claimTask(await this.user(context), organizationId, id, expectedVersion);
  }

  @Mutation('assignTask')
  async assignTask(
    @Context() context: GraphqlContext,
    @Args('organizationId') organizationId: string,
    @Args('id') id: string,
    @Args('assigneeId') assigneeId: string,
    @Args('expectedVersion') expectedVersion: number,
  ) {
    return this.data.assignTask(
      await this.user(context),
      organizationId,
      id,
      assigneeId,
      expectedVersion,
    );
  }

  @Mutation('addTaskComment')
  async addTaskComment(
    @Context() context: GraphqlContext,
    @Args('organizationId') organizationId: string,
    @Args('taskId') taskId: string,
    @Args('body') body: string,
  ) {
    return this.data.addTaskComment(await this.user(context), organizationId, taskId, body);
  }

  @Mutation('completeTask')
  async completeTask(
    @Context() context: GraphqlContext,
    @Args('organizationId') organizationId: string,
    @Args('id') id: string,
    @Args('resolution') resolution: string,
    @Args('diagnosisCode') diagnosisCode: string | undefined,
    @Args('expectedVersion') expectedVersion: number,
  ) {
    return this.data.completeTask(
      await this.user(context),
      organizationId,
      id,
      resolution,
      diagnosisCode,
      expectedVersion,
    );
  }

  @Mutation('resolveCase')
  async resolveCase(
    @Context() context: GraphqlContext,
    @Args('organizationId') organizationId: string,
    @Args('id') id: string,
    @Args('resolution') resolution: string,
    @Args('expectedVersion') expectedVersion: number,
  ) {
    return this.data.resolveCase(
      await this.user(context),
      organizationId,
      id,
      resolution,
      expectedVersion,
    );
  }

  @Mutation('recordAnimalEvent')
  async recordAnimalEvent(
    @Context() context: GraphqlContext,
    @Args('organizationId') organizationId: string,
    @Args('animalId') animalId: string,
    @Args('eventType') eventType: string,
    @Args('occurredAt') occurredAt?: string,
  ) {
    return this.data.recordAnimalEvent(
      await this.user(context),
      organizationId,
      animalId,
      eventType,
      occurredAt,
    );
  }

  @Mutation('replayOutbox')
  async replayOutbox(
    @Context() context: GraphqlContext,
    @Args('organizationId') organizationId: string,
  ) {
    return this.data.replayOutbox(await this.user(context), organizationId);
  }

  @Subscription('healthCaseChanged', { resolve: (value) => value })
  async healthCaseChanged(
    @Context() context: GraphqlContext,
    @Args('organizationId') organizationId: string,
  ) {
    const user = await this.user(context);
    if (user.organizationId !== organizationId) throw new Error('Organization access denied.');
    return this.realtime.subscribe('case', organizationId);
  }

  @Subscription('taskChanged', { resolve: (value) => value })
  async taskChanged(
    @Context() context: GraphqlContext,
    @Args('organizationId') organizationId: string,
  ) {
    const user = await this.user(context);
    if (user.organizationId !== organizationId) throw new Error('Organization access denied.');
    return this.realtime.subscribe('task', organizationId);
  }

  @Subscription('deviceStatusChanged', { resolve: (value) => value })
  async deviceStatusChanged(
    @Context() context: GraphqlContext,
    @Args('organizationId') organizationId: string,
  ) {
    const user = await this.user(context);
    if (user.organizationId !== organizationId) throw new Error('Organization access denied.');
    return this.realtime.subscribe('device', organizationId);
  }
}
