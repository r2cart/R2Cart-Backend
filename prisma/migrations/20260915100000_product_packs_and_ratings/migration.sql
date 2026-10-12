ALTER TABLE `products` ADD COLUMN `variantGroupId` VARCHAR(191) NULL;
CREATE INDEX `products_variantGroupId_idx` ON `products`(`variantGroupId`);
CREATE UNIQUE INDEX `products_variantGroupId_unit_key` ON `products`(`variantGroupId`, `unit`);

CREATE TABLE `product_ratings` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `productId` VARCHAR(191) NOT NULL,
    `score` INTEGER NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    UNIQUE INDEX `product_ratings_userId_productId_key` (`userId`, `productId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
ALTER TABLE `product_ratings` ADD CONSTRAINT `product_ratings_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `product_ratings` ADD CONSTRAINT `product_ratings_productId_fkey` FOREIGN KEY (`productId`) REFERENCES `products`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
