import { useEffect, useState } from 'react'
import { ThemeProvider, createTheme } from '@mui/material/styles'
import {
  Autocomplete,
  Box,
  Button,
  Container,
  Step,
  StepContent,
  StepLabel,
  Stepper,
  TextField,
  Typography,
} from '@mui/material'
import ReceiptLongIcon from '@mui/icons-material/ReceiptLong'
import InsertPhotoIcon from '@mui/icons-material/InsertPhoto'
import PhotoCameraIcon from '@mui/icons-material/PhotoCamera'
import ErrorIcon from '@mui/icons-material/Error'
import CheckCircleIcon from '@mui/icons-material/CheckCircle'
import type { Receipt } from 'shared'
import Cropper from 'react-easy-crop'
import { suggestReceiptCrop, cropImageFromPixels } from './utils/imageUtils'
import { generateProcessingFeedback } from './utils/generateProcessingFeedback'
import Table from '@mui/material/Table'
import TableBody from '@mui/material/TableBody'
import TableCell from '@mui/material/TableCell'
import TableContainer from '@mui/material/TableContainer'
import TableHead from '@mui/material/TableHead'
import TableRow from '@mui/material/TableRow'
import Paper from '@mui/material/Paper'
import Collapse from '@mui/material/Collapse'
import IconButton from '@mui/material/IconButton'
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown'
import KeyboardArrowUpIcon from '@mui/icons-material/KeyboardArrowUp'

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
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<{ x: number; y: number; width: number; height: number } | null>(null)
  const [croppedUrl, setCroppedUrl] = useState<string | null>(null)
  const [analyzedReceipt, setAnalyzedReceipt] = useState<Receipt | null>(null)
  const [openCategories, setOpenCategories] = useState<{ [cat: string]: boolean }>({})

  const isMockAI = Boolean(import.meta.env.VITE_MOCK_AI || window.location.pathname.includes('mock-ai'))

  useEffect(() => {
    const fetchInfo = async () => {
      try {
        const res = await fetch(`/api/ynab-info`)
        const info = await res.json()
        setAccounts(info.accounts || [])
        setAllCategories(info.categories || [])
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
        setShowCrop(true)
        
        // Try to suggest a crop area
        try {
          const suggestion = await suggestReceiptCrop(url)
          if (suggestion) {
            // Apply suggested crop as initial position
            setCrop({ x: suggestion.x, y: suggestion.y })
            setZoom(1)
          }
        } catch (error) {
          console.warn('Could not suggest crop area:', error)
        }
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
    let ynabInfo: { categories: string[], payees: string[], accounts: string[] }
    setActiveStep(0)
    try {
      const res = await fetch(`/api/ynab-info`)
      if (!res.ok) {
        const errorData = await res.json()
        throw new Error(errorData.error || `HTTP ${res.status}`)
      }
      ynabInfo = await res.json()
      markStepSuccess(0, `✓ Fetched ${ynabInfo.categories.length} categories, ${ynabInfo.payees.length} payees, and ${ynabInfo.accounts.length} accounts from YNAB`)
    } catch (err: unknown) {
      markStepError(0, `✗ Failed to fetch YNAB data: ${err instanceof Error ? err.message : 'Unknown error'}`)
      return
    }

    // Step 2: Analyze Receipt
    let receipt: Receipt
    setActiveStep(1)
    try {
      const form = new FormData()
      form.append('file', fileToProcess instanceof Blob ? fileToProcess : file)
      form.append('categories', JSON.stringify(category ? [category] : ynabInfo.categories))
      form.append('payees', JSON.stringify(ynabInfo.payees))
      
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
      setOpenCategories({}) // reset open state
      
      // Create detailed feedback about what was parsed
      const lineItemsText = receipt.lineItems && receipt.lineItems.length > 0 
        ? `\n• ${receipt.lineItems.length} line items found:\n${receipt.lineItems.map(item => `  - ${item.productName}: $${item.lineItemTotalAmount.toFixed(2)} (${item.category})`).join('\n')}`
        : ''
      
      const taxText = receipt.totalTaxes && receipt.totalTaxes > 0 
        ? `\n• Tax amount: $${receipt.totalTaxes.toFixed(2)}`
        : ''
      
      markStepSuccess(1, `✓ Receipt analyzed successfully:
• Merchant: ${receipt.merchant}
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
      markStepSuccess(3, '✓ Skipped YNAB transaction creation (mock AI mode)')
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
        let splitFeedback = ''
        if (transactionResult.splitInfo?.attempted) {
          if (transactionResult.splitInfo.successful) {
            splitFeedback = `\n• Split across ${transactionResult.splitInfo.splitCount} categories successfully`
            
            // Add tax distribution info if available
            if (transactionResult.splitInfo.taxDistributed && transactionResult.splitInfo.taxDistributed > 0) {
              splitFeedback += `\n• Tax distributed: $${transactionResult.splitInfo.taxDistributed.toFixed(2)}`
            }
            
            // Add adjustment info if available
            if (transactionResult.splitInfo.adjustmentApplied && Math.abs(transactionResult.splitInfo.adjustmentApplied) > 0) {
              const adjType = transactionResult.splitInfo.adjustmentType
              const adjTypeText = adjType === 'tolerance' ? 'tolerance adjustment' : 
                                 adjType === 'proportional_adjustment' ? 'proportional adjustment' :
                                 adjType === 'tax_distribution' ? 'with tax distribution' : 'adjustment'
              splitFeedback += `\n• ${adjTypeText}: ${transactionResult.splitInfo.adjustmentApplied >= 0 ? '+' : ''}$${transactionResult.splitInfo.adjustmentApplied.toFixed(2)}`
            }
            
            // Add detailed breakdown if available
            if (transactionResult.splitInfo.detailedBreakdown) {
              const breakdown = transactionResult.splitInfo.detailedBreakdown
              splitFeedback += `\n• Split breakdown: Items $${breakdown.originalSplitTotal.toFixed(2)}`
              if (breakdown.taxAmount > 0) {
                splitFeedback += ` + Tax $${breakdown.taxAmount.toFixed(2)}`
              }
              if (Math.abs(breakdown.finalAdjustment) > 0) {
                splitFeedback += ` + Adj $${breakdown.finalAdjustment.toFixed(2)}`
              }
              splitFeedback += ` = $${receipt.totalAmount.toFixed(2)}`
            }
          } else {
            splitFeedback = `\n• ⚠️ Split transaction attempted but failed: ${transactionResult.splitInfo.reason}`
            splitFeedback += `\n• Expected total: $${transactionResult.splitInfo.expectedAmount?.toFixed(2)}, Split total: $${transactionResult.splitInfo.totalSplitAmount?.toFixed(2)}`
            splitFeedback += `\n• Transaction created as single entry in "${receipt.category}" instead`
          }
        } else if (receipt.lineItems && receipt.lineItems.length > 1) {
          splitFeedback = `\n• Single transaction (no splits attempted)`
        }

        // Build date adjustment feedback
        let dateFeedback = ''
        if (transactionResult.dateAdjustment) {
          dateFeedback = `\n• ⚠️ Date adjusted: ${transactionResult.dateAdjustment.reason}`
          dateFeedback += `\n• Original: ${transactionResult.dateAdjustment.originalDate}, Used: ${transactionResult.dateAdjustment.adjustedDate}`
        }
        
        markStepSuccess(3, `✓ Transaction created in YNAB:
• Account: ${account}
• Amount: $${receipt.totalAmount.toFixed(2)}
• Payee: ${receipt.merchant}${splitFeedback}${dateFeedback}`)
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
        storageMessage = `✓ Receipt file saved locally\n• Location: ${uploadResult.storageInfo.location}`
      } else if (uploadResult.storageInfo.type === 's3') {
        storageMessage = `✓ Receipt file uploaded to S3 cloud storage\n• Location: ${uploadResult.storageInfo.location}`
      } else {
        storageMessage = '✓ Receipt file saved successfully'
      }
      
      markStepSuccess(4, storageMessage)
    } catch (err: unknown) {
      markStepError(4, `✗ Failed to save receipt file: ${err instanceof Error ? err.message : 'Unknown error'}`)
      return
    }

    // All steps completed successfully
    setActiveStep(5) // Set to completed state
  }

  // Helper to group line items by category
  const groupLineItemsByCategory = (lineItems: Receipt['lineItems'] = []) => {
    const groups: { [cat: string]: typeof lineItems } = {}
    for (const item of lineItems) {
      if (!groups[item.category]) groups[item.category] = []
      groups[item.category].push(item)
    }
    return groups
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
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Autocomplete
              autoHighlight
              options={accounts}
              value={account}
              onChange={(_, value) => {
                setAccount(value)
                setAccountTouched(true)
              }}
              renderInput={(params) => (
                <TextField
                  {...params}
                  label="Account"
                  placeholder="Select account"
                  required={accountTouched && !account}
                  error={accountTouched && !account}
                  onBlur={() => setAccountTouched(true)}
                />
              )}
              sx={{ mb: 2 }}
            />
            <Autocomplete
              autoHighlight
              options={allCategories}
              value={category}
              onChange={(_, value) => setCategory(value)}
              renderInput={(params) => (
                <TextField
                  {...params}
                  label="Category Override"
                  placeholder="Select category (optional)"
                />
              )}
              sx={{ mb: 2 }}
            />

            <Box sx={{ mt: 2, display: 'flex', alignItems: 'center' }}>
              <TextField
                label="Receipt Image"
                value={file ? file.name : ''}
                required={fileTouched && !file}
                disabled
                error={fileTouched && !file}
                InputProps={{ readOnly: true }}
                sx={{ mr: 2, flex: 1 }}
              />
              <Button
                variant="contained"
                component="label"
                startIcon={<PhotoCameraIcon />}
                onClick={() => setFileTouched(true)}
                sx={{ minWidth: 150 }}
              >
                Take Photo
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  hidden
                  onChange={handleFileChange}
                />
              </Button>
            </Box>
            <Box sx={{ mt: 2, mb: 2, display: 'flex', justifyContent: 'center' }}>
              <Box
                sx={{
                  width: '100%',
                  height: 200,
                  border: '1px solid #555',
                  borderRadius: 2,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  background: '#222',
                  overflow: 'hidden',
                  position: 'relative',
                }}
              >
                {showCrop && previewUrl ? (
                  <>
                    <Cropper
                      image={previewUrl}
                      crop={crop}
                      zoom={zoom}
                      aspect={3 / 4}
                      cropShape="rect"
                      showGrid={true}
                      onCropChange={setCrop}
                      onZoomChange={setZoom}
                      onCropComplete={(_, croppedAreaPixels) => {
                        setCroppedAreaPixels(croppedAreaPixels)
                      }}
                    />
                    <Box sx={{ position: 'absolute', bottom: 8, left: 8, zIndex: 10 }}>
                      <Button
                        size="small"
                        variant="contained"
                        onClick={handleCropConfirm}
                        sx={{ mr: 1 }}
                      >
                        Crop
                      </Button>
                      <Button
                        size="small"
                        variant="outlined"
                        onClick={handleCropSkip}
                      >
                        Skip
                      </Button>
                    </Box>
                  </>
                ) : croppedUrl ? (
                  <img
                    src={croppedUrl}
                    alt="Cropped Preview"
                    style={{
                      maxWidth: '100%',
                      maxHeight: '100%',
                      objectFit: 'contain',
                    }}
                  />
                ) : previewUrl ? (
                  <img
                    src={previewUrl}
                    alt="Preview"
                    style={{
                      maxWidth: '100%',
                      maxHeight: '100%',
                      objectFit: 'contain',
                    }}
                  />
                ) : (
                  <InsertPhotoIcon sx={{ fontSize: 80, color: '#666' }} />
                )}
              </Box>
            </Box>

            <Box sx={{ mt: 2 }}>
              <Button
                variant="contained"
                onClick={processReceipt}
                startIcon={<ReceiptLongIcon />}
                disabled={!account || !file || activeStep >= 0}
              >
                Process Receipt
              </Button>
              {(activeStep >= steps.length || stepErrors.some(Boolean)) && (
                <Button
                  variant="outlined"
                  onClick={() => {
                    resetSteps()
                    setFile(null)
                    setPreviewUrl(null)
                    setCroppedUrl(null)
                    setShowCrop(false)
                  }}
                  sx={{ ml: 2 }}
                >
                  Process Another Receipt
                </Button>
              )}
            </Box>
          </Box>

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
            <Stepper activeStep={activeStep} orientation="vertical">
              {steps.map((label, index) => (
                <Step key={label} expanded={index <= activeStep}>
                  <StepLabel
                    error={stepErrors[index]}
                    StepIconComponent={({ completed, error }) => {
                      if (error) {
                        return <ErrorIcon color="error" />
                      } else if (completed || stepSuccess[index]) {
                        return <CheckCircleIcon color="success" />
                      } else {
                        return <span>{index + 1}</span>
                      }
                    }}
                  >
                    {label}
                  </StepLabel>
                  <StepContent>
                    {/* Custom rendering for Analyze Receipt step with table */}
                    {index === 1 && analyzedReceipt && analyzedReceipt.lineItems && analyzedReceipt.lineItems.length > 0 ? (
                      <Box>
                        <Typography variant="body2" sx={{ mb: 1 }}>
                          ✓ Receipt analyzed successfully:
                          <br />• Merchant: {analyzedReceipt.merchant}
                          <br />• Date: {analyzedReceipt.transactionDate}
                          <br />• Memo: {analyzedReceipt.memo}
                        </Typography>
                        {/* Grouped Table */}
                        <TableContainer component={Paper} sx={{ mb: 2, minWidth: 400, maxWidth: '100%', overflowX: 'auto' }}>
                          <Table size="small">
                            <TableHead>
                              <TableRow>
                                <TableCell />
                                <TableCell>Category / Product</TableCell>
                                <TableCell align="right">Amount</TableCell>
                                <TableCell align="right">Quantity</TableCell>
                              </TableRow>
                            </TableHead>
                            <TableBody>
                              {Object.entries(groupLineItemsByCategory(analyzedReceipt.lineItems)).map(([cat, items]) => {
                                // Correct category total: sum of (lineItemTotalAmount) only, not multiplied by quantity
                                const catTotal = items.reduce((sum, item) => sum + item.lineItemTotalAmount, 0)
                                return (
                                  <>
                                    <TableRow key={cat} sx={{ backgroundColor: '#222' }}>
                                      <TableCell>
                                        <IconButton
                                          size="small"
                                          onClick={() => setOpenCategories(prev => ({ ...prev, [cat]: !prev[cat] }))
                                          }
                                        >
                                          {openCategories[cat] ? <KeyboardArrowUpIcon /> : <KeyboardArrowDownIcon />}
                                        </IconButton>
                                      </TableCell>
                                      <TableCell sx={{ fontWeight: 600 }}>{cat} ({items.length} items)</TableCell>
                                      <TableCell align="right" sx={{ fontWeight: 600 }}>${catTotal.toFixed(2)}</TableCell>
                                      <TableCell />
                                    </TableRow>
                                    <TableRow>
                                      <TableCell style={{ paddingBottom: 0, paddingTop: 0 }} colSpan={4}>
                                        <Collapse in={openCategories[cat]} timeout="auto" unmountOnExit>
                                          <Box sx={{ margin: 1 }}>
                                            <Table size="small">
                                              <TableBody>
                                                {items.map((item, idx) => (
                                                  <TableRow key={item.productName + idx}>
                                                    <TableCell />
                                                    <TableCell>{item.productName}</TableCell>
                                                    <TableCell align="right">${item.lineItemTotalAmount.toFixed(2)}</TableCell>
                                                    <TableCell align="right">{item.quantity || 1}</TableCell>
                                                  </TableRow>
                                                ))}
                                              </TableBody>
                                            </Table>
                                          </Box>
                                        </Collapse>
                                      </TableCell>
                                    </TableRow>
                                  </>
                                )
                              })}
                              {/* Taxes row */}
                              {analyzedReceipt.totalTaxes && analyzedReceipt.totalTaxes > 0 && (
                                <TableRow>
                                  <TableCell colSpan={2} />
                                  <TableCell sx={{ fontWeight: 600 }}>Tax</TableCell>
                                  <TableCell align="right" sx={{ fontWeight: 600 }}>${analyzedReceipt.totalTaxes.toFixed(2)}</TableCell>
                                </TableRow>
                              )}
                              {/* Total row */}
                              <TableRow>
                                <TableCell colSpan={2} />
                                <TableCell sx={{ fontWeight: 700 }}>Total</TableCell>
                                <TableCell align="right" sx={{ fontWeight: 700 }}>${analyzedReceipt.totalAmount.toFixed(2)}</TableCell>
                              </TableRow>
                            </TableBody>
                          </Table>
                        </TableContainer>
                      </Box>
                    ) : (
                      (index <= activeStep || logs[index]) && (
                        <Typography 
                          variant="body2" 
                          sx={{ 
                            whiteSpace: 'pre-line',
                            color: stepErrors[index] ? 'error.main' : stepSuccess[index] ? 'success.main' : 'text.secondary'
                          }}
                        >
                          {logs[index] || (index === activeStep ? 'In progress...' : '')}
                        </Typography>
                      )
                    )}
                  </StepContent>
                </Step>
              ))}
            </Stepper>
          </Box>
        </Box>
      </Container>
    </ThemeProvider>
  )
}

export default App