-- Cria a tabela pivot de vinculo horario <-> professores (idempotente)
-- Compativel com MySQL 8+

CREATE TABLE IF NOT EXISTS `class_schedule_user` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `tenant_id` BIGINT UNSIGNED NOT NULL,
  `class_schedule_id` BIGINT UNSIGNED NOT NULL,
  `user_id` BIGINT UNSIGNED NOT NULL,
  `created_at` TIMESTAMP NULL DEFAULT NULL,
  `updated_at` TIMESTAMP NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `class_schedule_user_schedule_id_user_id_unique` (`class_schedule_id`, `user_id`),
  KEY `class_schedule_user_tenant_id_schedule_id_index` (`tenant_id`, `class_schedule_id`),
  KEY `class_schedule_user_tenant_id_user_id_index` (`tenant_id`, `user_id`),
  CONSTRAINT `class_schedule_user_tenant_id_foreign`
    FOREIGN KEY (`tenant_id`) REFERENCES `tenants` (`id`) ON DELETE CASCADE,
  CONSTRAINT `class_schedule_user_class_schedule_id_foreign`
    FOREIGN KEY (`class_schedule_id`) REFERENCES `class_schedules` (`id`) ON DELETE CASCADE,
  CONSTRAINT `class_schedule_user_user_id_foreign`
    FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
