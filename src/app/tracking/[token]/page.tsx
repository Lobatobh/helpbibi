import { PublicTracking } from '@/components/rescue/public-tracking'

export default async function TrackingPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  return <PublicTracking token={token} />
}
