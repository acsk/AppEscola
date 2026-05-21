export type GuardianListItem = {
  id: number;
  name: string;
  document: string | null;
  email: string | null;
  phone: string | null;
  relationship: string | null;
  students_count: number;
};

export type GuardianStudentLink = {
  id: number;
  name: string;
  enrollment_number: string | null;
  status: string | null;
  pivot?: {
    is_financial_responsible: boolean;
    is_pedagogical_responsible: boolean;
    can_access_portal: boolean;
  };
};

export type GuardianDetail = GuardianListItem & {
  tenant_id?: number;
  user_id?: number | null;
  students: GuardianStudentLink[];
  created_at?: string;
  updated_at?: string;
};
