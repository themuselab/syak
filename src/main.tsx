import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import App from "./app/App.tsx";
import "./index.css";

// AIT 빌드(토스 미니앱)에서만 TDS Provider 적용. Vercel 빌드는 스킵.
const IS_VERCEL_BUILD = import.meta.env.VITE_TARGET === "vercel";

async function bootstrap() {
  let element = <App />;

  if (!IS_VERCEL_BUILD) {
    try {
      const tdsMod = await import("@toss/tds-mobile-ait");
      const configMod = await import("../granite.config.ts");
      const Provider = tdsMod.TDSMobileAITProvider;
      const config = configMod.default;
      element = (
        <Provider brandPrimaryColor={config.brand.primaryColor}>
          <App />
        </Provider>
      );
    } catch (e) {
      console.warn("[shak] TDS Provider load failed:", e);
    }
  }

  createRoot(document.getElementById("root")!).render(
    <StrictMode>{element}</StrictMode>,
  );
}

bootstrap();
