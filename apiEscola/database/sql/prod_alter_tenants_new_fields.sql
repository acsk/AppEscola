-- SQL de ajuste manual para produção
-- Objetivo: adicionar os campos atuais do módulo de tenants
-- Compatível com MySQL 8+

SET NAMES utf8mb4;

ALTER TABLE tenants
    ADD COLUMN IF NOT EXISTS corporate_name VARCHAR(255) NULL AFTER id,
    ADD COLUMN IF NOT EXISTS trade_name VARCHAR(255) NULL AFTER corporate_name,
    ADD COLUMN IF NOT EXISTS cnpj VARCHAR(20) NULL AFTER slug,
    ADD COLUMN IF NOT EXISTS email VARCHAR(255) NULL AFTER cnpj,
    ADD COLUMN IF NOT EXISTS phone VARCHAR(255) NULL AFTER email,
    ADD COLUMN IF NOT EXISTS whatsapp VARCHAR(255) NULL AFTER phone,
    ADD COLUMN IF NOT EXISTS zip_code VARCHAR(10) NULL AFTER whatsapp,
    ADD COLUMN IF NOT EXISTS street VARCHAR(255) NULL AFTER zip_code,
    ADD COLUMN IF NOT EXISTS number VARCHAR(20) NULL AFTER street,
    ADD COLUMN IF NOT EXISTS complement VARCHAR(255) NULL AFTER number,
    ADD COLUMN IF NOT EXISTS neighborhood VARCHAR(255) NULL AFTER complement,
    ADD COLUMN IF NOT EXISTS city VARCHAR(255) NULL AFTER neighborhood,
    ADD COLUMN IF NOT EXISTS state VARCHAR(2) NULL AFTER city,
    ADD COLUMN IF NOT EXISTS settings JSON NULL AFTER status,
    ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP NULL AFTER updated_at;

-- Garantir razão social para registros antigos
UPDATE tenants
SET corporate_name = COALESCE(corporate_name, name)
WHERE corporate_name IS NULL;

-- (Opcional) Se quiser endurecer regra para novos cadastros
-- ALTER TABLE tenants MODIFY corporate_name VARCHAR(255) NOT NULL;

-- (Opcional) Índices úteis
-- CREATE UNIQUE INDEX tenants_slug_unique ON tenants(slug);
-- CREATE UNIQUE INDEX tenants_cnpj_unique ON tenants(cnpj);

-- Verificação rápida
-- SHOW COLUMNS FROM tenants;
