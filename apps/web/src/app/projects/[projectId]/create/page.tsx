import { Creator } from "@/components/creator";

export default async function Page({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  return <Creator projectId={projectId} />;
}
