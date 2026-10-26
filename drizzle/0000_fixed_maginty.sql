CREATE TYPE "public"."collab_component" AS ENUM('clarification', 'critical_verification', 'iteration', 'autonomy', 'responsible_use');--> statement-breakpoint
CREATE TYPE "public"."consent_kind" AS ENUM('data_processing', 'behavioural_signals', 'llm_coaching', 'planted_flaws', 'camera', 'microphone', 'research_export');--> statement-breakpoint
CREATE TYPE "public"."goal_kind" AS ENUM('reach_score', 'reach_level', 'consistency');--> statement-breakpoint
CREATE TYPE "public"."goal_status" AS ENUM('active', 'achieved', 'expired', 'dropped');--> statement-breakpoint
CREATE TYPE "public"."message_role" AS ENUM('user', 'coach', 'system');--> statement-breakpoint
CREATE TYPE "public"."plan_status" AS ENUM('active', 'superseded', 'completed');--> statement-breakpoint
CREATE TYPE "public"."run_status" AS ENUM('active', 'completed', 'abandoned');--> statement-breakpoint
CREATE TYPE "public"."session_mode" AS ENUM('assessment', 'training');--> statement-breakpoint
CREATE TYPE "public"."snapshot_trigger" AS ENUM('prior', 'task_run', 'session_end', 'time_decay');--> statement-breakpoint
CREATE TYPE "public"."trial_outcome" AS ENUM('response', 'no_response', 'timeout', 'anticipation', 'abandoned');--> statement-breakpoint
CREATE TABLE "coach_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"session_id" uuid,
	"role" "message_role" NOT NULL,
	"content" text NOT NULL,
	"claims" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"planted_flaw" jsonb,
	"filtered_terms" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"model" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "collab_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"coach_message_id" uuid,
	"component" "collab_component" NOT NULL,
	"signal" text NOT NULL,
	"value" real NOT NULL,
	"details" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "collab_scores" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"score" integer NOT NULL,
	"components" jsonb NOT NULL,
	"weights" jsonb NOT NULL,
	"formula_version" text NOT NULL,
	"n_events" integer NOT NULL,
	"window_start" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "consents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"kind" "consent_kind" NOT NULL,
	"granted" boolean NOT NULL,
	"policy_version" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "deletion_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_hash" text NOT NULL,
	"reason" text NOT NULL,
	"rows_deleted" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "goals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"dimension_id" text,
	"kind" "goal_kind" NOT NULL,
	"title" text NOT NULL,
	"target_value" real NOT NULL,
	"current_value" real DEFAULT 0 NOT NULL,
	"deadline" date,
	"status" "goal_status" DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"achieved_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "plan_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"plan_id" uuid NOT NULL,
	"dimension_id" text NOT NULL,
	"task_id" text NOT NULL,
	"target_level" integer NOT NULL,
	"sessions_target" integer NOT NULL,
	"sessions_done" integer DEFAULT 0 NOT NULL,
	"reason" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "plans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"week_start" date NOT NULL,
	"status" "plan_status" DEFAULT 'active' NOT NULL,
	"rationale" text NOT NULL,
	"based_on_snapshot_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "profile_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"dimension_id" text NOT NULL,
	"session_id" uuid,
	"task_run_id" uuid,
	"trigger" "snapshot_trigger" NOT NULL,
	"mean" real NOT NULL,
	"sd" real NOT NULL,
	"ci_low" real NOT NULL,
	"ci_high" real NOT NULL,
	"n_observations" integer NOT NULL,
	"n_trials" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "projections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"dimension_id" text NOT NULL,
	"model" text NOT NULL,
	"horizon_days" integer NOT NULL,
	"mean" real NOT NULL,
	"ci_low" real NOT NULL,
	"ci_high" real NOT NULL,
	"fitted_on_snapshots" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"mode" "session_mode" NOT NULL,
	"status" "run_status" DEFAULT 'active' NOT NULL,
	"biometric" boolean DEFAULT false NOT NULL,
	"device" jsonb,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ended_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "task_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"dimension_id" text NOT NULL,
	"task_id" text NOT NULL,
	"config_version" integer NOT NULL,
	"difficulty_level" integer NOT NULL,
	"params" jsonb NOT NULL,
	"selection_reason" jsonb,
	"status" "run_status" DEFAULT 'active' NOT NULL,
	"metrics" jsonb,
	"composite" real,
	"observation" real,
	"observation_sd" real,
	"validity" jsonb,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ended_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "trials" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"task_run_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"trial_index" integer NOT NULL,
	"is_practice" boolean DEFAULT false NOT NULL,
	"stimulus" jsonb NOT NULL,
	"expected" jsonb,
	"response" jsonb,
	"outcome" "trial_outcome" NOT NULL,
	"correct" boolean,
	"rt_ms" integer,
	"behaviour" jsonb,
	"shown_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"display_name" text NOT NULL,
	"locale" text DEFAULT 'en' NOT NULL,
	"retention_days" integer DEFAULT 180 NOT NULL,
	"preferences" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_active_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "coach_messages" ADD CONSTRAINT "coach_messages_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coach_messages" ADD CONSTRAINT "coach_messages_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collab_events" ADD CONSTRAINT "collab_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collab_events" ADD CONSTRAINT "collab_events_coach_message_id_coach_messages_id_fk" FOREIGN KEY ("coach_message_id") REFERENCES "public"."coach_messages"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collab_scores" ADD CONSTRAINT "collab_scores_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consents" ADD CONSTRAINT "consents_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goals" ADD CONSTRAINT "goals_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_items" ADD CONSTRAINT "plan_items_plan_id_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."plans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plans" ADD CONSTRAINT "plans_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profile_snapshots" ADD CONSTRAINT "profile_snapshots_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profile_snapshots" ADD CONSTRAINT "profile_snapshots_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profile_snapshots" ADD CONSTRAINT "profile_snapshots_task_run_id_task_runs_id_fk" FOREIGN KEY ("task_run_id") REFERENCES "public"."task_runs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projections" ADD CONSTRAINT "projections_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_runs" ADD CONSTRAINT "task_runs_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_runs" ADD CONSTRAINT "task_runs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trials" ADD CONSTRAINT "trials_task_run_id_task_runs_id_fk" FOREIGN KEY ("task_run_id") REFERENCES "public"."task_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trials" ADD CONSTRAINT "trials_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "coach_messages_user_idx" ON "coach_messages" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "collab_events_user_idx" ON "collab_events" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "collab_scores_user_idx" ON "collab_scores" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "consents_user_kind_idx" ON "consents" USING btree ("user_id","kind","created_at");--> statement-breakpoint
CREATE INDEX "goals_user_idx" ON "goals" USING btree ("user_id","status");--> statement-breakpoint
CREATE INDEX "plans_user_idx" ON "plans" USING btree ("user_id","week_start");--> statement-breakpoint
CREATE INDEX "snapshots_user_dim_time_idx" ON "profile_snapshots" USING btree ("user_id","dimension_id","created_at");--> statement-breakpoint
CREATE INDEX "projections_user_dim_idx" ON "projections" USING btree ("user_id","dimension_id","created_at");--> statement-breakpoint
CREATE INDEX "sessions_user_idx" ON "sessions" USING btree ("user_id","started_at");--> statement-breakpoint
CREATE INDEX "task_runs_user_dim_idx" ON "task_runs" USING btree ("user_id","dimension_id","started_at");--> statement-breakpoint
CREATE INDEX "task_runs_session_idx" ON "task_runs" USING btree ("session_id");--> statement-breakpoint
CREATE UNIQUE INDEX "trials_run_index_uq" ON "trials" USING btree ("task_run_id","trial_index");--> statement-breakpoint
CREATE INDEX "trials_user_idx" ON "trials" USING btree ("user_id");