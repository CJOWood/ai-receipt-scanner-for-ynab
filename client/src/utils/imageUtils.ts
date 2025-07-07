// Utility functions for image cropping and crop suggestion
// Crop suggestion: find the largest white rectangle in the image (for receipts)

export interface CropArea {
  x: number // percent (0-100)
  y: number // percent (0-100)
  width: number // percent (0-100)
  height: number // percent (0-100)
}

/**
 * Suggest a crop area for a receipt image by analyzing the largest white-ish rectangle.
 * This is a simple heuristic and works best for receipts with white backgrounds.
 * @param imageUrl - The image URL (object URL or data URL)
 * @returns Promise<CropArea | null>
 */
export async function suggestReceiptCrop(imageUrl: string): Promise<CropArea | null> {
  return new Promise((resolve) => {
    const img = new window.Image()
    img.crossOrigin = 'Anonymous'
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas')
        canvas.width = img.width
        canvas.height = img.height
        const ctx = canvas.getContext('2d')
        if (!ctx) return resolve(null)
        
        ctx.drawImage(img, 0, 0)
        const imageData = ctx.getImageData(0, 0, img.width, img.height)
        
        // Simple approach: find the largest contiguous white area
        let minX = img.width, minY = img.height, maxX = 0, maxY = 0
        let whitePixelCount = 0
        
        // Sample every 4th pixel for performance
        for (let y = 0; y < img.height; y += 4) {
          for (let x = 0; x < img.width; x += 4) {
            const i = (y * img.width + x) * 4
            const r = imageData.data[i]
            const g = imageData.data[i + 1]
            const b = imageData.data[i + 2]
            
            // Check if pixel is white-ish (bright)
            const brightness = (r + g + b) / 3
            if (brightness > 200) {
              whitePixelCount++
              if (x < minX) minX = x
              if (x > maxX) maxX = x
              if (y < minY) minY = y
              if (y > maxY) maxY = y
            }
          }
        }
        
        // Only suggest crop if we found a reasonable amount of white pixels
        const totalSampledPixels = (img.width / 4) * (img.height / 4)
        const whiteRatio = whitePixelCount / totalSampledPixels
        
        if (whiteRatio > 0.1 && (maxX - minX) > img.width * 0.3 && (maxY - minY) > img.height * 0.3) {
          // Add some padding around the detected area
          const paddingX = (maxX - minX) * 0.1
          const paddingY = (maxY - minY) * 0.1
          
          resolve({
            x: Math.max(0, (minX - paddingX) / img.width * 100),
            y: Math.max(0, (minY - paddingY) / img.height * 100),
            width: Math.min(100, ((maxX - minX + 2 * paddingX) / img.width) * 100),
            height: Math.min(100, ((maxY - minY + 2 * paddingY) / img.height) * 100),
          })
        } else {
          // No good white area found, suggest a centered crop
          resolve({
            x: 10,
            y: 15,
            width: 80,
            height: 70,
          })
        }
      } catch (error) {
        console.warn('Error analyzing image for crop suggestion:', error)
        resolve(null)
      }
    }
    img.onerror = () => resolve(null)
    img.src = imageUrl
  })
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
