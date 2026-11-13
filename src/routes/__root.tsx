import { createRootRoute, HeadContent, Outlet, Scripts } from "@tanstack/react-router";
import { AuthProvider } from "@/lib/auth/provider";
import { PreviewHostBridge } from "@/components/preview-host-bridge";
import appCss from "../styles.css?url";

const APP_NAME = "توكتوك دار السلام";

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1, viewport-fit=cover" },
      { title: APP_NAME },
      { name: "theme-color", content: "#14181e" },
      {
        name: "description",
        content: "مسار من قدام مدرسة المعمارية في دار السلام لحد محطة أبو طالب: أبو طالب، الجمهورية، الجمعية، الأكحل، السنترال، مجمع المدارس، مخيمر، أبو أشرف، كشري أبو حنفي، عبد الهادي، التوحيد والنور، الملف، صالح عابدين، المشير، مزرعة البط، فرج يوسف، فايدة كامل، الحرية، السد العالي، حسنين دسوقي، ثم سور المترو على شمالك لحد مترو دار السلام، والكوبري، ويمين على محطة أبو طالب.",
      },
    ],
    links: [
      { rel: "icon", type: "image/svg+xml", href: "/favicon.svg" },
      { rel: "stylesheet", href: appCss },
      { rel: "manifest", href: "/__grok/manifest.webmanifest" },
      { rel: "apple-touch-icon", href: "/__grok/icon-180.png" },
    ],
  }),
  component: () => (
    <html lang="ar" dir="rtl" suppressHydrationWarning>
      <head>
        <HeadContent />
      </head>
      <body>
        <PreviewHostBridge />
        <AuthProvider>
          <Outlet />
        </AuthProvider>
        <Scripts />
      </body>
    </html>
  ),
});
