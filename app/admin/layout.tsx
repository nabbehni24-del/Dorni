import { WorkspaceShell } from "@/components/workspace-shell";
import { requireInternal } from "@/lib/server/access";
import { redirect } from "next/navigation";
import { UnauthorizedError } from "@/lib/server/http";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  try {
    const { supabase } = await requireInternal(["SUPER_ADMIN"]);
    const access = await supabase.rpc("support_staff_admin", {
      p_action: "list",
    });
    if (access.error) throw Error("FORBIDDEN");
  } catch (error) {
    if (error instanceof UnauthorizedError) redirect("/login");
    return (
      <main className="loading-screen" dir="rtl">
        <div>
          <h1>الوصول غير متاح</h1>
          <p>
            هذه المساحة مخصصة للأدمن. تواصل مع مسؤول الحساب للتحقق من صلاحياتك.
          </p>
          <a href="/login">العودة لتسجيل الدخول</a>
        </div>
      </main>
    );
  }
  return <WorkspaceShell>{children}</WorkspaceShell>;
}
