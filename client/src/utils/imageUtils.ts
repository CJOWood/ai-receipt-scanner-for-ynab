// Utility functions for image cropping
// Crop suggestion: find the largest white rectangle in the image (for receipts)

export interface CropArea {
  x: number // percent (0-100)
  y: number // percent (0-100)
  width: number // percent (0-100)
  height: number // percent (0-100)
}

/**
 * Crop an image to the given area and return a new blob URL
 * @param imageUrl - The image URL (object URL or data URL)
 * @param cropArea - Crop area with pixel coordinates
 * @returns Promise<string> - new object URL
 */
export async function cropImageFromPixels(
  imageUrl: string, 
  cropX: number, 
  cropY: number, 
  cropWidth: number, 
  cropHeight: number
): Promise<string> {
  return new Promise((resolve) => {
    const img = new window.Image()
    img.crossOrigin = 'Anonymous'
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas')
        canvas.width = cropWidth
        canvas.height = cropHeight
        const ctx = canvas.getContext('2d')
        if (!ctx) return resolve(imageUrl)
        
        ctx.drawImage(img, cropX, cropY, cropWidth, cropHeight, 0, 0, cropWidth, cropHeight)
        
        canvas.toBlob((blob) => {
          if (blob) {
            resolve(URL.createObjectURL(blob))
          } else {
            resolve(imageUrl)
          }
        }, 'image/jpeg', 0.9)
      } catch (error) {
        console.warn('Error cropping image:', error)
        resolve(imageUrl)
      }
    }
    img.onerror = () => resolve(imageUrl)
    img.src = imageUrl
  })
}
