import { Stepper, Step, StepLabel, StepContent, Box, Typography, CircularProgress } from '@mui/material'
import ErrorIcon from '@mui/icons-material/Error'
import CheckCircleIcon from '@mui/icons-material/CheckCircle'
import { ReceiptLineItemsTable } from './ReceiptLineItemsTable'
import type { Receipt } from 'shared'

interface Props {
  steps: string[]
  activeStep: number
  stepErrors: boolean[]
  stepSuccess: boolean[]
  logs: string[]
  analyzedReceipt: Receipt | null
}

export function ReceiptStepper({
  steps,
  activeStep,
  stepErrors,
  stepSuccess,
  logs,
  analyzedReceipt,
}: Props) {
  return (
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
                <Typography variant="body2" sx={{ 
                    whiteSpace: 'pre-line',
                    color: stepErrors[index] ? 'error.main' : 'text.secondary'
                  }}>
                  • Merchant: {analyzedReceipt.merchant}
                  <br />• Date: {analyzedReceipt.transactionDate}
                  <br />• Memo: {analyzedReceipt.memo}
                </Typography>
                <ReceiptLineItemsTable
                  lineItems={analyzedReceipt.lineItems}
                  totalTaxes={analyzedReceipt.totalTaxes}
                  totalAmount={analyzedReceipt.totalAmount}
                />
              </Box>
            ) : (
              (index <= activeStep || logs[index]) && (
                <Typography 
                  variant="body2" 
                  sx={{ 
                    whiteSpace: 'pre-line',
                    color: stepErrors[index] ? 'error.main' : 'text.secondary'
                  }}
                >
                  {/* Remove leading checkmark from logs as well */}
                  {logs[index]?.replace(/^✓\s?/, '') || (index === activeStep ? (
                    <span>
                      <CircularProgress size="20px" sx={{ verticalAlign: 'middle', mr: 1 }} />
                      In progress...
                    </span>
                  ) : '')}
                </Typography>
              )
            )}
          </StepContent>
        </Step>
      ))}
    </Stepper>
  )
}
