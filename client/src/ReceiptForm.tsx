import React from 'react'
import {
  Autocomplete,
  Box,
  Button,
  TextField,
  IconButton,
} from '@mui/material'
import PhotoCameraIcon from '@mui/icons-material/PhotoCamera'
import ReceiptLongIcon from '@mui/icons-material/ReceiptLong'
import InsertPhotoIcon from '@mui/icons-material/InsertPhoto'
import RotateRightIcon from '@mui/icons-material/RotateRight'
import Cropper from 'react-easy-crop'

interface Props {
  accounts: string[]
  account: string | null
  setAccount: (value: string | null) => void
  accountTouched: boolean
  setAccountTouched: (value: boolean) => void
  allCategories: string[]
  category: string | null
  setCategory: (value: string | null) => void
  file: File | null
  setFile: (file: File | null) => void
  fileTouched: boolean
  setFileTouched: (value: boolean) => void
  previewUrl: string | null
  croppedUrl: string | null
  showCrop: boolean
  crop: { x: number; y: number }
  setCrop: (crop: { x: number; y: number }) => void
  zoom: number
  setZoom: (zoom: number) => void
  rotation: number
  setRotation: (rotation: number) => void
  handleRotate: () => void
  handleFileChange: (e: React.ChangeEvent<HTMLInputElement>) => void
  handleCropConfirm: () => void
  handleCropSkip: () => void
  processReceipt: () => void
  resetSteps: () => void
  activeStep: number
  stepsLength: number
  stepErrors: boolean[]
  setPreviewUrl: (url: string | null) => void
  setCroppedUrl: (url: string | null) => void
  setShowCrop: (show: boolean) => void
  setCroppedAreaPixels: (area: { x: number; y: number; width: number; height: number }) => void
}

export function ReceiptForm({
  accounts,
  account,
  setAccount,
  accountTouched,
  setAccountTouched,
  allCategories,
  category,
  setCategory,
  file,
  setFile,
  fileTouched,
  setFileTouched,
  previewUrl,
  croppedUrl,
  showCrop,
  crop,
  setCrop,
  zoom,
  setZoom,
  rotation,
  setRotation,
  handleRotate,
  handleFileChange,
  handleCropConfirm,
  handleCropSkip,
  processReceipt,
  resetSteps,
  activeStep,
  stepsLength,
  stepErrors,
  setPreviewUrl,
  setCroppedUrl,
  setShowCrop,
  setCroppedAreaPixels,
}: Props) {
  return (
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
          disabled={activeStep >= 0}
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
            height: 300,
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
                rotation={rotation}
                aspect={3 / 4}
                cropShape="rect"
                showGrid={true}
                restrictPosition={false}
                onCropChange={setCrop}
                onZoomChange={setZoom}
                onCropComplete={(_, croppedAreaPixels) => {
                  setCroppedAreaPixels(croppedAreaPixels)
                }}
              />
              <Box sx={{ position: 'absolute', top: 8, right: 8, zIndex: 10 }}>
                <IconButton
                  size="small"
                  onClick={handleRotate}
                  sx={{ 
                    backgroundColor: 'rgba(0, 0, 0, 0.6)', 
                    color: 'white',
                    '&:hover': { backgroundColor: 'rgba(0, 0, 0, 0.8)' }
                  }}
                >
                  <RotateRightIcon />
                </IconButton>
              </Box>
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
                  variant="contained"
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
          Process
        </Button>
        {(activeStep >= stepsLength || stepErrors.some(Boolean)) && (
          <Button
            variant="outlined"
            onClick={() => {
              resetSteps()
              setFile(null)
              setPreviewUrl(null)
              setCroppedUrl(null)
              setShowCrop(false)
              setRotation(0)
            }}
            sx={{ ml: 2 }}
          >
            Process Another
          </Button>
        )}
      </Box>
    </Box>
  )
}
