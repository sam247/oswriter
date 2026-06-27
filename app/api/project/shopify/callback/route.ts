import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/server/auth";
import { getShopifyConfig, normalizeShopDomain } from "@/lib/connectors/shopify/config";
import { verifyCallbackHmac, exchangeCodeForToken } from "@/lib/connectors/shopify/oauth";
import { verifyOAuthState } from "@/lib/connectors/shopify/state";
import { connectShopifyDestination } from "@/lib/connectors/shopify/connector";
import { encryptSecret } from "@/lib/security/secrets";
import { createRuntime } from "@/lib/server/runtime";
import { getAccessibleProject } from "@/lib/server/project-access";
import { appUrl } from "@/lib/server/urls";
import { nowIso } from "@/lib/defaults";

export async function GET(req: Request) {
  const unauth = await requireAuth();
  if (unauth) return unauth;

  const { searchParams } = new URL(req.url);
  const errorParam = searchParams.get("error");
  if (errorParam) {
    const redirectUrl = appUrl(`/?shopifyError=${encodeURIComponent(errorParam)}`);
    return NextResponse.redirect(redirectUrl);
  }

  try {
    const config = getShopifyConfig();

    // Verify Shopify HMAC before trusting any other params.
    if (!verifyCallbackHmac(searchParams, config.apiSecret)) {
      return NextResponse.json({ error: "Invalid HMAC. Request could not be verified." }, { status: 400 });
    }

    const code = searchParams.get("code");
    const rawShop = searchParams.get("shop");
    const stateParam = searchParams.get("state");

    if (!code || !rawShop || !stateParam) {
      return NextResponse.json({ error: "Missing required callback parameters." }, { status: 400 });
    }

    // Verify signed state — also validates expiry.
    const oauthState = verifyOAuthState(stateParam);
    const shop = normalizeShopDomain(rawShop);

    if (oauthState.shop !== shop) {
      return NextResponse.json({ error: "Shop domain mismatch." }, { status: 400 });
    }

    // Exchange code for offline access token.
    const { accessToken, scope } = await exchangeCodeForToken(shop, code, config);

    // Load project (using projectId from signed state — trust after HMAC + state verification).
    const { store } = await createRuntime();
    const project = await getAccessibleProject(store, oauthState.projectId);
    if (!project) {
      return NextResponse.json({ error: "Project not found." }, { status: 404 });
    }

    const encryptedAccessToken = encryptSecret(accessToken);
    const grantedScopes = scope.split(",").map((s) => s.trim()).filter(Boolean);

    // Fetch shop metadata via GraphQL and build the public + secret records.
    const { publicConnection, secret } = await connectShopifyDestination({
      projectId: project.id,
      organisationId: project.organisationId,
      createdByUserId: project.createdByUserId,
      shopDomain: shop,
      accessToken,
      encryptedAccessToken,
      grantedScopes,
    });

    // Dual-write: project document (public) + secrets table.
    const now = nowIso();
    const updatedProject = {
      ...project,
      publishing: {
        ...project.publishing,
        shopify: publicConnection,
      },
      updatedAt: now,
    };

    await store.saveProject(updatedProject);
    await store.saveProjectShopifyConnection(secret);

    // Redirect back to QueueWrite with a signal to open project settings.
    const redirectUrl = appUrl(`/?projectSettings=${encodeURIComponent(project.id)}&shopify=connected`);
    return NextResponse.redirect(redirectUrl);
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Shopify connection failed.";
    const redirectUrl = appUrl(`/?shopifyError=${encodeURIComponent(msg)}`);
    return NextResponse.redirect(redirectUrl);
  }
}
