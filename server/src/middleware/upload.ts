import multer, { FileFilterCallback } from 'multer'
import path from 'path'
import fs from 'fs'
import { Request, Response, NextFunction } from 'express'
import { MAX_FILE_SIZE, BULK_MAX_ITEMS } from '../config'
import { put } from '@vercel/blob'

// ─── MIME type sets ───────────────────────────────────────────────────────────

const DRAWING_MIME_TYPES = new Set([
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/webp',
])

const KB_MIME_TYPES = new Set([
  'application/pdf',
])

// ─── Storage configs (memory storage — works in both local and cloud) ─────────

const drawingStorage = multer.memoryStorage()
const kbStorage = multer.memoryStorage()

// ─── File filters ─────────────────────────────────────────────────────────────

function drawingFileFilter(
  _req: Request,
  file: Express.Multer.File,
  cb: FileFilterCallback,
): void {
  if (DRAWING_MIME_TYPES.has(file.mimetype)) {
    cb(null, true)
  } else {
    cb(
      Object.assign(new Error('Invalid file type. Allowed: PDF, PNG, JPG, WEBP'), {
        error_code: 'INVALID_FILE_TYPE',
        status:     400,
      }) as unknown as null,
      false,
    )
  }
}

function kbFileFilter(
  _req: Request,
  file: Express.Multer.File,
  cb: FileFilterCallback,
): void {
  if (KB_MIME_TYPES.has(file.mimetype)) {
    cb(null, true)
  } else {
    cb(
      Object.assign(new Error('Invalid file type. Only PDF files are accepted for knowledge base'), {
        error_code: 'INVALID_FILE_TYPE',
        status:     400,
      }) as unknown as null,
      false,
    )
  }
}

// ─── Multer instances ─────────────────────────────────────────────────────────

const drawingMulter = multer({
  storage:    drawingStorage,
  fileFilter: drawingFileFilter,
  limits:     { fileSize: MAX_FILE_SIZE },
})

const kbMulter = multer({
  storage:    kbStorage,
  fileFilter: kbFileFilter,
  limits:     { fileSize: MAX_FILE_SIZE },
})

// ─── Error wrapper ────────────────────────────────────────────────────────────

function handleMulterError(
  err: unknown,
  _req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      res.status(400).json({
        success:    false,
        error:      `File too large. Maximum size is ${MAX_FILE_SIZE / 1024 / 1024}MB`,
        error_code: 'FILE_TOO_LARGE',
      })
      return
    }
    if (err.code === 'LIMIT_FILE_COUNT') {
      res.status(400).json({
        success:    false,
        error:      `Too many files. Maximum is ${BULK_MAX_ITEMS} files per batch`,
        error_code: 'TOO_MANY_FILES',
      })
      return
    }
    res.status(400).json({
      success:    false,
      error:      err.message,
      error_code: 'UPLOAD_ERROR',
    })
    return
  }

  if (err instanceof Error && (err as unknown as { error_code?: string }).error_code === 'INVALID_FILE_TYPE') {
    res.status(400).json({
      success:    false,
      error:      err.message,
      error_code: 'INVALID_FILE_TYPE',
    })
    return
  }

  next(err)
}

// ─── Exported middleware ──────────────────────────────────────────────────────

/**
 * Single drawing file upload. Field name: 'file'.
 * Accepts: PDF, PNG, JPG, WEBP. Max: 50MB.
 */
export function drawingUpload(req: Request, res: Response, next: NextFunction): void {
  drawingMulter.single('file')(req, res, (err) => handleMulterError(err, req, res, next))
}

/**
 * Multiple drawing files upload for bulk costing. Field name: 'files'.
 * Accepts: PDF, PNG, JPG, WEBP. Max: 50 files, 50MB each.
 */
export function bulkDrawingUpload(req: Request, res: Response, next: NextFunction): void {
  drawingMulter.array('files', BULK_MAX_ITEMS)(req, res, (err) => handleMulterError(err, req, res, next))
}

/**
 * Single knowledge base document upload. Field name: 'file'.
 * Accepts: PDF only. Max: 50MB.
 */
export function kbUpload(req: Request, res: Response, next: NextFunction): void {
  kbMulter.single('file')(req, res, (err) => handleMulterError(err, req, res, next))
}

// ─── Cloud/local file persistence helper ─────────────────────────────────────

const IS_CLOUD = !!process.env.TURSO_DATABASE_URL

/**
 * In production: uploads buffer to Vercel Blob, returns the public URL.
 * In development: saves buffer to disk, returns the relative path.
 */
export async function saveUploadedFile(
  file: Express.Multer.File,
  folder: 'drawings' | 'kb',
): Promise<string> {
  const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`
  const ext    = path.extname(file.originalname)
  const name   = `${unique}${ext}`

  if (IS_CLOUD) {
    const blob = await put(`${folder}/${name}`, file.buffer, {
      access: 'public',
      contentType: file.mimetype,
    })
    return blob.url
  } else {
    const dir  = folder === 'drawings'
      ? path.resolve(__dirname, '../../../data/uploads/drawings')
      : path.resolve(__dirname, '../../../data/uploads/kb')
    fs.mkdirSync(dir, { recursive: true })
    const dest = path.join(dir, name)
    fs.writeFileSync(dest, file.buffer)
    return `uploads/${folder}/${name}`
  }
}
