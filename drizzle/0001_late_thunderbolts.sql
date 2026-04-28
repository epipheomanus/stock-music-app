CREATE TABLE `cart_items` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`trackId` int NOT NULL,
	`addedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `cart_items_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `downloads` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`trackId` int NOT NULL,
	`projectName` varchar(256) NOT NULL,
	`downloadedAt` timestamp NOT NULL DEFAULT (now()),
	`fileType` enum('clean_wav','watermarked_mp3') NOT NULL DEFAULT 'clean_wav',
	CONSTRAINT `downloads_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `invites` (
	`id` int AUTO_INCREMENT NOT NULL,
	`token` varchar(128) NOT NULL,
	`createdById` int NOT NULL,
	`usedById` int,
	`usedAt` timestamp,
	`expiresAt` timestamp NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `invites_id` PRIMARY KEY(`id`),
	CONSTRAINT `invites_token_unique` UNIQUE(`token`)
);
--> statement-breakpoint
CREATE TABLE `track_tags` (
	`id` int AUTO_INCREMENT NOT NULL,
	`trackId` int NOT NULL,
	`type` enum('genre','mood','attribute') NOT NULL,
	`value` varchar(128) NOT NULL,
	CONSTRAINT `track_tags_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `tracks` (
	`id` int AUTO_INCREMENT NOT NULL,
	`title` varchar(256) NOT NULL,
	`composerName` varchar(256),
	`description` text,
	`durationSeconds` int,
	`bpm` int,
	`wavKey` varchar(512),
	`wavUrl` varchar(1024),
	`stemsZipKey` varchar(512),
	`stemsZipUrl` varchar(1024),
	`watermarkedMp3Key` varchar(512),
	`watermarkedMp3Url` varchar(1024),
	`coverArtKey` varchar(512),
	`coverArtUrl` varchar(1024),
	`hasStems` boolean NOT NULL DEFAULT false,
	`watermarkStatus` enum('pending','processing','done','error') NOT NULL DEFAULT 'pending',
	`isPublished` boolean NOT NULL DEFAULT false,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `tracks_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `watermark_config` (
	`id` int AUTO_INCREMENT NOT NULL,
	`audioKey` varchar(512),
	`audioUrl` varchar(1024),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `watermark_config_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `users` ADD `firstName` varchar(128);--> statement-breakpoint
ALTER TABLE `users` ADD `lastName` varchar(128);--> statement-breakpoint
ALTER TABLE `users` ADD `company` varchar(256);--> statement-breakpoint
ALTER TABLE `users` ADD `username` varchar(64);--> statement-breakpoint
ALTER TABLE `users` ADD `passwordHash` varchar(256);--> statement-breakpoint
ALTER TABLE `users` ADD `resetToken` varchar(128);--> statement-breakpoint
ALTER TABLE `users` ADD `resetTokenExpiresAt` timestamp;--> statement-breakpoint
ALTER TABLE `users` ADD CONSTRAINT `users_username_unique` UNIQUE(`username`);