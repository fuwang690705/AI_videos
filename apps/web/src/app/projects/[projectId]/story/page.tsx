import { Story } from "@/components/story";

export default async function Page({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  return <Story projectId={projectId} />;
}
