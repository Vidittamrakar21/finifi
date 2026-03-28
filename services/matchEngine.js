const { PO, GRN, Invoice } = require('../models/schemas');

async function performThreeWayMatch(poNumber) {
    const po = await PO.findOne({ poNumber });
    const grns = await GRN.find({ poNumber });
    const invoices = await Invoice.find({ poNumber });

    if (!po || grns.length === 0 || invoices.length === 0) {
        return { status: "insufficient documents", reasons: ["Missing PO, GRN, or Invoice"] };
    }

    let reasons = [];
    let status = "matched";

    // 1. Check Invoice Dates
    invoices.forEach(inv => {
        if (new Date(inv.invoiceDate) > new Date(po.poDate)) {
            reasons.push("invoice_date_after_po_date");
            status = "mismatch";
        }
    });

    // 2. Item Level Matching (Using itemCode as key)
    po.items.forEach(poItem => {
        const totalGrnQty = grns.reduce((sum, grn) => {
            const item = grn.items.find(i => i.itemCode === poItem.itemCode);
            return sum + (item ? item.receivedQuantity : 0);
        }, 0);

        const totalInvQty = invoices.reduce((sum, inv) => {
            const item = inv.items.find(i => i.itemCode === poItem.itemCode);
            return sum + (item ? item.quantity : 0);
        }, 0);

        if (totalGrnQty > poItem.quantity) {
            reasons.push(`grn_qty_exceeds_po_qty for ${poItem.itemCode}`);
            status = "partially_matched";
        }
        if (totalInvQty > totalGrnQty) {
            reasons.push(`invoice_qty_exceeds_grn_qty for ${poItem.itemCode}`);
            status = "mismatch";
        }
        if (totalInvQty > poItem.quantity) {
            reasons.push(`invoice_qty_exceeds_po_qty for ${poItem.itemCode}`);
            status = "mismatch";
        }
    });

    return { status, reasons: [...new Set(reasons)] };
}

module.exports = { performThreeWayMatch };