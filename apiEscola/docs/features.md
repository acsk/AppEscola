# AppEscola — Features & Roadmap

## MVP - Primeira versão

Features incluídas no MVP:

1. **Autenticação com Laravel Sanctum** — login, logout, /me
2. **Gestão de tenants/escolas** — CRUD completo (super_admin)
3. **Gestão de usuários e papéis** — roles: super_admin, admin, secretaria, professor, aluno, responsavel
4. **Cadastro de alunos** — com campos de contato, documento, data de nascimento e flag is_minor
5. **Cadastro de responsáveis** — com tipo de relacionamento e vínculo com usuário opcional
6. **Vínculo aluno x responsável** — pivot com flags: financeiro, pedagógico, acesso ao portal
7. **Regra de responsável financeiro obrigatório para aluno menor** — validação ao desvincular
8. **Cadastro de cursos** — por tenant
9. **Cadastro de disciplinas** — por tenant
10. **Cadastro de turmas** — associadas a curso, com período, capacidade e ano
11. **Cadastro de horários da turma** — dia da semana, início, fim, sala, professor e disciplina
12. **Matrícula de aluno em turma** — com número, datas, valores e dia de vencimento
13. **Controle financeiro básico** — cobranças com valor, vencimento, status
14. **Geração manual de cobranças** — POST /api/invoices
15. **Marcar cobrança como paga** — POST /api/invoices/{id}/mark-as-paid
16. **Cancelar cobrança** — POST /api/invoices/{id}/cancel
17. **API token por tenant** — geração, listagem e revogação com armazenamento seguro (hash)
18. **Isolamento de dados por tenant** — middleware + trait ScopedByTenant em todos os controllers
19. **Resources JSON padronizados** — todos os endpoints retornam API Resources
20. **Form Requests para validação** — todas as entradas validadas com FormRequest

---

## Features futuras

1. Simulados online
2. Provas online
3. Banco de questões
4. Correção automática de provas
5. Lançamento de notas
6. Boletim do aluno
7. Ranking de desempenho
8. Frequência / controle de presença
9. Comunicados para pais e alunos
10. Portal do responsável
11. Portal do aluno
12. Portal do professor
13. Relatórios pedagógicos
14. Relatórios financeiros
15. Integração com PIX
16. Integração com boleto bancário
17. Notificações por WhatsApp
18. Notificações por e-mail
19. App mobile exclusivo por escola (consumindo TenantApiToken)
20. Dashboard administrativo
21. Importação de alunos por planilha (CSV/Excel)
22. Exportação de relatórios PDF/Excel
23. Permissões avançadas por perfil (ex: policy por role)
24. Plano de assinatura por tenant
25. Controle de inadimplência automático
26. Contratos digitais
27. Assinatura eletrônica
28. Módulo de redação com correção por critérios
29. Módulo de aulas gravadas (upload/streaming)
30. Gamificação (pontos, conquistas, ranking)

---

## Módulos planejados

| Módulo              | Descrição                                              | Status      |
|---------------------|--------------------------------------------------------|-------------|
| Auth                | Login/logout com Sanctum                               | ✅ MVP       |
| Tenants             | Gestão de escolas/cursinhos                            | ✅ MVP       |
| Usuários            | Usuários com roles e vínculo ao tenant                 | ✅ MVP       |
| Alunos              | Cadastro completo de alunos                            | ✅ MVP       |
| Responsáveis        | Cadastro e vínculo com alunos                          | ✅ MVP       |
| Cursos              | Organização pedagógica de cursos                       | ✅ MVP       |
| Disciplinas         | Matérias/disciplinas por tenant                        | ✅ MVP       |
| Turmas              | Turmas vinculadas a cursos                             | ✅ MVP       |
| Horários            | Grade horária das turmas                               | ✅ MVP       |
| Matrículas          | Vínculo aluno-turma com dados financeiros              | ✅ MVP       |
| Financeiro          | Cobranças, pagamentos e cancelamentos                  | ✅ MVP       |
| API Tokens          | Tokens por tenant para apps externos                   | ✅ MVP       |
| Notas & Avaliações  | Lançamento de notas por disciplina                     | 🔜 Futuro   |
| Frequência          | Registro de presença por aula                          | 🔜 Futuro   |
| Simulados           | Banco de questões e aplicação online                   | 🔜 Futuro   |
| Comunicados         | Envio para responsáveis/alunos/professores             | 🔜 Futuro   |
| Portais             | Áreas exclusivas por perfil                            | 🔜 Futuro   |
| Relatórios          | Pedagógicos e financeiros com exportação               | 🔜 Futuro   |
| Pagamentos          | Integração PIX/boleto/cartão                           | 🔜 Futuro   |
| Notificações        | WhatsApp/e-mail automáticos                            | 🔜 Futuro   |
| App Mobile          | App por escola via API Token                           | 🔜 Futuro   |
| Contratos           | Contratos digitais com assinatura eletrônica           | 🔜 Futuro   |
| Gamificação         | Pontos, conquistas e ranking entre alunos              | 🔜 Futuro   |

---

## Ordem de desenvolvimento

### Fase 1 — Base (concluída no MVP)
1. Configuração inicial do Laravel
2. Docker (PHP 8.3-FPM + Nginx + MySQL 8)
3. Autenticação com Sanctum
4. Tabela e modelo de Tenants
5. Middleware de identificação de tenant (`IdentifyTenant`)
6. Trait `ScopedByTenant` para isolamento nos controllers
7. Users com roles (super_admin, admin, secretaria, professor, aluno, responsavel)
8. Students (alunos)
9. Guardians (responsáveis)
10. StudentGuardians (pivot aluno-responsável com validação de responsável financeiro)
11. Courses (cursos)
12. Subjects (disciplinas)
13. SchoolClasses (turmas)
14. ClassSchedules (horários)
15. Enrollments (matrículas)
16. Invoices (cobranças)
17. TenantApiTokens (tokens de API por tenant)

### Fase 2 — Acadêmico
18. Frequência/presença
19. Lançamento de notas
20. Boletim do aluno
21. Relatórios pedagógicos

### Fase 3 — Financeiro avançado
22. Geração automática de cobranças por matrícula
23. Integração com gateway PIX
24. Integração com boleto bancário
25. Controle de inadimplência
26. Relatórios financeiros

### Fase 4 — Comunicação
27. Comunicados internos
28. Notificações por e-mail
29. Notificações por WhatsApp (ex: Z-API)

### Fase 5 — Portais e mobile
30. Portal do responsável (web)
31. Portal do aluno (web)
32. Portal do professor (web)
33. API pública para app mobile (usando TenantApiToken)

### Fase 6 — Avaliações
34. Banco de questões
35. Simulados online
36. Correção automática (objetivas)
37. Correção manual (discursivas e redação)
38. Ranking de desempenho

### Fase 7 — Extras
39. Importação de alunos por planilha
40. Contratos digitais com assinatura eletrônica
41. Gamificação
42. Dashboard administrativo avançado
43. Módulo de aulas gravadas
