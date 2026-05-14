import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AxiosError } from 'axios';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { colors } from '../../../theme';
import {
  extractPublicValidationErrors,
  getPublicTenantSlug,
  listPublicCourses,
  PublicCourse,
  PublicGuardianRelationship,
  registerPublicStudent,
} from '../../../services/public-registration.service';
import { AuthStackParamList } from '../../../navigation/AuthNavigator';

type Props = NativeStackScreenProps<AuthStackParamList, 'PublicRegister'>;

type FormState = {
  studentName: string;
  studentEmail: string;
  studentBirthDate: string;
  studentDocument: string;
  studentPhone: string;
  courseIds: number[];
  guardianName: string;
  guardianDocument: string;
  guardianEmail: string;
  guardianPhone: string;
  guardianRelationship: PublicGuardianRelationship | '';
};

const INITIAL_FORM: FormState = {
  studentName: '',
  studentEmail: '',
  studentBirthDate: '',
  studentDocument: '',
  studentPhone: '',
  courseIds: [],
  guardianName: '',
  guardianDocument: '',
  guardianEmail: '',
  guardianPhone: '',
  guardianRelationship: '',
};

const RELATIONSHIP_OPTIONS: { value: PublicGuardianRelationship; label: string }[] = [
  { value: 'pai', label: 'Pai' },
  { value: 'mae', label: 'Mãe' },
  { value: 'avo_paterno', label: 'Avô paterno' },
  { value: 'avo_materno', label: 'Avó materna' },
  { value: 'tio', label: 'Tio/Tia' },
  { value: 'responsavel_legal', label: 'Responsável legal' },
  { value: 'outro', label: 'Outro' },
];

function sanitizeOptional(value: string): string | undefined {
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

function onlyDigits(value: string): string {
  return value.replace(/\D/g, '');
}

function maskCpf(value: string): string {
  const digits = onlyDigits(value).slice(0, 11);
  if (digits.length <= 3) return digits;
  if (digits.length <= 6) return `${digits.slice(0, 3)}.${digits.slice(3)}`;
  if (digits.length <= 9) return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6)}`;
  return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`;
}

function maskPhone(value: string): string {
  const digits = onlyDigits(value).slice(0, 11);
  if (digits.length <= 2) return digits ? `(${digits}` : '';
  if (digits.length <= 6) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  if (digits.length <= 10) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  }
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
}

function normalizeCpfDocument(value: string): string | undefined {
  const digits = onlyDigits(value);
  return digits ? digits : undefined;
}

function maskDateBr(value: string): string {
  const digits = onlyDigits(value).slice(0, 8);
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
}

function isValidDateBr(value: string): boolean {
  if (!value) return true;
  if (!/^\d{2}\/\d{2}\/\d{4}$/.test(value)) return false;

  const [dd, mm, yyyy] = value.split('/').map((item) => Number(item));
  const date = new Date(yyyy, mm - 1, dd);

  return (
    date.getFullYear() === yyyy &&
    date.getMonth() === mm - 1 &&
    date.getDate() === dd
  );
}

function dateBrToIso(value: string): string | undefined {
  if (!value || !isValidDateBr(value)) return undefined;
  const [dd, mm, yyyy] = value.split('/');
  return `${yyyy}-${mm}-${dd}`;
}

function calculateIsMinor(value: string): boolean | null {
  if (!isValidDateBr(value)) return null;
  const [dd, mm, yyyy] = value.split('/').map((item) => Number(item));
  const birthDate = new Date(yyyy, mm - 1, dd);
  const today = new Date();

  let age = today.getFullYear() - birthDate.getFullYear();
  const hasBirthdayPassedThisYear =
    today.getMonth() > birthDate.getMonth() ||
    (today.getMonth() === birthDate.getMonth() && today.getDate() >= birthDate.getDate());

  if (!hasBirthdayPassedThisYear) {
    age -= 1;
  }

  return age < 18;
}

export function PublicRegisterScreen({ navigation, route }: Props) {
  const routeTenantSlug = route.params?.tenantSlug?.trim() || '';
  const [form, setForm] = useState<FormState>(INITIAL_FORM);
  const [courses, setCourses] = useState<PublicCourse[]>([]);
  const [loadingCourses, setLoadingCourses] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [globalError, setGlobalError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [relationshipPickerVisible, setRelationshipPickerVisible] = useState(false);

  const selectedRelationshipName = useMemo(() => {
    if (!form.guardianRelationship) return 'Selecione o parentesco';
    const found = RELATIONSHIP_OPTIONS.find((option) => option.value === form.guardianRelationship);
    return found ? found.label : 'Selecione o parentesco';
  }, [form.guardianRelationship]);

  const isMinorCalculated = useMemo(
    () => calculateIsMinor(form.studentBirthDate.trim()),
    [form.studentBirthDate],
  );

  useEffect(() => {
    let active = true;

    async function loadCourses() {
      setLoadingCourses(true);
      setGlobalError(null);
      try {
        const tenantSlug = routeTenantSlug || getPublicTenantSlug();
        const list = await listPublicCourses(tenantSlug);
        if (active) setCourses(list);
      } catch (error: unknown) {
        if (!active) return;

        const axiosError = error as AxiosError<{ message?: string }>;
        const status = axiosError.response?.status;
        if (status === 404) {
          setGlobalError('Escola não encontrada. Verifique o tenant configurado no app.');
        } else {
          setGlobalError((error as Error).message || 'Não foi possível carregar os cursos.');
        }
      } finally {
        if (active) setLoadingCourses(false);
      }
    }

    loadCourses();

    return () => {
      active = false;
    };
  }, [routeTenantSlug]);

  const setField = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setFieldErrors((prev) => {
      if (!prev[key]) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
    setGlobalError(null);
  };

  const getFieldError = (...keys: string[]) => {
    for (const key of keys) {
      if (fieldErrors[key]) return fieldErrors[key];
    }
    return null;
  };

  const validateForm = (): boolean => {
    const errors: Record<string, string> = {};

    if (!form.studentName.trim()) {
      errors.studentName = 'Nome do aluno é obrigatório.';
    }

    if (!form.studentEmail.trim()) {
      errors.studentEmail = 'E-mail do aluno é obrigatório.';
    }

    if (!form.studentBirthDate.trim()) {
      errors.studentBirthDate = 'Data de nascimento do aluno é obrigatória.';
    }

    if (!form.guardianName.trim()) {
      errors.guardianName = 'Nome do responsável é obrigatório.';
    }

    if (!form.guardianDocument.trim()) {
      errors.guardianDocument = 'CPF do responsável é obrigatório.';
    }

    if (!form.guardianPhone.trim()) {
      errors.guardianPhone = 'Telefone do responsável é obrigatório.';
    }

    if (!form.guardianEmail.trim()) {
      errors.guardianEmail = 'E-mail do responsável é obrigatório.';
    }

    if (!form.guardianRelationship) {
      errors.guardianRelationship = 'Parentesco do responsável é obrigatório.';
    }

    if (!isValidDateBr(form.studentBirthDate.trim())) {
      errors.studentBirthDate = 'Data de nascimento deve estar no formato DD/MM/AAAA.';
    }

    if (form.guardianEmail.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.guardianEmail.trim())) {
      errors.guardianEmail = 'Informe um e-mail válido.';
    }

    if (form.studentEmail.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.studentEmail.trim())) {
      errors.studentEmail = 'Informe um e-mail válido.';
    }

    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async () => {
    setGlobalError(null);

    if (!validateForm()) return;

    setSubmitting(true);
    try {
      const tenantSlug = routeTenantSlug || getPublicTenantSlug();
      const selectedIds = form.courseIds;

      const response = await registerPublicStudent({
        student: {
          name: form.studentName.trim(),
          email: form.studentEmail.trim(),
          birth_date: dateBrToIso(form.studentBirthDate.trim()),
          document: normalizeCpfDocument(form.studentDocument),
          phone: sanitizeOptional(form.studentPhone),
          is_minor: isMinorCalculated ?? false,
        },
        course_ids: selectedIds.length ? selectedIds : undefined,
        course_id: selectedIds.length ? selectedIds[0] : undefined,
        guardian: {
          name: form.guardianName.trim(),
          document: normalizeCpfDocument(form.guardianDocument),
          email: sanitizeOptional(form.guardianEmail),
          phone: sanitizeOptional(form.guardianPhone),
          relationship: form.guardianRelationship || undefined,
        },
      }, tenantSlug);

      setSuccessMessage(response.message);
      setFieldErrors({});
    } catch (error: unknown) {
      const axiosError = error as AxiosError<{ message?: string; errors?: Record<string, string[]> }>;
      const status = axiosError.response?.status;

      if (status === 422) {
        const apiErrors = extractPublicValidationErrors(error);

        const mapped: Record<string, string> = {
          studentName: apiErrors['student.name'] || '',
          studentEmail: apiErrors['student.email'] || '',
          studentBirthDate: apiErrors['student.birth_date'] || '',
          studentDocument: apiErrors['student.document'] || '',
          studentPhone: apiErrors['student.phone'] || '',
          courseIds: apiErrors.course_ids || apiErrors['course_ids.0'] || apiErrors.course_id || '',
          guardianName: apiErrors['guardian.name'] || '',
          guardianDocument: apiErrors['guardian.document'] || '',
          guardianEmail: apiErrors['guardian.email'] || '',
          guardianPhone: apiErrors['guardian.phone'] || '',
          guardianRelationship: apiErrors['guardian.relationship'] || '',
        };

        const filtered = Object.fromEntries(Object.entries(mapped).filter(([, value]) => value));
        setFieldErrors(filtered);
        setGlobalError(axiosError.response?.data?.message || 'Corrija os campos destacados.');
      } else if (status === 404) {
        setGlobalError('Escola não encontrada. Verifique o tenant configurado no app.');
      } else if (status === 429) {
        setGlobalError('Muitas tentativas. Aguarde um minuto e tente novamente.');
      } else {
        setGlobalError((error as Error).message || 'Não foi possível concluir a matrícula.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  const toggleCourse = (courseId: number) => {
    setField('courseIds',
      form.courseIds.includes(courseId)
        ? form.courseIds.filter((id) => id !== courseId)
        : [...form.courseIds, courseId],
    );
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation.goBack()}
          activeOpacity={0.8}
        >
          <Ionicons name="arrow-back" size={18} color={colors.primary} />
          <Text style={styles.backButtonText}>Voltar para login</Text>
        </TouchableOpacity>

        <View style={styles.headerCard}>
          <Text style={styles.headerTitle}>Matrícula</Text>
          <Text style={styles.headerSubtitle}>
            Preencha os dados do aluno e responsável para iniciar a matrícula.
          </Text>
        </View>

        {globalError ? (
          <View style={styles.errorBanner}>
            <Ionicons name="alert-circle-outline" size={16} color="#991B1B" />
            <Text style={styles.errorBannerText}>{globalError}</Text>
          </View>
        ) : null}

        <View style={styles.formCard}>
          <Text style={styles.sectionTitle}>Dados do aluno</Text>

          <Text style={styles.label}>Nome do aluno *</Text>
          <TextInput
            style={[styles.input, getFieldError('studentName', 'student.name') && styles.inputError]}
            placeholder="Nome completo"
            value={form.studentName}
            onChangeText={(value) => setField('studentName', value)}
          />
          {getFieldError('studentName', 'student.name') ? (
            <Text style={styles.fieldError}>{getFieldError('studentName', 'student.name')}</Text>
          ) : null}

          <View style={styles.fieldRow}>
            <View style={styles.fieldCol}>
              <Text style={styles.label}>Data de nascimento</Text>
              <TextInput
                style={[styles.input, getFieldError('studentBirthDate', 'student.birth_date') && styles.inputError]}
                placeholder="DD/MM/AAAA"
                value={form.studentBirthDate}
                onChangeText={(value) => setField('studentBirthDate', maskDateBr(value))}
                autoCapitalize="none"
                keyboardType="number-pad"
              />
              {getFieldError('studentBirthDate', 'student.birth_date') ? (
                <Text style={styles.fieldError}>{getFieldError('studentBirthDate', 'student.birth_date')}</Text>
              ) : null}
            </View>

            <View style={styles.fieldCol}>
              <Text style={styles.label}>CPF do aluno</Text>
              <TextInput
                style={[styles.input, getFieldError('studentDocument', 'student.document') && styles.inputError]}
                placeholder="000.000.000-00"
                value={form.studentDocument}
                onChangeText={(value) => setField('studentDocument', maskCpf(value))}
                keyboardType="number-pad"
              />
              {getFieldError('studentDocument', 'student.document') ? (
                <Text style={styles.fieldError}>{getFieldError('studentDocument', 'student.document')}</Text>
              ) : null}
            </View>
          </View>

          <View style={styles.fieldRow}>
            <View style={styles.fieldCol}>
              <Text style={styles.label}>E-mail do aluno *</Text>
              <TextInput
                style={[styles.input, getFieldError('studentEmail', 'student.email') && styles.inputError]}
                placeholder="email@exemplo.com"
                value={form.studentEmail}
                onChangeText={(value) => setField('studentEmail', value)}
                autoCapitalize="none"
                keyboardType="email-address"
              />
              {getFieldError('studentEmail', 'student.email') ? (
                <Text style={styles.fieldError}>{getFieldError('studentEmail', 'student.email')}</Text>
              ) : null}
            </View>

            <View style={styles.fieldCol}>
              <Text style={styles.label}>Telefone do aluno</Text>
              <TextInput
                style={[styles.input, getFieldError('studentPhone', 'student.phone') && styles.inputError]}
                placeholder="(11) 99999-0001"
                value={form.studentPhone}
                onChangeText={(value) => setField('studentPhone', maskPhone(value))}
                keyboardType="phone-pad"
              />
              {getFieldError('studentPhone', 'student.phone') ? (
                <Text style={styles.fieldError}>{getFieldError('studentPhone', 'student.phone')}</Text>
              ) : null}
            </View>
          </View>

          <View style={styles.autoFlagBox}>
            <Ionicons
              name={isMinorCalculated ? 'shield-checkmark' : 'person-outline'}
              size={16}
              color={colors.primary}
            />
            <Text style={styles.autoFlagText}>
              Menor de idade: {isMinorCalculated === null ? 'preencha a data' : isMinorCalculated ? 'Sim' : 'Não'}
            </Text>
          </View>

          <Text style={styles.label}>Selecione os cursos matriculados</Text>
          <View style={[styles.multiSelectWrap, getFieldError('courseIds', 'course_ids', 'course_ids.0', 'course_id') && styles.inputError]}>
            {loadingCourses ? (
              <View style={styles.multiSelectLoading}>
                <ActivityIndicator size="small" color={colors.primary} />
                <Text style={styles.multiSelectLoadingText}>Carregando cursos...</Text>
              </View>
            ) : courses.length ? (
              <View style={styles.multiSelectGrid}>
                {courses.map((course) => {
                  const selected = form.courseIds.includes(course.id);
                  return (
                    <TouchableOpacity
                      key={course.id}
                      style={[styles.courseChip, selected && styles.courseChipSelected]}
                      onPress={() => toggleCourse(course.id)}
                      activeOpacity={0.85}
                    >
                      <Ionicons
                        name={selected ? 'checkbox' : 'square-outline'}
                        size={14}
                        color={selected ? colors.surface : colors.primary}
                      />
                      <Text style={[styles.courseChipText, selected && styles.courseChipTextSelected]}>
                        {course.name}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            ) : (
              <Text style={styles.multiSelectEmptyText}>Nenhum curso disponível.</Text>
            )}
          </View>
          {getFieldError('courseIds', 'course_ids', 'course_ids.0', 'course_id') ? (
            <Text style={styles.fieldError}>{getFieldError('courseIds', 'course_ids', 'course_ids.0', 'course_id')}</Text>
          ) : null}

          <Text style={styles.sectionTitle}>Dados do responsável</Text>

          <Text style={styles.label}>Nome do responsável *</Text>
          <TextInput
            style={[styles.input, getFieldError('guardianName', 'guardian.name') && styles.inputError]}
            placeholder="Nome completo"
            value={form.guardianName}
            onChangeText={(value) => setField('guardianName', value)}
          />
          {getFieldError('guardianName', 'guardian.name') ? (
            <Text style={styles.fieldError}>{getFieldError('guardianName', 'guardian.name')}</Text>
          ) : null}

          <View style={styles.fieldRow}>
            <View style={styles.fieldCol}>
              <Text style={styles.label}>CPF do responsável *</Text>
              <TextInput
                style={[styles.input, getFieldError('guardianDocument', 'guardian.document') && styles.inputError]}
                placeholder="000.000.000-00"
                value={form.guardianDocument}
                onChangeText={(value) => setField('guardianDocument', maskCpf(value))}
                keyboardType="number-pad"
              />
              {getFieldError('guardianDocument', 'guardian.document') ? (
                <Text style={styles.fieldError}>{getFieldError('guardianDocument', 'guardian.document')}</Text>
              ) : null}
            </View>

            <View style={styles.fieldCol}>
              <Text style={styles.label}>Telefone do responsável *</Text>
              <TextInput
                style={[styles.input, getFieldError('guardianPhone', 'guardian.phone') && styles.inputError]}
                placeholder="(11) 99999-0002"
                value={form.guardianPhone}
                onChangeText={(value) => setField('guardianPhone', maskPhone(value))}
                keyboardType="phone-pad"
              />
              {getFieldError('guardianPhone', 'guardian.phone') ? (
                <Text style={styles.fieldError}>{getFieldError('guardianPhone', 'guardian.phone')}</Text>
              ) : null}
            </View>
          </View>

          <View style={styles.fieldRow}>
            <View style={styles.fieldCol}>
              <Text style={styles.label}>E-mail do responsável *</Text>
              <TextInput
                style={[styles.input, getFieldError('guardianEmail', 'guardian.email') && styles.inputError]}
                placeholder="email@exemplo.com"
                value={form.guardianEmail}
                onChangeText={(value) => setField('guardianEmail', value)}
                autoCapitalize="none"
                keyboardType="email-address"
              />
              {getFieldError('guardianEmail', 'guardian.email') ? (
                <Text style={styles.fieldError}>{getFieldError('guardianEmail', 'guardian.email')}</Text>
              ) : null}
            </View>

            <View style={styles.fieldCol}>
              <Text style={styles.label}>Parentesco *</Text>
              <TouchableOpacity
                style={[styles.selector, getFieldError('guardianRelationship', 'guardian.relationship') && styles.inputError]}
                onPress={() => setRelationshipPickerVisible(true)}
              >
                <Text style={styles.selectorText}>{selectedRelationshipName}</Text>
                <Ionicons name="chevron-down" size={18} color={colors.muted} />
              </TouchableOpacity>
              {getFieldError('guardianRelationship', 'guardian.relationship') ? (
                <Text style={styles.fieldError}>{getFieldError('guardianRelationship', 'guardian.relationship')}</Text>
              ) : null}
            </View>
          </View>

          <TouchableOpacity
            style={[styles.submitButton, submitting && styles.submitButtonDisabled]}
            onPress={handleSubmit}
            disabled={submitting}
            activeOpacity={0.85}
          >
            {submitting ? (
              <ActivityIndicator color={colors.surface} />
            ) : (
              <>
                <Ionicons name="send-outline" size={18} color={colors.surface} />
                <Text style={styles.submitButtonText}>Enviar matrícula</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      </ScrollView>

      <Modal
        visible={relationshipPickerVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setRelationshipPickerVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Selecionar parentesco</Text>
            <ScrollView style={styles.modalList}>
              <TouchableOpacity
                style={styles.modalItem}
                onPress={() => {
                  setField('guardianRelationship', '');
                  setRelationshipPickerVisible(false);
                }}
              >
                <Text style={styles.modalItemText}>Nenhum</Text>
              </TouchableOpacity>
              {RELATIONSHIP_OPTIONS.map((option) => (
                <TouchableOpacity
                  key={option.value}
                  style={styles.modalItem}
                  onPress={() => {
                    setField('guardianRelationship', option.value);
                    setRelationshipPickerVisible(false);
                  }}
                >
                  <Text style={styles.modalItemText}>{option.label}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
            <TouchableOpacity
              style={styles.modalCloseButton}
              onPress={() => setRelationshipPickerVisible(false)}
            >
              <Text style={styles.modalCloseButtonText}>Fechar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal
        visible={Boolean(successMessage)}
        transparent
        animationType="fade"
        onRequestClose={() => setSuccessMessage(null)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.successHeader}>
              <Ionicons name="checkmark-circle" size={24} color={colors.credit} />
              <Text style={styles.modalTitle}>Matrícula enviada</Text>
            </View>
            <Text style={styles.successText}>{successMessage}</Text>
            <TouchableOpacity
              style={styles.successButton}
              onPress={() => {
                setSuccessMessage(null);
                navigation.navigate('Login');
              }}
            >
              <Text style={styles.successButtonText}>Voltar para login</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    padding: 16,
    paddingBottom: 36,
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 12,
  },
  backButtonText: {
    color: colors.primary,
    fontSize: 14,
    fontWeight: '700',
  },
  headerCard: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E7EAF6',
    backgroundColor: colors.surface,
    padding: 16,
    marginBottom: 12,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: '900',
    color: colors.ink,
    marginBottom: 6,
  },
  headerSubtitle: {
    fontSize: 14,
    color: colors.muted,
    lineHeight: 20,
  },
  formCard: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E7EAF6',
    backgroundColor: colors.surface,
    padding: 16,
  },
  sectionTitle: {
    marginTop: 8,
    marginBottom: 12,
    fontSize: 17,
    fontWeight: '800',
    color: colors.ink,
  },
  label: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 8,
  },
  fieldRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 6,
  },
  fieldCol: {
    flex: 1,
    marginBottom: 4,
  },
  input: {
    minHeight: 48,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#DDE3F5',
    paddingHorizontal: 12,
    fontSize: 14,
    color: colors.ink,
    backgroundColor: '#FFFFFF',
    marginBottom: 10,
  },
  selector: {
    minHeight: 48,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#DDE3F5',
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFFFFF',
    marginBottom: 10,
  },
  selectorText: {
    flex: 1,
    fontSize: 14,
    color: colors.ink,
    paddingRight: 8,
  },
  inputError: {
    borderColor: '#DC2626',
  },
  fieldError: {
    marginTop: 4,
    marginBottom: 12,
    color: '#B91C1C',
    fontSize: 12,
    fontWeight: '600',
  },
  autoFlagBox: {
    marginTop: 0,
    marginBottom: 0,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E7EAF6',
    paddingHorizontal: 12,
    paddingVertical: 10,
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#F8FAFF',
  },
  autoFlagText: {
    fontSize: 14,
    color: colors.text,
    fontWeight: '700',
  },
  multiSelectWrap: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#DDE3F5',
    backgroundColor: '#FFFFFF',
    padding: 10,
    marginBottom: 10,
  },
  multiSelectLoading: {
    minHeight: 42,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  multiSelectLoadingText: {
    fontSize: 13,
    color: colors.muted,
    fontWeight: '600',
  },
  multiSelectGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  courseChip: {
    minHeight: 30,
    paddingHorizontal: 8,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: '#C7D2FE',
    backgroundColor: '#EEF2FF',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  courseChipSelected: {
    borderColor: colors.primary,
    backgroundColor: colors.primary,
  },
  courseChipText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.primary,
  },
  courseChipTextSelected: {
    color: colors.surface,
  },
  multiSelectEmptyText: {
    fontSize: 13,
    color: colors.muted,
    fontWeight: '600',
  },
  submitButton: {
    marginTop: 16,
    borderRadius: 12,
    minHeight: 50,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  submitButtonDisabled: {
    opacity: 0.7,
  },
  submitButtonText: {
    color: colors.surface,
    fontSize: 15,
    fontWeight: '800',
  },
  errorBanner: {
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#FECACA',
    backgroundColor: '#FEF2F2',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  errorBannerText: {
    flex: 1,
    color: '#991B1B',
    fontSize: 13,
    fontWeight: '600',
    lineHeight: 18,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.45)',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  modalCard: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E7EAF6',
    maxHeight: '75%',
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: colors.ink,
    marginBottom: 10,
  },
  modalList: {
    maxHeight: 260,
  },
  modalItem: {
    minHeight: 44,
    borderRadius: 10,
    justifyContent: 'center',
    paddingHorizontal: 10,
    marginBottom: 6,
    backgroundColor: '#F8FAFF',
    borderWidth: 1,
    borderColor: '#E7EAF6',
  },
  modalItemText: {
    fontSize: 14,
    color: colors.ink,
    fontWeight: '600',
  },
  modalCloseButton: {
    marginTop: 10,
    borderRadius: 10,
    minHeight: 42,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#DDE3F5',
  },
  modalCloseButtonText: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.text,
  },
  successHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  successText: {
    fontSize: 14,
    color: colors.text,
    lineHeight: 20,
    marginBottom: 14,
  },
  successButton: {
    borderRadius: 10,
    minHeight: 44,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.primary,
  },
  successButtonText: {
    fontSize: 14,
    fontWeight: '800',
    color: colors.surface,
  },
});
