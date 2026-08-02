import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import type { Kysely } from 'kysely';
import type { Database } from '@herdpulse/database';
import { DATABASE } from './tokens.js';

export interface RequestUser {
  id: string;
  organizationId: string;
  role: string;
}

const demoUsers: Record<string, RequestUser> = {
  'demo-owner': { id: 'user-owner', organizationId: 'org-demo-farm', role: 'OWNER' },
  'demo-manager': { id: 'user-manager', organizationId: 'org-demo-farm', role: 'MANAGER' },
  'demo-worker': { id: 'user-worker', organizationId: 'org-demo-farm', role: 'WORKER' },
  'demo-vet': { id: 'user-vet', organizationId: 'org-demo-farm', role: 'VET' },
  'demo-consultant': { id: 'user-consultant', organizationId: 'org-demo-farm', role: 'CONSULTANT' },
};

@Injectable()
export class AuthService {
  constructor(@Inject(DATABASE) private readonly db: Kysely<Database>) {}

  async authenticate(header?: string): Promise<RequestUser> {
    const token =
      header?.replace(/^Bearer\s+/i, '') || process.env.DEMO_AUTH_TOKEN || 'demo-manager';
    if (demoUsers[token]) return demoUsers[token];

    const issuer = process.env.OIDC_ISSUER;
    const audience = process.env.OIDC_AUDIENCE || 'herd-pulse-web';
    if (!issuer) throw new UnauthorizedException('No OIDC issuer is configured.');
    try {
      const jwks = createRemoteJWKSet(new URL(`${issuer}/protocol/openid-connect/certs`));
      const verified = await jwtVerify(token, jwks, { issuer, audience });
      const subject = String(verified.payload.sub);
      const membership = await this.db
        .selectFrom('user')
        .innerJoin('organizationMembership', 'organizationMembership.userId', 'user.id')
        .select(['user.id', 'organizationMembership.organizationId', 'organizationMembership.role'])
        .where('user.oidcSubject', '=', subject)
        .where('organizationMembership.active', '=', true)
        .executeTakeFirstOrThrow();
      return {
        id: membership.id,
        organizationId: membership.organizationId,
        role: membership.role,
      };
    } catch {
      throw new UnauthorizedException('The access token is invalid or has no active membership.');
    }
  }
}
