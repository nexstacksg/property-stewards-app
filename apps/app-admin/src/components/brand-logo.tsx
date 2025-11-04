"use client"

import Image from "next/image"

export const LOGO_URL = "https://s3.ap-southeast-1.amazonaws.com/media.property-stewards.com/wp-content/uploads/2025/07/27181102/Property-Stewards-Master-File_PS-EN%E2%80%91Hor%E2%80%91TagLn%E2%80%91FC-scaled.png"

type BrandLogoProps = {
  className?: string
  priority?: boolean
}

export default function BrandLogo({ className = "w-48", priority = false }: BrandLogoProps) {
  return (
    <Image
      src={LOGO_URL}
      alt="Property Stewards"
      width={2400}
      height={800}
      priority={priority}
      className={`h-auto ${className}`}
      sizes="(min-width: 1024px) 256px, 50vw"
    />
  )
}

