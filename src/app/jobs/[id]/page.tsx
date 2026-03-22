import { JobDetailShell } from '@/components/widgets/job-detail/page-shell'

export default async function JobDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return <JobDetailShell jobId={id} />
}
