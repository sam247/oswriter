import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { BlogPostPage } from "@/components/site/BlogPostPage";
import { BLOG_POSTS } from "@/lib/site/blog-posts";

type BlogPostRouteProps = {
  params: Promise<{ slug: string }>;
};

export async function generateStaticParams() {
  return BLOG_POSTS.map((post) => ({ slug: post.slug }));
}

export async function generateMetadata({
  params,
}: BlogPostRouteProps): Promise<Metadata> {
  const { slug } = await params;
  const post = BLOG_POSTS.find((entry) => entry.slug === slug);

  if (!post) {
    return {
      title: "Article not found — QueueWrite",
    };
  }

  return {
    title: `${post.title} — QueueWrite`,
    description: post.description,
    openGraph: {
      title: post.title,
      description: post.description,
      type: "article",
    },
    twitter: {
      card: "summary",
      title: post.title,
      description: post.description,
    },
  };
}

export default async function BlogPostRoutePage({
  params,
}: BlogPostRouteProps) {
  const { slug } = await params;
  const post = BLOG_POSTS.find((entry) => entry.slug === slug);

  if (!post) {
    notFound();
  }

  return <BlogPostPage post={post} />;
}
