CREATE TABLE `sandboxes` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` integer NOT NULL,
	`last_seen` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `trips` (
	`sandbox_id` text NOT NULL,
	`id` text NOT NULL,
	`start_utc` integer NOT NULL,
	`end_utc` integer NOT NULL,
	`start_offset` text NOT NULL,
	`end_offset` text NOT NULL,
	`amount` integer NOT NULL,
	`commission` integer NOT NULL,
	`payment` text NOT NULL,
	`created_at` integer NOT NULL,
	PRIMARY KEY(`sandbox_id`, `id`),
	FOREIGN KEY (`sandbox_id`) REFERENCES `sandboxes`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "trips_payment_check" CHECK("trips"."payment" IN ('cash','card'))
);
--> statement-breakpoint
CREATE INDEX `trips_by_day` ON `trips` (`sandbox_id`,`start_utc`);