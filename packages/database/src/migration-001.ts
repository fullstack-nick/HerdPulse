import { sql, type Kysely } from 'kysely';
import type { Database } from './types.js';

export async function migration001(db: Kysely<Database>): Promise<void> {
  await sql
    .raw(
      `
    CREATE TABLE IF NOT EXISTS schema_migration (
      version integer PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS organization (
      id text PRIMARY KEY,
      name text NOT NULL,
      timezone text NOT NULL,
      default_language text NOT NULL DEFAULT 'en',
      created_at timestamptz NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS organization_setting (
      organization_id text PRIMARY KEY REFERENCES organization(id) ON DELETE CASCADE,
      risk_settings jsonb NOT NULL,
      version integer NOT NULL DEFAULT 1,
      updated_at timestamptz NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS "user" (
      id text PRIMARY KEY,
      email text NOT NULL UNIQUE,
      display_name text NOT NULL,
      oidc_subject text UNIQUE,
      created_at timestamptz NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS organization_membership (
      organization_id text NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
      user_id text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
      role text NOT NULL CHECK (role IN ('OWNER','MANAGER','WORKER','VET','CONSULTANT')),
      preferred_language text NOT NULL DEFAULT 'en',
      active boolean NOT NULL DEFAULT true,
      PRIMARY KEY (organization_id, user_id)
    );

    CREATE TABLE IF NOT EXISTS animal_group (
      id text PRIMARY KEY,
      organization_id text NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
      name text NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE (organization_id, name),
      UNIQUE (organization_id, id)
    );

    CREATE TABLE IF NOT EXISTS device (
      id text PRIMARY KEY,
      organization_id text NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
      hardware_id text NOT NULL,
      status text NOT NULL CHECK (status IN ('ONLINE','STALE','OFFLINE')),
      last_seen_at timestamptz,
      battery_percent integer CHECK (battery_percent BETWEEN 0 AND 100),
      signal_strength integer,
      updated_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE (organization_id, hardware_id),
      UNIQUE (organization_id, id)
    );

    CREATE TABLE IF NOT EXISTS animal (
      id text PRIMARY KEY,
      organization_id text NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
      official_id text NOT NULL,
      display_name text NOT NULL,
      group_id text,
      device_id text,
      lactation_phase text NOT NULL CHECK (lactation_phase IN ('HEIFER','CLOSE_UP','FRESH','LACTATING','DRY')),
      parity integer NOT NULL DEFAULT 0 CHECK (parity >= 0),
      last_calving_at timestamptz,
      expected_calving_at timestamptz,
      archived_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE (organization_id, official_id),
      UNIQUE (organization_id, id),
      FOREIGN KEY (organization_id, group_id) REFERENCES animal_group(organization_id, id),
      FOREIGN KEY (organization_id, device_id) REFERENCES device(organization_id, id)
    );

    CREATE TABLE IF NOT EXISTS telemetry_sample (
      id text NOT NULL,
      organization_id text NOT NULL,
      animal_id text NOT NULL,
      device_id text NOT NULL,
      external_sample_id text NOT NULL,
      metric text NOT NULL CHECK (metric IN ('TEMPERATURE','RUMINATION','ACTIVITY','DRINKING','PH')),
      value double precision NOT NULL,
      unit text NOT NULL,
      occurred_at timestamptz NOT NULL,
      received_at timestamptz NOT NULL,
      source text NOT NULL,
      PRIMARY KEY (id, occurred_at),
      FOREIGN KEY (organization_id, animal_id) REFERENCES animal(organization_id, id),
      FOREIGN KEY (organization_id, device_id) REFERENCES device(organization_id, id)
    ) PARTITION BY RANGE (occurred_at);

    CREATE TABLE IF NOT EXISTS telemetry_sample_default PARTITION OF telemetry_sample DEFAULT;
    CREATE INDEX IF NOT EXISTS telemetry_animal_curve_idx
      ON telemetry_sample (organization_id, animal_id, metric, occurred_at DESC);
    CREATE INDEX IF NOT EXISTS telemetry_occurred_brin_idx
      ON telemetry_sample USING brin (occurred_at);

    CREATE TABLE IF NOT EXISTS animal_event (
      id text PRIMARY KEY,
      organization_id text NOT NULL,
      animal_id text NOT NULL,
      external_event_id text NOT NULL,
      type text NOT NULL,
      occurred_at timestamptz NOT NULL,
      received_at timestamptz NOT NULL,
      source text NOT NULL,
      schema_version integer NOT NULL,
      payload jsonb NOT NULL DEFAULT '{}'::jsonb,
      created_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE (organization_id, source, external_event_id),
      FOREIGN KEY (organization_id, animal_id) REFERENCES animal(organization_id, id)
    );
    CREATE INDEX IF NOT EXISTS animal_event_window_idx
      ON animal_event (organization_id, animal_id, occurred_at DESC);

    CREATE TABLE IF NOT EXISTS health_case (
      id text PRIMARY KEY,
      organization_id text NOT NULL,
      animal_id text NOT NULL,
      priority text NOT NULL CHECK (priority IN ('LOW','MEDIUM','HIGH')),
      status text NOT NULL CHECK (status IN ('OPEN','ACKNOWLEDGED','IN_PROGRESS','RESOLVED')),
      score integer NOT NULL CHECK (score >= 0),
      current_risk_assessment_id text,
      opened_at timestamptz NOT NULL,
      acknowledged_at timestamptz,
      resolved_at timestamptz,
      resolution text,
      version integer NOT NULL DEFAULT 1,
      updated_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE (organization_id, id),
      FOREIGN KEY (organization_id, animal_id) REFERENCES animal(organization_id, id)
    );
    CREATE UNIQUE INDEX IF NOT EXISTS health_case_one_active_per_animal_idx
      ON health_case (organization_id, animal_id)
      WHERE status IN ('OPEN','ACKNOWLEDGED','IN_PROGRESS');
    CREATE INDEX IF NOT EXISTS health_case_queue_idx
      ON health_case (organization_id, status, priority, updated_at DESC);

    CREATE TABLE IF NOT EXISTS risk_assessment (
      id text PRIMARY KEY,
      organization_id text NOT NULL,
      health_case_id text NOT NULL,
      ruleset_version integer NOT NULL,
      window_start timestamptz NOT NULL,
      window_end timestamptz NOT NULL,
      score integer NOT NULL,
      priority text NOT NULL,
      reasons jsonb NOT NULL,
      considered_event_ids jsonb NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      FOREIGN KEY (organization_id, health_case_id) REFERENCES health_case(organization_id, id)
    );
    ALTER TABLE health_case
      DROP CONSTRAINT IF EXISTS health_case_current_risk_assessment_fk;
    ALTER TABLE health_case
      ADD CONSTRAINT health_case_current_risk_assessment_fk
      FOREIGN KEY (current_risk_assessment_id) REFERENCES risk_assessment(id);

    CREATE TABLE IF NOT EXISTS health_case_event (
      id text PRIMARY KEY,
      organization_id text NOT NULL,
      health_case_id text NOT NULL,
      actor_user_id text REFERENCES "user"(id),
      type text NOT NULL,
      data jsonb NOT NULL DEFAULT '{}'::jsonb,
      created_at timestamptz NOT NULL DEFAULT now(),
      FOREIGN KEY (organization_id, health_case_id) REFERENCES health_case(organization_id, id)
    );

    CREATE TABLE IF NOT EXISTS sop (
      id text PRIMARY KEY,
      organization_id text NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
      name text NOT NULL,
      active boolean NOT NULL DEFAULT true,
      created_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE (organization_id, id)
    );

    CREATE TABLE IF NOT EXISTS sop_version (
      id text PRIMARY KEY,
      organization_id text NOT NULL,
      sop_id text NOT NULL,
      version integer NOT NULL,
      title text NOT NULL,
      instructions text NOT NULL,
      trigger_priority text NOT NULL CHECK (trigger_priority IN ('LOW','MEDIUM','HIGH')),
      due_minutes integer NOT NULL CHECK (due_minutes > 0),
      created_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE (sop_id, version),
      FOREIGN KEY (organization_id, sop_id) REFERENCES sop(organization_id, id)
    );

    CREATE TABLE IF NOT EXISTS task (
      id text PRIMARY KEY,
      organization_id text NOT NULL,
      health_case_id text NOT NULL,
      sop_version_id text REFERENCES sop_version(id),
      title text NOT NULL,
      instructions text NOT NULL,
      assignee_user_id text REFERENCES "user"(id),
      due_at timestamptz NOT NULL,
      status text NOT NULL CHECK (status IN ('OPEN','CLAIMED','COMPLETED','CANCELLED')),
      resolution text,
      diagnosis_code text,
      version integer NOT NULL DEFAULT 1,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      completed_at timestamptz,
      UNIQUE (organization_id, id),
      FOREIGN KEY (organization_id, health_case_id) REFERENCES health_case(organization_id, id)
    );
    CREATE INDEX IF NOT EXISTS task_queue_idx
      ON task (organization_id, status, due_at, assignee_user_id);

    CREATE TABLE IF NOT EXISTS task_comment (
      id text PRIMARY KEY,
      organization_id text NOT NULL,
      task_id text NOT NULL,
      author_user_id text NOT NULL REFERENCES "user"(id),
      body text NOT NULL CHECK (char_length(body) BETWEEN 1 AND 2000),
      created_at timestamptz NOT NULL DEFAULT now(),
      FOREIGN KEY (organization_id, task_id) REFERENCES task(organization_id, id)
    );

    CREATE TABLE IF NOT EXISTS inbox_message (
      consumer_name text NOT NULL,
      event_id text NOT NULL,
      topic text NOT NULL,
      partition integer NOT NULL,
      offset_value text NOT NULL,
      processed_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (consumer_name, event_id)
    );

    CREATE TABLE IF NOT EXISTS outbox_message (
      id text PRIMARY KEY,
      organization_id text NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
      topic text NOT NULL,
      event_key text NOT NULL,
      payload jsonb NOT NULL,
      attempts integer NOT NULL DEFAULT 0,
      created_at timestamptz NOT NULL DEFAULT now(),
      published_at timestamptz,
      last_error text
    );
    CREATE INDEX IF NOT EXISTS outbox_unpublished_idx
      ON outbox_message (created_at) WHERE published_at IS NULL;

    CREATE TABLE IF NOT EXISTS audit_log (
      id text PRIMARY KEY,
      organization_id text NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
      actor_user_id text REFERENCES "user"(id),
      action text NOT NULL,
      entity_type text NOT NULL,
      entity_id text NOT NULL,
      data jsonb NOT NULL DEFAULT '{}'::jsonb,
      created_at timestamptz NOT NULL DEFAULT now()
    );

    INSERT INTO schema_migration(version) VALUES (1) ON CONFLICT DO NOTHING;

    ALTER TABLE animal ENABLE ROW LEVEL SECURITY;
    ALTER TABLE device ENABLE ROW LEVEL SECURITY;
    ALTER TABLE animal_event ENABLE ROW LEVEL SECURITY;
    ALTER TABLE health_case ENABLE ROW LEVEL SECURITY;
    ALTER TABLE task ENABLE ROW LEVEL SECURITY;
  `,
    )
    .execute(db);
}
