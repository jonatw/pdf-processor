// main.js
import './style.css'
import {
  PDFDocument,
  PDFName,
  PDFNumber,
  PDFStream,
  PDFArray
} from 'pdf-lib'
import { inflate, deflate } from 'pako'

// 1. Render the page
function renderPage() {
  const app = document.querySelector('#app')
  app.innerHTML = `
    <div class="container mt-5">
      <h1 class="mb-4">PDF Processor</h1>
      <div class="mb-3">
        <input type="file" id="pdf-upload" accept="application/pdf" class="form-control">
      </div>
      <button id="process-btn" class="btn btn-primary mb-4">Remove Most Common Substring</button>
      
      <!-- Progress Bar -->
      <div class="progress mb-3" style="height: 25px; display: none;" id="progress-container">
        <div class="progress-bar" role="progressbar" style="width: 0%;" aria-valuenow="0" aria-valuemin="0" aria-valuemax="100" id="progress-bar">
          0%
        </div>
      </div>
      
      <!-- Status Block -->
      <div class="alert alert-info align-items-center" role="alert" style="display: none;" id="status-block">
        <div class="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true" id="spinner"></div>
        <span id="status-message">Processing...</span>
      </div>
    </div>
  `

  // Select elements after setting innerHTML
  const progressContainer = document.getElementById('progress-container')
  const progressBar = document.getElementById('progress-bar')
  const statusBlock = document.getElementById('status-block')
  const statusMessage = document.getElementById('status-message')
  const processBtn = document.getElementById('process-btn')
  const spinner = document.getElementById('spinner')

  // Ensure both progress container and status block are hidden on page load
  window.onload = function () {
    hideProgressIndicators()
  }

  // Add event listener to the process button
  processBtn.addEventListener('click', handleProcessButtonClick)
}

// 2. Read the file from the file input after user clicked the button
async function handleProcessButtonClick() {
  const pdfInput = document.getElementById('pdf-upload').files[0]
  const processBtn = document.getElementById('process-btn')

  if (!pdfInput) {
    alert('Please upload a PDF file.')
    hideProgressIndicators()
    return
  }

  processBtn.disabled = true
  showProgressIndicators()
  updateProgress(0, 'Starting the PDF processing...')

  let reader = new FileReader()

  reader.onload = async function (event) {
    try {
      updateProgress(10, 'Reading the PDF file...')
      let typedArray = new Uint8Array(event.target.result)
      
      // 3. Put the file into processPdf function and return the pdfDoc for download
      const modifiedPdfBytes = await processPdf(typedArray)

      // 4. Create download link and clean up all the resources
      await createDownloadLink(modifiedPdfBytes)

      // Clean up resources
      typedArray = null
      reader.abort()
      reader = null

      if (window.gc) {
        window.gc()
      }

      updateProgress(100, 'Processing complete!', 'bg-success')
      hideProgressIndicators()
      processBtn.disabled = false

    } catch (error) {
      console.error('An error occurred during processing:', error)
      updateProgress(0, 'An error occurred. Please try again.', 'bg-danger')
      hideProgressIndicators()
      processBtn.disabled = false
    }
  }

  reader.readAsArrayBuffer(pdfInput)
}

// 3. Process the PDF file
async function processPdf(typedArray) {
  updateProgress(20, 'Loading the PDF document...')
  let pdfDoc = await PDFDocument.load(typedArray)
  let pages = pdfDoc.getPages()

  let substringCounter = new Map()
  const patternString = ' Td <'
  const desiredLength = 100
  const patternBytes = new TextEncoder('latin1').encode(patternString)

  updateProgress(30, 'Processing the first page...')
  const firstPage = pages[0]
  const contentStreamRefs = firstPage.node.normalizedEntries().Contents

  if (contentStreamRefs) {
    const contentStreamArray = Array.isArray(contentStreamRefs) ? contentStreamRefs : [contentStreamRefs]
    for (const [index, streamRef] of contentStreamArray.entries()) {
      updateProgress(30 + (index + 1) * 5, `Processing content stream ${index + 1}/${contentStreamArray.length}...`)
      await processContentStream(streamRef, pdfDoc, substringCounter, patternBytes, desiredLength)
    }
  }

  updateProgress(50, 'Identifying the most common substring...')
  let mostCommonSubstringHex = ''
  let maxCount = 0

  for (const [substringHex, count] of substringCounter.entries()) {
    if (count > maxCount) {
      maxCount = count
      mostCommonSubstringHex = substringHex
    }
  }

  console.log(`Most common substring: ${hexToAscii(mostCommonSubstringHex)} (Occurrences: ${maxCount})`)

  updateProgress(60, 'Replacing the most common substring in all pages...')
  let mostCommonSubstringBytes = hexStringToUint8Array(mostCommonSubstringHex)

  const totalPages = pages.length
  for (const [pageIndex, page] of pages.entries()) {
    updateProgress(60 + ((pageIndex + 1) / totalPages) * 20, `Modifying page ${pageIndex + 1}/${totalPages}...`)
    const contentStreamRefs = page.node.normalizedEntries().Contents

    if (contentStreamRefs) {
      const contentStreamArray = Array.isArray(contentStreamRefs) ? contentStreamRefs : [contentStreamRefs]
      for (const streamRef of contentStreamArray) {
        await replaceInContentStream(streamRef, pdfDoc, mostCommonSubstringBytes)
      }
    }
  }

  updateProgress(85, 'Saving the modified PDF...')
  return await pdfDoc.save()
}

// 4. Create download link and clean up resources
async function createDownloadLink(modifiedPdfBytes) {
  updateProgress(90, 'Preparing download...')
  const blob = new Blob([modifiedPdfBytes], { type: 'application/pdf' })
  const link = document.createElement('a')
  link.href = URL.createObjectURL(blob)
  link.download = 'output_without_common_substring.pdf'
  link.click()

  // Release memory resources
  URL.revokeObjectURL(link.href)
  link.remove()
}

// Helper functions
function updateProgress(percent, message, barClass = 'bg-info') {
  const progressBar = document.getElementById('progress-bar')
  const statusMessage = document.getElementById('status-message')
  const statusBlock = document.getElementById('status-block')
  const spinner = document.getElementById('spinner')

  progressBar.style.width = `${percent}%`
  progressBar.setAttribute('aria-valuenow', percent)
  progressBar.textContent = `${percent}%`

  statusMessage.textContent = message
  statusBlock.className = `alert ${barClass} align-items-center`

  if (percent < 100) {
    spinner.style.display = 'inline-block'
  } else {
    spinner.style.display = 'none'
  }
}

function showProgressIndicators() {
  const progressContainer = document.getElementById('progress-container')
  const statusBlock = document.getElementById('status-block')
  const spinner = document.getElementById('spinner')

  progressContainer.style.display = 'block'
  statusBlock.style.display = 'flex'
  spinner.style.display = 'inline-block'
}

function hideProgressIndicators() {
  const progressContainer = document.getElementById('progress-container')
  const statusBlock = document.getElementById('status-block')
  const spinner = document.getElementById('spinner')

  progressContainer.style.display = 'none'
  statusBlock.style.display = 'none'
  spinner.style.display = 'none'
  resetProgress()
}

function resetProgress() {
  const progressBar = document.getElementById('progress-bar')
  const statusMessage = document.getElementById('status-message')

  progressBar.style.width = '0%'
  progressBar.setAttribute('aria-valuenow', 0)
  progressBar.textContent = '0%'
  progressBar.classList.remove('bg-success', 'bg-danger')
  progressBar.classList.add('bg-info')

  statusMessage.textContent = ''
}

// Process content stream and count substrings
async function processContentStream(streamRef, pdfDoc, substringCounter, patternBytes, desiredLength) {
  const contentStream = pdfDoc.context.lookup(streamRef)

  if (contentStream instanceof PDFStream) {
    let contentBytes = contentStream.contents
    const filters = contentStream.dict.get(PDFName.of('Filter'))

    let isCompressed = false

    if (filters) {
      isCompressed = true

      if (filters instanceof PDFName && filters.asString() === '/FlateDecode') {
        try {
          if (contentBytes && contentBytes.length > 0) {
            contentBytes = inflate(contentBytes)
          } else {
            console.warn('contentBytes is undefined or empty, skipping inflation.')
            return
          }
        } catch (e) {
          console.error('Error inflating contentBytes:', e)
          return
        }
      } else if (filters instanceof PDFArray && filters.asArray().some(filter => filter.asString() === '/FlateDecode')) {
        try {
          if (contentBytes && contentBytes.length > 0) {
            contentBytes = inflate(contentBytes)
          } else {
            console.warn('contentBytes is undefined or empty, skipping inflation.')
            return
          }
        } catch (e) {
          console.error('Error inflating contentBytes:', e)
          return
        }
      } else {
        alert(`Unsupported compression method: ${filters instanceof PDFName ? filters.asString() : filters.asArray().map(f => f.asString()).join(', ')}`)
        return
      }
    }

    if (!contentBytes || contentBytes.length === 0) {
      console.warn('contentBytes is undefined or empty, skipping.')
      return
    }

    const positions = findPatternPositions(contentBytes, patternBytes)

    for (const position of positions) {
      const substringBytes = contentBytes.slice(position, position + desiredLength)
      const substringHex = uint8ArrayToHexString(substringBytes)
      const count = substringCounter.get(substringHex) || 0
      substringCounter.set(substringHex, count + 1)
    }
  } else if (contentStream instanceof PDFArray) {
    for (const subStreamRef of contentStream.asArray()) {
      await processContentStream(subStreamRef, pdfDoc, substringCounter, patternBytes, desiredLength)
    }
  } else {
    console.error('contentStream is not an instance of PDFStream or PDFArray', contentStream)
  }
}

// Find pattern positions in byte array
function findPatternPositions(contentBytes, patternBytes) {
  const positions = []
  const len = contentBytes.length
  const patternLen = patternBytes.length

  for (let i = 0; i <= len - patternLen; i++) {
    let match = true
    for (let j = 0; j < patternLen; j++) {
      if (contentBytes[i + j] !== patternBytes[j]) {
        match = false
        break
      }
    }
    if (match) {
      positions.push(i)
      i += patternLen - 1
    }
  }
  return positions
}

// Convert Uint8Array to hexadecimal string
function uint8ArrayToHexString(uint8Array) {
  return Array.from(uint8Array).map(b => b.toString(16).padStart(2, '0')).join('')
}

// Convert hexadecimal string to Uint8Array
function hexStringToUint8Array(hexString) {
  const result = []
  for (let i = 0; i < hexString.length; i += 2) {
    result.push(parseInt(hexString.substr(i, 2), 16))
  }
  return new Uint8Array(result)
}

// Convert hexadecimal string to ASCII string (for log output)
function hexToAscii(hexString) {
  const hexes = hexString.match(/.{1,2}/g) || []
  return hexes.map(hex => String.fromCharCode(parseInt(hex, 16))).join('')
}

// Remove specified byte sequence from byte array
function removeByteSequence(contentBytes, sequenceBytes) {
  const contentLength = contentBytes.length
  const sequenceLength = sequenceBytes.length

  let result = []
  let i = 0

  while (i <= contentLength - sequenceLength) {
    let match = true
    for (let j = 0; j < sequenceLength; j++) {
      if (contentBytes[i + j] !== sequenceBytes[j]) {
        match = false
        break
      }
    }
    if (match) {
      i += sequenceLength
    } else {
      result.push(contentBytes[i])
      i++
    }
  }

  while (i < contentLength) {
    result.push(contentBytes[i])
    i++
  }

  return new Uint8Array(result)
}

// Replace substring in content stream
async function replaceInContentStream(streamRef, pdfDoc, mostCommonSubstringBytes) {
  const contentStream = pdfDoc.context.lookup(streamRef)

  if (contentStream instanceof PDFStream) {
    let contentBytes = contentStream.contents
    const filters = contentStream.dict.get(PDFName.of('Filter'))
    let isCompressed = false

    if (filters) {
      isCompressed = true

      if (filters instanceof PDFName && filters.asString() === '/FlateDecode') {
        try {
          if (contentBytes && contentBytes.length > 0) {
            contentBytes = inflate(contentBytes)
          } else {
            console.warn('contentBytes is undefined or empty, skipping inflation.')
            return
          }
        } catch (e) {
          console.error('Error inflating contentBytes:', e)
          return
        }
      } else if (filters instanceof PDFArray && filters.asArray().some(filter => filter.asString() === '/FlateDecode')) {
        try {
          if (contentBytes && contentBytes.length > 0) {
            contentBytes = inflate(contentBytes)
          } else {
            console.warn('contentBytes is undefined or empty, skipping inflation.')
            return
          }
        } catch (e) {
          console.error('Error inflating contentBytes:', e)
          return
        }
      } else {
        alert(`Unsupported compression method: ${filters instanceof PDFName ? filters.asString() : filters.asArray().map(f => f.asString()).join(', ')}`)
        return
      }
    }

    if (!contentBytes || contentBytes.length === 0) {
      console.warn('contentBytes is undefined or empty, skipping.')
      return
    }

    contentBytes = removeByteSequence(contentBytes, mostCommonSubstringBytes)

    if (isCompressed) {
      try {
        if (contentBytes && contentBytes.length > 0) {
          contentBytes = deflate(contentBytes)
        } else {
          console.warn('contentBytes is undefined or empty, skipping deflation.')
          return
        }
      } catch (e) {
        console.error('Error deflating contentBytes:', e)
        return
      }
    }

    contentStream.contents = contentBytes
    contentStream.dict.set(PDFName.of('Length'), PDFNumber.of(contentBytes.length))
  } else if (contentStream instanceof PDFArray) {
    for (const subStreamRef of contentStream.asArray()) {
      await replaceInContentStream(subStreamRef, pdfDoc, mostCommonSubstringBytes)
    }
  } else {
    console.error('contentStream is not an instance of PDFStream or PDFArray', contentStream)
  }
}

// Initialize the application
renderPage()
