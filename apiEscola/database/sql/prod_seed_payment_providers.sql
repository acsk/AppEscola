-- Seed de provedores de pagamento para produção (GLOBAL)
-- Origem: ambiente Docker local (database appescola)
-- Data: 2026-05-16
-- Catálogo global - todos os tenants compartilham estes bancos

START TRANSACTION;

INSERT INTO payment_providers
    (name, slug, description, logo_url, is_active, `order`, created_at, updated_at, deleted_at)
VALUES
    ('Inter',  'inter',  'Banco Inter',    'https://static.bancointer.com.br/blog/images/0234e7aa235244759b77f4f5c444fdbd_inter-logo.jpg', 1, 1, NOW(), NOW(), NULL),
    ('Cora',   'cora',   'Gateway Cora',   'https://www.cora.com.br/_next/image/?url=%2Fassets%2Flogo-cora.svg&w=96&q=75&dpl=dpl_Gxtkf46ztGzr3ihWEy9meeajLviR', 1, 2, NOW(), NOW(), NULL),
    ('Nubank', 'nubank', 'Gateway Nubank', 'https://upload.wikimedia.org/wikipedia/commons/thumb/3/3b/Nubank_logo.svg/330px-Nubank_logo.svg.png', 1, 3, NOW(), NOW(), NULL)
ON DUPLICATE KEY UPDATE
    name = VALUES(name),
    description = VALUES(description),
    logo_url = VALUES(logo_url),
    is_active = VALUES(is_active),
    `order` = VALUES(`order`),
    deleted_at = NULL,
    updated_at = NOW();

COMMIT;
