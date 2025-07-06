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
  const [categories, setCategories] = useState<string[]>(() => {
    const saved = localStorage.getItem('categories')
    return saved ? JSON.parse(saved) : []
  })
  const [accounts, setAccounts] = useState<string[]>([])
  const [account, setAccount] = useState<string | null>(null)
  const [file, setFile] = useState<File | null>(null)
  const [activeStep, setActiveStep] = useState<number>(-1)
  const [logs, setLogs] = useState<string[]>(Array(steps.length).fill(''))

  useEffect(() => {
    const fetchInfo = async () => {
      try {
        const res = await fetch(`${SERVER_URL}/ynab-info`)
        const info = await res.json()
        setAccounts(info.accounts || [])
      } catch (err) {
        console.error('Error fetching YNAB info', err)
      }
    }
    fetchInfo()
  }, [])

  useEffect(() => {
    localStorage.setItem('categories', JSON.stringify(categories))
  }, [categories])

  const updateLog = (index: number, message: string) => {
    setLogs((prev) => {
      const arr = [...prev]
      arr[index] = message
      return arr
    })
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0])
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
      form.append(
        'categories',
        JSON.stringify(categories.length ? categories : ynabInfo.categories)
      )
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
          options={accounts}
          value={account}
          onChange={(_, value) => setAccount(value)}
          renderInput={(params) => (
            <TextField {...params} label="Account" placeholder="Select account" />
          )}
          sx={{ mb: 2 }}
        />
        <Autocomplete
          freeSolo
          options={categories}
          value={categories[0] || null}
          onChange={(_, value) =>
            setCategories(value ? [value] : [])
          }
          renderInput={(params) => (
            <TextField {...params} label="Category" placeholder="Add category" />
          )}
        />

        <Box sx={{ mt: 2 }}>
          <Button variant="contained" component="label">
            Choose File
            <input
              type="file"
              accept="image/*"
              capture="environment"
              hidden
              onChange={handleFileChange}
            />
          </Button>
          {file && (
            <Typography variant="body2" sx={{ mt: 1 }}>
              {file.name}
            </Typography>
          )}
        </Box>

        <Box sx={{ mt: 2 }}>
          <Button variant="contained" onClick={processReceipt}>
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
