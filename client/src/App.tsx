import { useEffect, useState } from 'react'
import { ThemeProvider, createTheme } from '@mui/material/styles'
import {
  Box,
  Container,
  Typography,
} from '@mui/material'
import { ReceiptStepper } from './ReceiptStepper'
import type { Receipt } from 'shared'
import { ReceiptForm } from './ReceiptForm'
import { generateProcessingFeedback } from './utils/generateProcessingFeedback'
import { buildSplitFeedback } from './utils/buildSplitFeedback'
import { cropImageFromPixels } from './utils/imageUtils'

const theme = createTheme({ palette: { mode: 'dark' } })
const steps = [
  'Get YNAB Data',
  'Analyze Receipt',
  'Process Data',
  'Create YNAB Transaction',
  'Save File',
]

function App() {
  const [allCategories, setAllCategories] = useState<string[]>([])
  const [allPayees, setAllPayees] = useState<string[]>([])
  const [category, setCategory] = useState<string | null>(null)
  const [accounts, setAccounts] = useState<string[]>([])
  const [account, setAccount] = useState<string | null>(null)
  const [file, setFile] = useState<File | null>(null)
  const [activeStep, setActiveStep] = useState<number>(-1)
  const [logs, setLogs] = useState<string[]>(Array(steps.length).fill(''))
  const [stepErrors, setStepErrors] = useState<boolean[]>(Array(steps.length).fill(false))
  const [stepSuccess, setStepSuccess] = useState<boolean[]>(Array(steps.length).fill(false))
  const [accountTouched, setAccountTouched] = useState(false)
  const [fileTouched, setFileTouched] = useState(false)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [showCrop, setShowCrop] = useState(false)
  const [crop, setCrop] = useState({ x: 0, y: 0 })
  const [zoom, setZoom] = useState(1)
  const [rotation, setRotation] = useState(0)
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<{ x: number; y: number; width: number; height: number } | null>(null)
  const [croppedUrl, setCroppedUrl] = useState<string | null>(null)
  const [analyzedReceipt, setAnalyzedReceipt] = useState<Receipt | null>(null)

  const isMockAI = Boolean(import.meta.env.VITE_MOCK_AI || window.location.pathname.includes('mock-ai'))

  useEffect(() => {
    const fetchInfo = async () => {
      try {
        const res = await fetch(`/api/ynab-info`)
        const info = await res.json()
        setAccounts(info.accounts || [])
        setAllCategories(info.categories || [])
        setAllPayees(info.payees || [])
      } catch (err) {
        console.error('Error fetching YNAB info', err)
      }
    }
    fetchInfo()
  }, [])

  const updateLog = (index: number, message: string) => {
    setLogs((prev) => {
      const arr = [...prev]
      arr[index] = message
      return arr
    })
  }

  const markStepSuccess = (index: number, message: string) => {
    updateLog(index, message)
    setStepSuccess((prev) => {
      const arr = [...prev]
      arr[index] = true
      return arr
    })
    setStepErrors((prev) => {
      const arr = [...prev]
      arr[index] = false
      return arr
    })
  }

  const markStepError = (index: number, message: string) => {
    updateLog(index, message)
    setStepErrors((prev) => {
      const arr = [...prev]
      arr[index] = true
      return arr
    })
    setStepSuccess((prev) => {
      const arr = [...prev]
      arr[index] = false
      return arr
    })
  }

  const resetSteps = () => {
    setActiveStep(-1)
    setLogs(Array(steps.length).fill(''))
    setStepErrors(Array(steps.length).fill(false))
    setStepSuccess(Array(steps.length).fill(false))
  }

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    setFileTouched(true)
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0])
      const fileObj = e.target.files[0]
      if (fileObj.type.startsWith('image/')) {
        const url = URL.createObjectURL(fileObj)
        setPreviewUrl(url)
        setCroppedUrl(null)
        setRotation(0)
        setShowCrop(true)
        
      } else {
        setPreviewUrl(null)
        setCroppedUrl(null)
        setShowCrop(false)
      }
    } else {
      setFile(null)
      setPreviewUrl(null)
      setCroppedUrl(null)
      setShowCrop(false)
    }
  }

  // Called when user confirms crop
  const handleCropConfirm = async () => {
    if (previewUrl && croppedAreaPixels) {
      const cropped = await cropImageFromPixels(
        previewUrl, 
        croppedAreaPixels.x, 
        croppedAreaPixels.y, 
        croppedAreaPixels.width, 
        croppedAreaPixels.height
      )
      setCroppedUrl(cropped)
      setShowCrop(false)
    }
  }

  // Called when user skips crop
  const handleCropSkip = () => {
    setShowCrop(false)
    setCroppedUrl(null)
  }

  // Called when user rotates the image
  const handleRotate = () => {
    setRotation((prev) => (prev + 90) % 360)
  }

  const processReceipt = async () => {
    if (!file) {
      alert('Please select a receipt image')
      return
    }

    if (!account) {
      alert('Please select an account')
      return
    }

    // Reset all steps before starting
    resetSteps()

    // Use cropped image if available, otherwise use original file
    const fileToProcess = croppedUrl ? await fetch(croppedUrl).then(r => r.blob()) : file

    // Step 1: Get YNAB Data
    setActiveStep(0)
    if (!allCategories.length || !allPayees.length || !accounts.length) {
      markStepError(0, '✗ Failed to fetch YNAB data: Not loaded')
      return
    }
    markStepSuccess(0, `${allCategories.length} categories, ${allPayees.length} payees, and ${accounts.length} accounts from YNAB`)

    // Step 2: Analyze Receipt
    let receipt: Receipt
    setActiveStep(1)
    try {
      const form = new FormData()
      form.append('file', fileToProcess instanceof Blob ? fileToProcess : file)
      form.append('categories', JSON.stringify(category ? [category] : allCategories))
      form.append('payees', JSON.stringify(allPayees))
      
      const parseRes = await fetch(`/api/parse-receipt`, {
        method: 'POST',
        body: form,
      })
      
      if (!parseRes.ok) {
        const errorData = await parseRes.json()
        throw new Error(errorData.error || `HTTP ${parseRes.status}`)
      }
      
      receipt = await parseRes.json()
      setAnalyzedReceipt(receipt)
      
      // Create detailed feedback about what was parsed
      const lineItemsText = receipt.lineItems && receipt.lineItems.length > 0 
        ? `\n• ${receipt.lineItems.length} line items found.`
        : ''
      
      const taxText = receipt.totalTaxes && receipt.totalTaxes > 0 
        ? `\n• Tax amount: $${receipt.totalTaxes.toFixed(2)}`
        : ''
      
      markStepSuccess(1, `• Merchant: ${receipt.merchant}
• Date: ${receipt.transactionDate}
• Total: $${receipt.totalAmount.toFixed(2)}${taxText}
• Category: ${receipt.category}
• Memo: ${receipt.memo}
${lineItemsText}`)
    } catch (err: unknown) {
      markStepError(1, `✗ Failed to analyze receipt: ${err instanceof Error ? err.message : 'Unknown error'}`)
      return
    }

    // Step 3: Process Data
    setActiveStep(2)
    markStepSuccess(2, generateProcessingFeedback(receipt))

    // Step 4: Create YNAB Transaction
    setActiveStep(3)
    if (isMockAI) {
      markStepSuccess(3, 'Skipped YNAB transaction creation (mock AI mode)')
    } else {
      try {
        const createRes = await fetch(`/api/create-transaction`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ account, receipt }),
        })
        
        if (!createRes.ok) {
          const errorData = await createRes.json()
          throw new Error(errorData.error || `HTTP ${createRes.status}`)
        }
        
        const transactionResult = await createRes.json()

        // Build split transaction feedback
        const splitFeedback = buildSplitFeedback(transactionResult.splitInfo, receipt)

        // Build date adjustment feedback
        let dateFeedback = ''
        if (transactionResult.dateAdjustment) {
          dateFeedback = `\n• ⚠️ Date adjusted: ${transactionResult.dateAdjustment.reason}.`
          dateFeedback += ` Used: ${transactionResult.dateAdjustment.adjustedDate} instead.`
        }
        
        markStepSuccess(3, `${splitFeedback}
          ${dateFeedback}`)
      } catch (err: unknown) {
        markStepError(3, `✗ Failed to create YNAB transaction: ${err instanceof Error ? err.message : 'Unknown error'}`)
        return
      }
    }

    // Step 5: Save File
    setActiveStep(4)
    try {
      const upload = new FormData()
      upload.append('merchant', receipt.merchant)
      upload.append('transactionDate', receipt.transactionDate)
      upload.append('file', fileToProcess instanceof Blob ? fileToProcess : file)
      
      const uploadRes = await fetch(`/api/upload-file`, { 
        method: 'POST', 
        body: upload 
      })
      
      if (!uploadRes.ok) {
        const errorData = await uploadRes.json()
        throw new Error(errorData.error || `HTTP ${uploadRes.status}`)
      }
      
      const uploadResult = await uploadRes.json()
      
      // Build storage feedback based on configuration
      let storageMessage = ''
      if (!uploadResult.storageInfo?.configured) {
        storageMessage = '⚠️ Receipt file not saved - no storage configured\n(This is optional - your YNAB transaction was created successfully)'
      } else if (uploadResult.storageInfo.type === 'local') {
        storageMessage = `Receipt file saved locally\n• Location: ${uploadResult.storageInfo.location}`
      } else if (uploadResult.storageInfo.type === 's3') {
        storageMessage = `Receipt file uploaded to S3 cloud storage\n• Location: ${uploadResult.storageInfo.location}`
      }
      
      markStepSuccess(4, storageMessage)
    } catch (err: unknown) {
      markStepError(4, `✗ Failed to save receipt file: ${err instanceof Error ? err.message : 'Unknown error'}`)
      return
    }

    // All steps completed successfully
    setActiveStep(5) // Set to completed state
  }

  return (
    <ThemeProvider theme={theme}>
      <Container maxWidth="md" sx={{ mt: 4 }}>
        <Typography variant="subtitle1" sx={{ textAlign: 'center', mb: 2, letterSpacing: 1, fontWeight: 500, color: 'text.secondary' }}>
          YNAB Receipt Uploader
        </Typography>
        <Box
          sx={{
            display: 'flex',
            flexDirection: { xs: 'column', md: 'row' },
            alignItems: { xs: 'stretch', md: 'flex-start' },
            gap: 4,
          }}
        >
          {/* Form Section */}
          <ReceiptForm
            accounts={accounts}
            account={account}
            setAccount={setAccount}
            accountTouched={accountTouched}
            setAccountTouched={setAccountTouched}
            allCategories={allCategories}
            category={category}
            setCategory={setCategory}
            file={file}
            setFile={setFile}
            fileTouched={fileTouched}
            setFileTouched={setFileTouched}
            previewUrl={previewUrl}
            setPreviewUrl={setPreviewUrl}
            croppedUrl={croppedUrl}
            setCroppedUrl={setCroppedUrl}
            showCrop={showCrop}
            setShowCrop={setShowCrop}
            crop={crop}
            setCrop={setCrop}
            zoom={zoom}
            setZoom={setZoom}
            rotation={rotation}
            setRotation={setRotation}
            setCroppedAreaPixels={setCroppedAreaPixels}
            handleFileChange={handleFileChange}
            handleCropConfirm={handleCropConfirm}
            handleCropSkip={handleCropSkip}
            handleRotate={handleRotate}
            processReceipt={processReceipt}
            resetSteps={resetSteps}
            activeStep={activeStep}
            stepsLength={steps.length}
            stepErrors={stepErrors}
          />

          {/* Vertical Divider for desktop only */}
          <Box
            sx={{
              display: { xs: 'none', md: 'flex' },
              alignItems: 'stretch',
              mx: 2,
            }}
          >
            <Box
              sx={{
                width: '1px',
                backgroundColor: 'divider',
                height: '100%',
                minHeight: 400,
                alignSelf: 'stretch',
                opacity: 0.5,
              }}
            />
          </Box>

          {/* Stepper Section */}
          <Box 
            sx={{ 
              flex: 1, 
              minWidth: 0, 
              mt: { xs: 4, md: 0 }, 
              display: 'flex', 
              flexDirection: 'column', 
              justifyContent: { xs: 'flex-start', md: 'center' }, 
              height: { md: '100%' },
              top: { md: 32 }, // adjust as needed for your header spacing
              alignSelf: { md: 'flex-start' },
            }}
          >
            <ReceiptStepper
              steps={steps}
              activeStep={activeStep}
              stepErrors={stepErrors}
              stepSuccess={stepSuccess}
              logs={logs}
              analyzedReceipt={analyzedReceipt}
            />
          </Box>
        </Box>
      </Container>
    </ThemeProvider>
  )
}

export default App