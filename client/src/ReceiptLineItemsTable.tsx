import React, { useState } from 'react'
import { Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Paper, Collapse, IconButton, Box } from '@mui/material'
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown'
import KeyboardArrowUpIcon from '@mui/icons-material/KeyboardArrowUp'
import type { Receipt } from 'shared'

type Props = {
  lineItems: Receipt['lineItems']
  totalTaxes?: number
  totalAmount: number
}

export function ReceiptLineItemsTable({ lineItems = [], totalTaxes = 0, totalAmount }: Props) {
  const [openCategories, setOpenCategories] = useState<{ [cat: string]: boolean }>({})

  const groupLineItemsByCategory = (lineItems: Receipt['lineItems'] = []) => {
    const groups: { [cat: string]: typeof lineItems } = {}
    for (const item of lineItems) {
      if (!groups[item.category]) groups[item.category] = []
      groups[item.category].push(item)
    }
    return groups
  }

  return (
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
          {Object.entries(groupLineItemsByCategory(lineItems)).map(([cat, items]) => {
            const catTotal = items.reduce((sum, item) => sum + item.lineItemTotalAmount, 0)
            return (
              <React.Fragment key={cat}>
                <TableRow sx={{ backgroundColor: '#222' }}>
                  <TableCell>
                    <IconButton
                      size="small"
                      onClick={() => setOpenCategories(prev => ({ ...prev, [cat]: !prev[cat] }))}
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
              </React.Fragment>
            )
          })}
          {totalTaxes > 0 && (
            <TableRow>
              <TableCell colSpan={2} />
              <TableCell sx={{ fontWeight: 600 }}>Tax</TableCell>
              <TableCell align="right" sx={{ fontWeight: 600 }}>${totalTaxes.toFixed(2)}</TableCell>
            </TableRow>
          )}
          <TableRow>
            <TableCell colSpan={2} />
            <TableCell sx={{ fontWeight: 700 }}>Total</TableCell>
            <TableCell align="right" sx={{ fontWeight: 700 }}>${totalAmount.toFixed(2)}</TableCell>
          </TableRow>
        </TableBody>
      </Table>
    </TableContainer>
  )
}
