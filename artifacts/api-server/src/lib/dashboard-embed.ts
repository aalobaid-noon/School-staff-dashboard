import { createHmac, timingSafeEqual } from "node:crypto";

const workspaceOrigins = new Set([
  "https://school.noonacademy.com",
  "https://school.staging.noonedu.io",
]);
export function workspaceOrigin(value: unknown): string | null {
  return typeof value === "string" && workspaceOrigins.has(value) ? value : null;
}
export function embedContext(origin: unknown, attempt: unknown, state: string, secret: string): string | null {
  if (!workspaceOrigin(origin) || typeof attempt !== "string" || !/^[a-f0-9]{32}$/.test(attempt)) return null;
  const payload = Buffer.from(JSON.stringify({ origin, attempt, state })).toString("base64url");
  return `${payload}.${createHmac("sha256", secret).update(payload).digest("hex")}`;
}
export function readEmbedContext(value: string | undefined, state: string, secret: string): { origin: string; attempt: string } | null {
  if (!value) return null;
  try {
    const [payload, signature, extra] = value.split(".");
    if (extra || !payload || !signature || !/^[a-f0-9]{64}$/.test(signature)) return null;
    const expected = createHmac("sha256", secret).update(payload).digest();
    if (!timingSafeEqual(expected, Buffer.from(signature, "hex"))) return null;
    const context = JSON.parse(Buffer.from(payload, "base64url").toString());
    return context.state === state && workspaceOrigin(context.origin) && /^[a-f0-9]{32}$/.test(context.attempt)
      ? { origin: context.origin, attempt: context.attempt } : null;
  } catch { return null; }
}
export function embedMessage(origin: string, type: "login-required" | "ready", nonce = ""): string {
  return `<script nonce="${nonce}">if(window.parent!==window){window.parent.postMessage({type:"school-insights:${type}"},${JSON.stringify(origin)});document.addEventListener('click',function(event){const link=event.target.closest?.('a');if(link&&new URL(link.href).pathname==='/api/dashboard/login'){event.preventDefault();window.parent.postMessage({type:'school-insights:login-required'},${JSON.stringify(origin)});}});}</script>`;
}
