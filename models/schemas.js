const mongoose = require('mongoose');

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

module.exports = {
    PO: mongoose.model('PO', POSchema),
    GRN: mongoose.model('GRN', GRNSchema),
    Invoice: mongoose.model('Invoice', InvoiceSchema)
};