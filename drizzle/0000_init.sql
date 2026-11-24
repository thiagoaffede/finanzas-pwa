CREATE TYPE "public"."account_kind" AS ENUM('efectivo', 'banco', 'billetera', 'tarjeta', 'reserva');--> statement-breakpoint
CREATE TYPE "public"."bill_provider" AS ENUM('EDES', 'CAMUZZI', 'BVC', 'PERSONAL', 'OTRO');--> statement-breakpoint
CREATE TYPE "public"."bill_status" AS ENUM('pending', 'paid', 'overdue');--> statement-breakpoint
CREATE TYPE "public"."currency" AS ENUM('ARS', 'USD');--> statement-breakpoint
CREATE TYPE "public"."document_kind" AS ENUM('bill', 'payslip');--> statement-breakpoint
CREATE TYPE "public"."document_status" AS ENUM('uploaded', 'parsed', 'confirmed', 'failed');--> statement-breakpoint
CREATE TYPE "public"."index_type" AS ENUM('ICL', 'IPC', 'FIXED');--> statement-breakpoint
CREATE TYPE "public"."payment_method" AS ENUM('contado', 'debito', 'tarjeta', 'cuotas', 'transferencia');--> statement-breakpoint
CREATE TABLE "accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"kind" "account_kind" NOT NULL,
	"currency" "currency" DEFAULT 'ARS' NOT NULL,
	"opening_balance_cents" bigint DEFAULT 0 NOT NULL,
	"closing_day" integer,
	"due_day" integer,
	"archived" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bills" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider" "bill_provider" NOT NULL,
	"provider_label" text,
	"account_number" text,
	"billing_period" text NOT NULL,
	"issue_date" date,
	"due_date" date NOT NULL,
	"second_due_date" date,
	"amount_cents" bigint NOT NULL,
	"status" "bill_status" DEFAULT 'pending' NOT NULL,
	"paid_at" date,
	"source_document_id" uuid,
	"raw_extracted_json" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"icon" text,
	"color" text,
	"monthly_budget_cents" bigint,
	CONSTRAINT "categories_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" "document_kind" NOT NULL,
	"file_url" text,
	"mime_type" text,
	"status" "document_status" DEFAULT 'uploaded' NOT NULL,
	"extracted_json" jsonb,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "goal_contributions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"goal_id" uuid NOT NULL,
	"date" date NOT NULL,
	"amount_cents" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "goals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"target_cents" bigint NOT NULL,
	"currency" "currency" DEFAULT 'ARS' NOT NULL,
	"target_date" date,
	"monthly_contribution_cents" bigint,
	"account_id" uuid,
	"archived" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "index_values" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"index_type" "index_type" NOT NULL,
	"date" date NOT NULL,
	"value" numeric(18, 8) NOT NULL,
	"source" text
);
--> statement-breakpoint
CREATE TABLE "installments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"transaction_id" uuid NOT NULL,
	"number" integer NOT NULL,
	"total" integer NOT NULL,
	"due_date" date NOT NULL,
	"amount_cents" bigint NOT NULL,
	"paid" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "market_quotes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"house" text NOT NULL,
	"buy_cents" bigint,
	"sell_cents" bigint,
	"quoted_at" timestamp with time zone NOT NULL,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payroll_profile" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"category" text DEFAULT 'AUXILIAR_C' NOT NULL,
	"hire_date" date NOT NULL,
	"weekly_hours" integer DEFAULT 48 NOT NULL,
	"config_overrides" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payroll_scales" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agreement" text DEFAULT 'CCT 130/75' NOT NULL,
	"category" text NOT NULL,
	"valid_from" date NOT NULL,
	"valid_to" date,
	"basic_cents" bigint NOT NULL,
	"non_remunerative_cents" bigint DEFAULT 0 NOT NULL,
	"source" text
);
--> statement-breakpoint
CREATE TABLE "payslips" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"period" text NOT NULL,
	"employer" text,
	"payment_date" date,
	"remunerative_cents" bigint NOT NULL,
	"non_remunerative_cents" bigint DEFAULT 0 NOT NULL,
	"deductions_cents" bigint NOT NULL,
	"net_cents" bigint NOT NULL,
	"lines" jsonb,
	"source_document_id" uuid,
	"raw_extracted_json" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payslips_period_unique" UNIQUE("period")
);
--> statement-breakpoint
CREATE TABLE "rent_contracts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"label" text DEFAULT 'Alquiler' NOT NULL,
	"start_date" date NOT NULL,
	"duration_months" integer,
	"base_rent_cents" bigint NOT NULL,
	"adjustment_interval_months" integer NOT NULL,
	"index_type" "index_type" NOT NULL,
	"fixed_rate" numeric(10, 6),
	"lag_months" integer DEFAULT 1 NOT NULL,
	"due_day" integer DEFAULT 10 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "transactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"date" date NOT NULL,
	"amount_cents" bigint NOT NULL,
	"currency" "currency" DEFAULT 'ARS' NOT NULL,
	"is_income" boolean DEFAULT false NOT NULL,
	"category_id" uuid,
	"account_id" uuid,
	"payment_method" "payment_method" DEFAULT 'contado' NOT NULL,
	"installments_count" integer DEFAULT 1 NOT NULL,
	"description" text,
	"item" text,
	"quantity" numeric(12, 3),
	"notes" text,
	"my_share_cents" bigint,
	"owed_by_name" text,
	"owed_cents" bigint DEFAULT 0 NOT NULL,
	"reimbursed_cents" bigint DEFAULT 0 NOT NULL,
	"client_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "transactions_client_id_unique" UNIQUE("client_id")
);
--> statement-breakpoint
ALTER TABLE "bills" ADD CONSTRAINT "bills_source_document_id_documents_id_fk" FOREIGN KEY ("source_document_id") REFERENCES "public"."documents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goal_contributions" ADD CONSTRAINT "goal_contributions_goal_id_goals_id_fk" FOREIGN KEY ("goal_id") REFERENCES "public"."goals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goals" ADD CONSTRAINT "goals_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "installments" ADD CONSTRAINT "installments_transaction_id_transactions_id_fk" FOREIGN KEY ("transaction_id") REFERENCES "public"."transactions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payslips" ADD CONSTRAINT "payslips_source_document_id_documents_id_fk" FOREIGN KEY ("source_document_id") REFERENCES "public"."documents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "bills_due_idx" ON "bills" USING btree ("due_date");--> statement-breakpoint
CREATE INDEX "bills_provider_period_idx" ON "bills" USING btree ("provider","billing_period");--> statement-breakpoint
CREATE UNIQUE INDEX "index_values_type_date_idx" ON "index_values" USING btree ("index_type","date");--> statement-breakpoint
CREATE INDEX "installments_due_idx" ON "installments" USING btree ("due_date");--> statement-breakpoint
CREATE UNIQUE INDEX "installments_tx_num_idx" ON "installments" USING btree ("transaction_id","number");--> statement-breakpoint
CREATE INDEX "market_quotes_house_time_idx" ON "market_quotes" USING btree ("house","fetched_at");--> statement-breakpoint
CREATE UNIQUE INDEX "payroll_scales_cat_from_idx" ON "payroll_scales" USING btree ("agreement","category","valid_from");--> statement-breakpoint
CREATE INDEX "transactions_date_idx" ON "transactions" USING btree ("date");--> statement-breakpoint
CREATE INDEX "transactions_category_idx" ON "transactions" USING btree ("category_id");