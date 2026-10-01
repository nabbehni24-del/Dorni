import { z } from "zod";

export const supportCenterSchema = z.object({
  enabled: z.boolean(),
  escalationMinutes: z.number().int().min(0).max(1440),
  callMinutes: z.number().int().min(0).max(1440),
  hours: z.string().trim().max(200),
  instructions: z.string().trim().max(600),
  phones: z.array(z.object({
    label: z.string().trim().min(1).max(60),
    number: z.string().trim().regex(/^\+?[0-9]{5,15}$/),
  }).strict()).max(8),
}).strict();
export type SupportCenterSettings = z.infer<typeof supportCenterSchema>;
export type ReportSupport = {
  enabled: boolean; canEscalate: boolean; escalationAt: string;
  ticket: null | { id: string; status: string; createdAt: string };
  messages: { id: string; body: string; createdAt: string }[];
  canCall: boolean; callAt: string | null;
  contact: null | Pick<SupportCenterSettings, "phones" | "hours" | "instructions">;
};
