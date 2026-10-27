ALTER TABLE "users" ADD COLUMN "signin_key_hash" text;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_signin_key_hash_unique" UNIQUE("signin_key_hash");