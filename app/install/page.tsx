import { DorniBrand } from "@/components/dorni-brand";
import { InstallPanel } from "@/components/pwa-provider";

export default function InstallPage() {
  return <main className="install-page" dir="rtl"><header><DorniBrand /></header><section className="install-card"><InstallPanel /></section></main>;
}
