CREATE TABLE `users` (`id` text PRIMARY KEY NOT NULL, `phone` text NOT NULL UNIQUE, `created_at` integer NOT NULL);
--> statement-breakpoint
CREATE TABLE `otp_challenges` (`id` text PRIMARY KEY NOT NULL, `phone` text NOT NULL, `code_hash` text NOT NULL, `attempts` integer DEFAULT 0 NOT NULL, `expires_at` integer NOT NULL, `consumed_at` integer, `created_at` integer NOT NULL);
--> statement-breakpoint
CREATE INDEX `idx_otp_phone_created` ON `otp_challenges` (`phone`,`created_at`);
--> statement-breakpoint
CREATE TABLE `sessions` (`token_hash` text PRIMARY KEY NOT NULL, `user_id` text NOT NULL REFERENCES `users`(`id`) ON DELETE CASCADE, `expires_at` integer NOT NULL, `created_at` integer NOT NULL);
--> statement-breakpoint
CREATE INDEX `idx_sessions_user` ON `sessions` (`user_id`);
--> statement-breakpoint
CREATE TABLE `vehicles` (`id` text PRIMARY KEY NOT NULL, `user_id` text NOT NULL REFERENCES `users`(`id`) ON DELETE CASCADE, `manufacturer` text NOT NULL, `model` text NOT NULL, `color` text NOT NULL, `year` integer, `created_at` integer NOT NULL);
--> statement-breakpoint
CREATE INDEX `idx_vehicles_user` ON `vehicles` (`user_id`);
--> statement-breakpoint
CREATE TABLE `codes` (`id` text PRIMARY KEY NOT NULL, `serial_number` text NOT NULL UNIQUE, `public_token` text NOT NULL UNIQUE, `user_id` text NOT NULL REFERENCES `users`(`id`), `vehicle_id` text NOT NULL REFERENCES `vehicles`(`id`), `activation_state` text DEFAULT 'ACTIVE' NOT NULL, `created_at` integer NOT NULL);
--> statement-breakpoint
CREATE INDEX `idx_codes_user` ON `codes` (`user_id`);
--> statement-breakpoint
CREATE INDEX `idx_codes_vehicle_state` ON `codes` (`vehicle_id`,`activation_state`);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_codes_active_vehicle` ON `codes` (`vehicle_id`) WHERE `activation_state` = 'ACTIVE';
--> statement-breakpoint
CREATE TABLE `reports` (`id` text PRIMARY KEY NOT NULL, `code_id` text NOT NULL REFERENCES `codes`(`id`), `vehicle_id` text NOT NULL REFERENCES `vehicles`(`id`), `report_type` text NOT NULL, `status` text DEFAULT 'ACTIVE' NOT NULL, `owner_response` text, `status_token_hash` text NOT NULL UNIQUE, `expires_at` integer NOT NULL, `created_at` integer NOT NULL, `updated_at` integer NOT NULL);
--> statement-breakpoint
CREATE INDEX `idx_reports_vehicle_status` ON `reports` (`vehicle_id`,`status`,`created_at`);
--> statement-breakpoint
CREATE TABLE `report_events` (`id` text PRIMARY KEY NOT NULL, `report_id` text NOT NULL REFERENCES `reports`(`id`) ON DELETE CASCADE, `event_type` text NOT NULL, `created_at` integer NOT NULL);
--> statement-breakpoint
CREATE INDEX `idx_report_events_report_time` ON `report_events` (`report_id`,`created_at`);
--> statement-breakpoint
CREATE TABLE `audit_logs` (`id` text PRIMARY KEY NOT NULL, `actor_id` text, `action` text NOT NULL, `entity_type` text NOT NULL, `entity_id` text, `created_at` integer NOT NULL);
--> statement-breakpoint
CREATE INDEX `idx_audit_entity_time` ON `audit_logs` (`entity_type`,`entity_id`,`created_at`);
