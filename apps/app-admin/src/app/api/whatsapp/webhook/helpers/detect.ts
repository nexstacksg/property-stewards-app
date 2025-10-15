export function detectHasMedia(data: any): boolean {
  return Boolean(
    data?.type === 'image' ||
    data?.type === 'video' ||
    data?.type === 'document' ||
    data?.type === 'audio' ||
    data?.hasMedia ||
    data?.media ||
    data?.message?.imageMessage ||
    data?.message?.videoMessage ||
    data?.message?.documentMessage ||
    data?.url ||
    data?.fileUrl ||
    data?.media?.file?.download ||
    data?.media?.links?.download ||
    data?.media?.links?.resource
  )
}

