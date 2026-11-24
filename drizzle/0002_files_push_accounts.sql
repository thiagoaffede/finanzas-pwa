CREATE TABLE "push_subscriptions" (
	"endpoint" text PRIMARY KEY NOT NULL,
	"p256dh" text NOT NULL,
	"auth" text NOT NULL,
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "accounts" ADD COLUMN "balance_set_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "file_name" text;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "size_bytes" integer;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "content_base64" text;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "method" text;