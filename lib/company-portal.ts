export type CompanySection =
  | "overview"
  | "codes"
  | "production"
  | "operations"
  | "structure"
  | "team"
  | "roles"
  | "reports";

export type PartnerBatch = {
  id: string;
  batch_code: string;
  quantity: number;
  generated_count: number;
  generation_status: string;
  distribution_status: string;
  created_at: string;
};

export type PartnerCode = {
  id: string;
  batch_id: string;
  serial_number: string;
  public_token: string;
  ownership_state: string;
  activation_state: string;
};

export type ProductionExport = {
  id: string;
  batch_id: string;
  expires_at: string;
  downloaded_at: string | null;
};

export type PartnerOverview = {
  membership: { role: string; organization_id: string };
  organization: {
    id: string;
    name: string;
    type: string;
    status: string;
    trusted_generation: boolean;
    institutional_enabled: boolean;
    institutional_status?: string;
    generation_limit_per_day: number;
    registration_number: string | null;
  };
  batches: PartnerBatch[];
  requests: { id: string; quantity: number; status: string; created_at: string }[];
  members: { id: string; role: string; status: string; created_at: string }[];
  codes: PartnerCode[];
  exports: ProductionExport[];
};

export const companySectionLabels: Record<CompanySection, string> = {
  overview: "مركز القيادة",
  codes: "سجل الأصول وQR",
  production: "الإمداد والمخزون",
  operations: "مركز العمليات",
  structure: "الهيكل التنظيمي",
  team: "القوى العاملة",
  roles: "الحوكمة والصلاحيات",
  reports: "التحليلات وSLA",
};

export function isCompanySection(value: string | null): value is CompanySection {
  return Boolean(value && value in companySectionLabels);
}

