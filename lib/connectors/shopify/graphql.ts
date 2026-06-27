/**
 * Shopify publishing destination — GraphQL Admin API client.
 *
 * This is the single API foundation for all current and future Shopify features:
 *   Phase 1  — shop metadata and blog list
 *   Phase 2  — article publishing (write_content scope)
 *   Phase 3  — products, collections, SEO metadata
 *
 * Always uses the GraphQL Admin API; REST is not used.
 */

export interface ShopMetadata {
  name: string;
  myshopifyDomain: string;
  primaryDomain: string | null;
  currencyCode: string | null;
  ianaTimezone: string | null;
  primaryLocale: string | null;
}

export interface BlogSummary {
  id: string;
  title: string;
  handle: string;
}

const SHOP_METADATA_QUERY = `
  query ShopMetadata {
    shop {
      name
      myshopifyDomain
      primaryDomain { host }
      currencyCode
      ianaTimezone
      primaryLocale { locale }
    }
  }
`;

const BLOG_LIST_QUERY = `
  query BlogList {
    blogs(first: 50) {
      nodes {
        id
        title
        handle
      }
    }
  }
`;

const HEALTH_QUERY = `
  query HealthCheck {
    shop {
      name
    }
  }
`;

interface GraphQLResponse<T> {
  data?: T;
  errors?: Array<{ message: string }>;
}

export class ShopifyGraphQLClient {
  private readonly shop: string;
  private readonly accessToken: string;
  private readonly apiVersion: string;

  constructor(shop: string, accessToken: string, apiVersion = "2025-01") {
    this.shop = shop;
    this.accessToken = accessToken;
    this.apiVersion = apiVersion;
  }

  private async execute<T>(query: string): Promise<T> {
    const url = `https://${this.shop}/admin/api/${this.apiVersion}/graphql.json`;
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Access-Token": this.accessToken,
        Accept: "application/json",
      },
      body: JSON.stringify({ query }),
      cache: "no-store",
    });

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new Error(`Shopify GraphQL request failed (${response.status}): ${text}`);
    }

    const result = (await response.json()) as GraphQLResponse<T>;
    if (result.errors?.length) {
      throw new Error(`Shopify GraphQL error: ${result.errors.map((e) => e.message).join("; ")}`);
    }
    if (!result.data) throw new Error("Shopify GraphQL returned no data.");
    return result.data;
  }

  async getShopMetadata(): Promise<ShopMetadata> {
    const data = await this.execute<{
      shop: {
        name: string;
        myshopifyDomain: string;
        primaryDomain: { host: string } | null;
        currencyCode: string | null;
        ianaTimezone: string | null;
        primaryLocale: { locale: string } | null;
      };
    }>(SHOP_METADATA_QUERY);

    return {
      name: data.shop.name,
      myshopifyDomain: data.shop.myshopifyDomain,
      primaryDomain: data.shop.primaryDomain?.host ?? null,
      currencyCode: data.shop.currencyCode ?? null,
      ianaTimezone: data.shop.ianaTimezone ?? null,
      primaryLocale: data.shop.primaryLocale?.locale ?? null,
    };
  }

  async listBlogs(): Promise<BlogSummary[]> {
    const data = await this.execute<{
      blogs: { nodes: Array<{ id: string; title: string; handle: string }> };
    }>(BLOG_LIST_QUERY);
    return data.blogs.nodes;
  }

  async healthCheck(): Promise<{ name: string }> {
    const data = await this.execute<{ shop: { name: string } }>(HEALTH_QUERY);
    return { name: data.shop.name };
  }
}
