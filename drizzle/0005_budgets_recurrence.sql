ALTER TABLE "bills" ADD COLUMN "recurrence_months" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "bills" ADD COLUMN "category" text;