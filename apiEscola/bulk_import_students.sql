-- Bulk import de 26 alunos (excluindo os 4 primeiros já cadastrados)
-- Tenant: 2 (AppEscola)
-- IFAL: course_id = 5
-- Gerado em: 14/05/2026

SET FOREIGN_KEY_CHECKS = 0;

-- Variável para ID do próximo aluno (ajustar conforme necessário)
SET @next_student_id = (SELECT MAX(id) + 1 FROM students);
SET @next_guardian_id = (SELECT MAX(id) + 1 FROM guardians);
SET @tenant_id = 2;
SET @course_id = 5;
SET @current_year = 2026;

-- ==============================================================================
-- 1. INSERT GUARDIANS (responsáveis únicos por CPF + tenant)
-- ==============================================================================

INSERT IGNORE INTO guardians (tenant_id, name, document, email, phone, relationship, created_at, updated_at)
VALUES
(2, 'HELVIA KELLY MELO SILVA', '05364923444', 'helvia kelly.npp@gmail.com', '82996231764', 'mae', NOW(), NOW()),
(2, 'ALEXSANDRA CORREIA DE OLIVEIRA SOUZA', '04158576431', 'alexsandraitamar@gmail.com', '82981556456', 'mae', NOW(), NOW()),
(2, 'OS PAIS', '02800046481', 'josineidealmeida2016@gmail.com', '82-99921-6143', 'mae', NOW(), NOW()),
(2, 'SEMIÃO SEBASTIÃO DOS SANTOS', '08642671424', 'semeaosebastiao1982@gmail.com', '82999800164', 'pai', NOW(), NOW()),
(2, 'CLEIDIANE DA SILVA FERREIRA', '095574894', 'cleidianecleiddy@gmail.com', '82 991825176', 'mae', NOW(), NOW()),
(2, 'LUCINEIDE DE OLIVEIRA LIMA', '03539128409', 'lucineideoli.lima@gmail.com', '82999195741', 'mae', NOW(), NOW()),
(2, 'JOSEFA SOUZA DA SILVA', '10528674480', 'josefasouzadasilva266@gmail.com', '(82)981411105', 'mae', NOW(), NOW()),
(2, 'CLEZILENE PEREIRA DOS SANTOS', '039463874', 'clezilene79.prof@gmail.com', '82-994016228', 'mae', NOW(), NOW()),
(2, 'ALINE AGUIAR', '06161757443', 'aline.aguiar1004@gmail.com', '82996552325', 'mae', NOW(), NOW()),
(2, 'KEILA MARIA MELO SILVA', '046259774', 'agnaldaoo100@gmail.com', '996961385', 'mae', NOW(), NOW()),
(2, 'A MÃE', '080425184', 'Crislandiaamorimnana@gmail.com', '981655261', 'mae', NOW(), NOW()),
(2, 'QUITILIANE KATIUSCIA ALVES DA SILVA', '06594974416', 'quitiliane2020@gmail.com', '82996201792', 'mae', NOW(), NOW()),
(2, 'JOSILEIDE DE LIRA', '067581764', 'marialaura9090@icloud.com', '82981506505', 'mae', NOW(), NOW()),
(2, 'ANA MARIA DA COSTA', '03040632400', 'acsanacosta@gmail.com', '999965263', 'mae', NOW(), NOW()),
(2, 'JOSÉ FÁBIO DOS SANTOS', '05821313406', 'fabiojf191@gmail.com', '(82)99646-9465', 'pai', NOW(), NOW()),
(2, 'CESAR DOS SANTOS CARVALHO', '02412562407', 'tamiresyasmin133@gmail.com', '82998436707', 'pai', NOW(), NOW()),
(2, 'EDILMA DE BRITO LIMA', '072051284', 'edilmabritolima@gmail.com', '82996290892', 'mae', NOW(), NOW()),
(2, 'JOSINEIDE SANTOS DE MELO', '04187275460', 'josimelocontabil@gmail.com', '82999356830', 'mae', NOW(), NOW()),
(2, 'ROSILENE DE ALBUQUERQUE SANTOS ANDRADE', '05593202486', 'rosi.andrade2526@gmail.com', '82994441751', 'mae', NOW(), NOW()),
(2, 'PAI', '10487254481', 'dudawandeson@gmail.com', '11977663349', 'pai', NOW(), NOW()),
(2, 'ISANA MARIA BARROS AMORIM', '04943580416', 'maxwell82barros@gmail.com', '82998315325', 'pai', NOW(), NOW()),
(2, 'ROSEANE TENÓRIO ALBUQUERQUE NASCIMENTO', '08464848463', 'anne25albuquerque@gmail.com', '82996789039', 'mae', NOW(), NOW()),
(2, 'SIVANILDA MARIA DA SILVA', '078265534', 'Sivanildamaria8@gmail.com', '8282325083', 'mae', NOW(), NOW()),
(2, 'SANDRA ALVES DE SOUSA LOPES', '06206151417', 'sandra.alves06@icloud.com', '82999106453', 'mae', NOW(), NOW()),
(2, 'MARIA DAS DORES SANTOS DA SILVA', '82755833491', 'marialauralucas10@gmail.com', '82933005412', 'avo_materno', NOW(), NOW());

-- ==============================================================================
-- 2. INSERT STUDENTS (26 alunos restantes)
-- ==============================================================================

INSERT INTO students (tenant_id, name, birth_date, document, email, phone, is_minor, status, desired_course_id, created_at, updated_at)
VALUES
(2, 'ALICYA NAYRA MELO SILVA', '2011-10-16', '11375520423', 'alicyanayrams@gmail.com', '82998401886', 1, 'inactive', 5, NOW(), NOW()),
(2, 'ISABELLY AGUIAR DE OLIVEIRA SOUZA', '2012-01-03', '15102776410', 'isabellyaguiar0301@gmail.com', '82981051901', 1, 'inactive', 5, NOW(), NOW()),
(2, 'ANDRESSA ALMEIDA DE FARIAS', '2011-07-17', '11243920416', 'andressa.f.a.321@gmail.com', '82996350268', 1, 'inactive', 5, NOW(), NOW()),
(2, 'SAMUEL SEBASTIÃO DOS SANTOS SILVA', '2011-05-19', '14409343475', 'samuelsebastiao654@gmail.com', '82999800164', 1, 'inactive', 5, NOW(), NOW()),
(2, 'GUSTAVO RENAN DA SILVA FERREIRA', '2012-04-21', '17467264402', 'cleidianecleiddy@gmail.com', '82987856048', 1, 'inactive', 5, NOW(), NOW()),
(2, 'GABRIEL OLIVEIRA LIMA', '2012-02-01', '11576703428', 'gabrielolilima12@gmail.com', '82998328796', 1, 'inactive', 5, NOW(), NOW()),
(2, 'MARIA BEATRIZ ALMEIDA SILVA', '2011-08-24', '17026948440', 'josefasouzadasilva266@gmail.com', '(82)981351188', 1, 'inactive', 5, NOW(), NOW()),
(2, 'ANA CLARA PEREIRA DA SILVA', '2012-04-23', '13793213447', 'clezilene79.prof@gmail.com', '82-994016228', 1, 'inactive', 5, NOW(), NOW()),
(2, 'LUIZ AUGUSTO DOS SANTOS SILVA', '2011-09-02', '12074630433', 'aline.aguiar1004@gmail.com', '82999442771', 1, 'inactive', 5, NOW(), NOW()),
(2, 'ISAAC HENRIQUE MELO SILVA', '2011-12-24', '11524999474', 'agnaldaoo100@gmail.com', '991883589', 1, 'inactive', 5, NOW(), NOW()),
(2, 'CLARISSY VITORIA AMORIM GOMES', '0012-02-20', '15481621401', 'Crislandiaamorimnana@gmail.com', '8296513962', 1, 'inactive', 5, NOW(), NOW()),
(2, 'KEMILLY EMANUELLY ALVES MARTINS', '2012-06-21', '00002539446', 'quitiliane2020@gmail.com', '82999053061', 1, 'inactive', 5, NOW(), NOW()),
(2, 'MARIA LAURA DE LIDA', '2011-04-28', '14543901401', 'Marialaura9090@icloud.com', '82981506505', 1, 'inactive', 5, NOW(), NOW()),
(2, 'LUCAS GABRIEL COSTA SILVA', '2011-08-15', '14558907400', 'lucas41020859@gmail.com', '991831542', 1, 'inactive', 5, NOW(), NOW()),
(2, 'BRENO GUSTAVO DOS SANTOS', '2012-03-02', '15297529492', 'brenogustavodossantos214', '(82)99666-6841', 1, 'inactive', 5, NOW(), NOW()),
(2, 'YASMIN CARLEANY DOS SANTOS CARVALHO', '2011-05-27', '11995803413', 'tamiresyasmin133@gmail.com', '82999103161', 1, 'inactive', 5, NOW(), NOW()),
(2, 'AGATHA LIMA AVELINO', '2011-06-05', '13293355463', 'Agathalinda584@gmail.com', '82991207547', 1, 'inactive', 5, NOW(), NOW()),
(2, 'FELIPE DA SILVA MELO', '2011-10-26', '11434387445', 'josimelocontabil@gmail.com', '82999356830', 1, 'inactive', 5, NOW(), NOW()),
(2, 'ELIS REBECA DE ALBUQUERQUE ANDRADE', '2011-08-25', '14872892437', 'elisrebeca25@gmail.com', '82999247399', 1, 'inactive', 5, NOW(), NOW()),
(2, 'VITÓRIA CAVALCANTE DOS SANTOS', '2012-03-18', '05612026809', 'dudawandeson@gmail.com', '08296177586', 1, 'inactive', 5, NOW(), NOW()),
(2, 'ISA MARIA BARROS AMORIM RODRIGUES', '2012-04-30', '11919194479', 'maxwell82barros@gmail.com', '82998337699', 1, 'inactive', 5, NOW(), NOW()),
(2, 'MARÍA CLARA DE ALBUQUERQUE NASCIMENTO', '2011-09-07', '18329324435', 'anne25albuquerque@gmail.com', '82999527744', 1, 'inactive', 5, NOW(), NOW()),
(2, 'GABRIEL DA SILVA HORA', '2012-01-06', '18094817402', 'gabriel246hora@gmail.com', '82981129853', 1, 'inactive', 5, NOW(), NOW()),
(2, 'YASMIM ALVES DE SOUSA LOPES', '2012-04-26', '14935854448', 'yasmimlopes260412@gmail.com', '82999394929', 1, 'inactive', 5, NOW(), NOW()),
(2, 'LAURA LAVÍNYA SANTOS DE SÁ', '2012-05-25', '11769754474', 'lauralavinyasantossa@gmail.com', '82998346589', 1, 'inactive', 5, NOW(), NOW());

-- ==============================================================================
-- 3. UPDATE enrollment_number (após inserção dos IDs)
-- ==============================================================================

UPDATE students 
SET enrollment_number = CONCAT(@current_year, LPAD(id, 5, '0'))
WHERE tenant_id = 2 
  AND status = 'inactive'
  AND enrollment_number IS NULL;

-- ==============================================================================
-- 4. LINK STUDENTS TO GUARDIANS (via student_guardians pivot)
-- ==============================================================================

-- Alicya Nayra Melo Silva → Helvia Kelly Melo Silva
INSERT INTO student_guardians (tenant_id, student_id, guardian_id, is_financial_responsible, is_pedagogical_responsible, can_access_portal, created_at, updated_at)
SELECT 2, s.id, g.id, 1, 1, 0, NOW(), NOW()
FROM students s
JOIN guardians g ON g.tenant_id = 2 AND g.document = '05364923444'
WHERE s.tenant_id = 2 AND s.name = 'ALICYA NAYRA MELO SILVA'
ON DUPLICATE KEY UPDATE updated_at = NOW();

-- Isabelly Aguiar de Oliveira Souza → Alexsandra Correia de Oliveira Souza
INSERT INTO student_guardians (tenant_id, student_id, guardian_id, is_financial_responsible, is_pedagogical_responsible, can_access_portal, created_at, updated_at)
SELECT 2, s.id, g.id, 1, 1, 0, NOW(), NOW()
FROM students s
JOIN guardians g ON g.tenant_id = 2 AND g.document = '04158576431'
WHERE s.tenant_id = 2 AND s.name = 'ISABELLY AGUIAR DE OLIVEIRA SOUZA'
ON DUPLICATE KEY UPDATE updated_at = NOW();

-- Andressa Almeida de Farias → Os Pais
INSERT INTO student_guardians (tenant_id, student_id, guardian_id, is_financial_responsible, is_pedagogical_responsible, can_access_portal, created_at, updated_at)
SELECT 2, s.id, g.id, 1, 1, 0, NOW(), NOW()
FROM students s
JOIN guardians g ON g.tenant_id = 2 AND g.document = '02800046481'
WHERE s.tenant_id = 2 AND s.name = 'ANDRESSA ALMEIDA DE FARIAS'
ON DUPLICATE KEY UPDATE updated_at = NOW();

-- Samuel Sebastião dos Santos Silva → Semião Sebastião dos Santos
INSERT INTO student_guardians (tenant_id, student_id, guardian_id, is_financial_responsible, is_pedagogical_responsible, can_access_portal, created_at, updated_at)
SELECT 2, s.id, g.id, 1, 1, 0, NOW(), NOW()
FROM students s
JOIN guardians g ON g.tenant_id = 2 AND g.document = '08642671424'
WHERE s.tenant_id = 2 AND s.name = 'SAMUEL SEBASTIÃO DOS SANTOS SILVA'
ON DUPLICATE KEY UPDATE updated_at = NOW();

-- Gustavo Renan da Silva Ferreira → Cleidiane da Silva Ferreira
INSERT INTO student_guardians (tenant_id, student_id, guardian_id, is_financial_responsible, is_pedagogical_responsible, can_access_portal, created_at, updated_at)
SELECT 2, s.id, g.id, 1, 1, 0, NOW(), NOW()
FROM students s
JOIN guardians g ON g.tenant_id = 2 AND g.document = '095574894'
WHERE s.tenant_id = 2 AND s.name = 'GUSTAVO RENAN DA SILVA FERREIRA'
ON DUPLICATE KEY UPDATE updated_at = NOW();

-- Gabriel Oliveira Lima → Lucineide de Oliveira Lima
INSERT INTO student_guardians (tenant_id, student_id, guardian_id, is_financial_responsible, is_pedagogical_responsible, can_access_portal, created_at, updated_at)
SELECT 2, s.id, g.id, 1, 1, 0, NOW(), NOW()
FROM students s
JOIN guardians g ON g.tenant_id = 2 AND g.document = '03539128409'
WHERE s.tenant_id = 2 AND s.name = 'GABRIEL OLIVEIRA LIMA'
ON DUPLICATE KEY UPDATE updated_at = NOW();

-- Maria Beatriz Almeida Silva → Josefa Souza da Silva
INSERT INTO student_guardians (tenant_id, student_id, guardian_id, is_financial_responsible, is_pedagogical_responsible, can_access_portal, created_at, updated_at)
SELECT 2, s.id, g.id, 1, 1, 0, NOW(), NOW()
FROM students s
JOIN guardians g ON g.tenant_id = 2 AND g.document = '10528674480'
WHERE s.tenant_id = 2 AND s.name = 'MARIA BEATRIZ ALMEIDA SILVA'
ON DUPLICATE KEY UPDATE updated_at = NOW();

-- Ana Clara Pereira da Silva → Clezilene Pereira dos Santos
INSERT INTO student_guardians (tenant_id, student_id, guardian_id, is_financial_responsible, is_pedagogical_responsible, can_access_portal, created_at, updated_at)
SELECT 2, s.id, g.id, 1, 1, 0, NOW(), NOW()
FROM students s
JOIN guardians g ON g.tenant_id = 2 AND g.document = '039463874'
WHERE s.tenant_id = 2 AND s.name = 'ANA CLARA PEREIRA DA SILVA'
ON DUPLICATE KEY UPDATE updated_at = NOW();

-- Luiz Augusto dos Santos Silva → Aline Aguiar
INSERT INTO student_guardians (tenant_id, student_id, guardian_id, is_financial_responsible, is_pedagogical_responsible, can_access_portal, created_at, updated_at)
SELECT 2, s.id, g.id, 1, 1, 0, NOW(), NOW()
FROM students s
JOIN guardians g ON g.tenant_id = 2 AND g.document = '06161757443'
WHERE s.tenant_id = 2 AND s.name = 'LUIZ AUGUSTO DOS SANTOS SILVA'
ON DUPLICATE KEY UPDATE updated_at = NOW();

-- Isaac Henrique Melo Silva → Keila Maria Melo Silva
INSERT INTO student_guardians (tenant_id, student_id, guardian_id, is_financial_responsible, is_pedagogical_responsible, can_access_portal, created_at, updated_at)
SELECT 2, s.id, g.id, 1, 1, 0, NOW(), NOW()
FROM students s
JOIN guardians g ON g.tenant_id = 2 AND g.document = '046259774'
WHERE s.tenant_id = 2 AND s.name = 'ISAAC HENRIQUE MELO SILVA'
ON DUPLICATE KEY UPDATE updated_at = NOW();

-- Clarissy Vitoria Amorim Gomes → A Mãe
INSERT INTO student_guardians (tenant_id, student_id, guardian_id, is_financial_responsible, is_pedagogical_responsible, can_access_portal, created_at, updated_at)
SELECT 2, s.id, g.id, 1, 1, 0, NOW(), NOW()
FROM students s
JOIN guardians g ON g.tenant_id = 2 AND g.document = '080425184'
WHERE s.tenant_id = 2 AND s.name = 'CLARISSY VITORIA AMORIM GOMES'
ON DUPLICATE KEY UPDATE updated_at = NOW();

-- Kemilly Emanuelly Alves Martins → Quitiliane Katiuscia Alves da Silva
INSERT INTO student_guardians (tenant_id, student_id, guardian_id, is_financial_responsible, is_pedagogical_responsible, can_access_portal, created_at, updated_at)
SELECT 2, s.id, g.id, 1, 1, 0, NOW(), NOW()
FROM students s
JOIN guardians g ON g.tenant_id = 2 AND g.document = '06594974416'
WHERE s.tenant_id = 2 AND s.name = 'KEMILLY EMANUELLY ALVES MARTINS'
ON DUPLICATE KEY UPDATE updated_at = NOW();

-- Maria Laura de Lida → Josileide de Lira
INSERT INTO student_guardians (tenant_id, student_id, guardian_id, is_financial_responsible, is_pedagogical_responsible, can_access_portal, created_at, updated_at)
SELECT 2, s.id, g.id, 1, 1, 0, NOW(), NOW()
FROM students s
JOIN guardians g ON g.tenant_id = 2 AND g.document = '067581764'
WHERE s.tenant_id = 2 AND s.name = 'MARIA LAURA DE LIDA'
ON DUPLICATE KEY UPDATE updated_at = NOW();

-- Lucas Gabriel Costa Silva → Ana Maria da Costa (2 registros com mesmo aluno - usar primeiro)
INSERT INTO student_guardians (tenant_id, student_id, guardian_id, is_financial_responsible, is_pedagogical_responsible, can_access_portal, created_at, updated_at)
SELECT 2, s.id, g.id, 1, 1, 0, NOW(), NOW()
FROM students s
JOIN guardians g ON g.tenant_id = 2 AND g.document = '03040632400'
WHERE s.tenant_id = 2 AND s.name = 'LUCAS GABRIEL COSTA SILVA'
ON DUPLICATE KEY UPDATE updated_at = NOW();

-- Breno Gustavo dos Santos → José Fábio dos Santos
INSERT INTO student_guardians (tenant_id, student_id, guardian_id, is_financial_responsible, is_pedagogical_responsible, can_access_portal, created_at, updated_at)
SELECT 2, s.id, g.id, 1, 1, 0, NOW(), NOW()
FROM students s
JOIN guardians g ON g.tenant_id = 2 AND g.document = '05821313406'
WHERE s.tenant_id = 2 AND s.name = 'BRENO GUSTAVO DOS SANTOS'
ON DUPLICATE KEY UPDATE updated_at = NOW();

-- Yasmin Carleany dos Santos Carvalho → Cesar dos Santos Carvalho
INSERT INTO student_guardians (tenant_id, student_id, guardian_id, is_financial_responsible, is_pedagogical_responsible, can_access_portal, created_at, updated_at)
SELECT 2, s.id, g.id, 1, 1, 0, NOW(), NOW()
FROM students s
JOIN guardians g ON g.tenant_id = 2 AND g.document = '02412562407'
WHERE s.tenant_id = 2 AND s.name = 'YASMIN CARLEANY DOS SANTOS CARVALHO'
ON DUPLICATE KEY UPDATE updated_at = NOW();

-- Agatha Lima Avelino → Edilma de Brito Lima
INSERT INTO student_guardians (tenant_id, student_id, guardian_id, is_financial_responsible, is_pedagogical_responsible, can_access_portal, created_at, updated_at)
SELECT 2, s.id, g.id, 1, 1, 0, NOW(), NOW()
FROM students s
JOIN guardians g ON g.tenant_id = 2 AND g.document = '072051284'
WHERE s.tenant_id = 2 AND s.name = 'AGATHA LIMA AVELINO'
ON DUPLICATE KEY UPDATE updated_at = NOW();

-- Felipe da Silva Melo → Josineide Santos de Melo
INSERT INTO student_guardians (tenant_id, student_id, guardian_id, is_financial_responsible, is_pedagogical_responsible, can_access_portal, created_at, updated_at)
SELECT 2, s.id, g.id, 1, 1, 0, NOW(), NOW()
FROM students s
JOIN guardians g ON g.tenant_id = 2 AND g.document = '04187275460'
WHERE s.tenant_id = 2 AND s.name = 'FELIPE DA SILVA MELO'
ON DUPLICATE KEY UPDATE updated_at = NOW();

-- Elis Rebeca de Albuquerque Andrade → Rosilene de Albuquerque Santos Andrade
INSERT INTO student_guardians (tenant_id, student_id, guardian_id, is_financial_responsible, is_pedagogical_responsible, can_access_portal, created_at, updated_at)
SELECT 2, s.id, g.id, 1, 1, 0, NOW(), NOW()
FROM students s
JOIN guardians g ON g.tenant_id = 2 AND g.document = '05593202486'
WHERE s.tenant_id = 2 AND s.name = 'ELIS REBECA DE ALBUQUERQUE ANDRADE'
ON DUPLICATE KEY UPDATE updated_at = NOW();

-- Vitória Cavalcante dos Santos → Pai
INSERT INTO student_guardians (tenant_id, student_id, guardian_id, is_financial_responsible, is_pedagogical_responsible, can_access_portal, created_at, updated_at)
SELECT 2, s.id, g.id, 1, 1, 0, NOW(), NOW()
FROM students s
JOIN guardians g ON g.tenant_id = 2 AND g.document = '10487254481'
WHERE s.tenant_id = 2 AND s.name = 'VITÓRIA CAVALCANTE DOS SANTOS'
ON DUPLICATE KEY UPDATE updated_at = NOW();

-- Isa Maria Barros Amorim Rodrigues → Isana Maria Barros Amorim
INSERT INTO student_guardians (tenant_id, student_id, guardian_id, is_financial_responsible, is_pedagogical_responsible, can_access_portal, created_at, updated_at)
SELECT 2, s.id, g.id, 1, 1, 0, NOW(), NOW()
FROM students s
JOIN guardians g ON g.tenant_id = 2 AND g.document = '04943580416'
WHERE s.tenant_id = 2 AND s.name = 'ISA MARIA BARROS AMORIM RODRIGUES'
ON DUPLICATE KEY UPDATE updated_at = NOW();

-- María Clara de Albuquerque Nascimento → Roseane Tenório Albuquerque Nascimento
INSERT INTO student_guardians (tenant_id, student_id, guardian_id, is_financial_responsible, is_pedagogical_responsible, can_access_portal, created_at, updated_at)
SELECT 2, s.id, g.id, 1, 1, 0, NOW(), NOW()
FROM students s
JOIN guardians g ON g.tenant_id = 2 AND g.document = '08464848463'
WHERE s.tenant_id = 2 AND s.name = 'MARÍA CLARA DE ALBUQUERQUE NASCIMENTO'
ON DUPLICATE KEY UPDATE updated_at = NOW();

-- Gabriel da Silva Hora → Sivanilda Maria da Silva
INSERT INTO student_guardians (tenant_id, student_id, guardian_id, is_financial_responsible, is_pedagogical_responsible, can_access_portal, created_at, updated_at)
SELECT 2, s.id, g.id, 1, 1, 0, NOW(), NOW()
FROM students s
JOIN guardians g ON g.tenant_id = 2 AND g.document = '078265534'
WHERE s.tenant_id = 2 AND s.name = 'GABRIEL DA SILVA HORA'
ON DUPLICATE KEY UPDATE updated_at = NOW();

-- Yasmim Alves de Sousa Lopes → Sandra Alves de Sousa Lopes
INSERT INTO student_guardians (tenant_id, student_id, guardian_id, is_financial_responsible, is_pedagogical_responsible, can_access_portal, created_at, updated_at)
SELECT 2, s.id, g.id, 1, 1, 0, NOW(), NOW()
FROM students s
JOIN guardians g ON g.tenant_id = 2 AND g.document = '06206151417'
WHERE s.tenant_id = 2 AND s.name = 'YASMIM ALVES DE SOUSA LOPES'
ON DUPLICATE KEY UPDATE updated_at = NOW();

-- Laura Lavínya Santos de Sá → Maria das Dores Santos da Silva (Avó)
INSERT INTO student_guardians (tenant_id, student_id, guardian_id, is_financial_responsible, is_pedagogical_responsible, can_access_portal, created_at, updated_at)
SELECT 2, s.id, g.id, 1, 1, 0, NOW(), NOW()
FROM students s
JOIN guardians g ON g.tenant_id = 2 AND g.document = '82755833491'
WHERE s.tenant_id = 2 AND s.name = 'LAURA LAVÍNYA SANTOS DE SÁ'
ON DUPLICATE KEY UPDATE updated_at = NOW();

-- ==============================================================================
-- 5. LINK STUDENTS TO COURSES (student_desired_courses pivot)
-- ==============================================================================

INSERT INTO student_desired_courses (tenant_id, student_id, course_id, created_at, updated_at)
SELECT 2, id, 5, NOW(), NOW()
FROM students
WHERE tenant_id = 2 
  AND status = 'inactive'
  AND desired_course_id = 5
ON DUPLICATE KEY UPDATE updated_at = NOW();

-- ==============================================================================
-- 6. VERIFICATION QUERIES
-- ==============================================================================

-- Listar alunos importados
SELECT 
    s.id,
    s.enrollment_number,
    s.name,
    s.email,
    s.phone,
    s.document,
    s.birth_date,
    s.status,
    GROUP_CONCAT(g.name SEPARATOR ', ') as guardians,
    GROUP_CONCAT(c.name SEPARATOR ', ') as courses
FROM students s
LEFT JOIN student_guardians sg ON s.id = sg.student_id AND sg.tenant_id = 2
LEFT JOIN guardians g ON sg.guardian_id = g.id
LEFT JOIN student_desired_courses sdc ON s.id = sdc.student_id
LEFT JOIN courses c ON sdc.course_id = c.id
WHERE s.tenant_id = 2 AND s.status = 'inactive'
GROUP BY s.id, s.enrollment_number, s.name, s.email, s.phone, s.document, s.birth_date, s.status
ORDER BY s.enrollment_number;

SET FOREIGN_KEY_CHECKS = 1;
