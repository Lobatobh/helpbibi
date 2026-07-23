import Image from 'next/image'

export function BrandLogo({
  priority = false,
  className = '',
}: {
  priority?: boolean
  className?: string
}) {
  return (
    <span className={`inline-flex overflow-hidden rounded-xl bg-white px-2 py-1 shadow-sm ${className}`}>
      <Image
        src="/helpbibi-logo-official.png"
        alt="Help Bibi"
        width={1080}
        height={490}
        priority={priority}
        className="h-full w-auto object-contain"
      />
    </span>
  )
}
