CREATE TABLE "study_blocks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"course_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"name" text NOT NULL,
	"group_name" text,
	"detail" text,
	"level" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'pendiente' NOT NULL,
	"target_date" date,
	"completed_on" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "study_courses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"kind" text DEFAULT 'ati' NOT NULL,
	"status" text DEFAULT 'cursando' NOT NULL,
	"moodle_name" text,
	"review_days" integer DEFAULT 3 NOT NULL,
	"notes" text,
	"archived" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "study_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"course_id" uuid,
	"kind" text DEFAULT 'otro' NOT NULL,
	"title" text NOT NULL,
	"date" date NOT NULL,
	"end_date" date,
	"time" text,
	"place" text,
	"link" text,
	"notes" text,
	"result" text,
	"source" text DEFAULT 'manual' NOT NULL,
	"external_uid" text,
	"external_course" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "study_mistakes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"course_id" uuid,
	"block_id" uuid,
	"date" date NOT NULL,
	"description" text NOT NULL,
	"fixed" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "study_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"course_id" uuid,
	"date" date NOT NULL,
	"minutes" integer NOT NULL,
	"source" text DEFAULT 'pomodoro' NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "study_blocks" ADD CONSTRAINT "study_blocks_course_id_study_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."study_courses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "study_events" ADD CONSTRAINT "study_events_course_id_study_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."study_courses"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "study_mistakes" ADD CONSTRAINT "study_mistakes_course_id_study_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."study_courses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "study_mistakes" ADD CONSTRAINT "study_mistakes_block_id_study_blocks_id_fk" FOREIGN KEY ("block_id") REFERENCES "public"."study_blocks"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "study_sessions" ADD CONSTRAINT "study_sessions_course_id_study_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."study_courses"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "study_blocks_course_idx" ON "study_blocks" USING btree ("course_id","position");--> statement-breakpoint
CREATE UNIQUE INDEX "study_events_external_uid_idx" ON "study_events" USING btree ("external_uid");--> statement-breakpoint
CREATE INDEX "study_events_date_idx" ON "study_events" USING btree ("date");--> statement-breakpoint
CREATE INDEX "study_sessions_date_idx" ON "study_sessions" USING btree ("date");