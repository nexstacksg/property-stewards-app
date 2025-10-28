import { Buffer } from 'node:buffer'

// Runtime flags to control conversion behavior
const NO_IMAGE_PROXY = process.env.NO_IMAGE_PROXY === '1'
const PROXY_MAX_DIM = Number.parseInt(process.env.PDF_IMAGE_MAX_DIM || '1600', 10)

// Lightweight magic-byte sniffing for common formats that PDFKit often sees
// We only need to distinguish JPEG/PNG (supported) vs others (to convert)

export type ImageKind =
  | 'jpeg'
  | 'png'
  | 'webp'
  | 'gif'
  | 'avif'
  | 'heic'
  | 'heif'
  | 'tiff'
  | 'bmp'
  | 'unknown'

function startsWith(buf: Buffer, bytes: number[], offset = 0) {
  if (!buf || buf.length < offset + bytes.length) return false
  for (let i = 0; i < bytes.length; i += 1) {
    if (buf[offset + i] !== bytes[i]) return false
  }
  return true
}

export function detectImageKind(buf: Buffer): ImageKind {
  if (!buf || buf.length < 4) return 'unknown'
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (startsWith(buf, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'png'
  // JPEG: FF D8 FF
  if (startsWith(buf, [0xff, 0xd8, 0xff])) return 'jpeg'
  // GIF87a / GIF89a
  if (startsWith(buf, [0x47, 0x49, 0x46, 0x38, 0x37, 0x61]) || startsWith(buf, [0x47, 0x49, 0x46, 0x38, 0x39, 0x61])) return 'gif'
  // WebP: RIFF....WEBP
  if (startsWith(buf, [0x52, 0x49, 0x46, 0x46]) && startsWith(buf, [0x57, 0x45, 0x42, 0x50], 8)) return 'webp'
  // AVIF/HEIC/HEIF are ISO BMFF: ftyp.... with brand
  if (startsWith(buf, [0x66, 0x74, 0x79, 0x70], 4)) {
    const brand = buf.subarray(8, 12).toString('ascii').toLowerCase()
    if (brand.includes('heic') || brand.includes('heix') || brand.includes('hevc') || brand.includes('hevx')) return 'heic'
    if (brand.includes('mif1') || brand.includes('heif')) return 'heif'
    if (brand.includes('avif')) return 'avif'
  }
  // TIFF: II*\0 or MM\0*
  if (startsWith(buf, [0x49, 0x49, 0x2a, 0x00]) || startsWith(buf, [0x4d, 0x4d, 0x00, 0x2a])) return 'tiff'
  // BMP: BM
  if (startsWith(buf, [0x42, 0x4d])) return 'bmp'
  return 'unknown'
}

function readUInt32BE(buf: Buffer, offset: number): number {
  return (buf[offset] << 24) | (buf[offset + 1] << 16) | (buf[offset + 2] << 8) | buf[offset + 3]
}

function pngDimensions(buf: Buffer): { w: number; h: number } | null {
  // PNG signature (8) + IHDR chunk header (8) + data (13)
  if (buf.length < 8 + 8 + 13) return null
  if (!startsWith(buf, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0)) return null
  const length = readUInt32BE(buf, 8) // IHDR length
  const type = buf.subarray(12, 16).toString('ascii')
  if (type !== 'IHDR' || length !== 13) return null
  const w = readUInt32BE(buf, 16)
  const h = readUInt32BE(buf, 20)
  if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) return null
  return { w, h }
}

export function isPdfKitCompatibleImage(buf: Buffer): boolean {
  const kind = detectImageKind(buf)
  if (kind === 'png') {
    const dims = pngDimensions(buf)
    if (!dims) return false
    if (dims.w > 8192 || dims.h > 8192) return false
    return true
  }
  if (kind === 'jpeg') {
    // Heuristic: reject absurdly large files to avoid memory issues
    if (buf.length > 50 * 1024 * 1024) return false
    return true
  }
  return false
}

async function loadSharp(): Promise<any | null> {
  try {
    // Hide from bundlers; only resolve at runtime
    const dyn = (new Function('m', 'return import(m)')) as (m: string) => Promise<any>
    const mod = await dyn('sharp')
    return mod?.default ?? mod
  } catch {
    return null
  }
}

async function convertWithSharp(buf: Buffer, to: 'png' | 'jpeg'): Promise<Buffer> {
  const sharp = await loadSharp()
  if (!sharp) throw new Error('sharp-not-installed')
  // We keep conversion minimal (no resize) to preserve detail;
  // PDF layout will fit visuals to the grid.
  const base = sharp(buf, { failOn: 'none', limitInputPixels: 268402689 }).rotate()
  // Downscale very large images to a sane bound to avoid PDFKit memory errors
  const meta = await base.metadata().catch(() => ({} as any))
  const w = typeof meta.width === 'number' ? meta.width : undefined
  const h = typeof meta.height === 'number' ? meta.height : undefined
  const tooLarge = (w && w > 4096) || (h && h > 4096)
  const resized = tooLarge ? base.resize({ width: w && h && w >= h ? 4096 : undefined, height: w && h && h > w ? 4096 : undefined, fit: 'inside', withoutEnlargement: true }) : base

  if (to === 'png') return resized.png({ compressionLevel: 9 }).toBuffer()
  return resized.jpeg({ quality: 82, mozjpeg: true }).toBuffer()
}

/**
 * Ensure the buffer is in a PDFKit-supported encoding (PNG/JPEG).
 * Returns null when conversion is impossible or buffer is invalid.
 */
export async function ensurePdfSupportedImage(buf: Buffer): Promise<Buffer | null> {
  if (!buf || buf.length === 0) return null
  if (buf.length < 32) return null
  // Always normalize to PNG to eliminate edge cases across formats
  try {
    const converted = await convertWithSharp(buf, 'png')
    return isPdfKitCompatibleImage(converted) ? converted : null
  } catch {
    // If sharp is unavailable, accept validated PNG/JPEG buffers; otherwise null
    const kind = detectImageKind(buf)
    if (kind === 'png' || kind === 'jpeg') {
      return isPdfKitCompatibleImage(buf) ? buf : null
    }
    return null
  }
}

/**
 * Load an image from URL (http(s) or data URL) and normalize it to PNG/JPEG.
 */
export async function loadNormalizedImage(url: string): Promise<Buffer | null> {
  if (!url) return null
  try {
    // Data URL
    if (url.startsWith('data:')) {
      const comma = url.indexOf(',')
      if (comma === -1) return null
      const base64 = url.slice(comma + 1)
      const raw = Buffer.from(base64, 'base64')
      return await ensurePdfSupportedImage(raw)
    }

    if (!/^https?:/i.test(url)) return null
    const resp = await fetch(url, {
      method: 'GET',
      headers: { Accept: 'image/avif,image/webp,image/*;q=0.9,*/*;q=0.8' },
      signal: AbortSignal.timeout(6000)
    })
    if (!resp.ok) return null
    const arr = await resp.arrayBuffer()
    const raw = Buffer.from(arr)
    const normalized = await ensurePdfSupportedImage(raw)
    if (normalized) return normalized

    // Fallback: try a no-dependency on-the-fly converter (wsrv.nl)
    // Note: uses third-party CDN; disable with NO_IMAGE_PROXY=1
    if (NO_IMAGE_PROXY) return null
    const proxy = `https://wsrv.nl/?url=${encodeURIComponent(url)}&output=png&w=${PROXY_MAX_DIM}&h=${PROXY_MAX_DIM}&fit=inside`
    const proxied = await fetch(proxy, { method: 'GET', signal: AbortSignal.timeout(6000) }).catch(() => null as any)
    if (proxied?.ok) {
      const proxBuf = Buffer.from(await proxied.arrayBuffer())
      const kind = detectImageKind(proxBuf)
      if ((kind === 'png' || kind === 'jpeg') && isPdfKitCompatibleImage(proxBuf)) return proxBuf
    }
    return null
  } catch {
    return null
  }
}
