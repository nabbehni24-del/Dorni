import { z } from "zod";

export const supportPermissions = ["view", "view_all", "reply", "notes", "status", "assign"] as const;
export type SupportPermission = typeof supportPermissions[number];
export const permissionLabels: Record<SupportPermission, string> = {
  view: "مشاهدة التذاكر المسندة له",
  view_all: "مشاهدة كل التذاكر، بما فيها غير المسندة",
  reply: "إرسال ردود للمستخدمين",
  notes: "قراءة وكتابة ملاحظات داخلية",
  status: "تغيير الحالة وإغلاق وإعادة فتح التذاكر",
  assign: "إسناد التذاكر لموظفي الدعم",
};
export const ticketStatuses = ["OPEN", "IN_PROGRESS", "WAITING_FOR_USER", "RESOLVED", "CLOSED"] as const;
export const statusLabels: Record<string, string> = { OPEN: "جديدة", IN_PROGRESS: "قيد المعالجة", WAITING_FOR_USER: "بانتظار المستخدم", RESOLVED: "تم الحل", CLOSED: "مغلقة" };
const id = z.string().uuid();
export const supportMutation = z.discriminatedUnion("action", [
  z.object({ action: z.literal("reply"), data: z.object({ id, body: z.string().trim().min(1).max(4000), internal: z.boolean(), requestId: id }).strict() }),
  z.object({ action: z.literal("status"), data: z.object({ id, status: z.enum(ticketStatuses), updatedAt: z.string().datetime({ offset: true }) }).strict() }),
  z.object({ action: z.literal("assign"), data: z.object({ id, assignee: id.nullable(), updatedAt: z.string().datetime({ offset: true }) }).strict() }),
]);
export const staffMutation = z.object({ id: id.optional(), email: z.string().trim().email().max(254).optional(), active: z.boolean(), permissions: z.array(z.enum(supportPermissions)).max(6).refine(p => p.includes("view")) }).strict().refine(p => Boolean(p.id || p.email));
export type SupportTicket = { id: string; subject: string; category: string; status: string; assigned_to: string | null; created_at: string; updated_at: string; requester_name: string; assignee_name?: string; description?: string };
export type SupportMessage = { id: string; body: string; internal: boolean; created_at: string; mine: boolean; author_kind: string; author_name: string };
export type SupportOverview = { userId: string; permissions: SupportPermission[]; admin: boolean; metrics: Record<string, number>; total: number; tickets: SupportTicket[]; agents: { id: string; name: string }[] };
export type SupportThread = { ticket: SupportTicket; messages: SupportMessage[] };
export type SupportStaff = { id: string; name: string; email: string; active: boolean; permissions: SupportPermission[] };
