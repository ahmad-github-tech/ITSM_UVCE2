import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { format } from 'date-fns';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDuration(ms: number): string {
  if (ms < 0) return '0m';
  const minutes = Math.floor(ms / 60000);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days}d ${hours % 24}h`;
  if (hours > 0) return `${hours}h ${minutes % 60}m`;
  return `${minutes}m`;
}

export function exportToExcel(sheets: { name: string; data: any[] }[], filename: string) {
  const wb = XLSX.utils.book_new();
  
  sheets.forEach(sheet => {
    const ws = XLSX.utils.json_to_sheet(sheet.data);
    XLSX.utils.book_append_sheet(wb, ws, sheet.name);
  });

  XLSX.writeFile(wb, filename);
}

export function exportToPDF(sheets: { name: string; data: any[] }[], filename: string, chartImages: string[] = [], dateRange?: string) {
  const doc = new jsPDF('landscape');
  const now = format(new Date(), 'MMM dd, yyyy HH:mm');
  
  // Add Chart Images if present
  if (chartImages.length > 0) {
    chartImages.forEach((img, idx) => {
      // 4 charts per page (2x2)
      const chartsPerPage = 4;
      if (idx > 0 && idx % chartsPerPage === 0) doc.addPage();
      
      const col = idx % 2; // 0 or 1
      const row = Math.floor((idx % chartsPerPage) / 2); // 0 or 1
      
      const margin = 14;
      const gap = 8;
      const chartW = 128;
      const chartH = 75;
      
      const xPos = margin + col * (chartW + gap);
      const yPos = 35 + row * (chartH + gap);
      
      // Header for Chart Page
      if (idx % chartsPerPage === 0) {
        doc.setFontSize(18);
        doc.setTextColor(15, 23, 42);
        doc.text('IT Support Visual Analytics', 14, 15);
        if (dateRange) {
          doc.setFontSize(10);
          doc.setTextColor(51, 65, 85);
          doc.text(`Strategic Performance Period: ${dateRange}`, 14, 22);
        }
        doc.setFontSize(10);
        doc.setTextColor(100, 116, 139);
        doc.text(`System Generated: ${now}`, 283, 22, { align: 'right' });
      }

      try {
        if (img && img.length > 100) { // Basic validation
          doc.addImage(img, 'PNG', xPos, yPos, chartW, chartH, undefined, 'FAST');
        }
      } catch (e) {
        console.error('Error adding image to PDF:', e);
      }
    });
    doc.addPage();
  }

  sheets.forEach((sheet, index) => {
    if (index > 0 || (index === 0 && chartImages.length > 0)) doc.addPage();
    
    // Header
    doc.setFontSize(18);
    doc.setTextColor(15, 23, 42); // slate-900
    doc.text('IT Support Service Insights', 14, 15);
    
    doc.setFontSize(10);
    doc.setTextColor(100, 116, 139); // slate-500
    doc.text(`Sheet: ${sheet.name}${dateRange ? ` | Period: ${dateRange}` : ''}`, 14, 22);
    doc.text(`Generated: ${now}`, 283, 22, { align: 'right' });
    
    if (sheet.data.length > 0) {
      const headers = Object.keys(sheet.data[0]);
      const rows = sheet.data.map(row => headers.map(header => row[header] ?? ''));
      
      autoTable(doc, {
        head: [headers],
        body: rows,
        startY: 28,
        styles: { fontSize: 7.5, cellPadding: 2, font: 'helvetica', textColor: [51, 65, 85] },
        headStyles: { fillColor: [30, 41, 59], textColor: 255, fontStyle: 'bold', fontSize: 8 },
        alternateRowStyles: { fillColor: [248, 250, 252] }, // slate-50
        margin: { top: 30, left: 14, right: 14 },
        didParseCell: (data) => {
          if (data.cell.text[0] === 'MET') {
            data.cell.styles.textColor = [16, 185, 129]; // emerald-500
            data.cell.styles.fontStyle = 'bold';
          } else if (data.cell.text[0] === 'NOT MET' || data.cell.text[0] === 'BREACHED') {
            data.cell.styles.textColor = [239, 68, 68]; // red-500
            data.cell.styles.fontStyle = 'bold';
          }
        }
      });
    } else {
      doc.setFontSize(10);
      doc.text('No data points found for this report segment.', 14, 30);
    }

    // Footer
    const pageCount = (doc as any).internal.getNumberOfPages();
    doc.setFontSize(8);
    doc.setTextColor(148, 163, 184); // slate-400
    doc.text(`System Generated Report | Page ${index + 1} of ${pageCount}`, 14, 203);
  });

  doc.save(filename.replace(/\.[^/.]+$/, "") + ".pdf");
}

export function downloadCSV(data: any[], filename: string) {
  const headers = Object.keys(data[0]);
  const csvContent = [
    headers.join(','),
    ...data.map(row => headers.map(header => JSON.stringify(row[header] ?? '')).join(','))
  ].join('\n');

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  if (link.download !== undefined) {
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', filename);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }
}
