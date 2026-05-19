SET NAMES utf8mb4;

INSERT IGNORE INTO domain_statuses (slug, name) VALUES
('active', 'Ativo'),
('inactive', 'Inativo'),
('suspended', 'Suspenso'),
('closed', 'Encerrado');

INSERT IGNORE INTO domain_user_roles (slug, name) VALUES
('super_admin', 'Super Administrador'),
('admin', 'Administrador'),
('secretaria', 'Secretaria'),
('professor', 'Professor'),
('aluno', 'Aluno'),
('responsavel', 'Responsável');

INSERT IGNORE INTO domain_periods (slug, name, `order`) VALUES
('morning', 'Manhã', 1),
('afternoon', 'Tarde', 2),
('night', 'Noite', 3),
('full_time', 'Integral', 4);

INSERT IGNORE INTO domain_weekdays (slug, name, `order`) VALUES
('monday', 'Segunda-feira', 1),
('tuesday', 'Terça-feira', 2),
('wednesday', 'Quarta-feira', 3),
('thursday', 'Quinta-feira', 4),
('friday', 'Sexta-feira', 5),
('saturday', 'Sábado', 6),
('sunday', 'Domingo', 7);

INSERT IGNORE INTO domain_guardian_relationships (slug, name) VALUES
('pai', 'Pai'),
('mae', 'Mãe'),
('avo_paterno', 'Avô Paterno'),
('avo_materno', 'Avó Materna'),
('tio', 'Tio(a)'),
('responsavel_legal', 'Responsável Legal'),
('outro', 'Outro');

INSERT IGNORE INTO domain_payment_methods (slug, name) VALUES
('cash', 'Dinheiro'),
('pix', 'PIX'),
('credit_card', 'Cartão de Crédito'),
('debit_card', 'Cartão de Débito'),
('bank_slip', 'Boleto Bancário'),
('transfer', 'Transferência Bancária');

INSERT IGNORE INTO domain_enrollment_statuses (slug, name) VALUES
('pending', 'Pendente'),
('active', 'Ativa'),
('concluded', 'Concluída'),
('cancelled', 'Cancelada'),
('locked', 'Trancada');

INSERT IGNORE INTO domain_invoice_statuses (slug, name) VALUES
('pending', 'Pendente'),
('paid', 'Paga'),
('overdue', 'Vencida'),
('cancelled', 'Cancelada');

INSERT IGNORE INTO domain_billing_cycles (slug, name, months, `order`) VALUES
('monthly', 'Mensal', 1, 1),
('bimonthly', 'Bimestral', 2, 2),
('quadrimestral', 'Quadrimestral', 4, 3),
('semiannual', 'Semestral', 6, 4),
('annual', 'Anual', 12, 5);

INSERT IGNORE INTO domain_invoice_types (slug, name) VALUES
('enrollment_fee', 'Taxa de Matrícula'),
('monthly', 'Mensalidade'),
('other', 'Outro');

INSERT IGNORE INTO exam_statuses (id, slug, label, `order`, created_at, updated_at) VALUES
(1, 'draft', 'Rascunho', 1, NOW(), NOW()),
(2, 'published', 'Publicado', 2, NOW(), NOW()),
(3, 'archived', 'Arquivado', 3, NOW(), NOW());

INSERT IGNORE INTO exam_types (id, slug, label, created_at, updated_at) VALUES
(1, 'custom', 'Personalizado', NOW(), NOW()),
(2, 'enem', 'ENEM', NOW(), NOW()),
(3, 'vestibular', 'Vestibular', NOW(), NOW()),
(4, 'fuvest', 'FUVEST', NOW(), NOW()),
(5, 'concurso', 'Concurso', NOW(), NOW());

INSERT IGNORE INTO exam_attempt_statuses (id, slug, label, `order`, created_at, updated_at) VALUES
(1, 'in_progress', 'Em andamento', 1, NOW(), NOW()),
(2, 'pending_review', 'Aguardando correção', 2, NOW(), NOW()),
(3, 'awaiting_release', 'Aguardando liberação', 3, NOW(), NOW()),
(4, 'completed', 'Concluído', 4, NOW(), NOW()),
(5, 'abandoned', 'Abandonado', 5, NOW(), NOW());
