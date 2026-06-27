import { NextResponse } from "next/server";
import { requireAuth, getAuthSession } from "@/lib/server/auth";
import { getShopifyConfig, normalizeShopDomain } from "@/lib/connectors/shopify/config";
import { buildOAuthState } from "@/lib/connectors/shopify/state";
import { buildAuthorizeUrl } from "@/lib/connectors/shopify/oauth";
import { createRuntime } from "@/lib/server/runtime";
import { getAccessibleProject } from "@/lib/server/project-access";

export async function GET(req: Request) {
  const unauth = await requireAuth();
  if (unauth) return unauth;

  try {
    const { searchParams } = new URL(req.url);
    const projectId = searchParams.get("projectId")?.trim();
    if (!projectId) {
      return NextResponse.json({ error: "projectId is required." }, { status: 400 });
    }

    const rawShop = searchParams.get("shop")?.trim();
    if (!rawShop) {
      return NextResponse.json({ error: "shop is required." }, { status: 400 });
    }

    const shop = normalizeShopDomain(rawShop);

    const { store } = await createRuntime();
    const project = await getAccessibleProject(store, projectId);
    if (!project) {
      return NextResponse.json({ error: "Project not found." }, { status: 404 });
    }

    const session = await getAuthSession();
    const userId = session?.userId ?? "unknown";

    const config = getShopifyConfig();
    const state = buildOAuthState({ projectId, userId, shop });
    const authorizeUrl = buildAuthorizeUrl(shop, state, config);

    return NextResponse.redirect(authorizeUrl);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not initiate Shopify connection." },
      { status: 400 }
    );
  }
}
