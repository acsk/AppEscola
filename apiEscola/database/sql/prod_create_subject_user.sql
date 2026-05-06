-- Cria a tabela pivot de vínculo professor <-> disciplinas (idempotente)
-- Compatível com MySQL 8+

CREATE TABLE IF NOT EXISTS `subject_user` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `tenant_id` BIGINT UNSIGNED NOT NULL,
  `user_id` BIGINT UNSIGNED NOT NULL,
  `subject_id` BIGINT UNSIGNED NOT NULL,
  `created_at` TIMESTAMP NULL DEFAULT NULL,
  `updated_at` TIMESTAMP NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `subject_user_user_id_subject_id_unique` (`user_id`, `subject_id`),
  KEY `subject_user_tenant_id_user_id_index` (`tenant_id`, `user_id`),
  KEY `subject_user_tenant_id_subject_id_index` (`tenant_id`, `subject_id`),
  CONSTRAINT `subject_user_tenant_id_foreign`
    FOREIGN KEY (`tenant_id`) REFERENCES `tenants` (`id`) ON DELETE CASCADE,
  CONSTRAINT `subject_user_user_id_foreign`
    FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  CONSTRAINT `subject_user_subject_id_foreign`
    FOREIGN KEY (`subject_id`) REFERENCES `subjects` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
