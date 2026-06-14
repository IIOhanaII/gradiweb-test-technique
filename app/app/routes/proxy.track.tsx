import type { ActionFunctionArgs } from "react-router";

import { authenticate } from "../shopify.server";
import { recordComparison } from "../comparator.server";

/**
 * Endpoint App Proxy (Partie C) — tracking des comparaisons.
 *
 * Le thème POST en same-origin sur `/apps/comparator/track` ; Shopify relaie ici
 * (`<app>/proxy/track`, cf. `[app_proxy] url = "/proxy"`) avec une signature HMAC
 * vérifiée par `authenticate.public.appProxy`.
 * On récupère un client Admin (token offline de la boutique, **jamais exposé au
 * navigateur**) pour incrémenter le metafield de stats côté serveur.
 */
export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin } = await authenticate.public.appProxy(request);
  if (!admin) {
    return new Response(JSON.stringify({ ok: false }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  let ids: string[] = [];
  try {
    const body = await request.json();
    if (body && Array.isArray(body.ids)) ids = body.ids.map(String);
  } catch {
    // Corps absent/invalide → on ignore proprement (best-effort).
  }

  await recordComparison(admin, ids);

  return new Response(JSON.stringify({ ok: true }), {
    headers: { "Content-Type": "application/json" },
  });
};
