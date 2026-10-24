import { MediaWorkspace } from "@/components/media-workspace";

export default async function Page({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  return <MediaWorkspace projectId={projectId} />;
}
