import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/", name: "دورني | Dorni", short_name: "دورني",
    description: "تواصل آمن مع صاحب السيارة وإدارة بطاقاتك وتنبيهاتك.",
    lang: "ar", dir: "rtl", start_url: "/app", scope: "/",
    display: "standalone", background_color: "#071421", theme_color: "#071421",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
