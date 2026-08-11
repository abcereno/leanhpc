import React, { useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Container, Button, Spinner, Alert } from "react-bootstrap";
import html2canvas from "html2canvas"; 
import jsPDF from "jspdf"; 

// Imports
import { useProgressReportData } from "../../../hooks/useProgressReportData"; 
import ProgressReportLayout from "./ProgressReportLayout"; 
import ProgressReportDetails from "./ProgressReportDetails"; 
import PdfPreviewModal from "../ui/PdfPreviewModal";
import { delay, waitForImages } from "../../../utils/pdfExport";
import { useToast } from "../ui/ToastNotifier";

export default function ClientProgressPage() {
  const { addToast } = useToast();
  const { clientId } = useParams();
  const navigate = useNavigate();
  
  // Data Fetching
  const { data, startSnapshot, currentSnapshot, loading, error } = useProgressReportData(clientId);
  
  const [busy, setBusy] = useState(false);
  const [openPreview, setOpenPreview] = useState(false);
  const [previewPdfUrl, setPreviewPdfUrl] = useState(null); 
  
  const stageRef = useRef(null);
  const [renderForStage, setRenderForStage] = useState(false);

  // --- MULTI-PAGE PDF GENERATOR ---
  async function generatePDF(action = 'download') {
    setBusy(true);
    setRenderForStage(true); 
    
    try {
        await delay(800); 
        await waitForImages(stageRef.current);

        const pageElements = stageRef.current.querySelectorAll(".print-page");
        if (pageElements.length === 0) throw new Error("Print pages not found");

        const pdf = new jsPDF('p', 'mm', 'a4');
        
        const margin = 12; 
        const pdfWidth = pdf.internal.pageSize.getWidth();   // 210mm
        const pdfHeight = pdf.internal.pageSize.getHeight(); // 297mm
        const usableWidth = pdfWidth - (margin * 2);
        const usableHeight = pdfHeight - (margin * 2);

        for (let i = 0; i < pageElements.length; i++) {
            const element = pageElements[i];
            
            const canvas = await html2canvas(element, { 
                scale: 2, 
                useCORS: true,
                logging: false,
                windowWidth: 794, 
                backgroundColor: '#ffffff' // 👈 Force html2canvas background
            });
            
            // 👇 FIX 1: Export as JPEG to completely eliminate transparency 👇
            const imgData = canvas.toDataURL('image/jpeg', 1.0);

            const imgWidth = usableWidth;
            const imgHeight = (canvas.height * imgWidth) / canvas.width;
            
            let heightLeft = imgHeight;
            let position = margin; 

            if (i === 0) {
                // 👇 FIX 2: Paint the very first PDF page pure white 👇
                pdf.setFillColor(255, 255, 255);
                pdf.rect(0, 0, pdfWidth, pdfHeight, 'F');
            } else {
                pdf.addPage();
                // Paint subsequent pages pure white before drawing
                pdf.setFillColor(255, 255, 255);
                pdf.rect(0, 0, pdfWidth, pdfHeight, 'F');
            }

            // Draw image (Now using JPEG)
            pdf.addImage(imgData, 'JPEG', margin, position, imgWidth, imgHeight);
            
            // Bottom margin mask
            pdf.setFillColor(255, 255, 255);
            pdf.rect(0, pdfHeight - margin, pdfWidth, margin, 'F');

            heightLeft -= usableHeight;

            // Magic Slicer for overflowing content
            while (heightLeft > 5) { 
                position -= usableHeight; 
                pdf.addPage();
                
                // 👇 Paint new slice pages pure white 👇
                pdf.setFillColor(255, 255, 255);
                pdf.rect(0, 0, pdfWidth, pdfHeight, 'F');

                pdf.addImage(imgData, 'JPEG', margin, position, imgWidth, imgHeight);
                
                // Top and Bottom margin masks
                pdf.setFillColor(255, 255, 255);
                pdf.rect(0, 0, pdfWidth, margin, 'F'); 
                pdf.rect(0, pdfHeight - margin, pdfWidth, margin, 'F'); 
                
                heightLeft -= usableHeight;
            }
        }

        // --- OUTPUT HANDLER ---
        if (action === 'download') {
            pdf.save(`Progress_Report_${data?.clientName || 'Client'}.pdf`);
            setOpenPreview(false);
        } else {
            const pdfBlobUrl = pdf.output('bloburl');
            setPreviewPdfUrl(pdfBlobUrl);
            setOpenPreview(true);
        }

    } catch (err) {
        console.error(err);
        addToast({ title: "PDF Generation Failed", message: err.message, variant: "danger", icon: "bi-exclamation-triangle-fill" });
    } finally {
        setRenderForStage(false); 
        setBusy(false);
    }
  }

  if (loading) return <Container className="p-5 text-center"><Spinner animation="border" /></Container>;
  if (error || !data) return <Container className="p-5 text-center"><Alert variant="danger">No report data found.</Alert></Container>;

  return (
    <Container className="py-4 client-progress-page-root">
      {/* Actions Bar */}
      <div className="d-flex justify-content-between mb-4 no-print">
        <h3 className="fw-bold">Progress Report</h3>
        <div className="d-flex gap-2">
            <Button variant="outline-secondary" onClick={() => navigate(-1)}>Back</Button>
            <Button variant="warning" onClick={() => generatePDF('preview')} disabled={busy}>
               {busy ? "Processing..." : "Preview PDF"}
            </Button>
            <Button variant="primary" onClick={() => generatePDF('download')} disabled={busy}>
               Download PDF
            </Button>
        </div>
      </div>

      {/* DOCUMENT VIEWER (SCREEN) */}
      <div className="report-viewer">
        <div className="report-page">
            <ProgressReportLayout data={data} />
        </div>
        <div className="report-page" style={{ height: 'auto', minHeight: '1123px' }}> 
            <ProgressReportDetails startReport={startSnapshot} currentReport={currentSnapshot} />
        </div>
      </div>

      {/* HIDDEN STAGE (PDF GENERATION) */}
      {/* 👇 FIX 3: Force light theme and white background to prevent Bootstrap dark mode bleed 👇 */}
      <div 
        ref={stageRef} 
        style={{ position: 'absolute', left: '-9999px', top: 0, backgroundColor: '#ffffff', color: '#000000' }} 
        data-bs-theme="light"
      >
        {renderForStage && (
            <div style={{ width: '794px', backgroundColor: '#ffffff' }}>
                <div className="print-page">
                    <ProgressReportLayout data={data} />
                </div>
                <div className="print-page">
                    <ProgressReportDetails startReport={startSnapshot} currentReport={currentSnapshot} />
                </div>
            </div>
        )}
      </div>

      {/* PREVIEW MODAL */}
      <PdfPreviewModal open={openPreview} onClose={() => setOpenPreview(false)} onDownload={() => generatePDF('download')}>
         <div style={{ height: '70vh', width: '100%', backgroundColor: '#ffffff' }}>
            {previewPdfUrl ? (
                <iframe 
                    src={previewPdfUrl} 
                    width="100%" 
                    height="100%" 
                    style={{ border: 'none', borderRadius: '8px', backgroundColor: '#ffffff' }} 
                    title="PDF Preview" 
                />
            ) : (
                <div className="d-flex h-100 justify-content-center align-items-center text-muted">
                    Loading PDF Preview...
                </div>
            )}
         </div>
      </PdfPreviewModal>
    </Container>
  );
}