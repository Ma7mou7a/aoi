CREATE TYPE "public"."reward_kind" AS ENUM('daily_visit', 'game_completed', 'daily_plan_done', 'daily_challenge', 'streak_day', 'badge');--> statement-breakpoint
CREATE TABLE "reward_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"kind" "reward_kind" NOT NULL,
	"amount" integer NOT NULL,
	"day" date NOT NULL,
	"ref" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "coach_messages" ADD COLUMN "actions" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "coach_messages" ADD COLUMN "mood" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "coach_memory" jsonb DEFAULT '{"recentTopics":[],"recentLineIds":[],"recentPlays":[],"debriefsSinceBet":0}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "reward_events" ADD CONSTRAINT "reward_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "reward_events_once_idx" ON "reward_events" USING btree ("user_id","kind","day","ref");