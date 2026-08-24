export const DARK_PHOTO_LUMINANCE = 55

export const isDarkPhoto = (luminance: number | null): boolean =>
  luminance !== null && luminance < DARK_PHOTO_LUMINANCE

export const averageLuminance = (img: HTMLImageElement): number | null => {
  if (!img.naturalWidth || !img.naturalHeight) {
    return null
  }

  const width = 32
  const height = 18
  const canvas = document.createElement("canvas")
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext("2d", { willReadFrequently: true })

  if (!ctx) {
    return null
  }

  try {
    ctx.drawImage(img, 0, 0, width, height)
    const { data } = ctx.getImageData(0, 0, width, height)
    let sum = 0
    const pixels = data.length / 4
    for (let i = 0; i < data.length; i += 4) {
      const red = data[i] ?? 0
      const green = data[i + 1] ?? 0
      const blue = data[i + 2] ?? 0

      sum += 0.299 * red + 0.587 * green + 0.114 * blue
    }

    return sum / pixels
  } catch {
    return null
  }
}
