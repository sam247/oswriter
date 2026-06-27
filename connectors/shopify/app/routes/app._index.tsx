/**
 * The only page in the QueueWrite Shopify auth bridge.
 *
 * This is intentionally minimal. QueueWrite is the product.
 * This app exists only to satisfy Shopify's requirement for an installable
 * app and to give merchants a way to return to QueueWrite from the Shopify
 * admin.
 */
import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData } from "react-router";
import { Page, Layout, Card, Text, Button, BlockStack, InlineStack } from "@shopify/polaris";
import { authenticate } from "../shopify.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);
  return json({
    queueWriteUrl: process.env.QUEUEWRITE_APP_URL ?? "https://app.queuewrite.com",
  });
};

export default function Index() {
  const { queueWriteUrl } = useLoaderData<typeof loader>();

  return (
    <Page>
      <Layout>
        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <Text as="h1" variant="headingLg">
                QueueWrite is connected.
              </Text>
              <Text as="p" variant="bodyMd" tone="subdued">
                Return to QueueWrite to research, generate and publish articles.
              </Text>
              <InlineStack>
                <Button
                  url={queueWriteUrl}
                  target="_blank"
                  variant="primary"
                >
                  Open QueueWrite
                </Button>
              </InlineStack>
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
