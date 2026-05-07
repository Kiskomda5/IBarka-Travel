import { jsPDF } from 'jspdf';
import { Ticket, Trip, Company } from '../types';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';

export const generateTicketPDF = async (ticket: Ticket, trip?: Trip, company?: Company) => {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const centerX = pageWidth / 2;

  // Header - Brand
  doc.setFillColor(30, 58, 138); // Primary color
  doc.rect(0, 0, pageWidth, 40, 'F');
  
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(24);
  doc.setFont('helvetica', 'bold');
  doc.text('FASOTRANS', centerX, 20, { align: 'center' });
  
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text('VOTRE PASS DE VOYAGE NUMÉRIQUE', centerX, 30, { align: 'center' });

  // Main Ticket Card
  const margin = 20;
  const cardY = 50;
  const cardWidth = pageWidth - (margin * 2);
  const cardHeight = 120;

  doc.setDrawColor(226, 232, 240);
  doc.setFillColor(255, 255, 255);
  doc.roundedRect(margin, cardY, cardWidth, cardHeight, 3, 3, 'FD');

  // Trip Info
  doc.setTextColor(30, 41, 59);
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  
  const from = trip?.from || 'N/A';
  const to = trip?.to || 'N/A';
  doc.text(`${from}   ->   ${to}`, centerX, cardY + 15, { align: 'center' });

  doc.setDrawColor(241, 245, 249);
  doc.line(margin + 5, cardY + 25, margin + cardWidth - 5, cardY + 25);

  // Column Layout
  const col1 = margin + 10;
  const col2 = centerX + 5;

  // Passenger Info
  doc.setFontSize(8);
  doc.setTextColor(148, 163, 184);
  doc.text('PASSAGER', col1, cardY + 35);
  doc.setTextColor(30, 41, 59);
  doc.setFontSize(11);
  doc.text(ticket.passengerName, col1, cardY + 42);

  doc.setFontSize(8);
  doc.setTextColor(148, 163, 184);
  doc.text('TÉLÉPHONE', col2, cardY + 35);
  doc.setTextColor(30, 41, 59);
  doc.setFontSize(11);
  doc.text(ticket.passengerPhone, col2, cardY + 42);

  // Date & Time
  const departureDate = trip?.departureTime?.toDate ? format(trip.departureTime.toDate(), 'dd MMMM yyyy', { locale: fr }) : 'N/A';
  const departureTime = trip?.departureTime?.toDate ? format(trip.departureTime.toDate(), 'HH:mm', { locale: fr }) : 'N/A';

  doc.setFontSize(8);
  doc.setTextColor(148, 163, 184);
  doc.text('DATE DE DÉPART', col1, cardY + 55);
  doc.setTextColor(30, 41, 59);
  doc.setFontSize(11);
  doc.text(departureDate, col1, cardY + 62);

  doc.setFontSize(8);
  doc.setTextColor(148, 163, 184);
  doc.text('HEURE', col2, cardY + 55);
  doc.setTextColor(30, 41, 59);
  doc.setFontSize(11);
  doc.text(departureTime, col2, cardY + 62);

  // Seat & Price
  doc.setFontSize(8);
  doc.setTextColor(148, 163, 184);
  doc.text('SIÈGE', col1, cardY + 75);
  doc.setTextColor(30, 58, 138); // Primary
  doc.setFontSize(18);
  doc.setFont('helvetica', 'bold');
  doc.text(ticket.seatNumber, col1, cardY + 85);

  doc.setFontSize(8);
  doc.setTextColor(148, 163, 184);
  doc.text('PRIX', col2, cardY + 75);
  doc.setTextColor(30, 41, 59);
  doc.setFontSize(14);
  doc.text(`${ticket.price.toLocaleString()} FCFA`, col2, cardY + 85);

  // Company Info
  doc.setDrawColor(241, 245, 249);
  doc.line(margin + 5, cardY + 95, margin + cardWidth - 5, cardY + 95);

  doc.setFontSize(8);
  doc.setTextColor(148, 163, 184);
  doc.text('COMPAGNIE', col1, cardY + 105);
  doc.setTextColor(30, 41, 59);
  doc.setFontSize(10);
  doc.text(company?.name || 'Transport Excellence', col1, cardY + 112);

  doc.setFontSize(8);
  doc.setTextColor(148, 163, 184);
  doc.text('MATRICULE PHYSIQUE', col2, cardY + 105);
  doc.setTextColor(30, 58, 138);
  doc.setFontSize(10);
  doc.text(ticket.physicalSerialNumber || 'N/A', col2, cardY + 112);

  // QR Code Area
  const qrSize = 50;
  const qrY = cardY + cardHeight + 20;

  // Note: For real QR code in PDF, we'd need to convert the SVG/Canvas to a data URL
  // For this implementation, we will use a placeholder or better, we can use a library to draw QR in PDF
  // But since we have the QR rendered in the UI, we could pass its dataURL
  
  doc.setTextColor(148, 163, 184);
  doc.setFontSize(9);
  doc.text('SCANNNEZ CE CODE À L\'EMBARQUEMENT', centerX, qrY - 5, { align: 'center' });
  
  doc.setDrawColor(30, 58, 138);
  doc.setLineWidth(1);
  doc.rect(centerX - (qrSize/2) - 2, qrY - 2, qrSize + 4, qrSize + 4);
  
  doc.setFontSize(8);
  doc.text(`ID Ticket: ${ticket.id.toUpperCase()}`, centerX, qrY + qrSize + 10, { align: 'center' });

  // Footer
  doc.setFontSize(7);
  doc.setTextColor(148, 163, 184);
  const footerY = doc.internal.pageSize.getHeight() - 20;
  doc.text('Billet non-remboursable. Présentez-vous 30 minutes avant le départ.', centerX, footerY, { align: 'center' });
  doc.text('Généré par FasoTrans © 2024', centerX, footerY + 5, { align: 'center' });

  // Save the PDF
  doc.save(`Ticket_${ticket.id.slice(-8).toUpperCase()}_${ticket.passengerName.replace(/\s+/g, '_')}.pdf`);
};
