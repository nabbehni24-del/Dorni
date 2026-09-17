import { integer, sqliteTable, text, index } from "drizzle-orm/sqlite-core";

export const users = sqliteTable("users", {
  id: text("id").primaryKey(), phone: text("phone").notNull().unique(), createdAt: integer("created_at").notNull(),
});
export const otpChallenges = sqliteTable("otp_challenges", {
  id: text("id").primaryKey(), phone: text("phone").notNull(), codeHash: text("code_hash").notNull(),
  attempts: integer("attempts").notNull().default(0), expiresAt: integer("expires_at").notNull(), consumedAt: integer("consumed_at"), createdAt: integer("created_at").notNull(),
}, (t) => [index("idx_otp_phone_created").on(t.phone, t.createdAt)]);
export const sessions = sqliteTable("sessions", {
  tokenHash: text("token_hash").primaryKey(), userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }), expiresAt: integer("expires_at").notNull(), createdAt: integer("created_at").notNull(),
}, (t) => [index("idx_sessions_user").on(t.userId)]);
export const vehicles = sqliteTable("vehicles", {
  id: text("id").primaryKey(), userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }), manufacturer: text("manufacturer").notNull(), model: text("model").notNull(), color: text("color").notNull(), year: integer("year"), createdAt: integer("created_at").notNull(),
}, (t) => [index("idx_vehicles_user").on(t.userId)]);
export const codes = sqliteTable("codes", {
  id: text("id").primaryKey(), serialNumber: text("serial_number").notNull().unique(), publicToken: text("public_token").notNull().unique(), userId: text("user_id").notNull().references(() => users.id), vehicleId: text("vehicle_id").notNull().references(() => vehicles.id), activationState: text("activation_state").notNull().default("ACTIVE"), createdAt: integer("created_at").notNull(),
}, (t) => [index("idx_codes_user").on(t.userId), index("idx_codes_vehicle_state").on(t.vehicleId, t.activationState)]);
export const reports = sqliteTable("reports", {
  id: text("id").primaryKey(), codeId: text("code_id").notNull().references(() => codes.id), vehicleId: text("vehicle_id").notNull().references(() => vehicles.id), reportType: text("report_type").notNull(), status: text("status").notNull().default("ACTIVE"), ownerResponse: text("owner_response"), statusTokenHash: text("status_token_hash").notNull().unique(), expiresAt: integer("expires_at").notNull(), createdAt: integer("created_at").notNull(), updatedAt: integer("updated_at").notNull(),
}, (t) => [index("idx_reports_vehicle_status").on(t.vehicleId, t.status, t.createdAt)]);
export const reportEvents = sqliteTable("report_events", {
  id: text("id").primaryKey(), reportId: text("report_id").notNull().references(() => reports.id, { onDelete: "cascade" }), eventType: text("event_type").notNull(), createdAt: integer("created_at").notNull(),
}, (t) => [index("idx_report_events_report_time").on(t.reportId, t.createdAt)]);
export const auditLogs = sqliteTable("audit_logs", {
  id: text("id").primaryKey(), actorId: text("actor_id"), action: text("action").notNull(), entityType: text("entity_type").notNull(), entityId: text("entity_id"), createdAt: integer("created_at").notNull(),
}, (t) => [index("idx_audit_entity_time").on(t.entityType, t.entityId, t.createdAt)]);
