export const stripDataUrlBase64 = (dataBase64: string): string =>
  dataBase64.includes(",")
    ? dataBase64.slice(dataBase64.indexOf(",") + 1)
    : dataBase64

export const detectImageMimeType = (data: Buffer | Uint8Array): string | null => {
  if (data.length >= 8) {
    if (
      data[0] === 0x89 &&
      data[1] === 0x50 &&
      data[2] === 0x4e &&
      data[3] === 0x47 &&
      data[4] === 0x0d &&
      data[5] === 0x0a &&
      data[6] === 0x1a &&
      data[7] === 0x0a
    ) {
      return "image/png"
    }
  }

  if (data.length >= 3 && data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff) {
    return "image/jpeg"
  }

  if (
    data.length >= 6 &&
    data[0] === 0x47 &&
    data[1] === 0x49 &&
    data[2] === 0x46 &&
    data[3] === 0x38 &&
    (data[4] === 0x39 || data[4] === 0x37) &&
    data[5] === 0x61
  ) {
    return "image/gif"
  }

  if (
    data.length >= 12 &&
    data[0] === 0x52 &&
    data[1] === 0x49 &&
    data[2] === 0x46 &&
    data[3] === 0x46 &&
    data[8] === 0x57 &&
    data[9] === 0x45 &&
    data[10] === 0x42 &&
    data[11] === 0x50
  ) {
    return "image/webp"
  }

  return null
}
