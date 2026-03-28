const express = require('express');
const multer = require('multer');
const fs = require('fs');
const { GoogleGenerativeAI } = require("@google/generative-ai");
const { PO, GRN, Invoice } = require('./models/schemas');
const { performThreeWayMatch } = require('./services/matchEngine');
const mongoose = require('mongoose');
const cors = require('cors');
const dotenv = require('dotenv');
dotenv.config();



const app = express();
app.use(express.json());
app.use(cors({origin:"*"}));
const upload = multer({ dest: 'uploads/' });
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

main().catch(err => console.log(err));

    async function main() {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log("Database Connected");
    }


/**
 * Helper to convert file to GoogleGenerativeAI.Part object
 */
function fileToGenerativePart(path, mimeType) {
    return {
      inlineData: {
        data: Buffer.from(fs.readFileSync(path)).toString("base64"),
        mimeType
      },
    };
  }


  async function parseWithGemini(filePath, docType) {

    const model = genAI.getGenerativeModel({ model: "gemini-3-flash-preview" });

  
    const prompt = `
        You are an expert document parser. Extract data from this ${docType} document.
        Return ONLY a raw JSON object. Do not include markdown formatting or backticks.
        
        Required JSON Structure for ${docType}:
        ${docType === 'po' ? '{ "poNumber": "", "poDate": "YYYY-MM-DD", "vendorName": "", "items": [{ "itemCode": "", "description": "", "quantity": 0 }] }' : ''}
        ${docType === 'grn' ? '{ "grnNumber": "", "poNumber": "", "grnDate": "YYYY-MM-DD", "items": [{ "itemCode": "", "description": "", "receivedQuantity": 0 }] }' : ''}
        ${docType === 'invoice' ? '{ "invoiceNumber": "", "poNumber": "", "invoiceDate": "YYYY-MM-DD", "items": [{ "itemCode": "", "description": "", "quantity": 0 }] }' : ''}
        
        Important: Match the "itemCode" across documents accurately.
    `;

    try {
        const imagePart = fileToGenerativePart(filePath, "application/pdf");
        const result = await model.generateContent([prompt, imagePart]);
        const response = await result.response;
        const text = response.text();

        // Clean up the response in case Gemini adds markdown code blocks
        const cleanJson = text.replace(/```json|```/g, "").trim();
        return JSON.parse(cleanJson);
    } catch (error) {
        console.error("Gemini Parsing Error:", error);
        throw new Error("Failed to parse document");
    } finally {
        // Delete the temporary file after processing
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    }
}


app.post('/documents/upload', upload.single('file'), async (req, res) => {
    try {
        const { documentType } = req.body; // e.g., 'po', 'grn', 'invoice' [cite: 47]
        
        if (!req.file) return res.status(400).send("No file uploaded.");

        // Parse with Gemini
        const parsedData = await parseWithGemini(req.file.path, documentType.toLowerCase());

        // Store in MongoDB based on type [cite: 16, 51]
        let savedDoc;
        if (documentType.toLowerCase() === 'po') savedDoc = await PO.create(parsedData);
        else if (documentType.toLowerCase() === 'grn') savedDoc = await GRN.create(parsedData);
        else if (documentType.toLowerCase() === 'invoice') savedDoc = await Invoice.create(parsedData);

        // Trigger matching logic automatically [cite: 52]
        const matchResult = await performThreeWayMatch(parsedData.poNumber);

        res.status(200).json({
            message: "Document processed successfully",
            data: savedDoc,
            matchStatus: matchResult.status
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});  

app.get('/match/:poNumber', async (req, res) => {
    const result = await performThreeWayMatch(req.params.poNumber);
    res.json(result);
});


app.get('/documents/:id', async (req, res) => {
    try {
        const { id } = req.params;

        // Since we don't know which collection the ID belongs to, 
        // we check all three in parallel for efficiency.
        const [po, grn, invoice] = await Promise.all([
            PO.findById(id),
            GRN.findById(id),
            Invoice.findById(id)
        ]);

        const document = po || grn || invoice;

        if (!document) {
            return res.status(404).json({ error: "Document not found" });
        }

        res.status(200).json(document);
    } catch (err) {
     
        res.status(500).json({ error: "Invalid ID format or server error" });
    }
});


app.listen(5000, () => console.log(`server running on port 5000`));

