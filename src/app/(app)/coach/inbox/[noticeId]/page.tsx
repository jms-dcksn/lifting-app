import { CoachNoticeDetail } from "@/components/coach/coach-notice-detail";
export default async function NoticePage({
  params,
}: {
  params: Promise<{ noticeId: string }>;
}) {
  const { noticeId } = await params;
  return <CoachNoticeDetail noticeId={noticeId} />;
}
