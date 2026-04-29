CREATE TABLE `taxonomy_tags` (
	`id` int AUTO_INCREMENT NOT NULL,
	`type` enum('genre','mood','attribute') NOT NULL,
	`value` varchar(128) NOT NULL,
	CONSTRAINT `taxonomy_tags_id` PRIMARY KEY(`id`)
);
