CREATE TABLE `portfolio_genres` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(128) NOT NULL,
	`type` enum('audio','video') NOT NULL,
	`sortOrder` int NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `portfolio_genres_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `portfolio_items` (
	`id` int AUTO_INCREMENT NOT NULL,
	`genreId` int NOT NULL,
	`type` enum('audio','video') NOT NULL,
	`title` varchar(256),
	`description` text,
	`fileKey` varchar(512) NOT NULL,
	`fileUrl` varchar(1024) NOT NULL,
	`thumbnailKey` varchar(512),
	`thumbnailUrl` varchar(1024),
	`waveformPeaks` mediumtext,
	`durationSeconds` int,
	`sortOrder` int NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `portfolio_items_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `downloads` MODIFY COLUMN `userId` int;--> statement-breakpoint
ALTER TABLE `downloads` ADD `ipAddress` varchar(64);--> statement-breakpoint
ALTER TABLE `invites` ADD `email` varchar(320);