
# 📦 Three-Way Match Engine

A specialized backend service built to automate the reconciliation of procurement documents (PO, GRN, and Invoices). This system leverages the **Gemini 3 Flash Preview API** for intelligent data extraction and **MongoDB** for persistent storage and matching.

## 🚀 Overview
The Three-Way Match Engine ensures that a company only pays for what it ordered and actually received. It validates quantity consistency and date integrity across three disparate document types, even if they are uploaded out of chronological order.

---

## 🏗️ Technical Approach

### 1. Document Parsing Flow
* **Ingestion**: Files are uploaded via a `multipart/form-data` POST request.
* **AI Extraction**: The PDF is sent to the **Gemini 3 Flash Preview** model. A strict prompt ensures the AI returns a clean JSON object containing headers (PO numbers, dates) and line items.
* **Persistence**: Data is saved into document-specific collections in MongoDB, linked via the common `poNumber`.

### 2. Data Model
Documents are stored using Mongoose schemas categorized by type:
* **PO (Purchase Order)**: The original contract defining expected quantities and prices.
* **GRN (Goods Receipt Note)**: Records the physical receipt of goods (supports multiple GRNs per PO).
* **Invoice**: Records the financial claim from the vendor (supports multiple Invoices per PO).

### Schema

```json
const ItemSchema = new mongoose.Schema({
    itemCode: String,
    description: String,
    quantity: Number,
    receivedQuantity: Number // Specific to GRN
});

const POSchema = new mongoose.Schema({
    poNumber: { type: String, required: true, unique: true },
    poDate: Date,
    vendorName: String,
    items: [ItemSchema]
});

const GRNSchema = new mongoose.Schema({
    grnNumber: String,
    poNumber: String,
    grnDate: Date,
    items: [ItemSchema]
});

const InvoiceSchema = new mongoose.Schema({
    invoiceNumber: String,
    poNumber: String,
    invoiceDate: Date,
    items: [ItemSchema]
});

```

### 3. Matching Logic
The engine executes a re-validation every time a document is uploaded for a specific `poNumber`. It checks:
* **Date Check**: `Invoice Date` ≤ `PO Date`.
* **Fulfillment Check**: Total `Received Quantity` (sum of all GRNs) ≤ `PO Quantity`.
* **Billing Check**: `Invoice Quantity` ≤ Total `Received Quantity` AND `Invoice Quantity` ≤ `PO Quantity`.

---

## 🧩 Key Design Choices

### **Item Matching Key: `itemCode`**
I selected **`itemCode`** (SKU) as the primary matching key.
* **Reasoning**: Descriptions in supply chain documents are often inconsistent due to shorthand or formatting (e.g., *"Chicken Momo 1kg"* vs *"Chkn Momo 1000g"*). However, the `itemCode` is a unique identifier that remains constant across the vendor's and buyer's systems, preventing false mismatches.

### **Handling Out-of-Order Uploads**
The engine is designed to be **State-Aware**:
* Documents are accepted in any order (e.g., an Invoice can be uploaded before a PO).
* The system uses an **Aggregator Pattern**: every time a document is saved, the engine queries the database for *all* related documents linked to that `poNumber`.
* If a required document type is missing, the status is set to `insufficient documents`. As soon as the final document is uploaded, the status automatically transitions to `matched`, `partially_matched`, or `mismatch`.

---

## 📊 Sample Parsed Output (Invoice)
When an invoice is uploaded, the system generates a structured JSON response:

```json
{
    "message": "Document processed successfully",
    "data": {
        "invoiceNumber": "IN25MH2504251",
        "poNumber": "CI4PO05788",
        "invoiceDate": "2026-03-24T00:00:00.000Z",
        "items": [
            {
                "itemCode": "FG-P-F-0503",
                "description": "PSM Cheesy Spicy Vegetable Momos24Pcs",
                "quantity": 50
            }
        ]
    },
    "matchStatus": "mismatch"
}
```

---

## 🛠️ Installation & Setup

### Prerequisites
* Node.js (v18+)
* MongoDB Atlas or local instance
* Google Gemini API Key

### Environment Variables
Create a `.env` file in the root directory:
```env
PORT=5000
MONGODB_URI=your_mongodb_connection_string
GEMINI_API_KEY=your_api_key_here
```

### Steps
1.  **Install dependencies**: `npm install`
2.  **Start the server**: `npm start`
3.  **Open Frontend**: Open `index.html` in any modern browser.

---

## 🛣️ API Usage

### 1. Upload Document
**POST** `/documents/upload`
* **Body (form-data)**:
    * `documentType`: `po` | `grn` | `invoice`
    * `file`: (Your PDF file)

### 2. Fetch Match Result
**GET** `/match/:poNumber`

### 3. Fetch Parsed Document
**GET** `/documents/:id`

---

## 📝 Trade-offs & Assumptions
* **Assumption**: A single `poNumber` acts as the global link across all document types.
* **Trade-off**: Used `gemini-3-flash-preview` for its speed and high-quality OCR, which is essential for processing table-heavy documents.
* **Improvement**: With more time, I would implement **Fuzzy Matching** on item descriptions to act as a fallback if an `itemCode` is misread or missing.
