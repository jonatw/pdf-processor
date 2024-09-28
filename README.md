# PDF Processor

This is a web-based application designed to process specific types of PDF documents. It uses the `pdf-lib` library to manipulate the content of the PDF files, allowing you to modify and enhance your PDF documents efficiently.

## Features

- Upload and process PDF files directly in your browser.
- Provides a progress bar to track the status of the processing.
- Automatically downloads the modified PDF file after processing.

## Technologies Used

- **pdf-lib**: A powerful PDF manipulation library for JavaScript.
- **Bootstrap**: For styling the user interface and providing a clean, responsive design.
- **pako**: A library used for handling compressed content in the PDF.

## How to Use

1. Upload your PDF document by selecting a file.
2. Click on the "Remove Most Common Substring" button to initiate processing.
3. The progress bar will show the status of the document as it is processed.
4. Once the process is complete, the modified PDF will be downloaded automatically.

## Installation

To run this project locally, follow these steps:

1. Clone the repository:

   ```bash
   git clone https://github.com/jonatw/pdf-processor.git
   ```

2. Navigate to the project directory:

   ```bash
   cd pdf-processor
   ```

3. Install the required dependencies:

   ```bash
   npm install
   ```

4. Run the development server:

   ```bash
   npm run dev
   ```

   The app will be accessible at `http://localhost:5173`.

5. To build the project for production:

   ```bash
   npm run build
   ```