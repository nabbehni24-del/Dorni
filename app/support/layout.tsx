import { WorkspaceShell } from "@/components/workspace-shell";
import { requireInternal } from "@/lib/server/access";
import { UnauthorizedError } from "@/lib/server/http";
import { redirect } from "next/navigation";
export default async function SupportLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  try {
    await requireInternal(["SUPER_ADMIN", "SUPPORT"]);
  } catch (error) {
    if (error instanceof UnauthorizedError) redirect("/login");
    return (
      <main className="loading-screen" dir="rtl">
        <div>
          <h1>الوصول غير متاح</h1>
          <p>اطلب من الأدمن تفعيل وصولك إلى فريق الدعم.</p>
          <a href="/login">تسجيل الدخول</a>
        </div>
      </main>
    );
  }
  return <WorkspaceShell kind="support">{children}</WorkspaceShell>;
}
