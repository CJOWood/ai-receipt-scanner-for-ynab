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
import UploadFileIcon from '@mui/icons-material/UploadFile'
import ReceiptLongIcon from '@mui/icons-material/ReceiptLong'
import InsertPhotoIcon from '@mui/icons-material/InsertPhoto'
import type { Receipt } from 'shared'

const SERVER_URL = import.meta.env.APP_SERVER_URL || 'http://localhost:3000'

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
  const [accountTouched, setAccountTouched] = useState(false)
  const [fileTouched, setFileTouched] = useState(false)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)

  useEffect(() => {
    const fetchInfo = async () => {
      try {
        const res = await fetch(`${SERVER_URL}/ynab-info`)
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

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFileTouched(true)
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0])
      const fileObj = e.target.files[0]
      if (fileObj.type.startsWith('image/')) {
        const url = URL.createObjectURL(fileObj)
        setPreviewUrl(url)
      } else {
        setPreviewUrl(null)
      }
    } else {
      setFile(null)
      setPreviewUrl(null)
    }
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
    if (!category) {
      alert('Please select a category')
      return
    }

    let ynabInfo: any
    setActiveStep(0)
    try {
      const res = await fetch(`${SERVER_URL}/ynab-info`)
      ynabInfo = await res.json()
      updateLog(0, 'Fetched YNAB info')
    } catch (err: any) {
      updateLog(0, `Error: ${err.message}`)
      return
    }

    let receipt: Receipt
    setActiveStep(1)
    try {
      const form = new FormData()
      form.append('file', file)
      form.append('categories', JSON.stringify([category]))
      form.append('payees', JSON.stringify(ynabInfo.payees))
      const parseRes = await fetch(`${SERVER_URL}/parse-receipt`, {
        method: 'POST',
        body: form,
      })
      receipt = await parseRes.json()
      updateLog(1, 'Receipt analyzed')
    } catch (err: any) {
      updateLog(1, `Error: ${err.message}`)
      return
    }

    setActiveStep(2)
    updateLog(2, 'Processing data')

    setActiveStep(3)
    try {
      await fetch(`${SERVER_URL}/create-transaction`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ account, receipt }),
      })
      updateLog(3, 'Transaction created')
    } catch (err: any) {
      updateLog(3, `Error: ${err.message}`)
      return
    }

    setActiveStep(4)
    try {
      const upload = new FormData()
      upload.append('merchant', receipt.merchant)
      upload.append('transactionDate', receipt.transactionDate)
      upload.append('file', file)
      await fetch(`${SERVER_URL}/upload-file`, { method: 'POST', body: upload })
      updateLog(4, 'File saved')
    } catch (err: any) {
      updateLog(4, `Error: ${err.message}`)
      return
    }
  }

  return (
    <ThemeProvider theme={theme}>
      <Container maxWidth="sm" sx={{ textAlign: 'center', mt: 4 }}>
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
              label="Category"
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
            startIcon={<UploadFileIcon />}
            onClick={() => setFileTouched(true)}
            sx={{ minWidth: 150 }}
          >
            Choose File
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
            }}
          >
            {previewUrl ? (
              <img
                src={previewUrl}
                alt="Preview"
                style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }}
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
            disabled={!account || !file}
          >
            Process Receipt
          </Button>
        </Box>

        <Box sx={{ mt: 4 }}>
          <Stepper activeStep={activeStep} orientation="vertical">
            {steps.map((label, index) => (
              <Step key={label}>
                <StepLabel>{label}</StepLabel>
                <StepContent>
                  <Typography variant="body2" sx={{ whiteSpace: 'pre-line' }}>
                    {logs[index]}
                  </Typography>
                </StepContent>
              </Step>
            ))}
          </Stepper>
        </Box>
      </Container>
    </ThemeProvider>
  )
}

export default App
