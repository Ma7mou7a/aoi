CREATE TABLE "ai_lab_rounds" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"game" text NOT NULL,
	"game_id" uuid NOT NULL,
	"item_id" text NOT NULL,
	"shown" jsonb NOT NULL,
	"key" jsonb NOT NULL,
	"play" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"model" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "ai_lab_rounds" ADD CONSTRAINT "ai_lab_rounds_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ai_lab_rounds_user_idx" ON "ai_lab_rounds" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "ai_lab_rounds_game_idx" ON "ai_lab_rounds" USING btree ("game_id");