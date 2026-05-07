import { useState, useEffect } from 'react';
import { collection, query, where, onSnapshot, orderBy } from 'firebase/firestore';
import { db, auth, handleFirestoreError, OperationType } from '../lib/firebase';
import { Ticket, Trip, Company } from '../types';
import { QRCodeSVG } from 'qrcode.react';
import { motion, AnimatePresence } from 'motion/react';
import { Ticket as TicketIcon, Calendar, Clock, MapPin, ChevronRight, X, User, Bus, Download, PhoneCall, Globe } from 'lucide-react';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { doc, getDoc } from 'firebase/firestore';
import { generateTicketPDF } from '../lib/pdfGenerator';

interface PassengerHistoryProps {
  onSelectTrip: (id: string) => void;
}

export default function PassengerHistory({ onSelectTrip }: PassengerHistoryProps) {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null);
  const [selectedTrip, setSelectedTrip] = useState<Trip | null>(null);
  const [selectedCompany, setSelectedCompany] = useState<Company | null>(null);
  const [fetchingDetails, setFetchingDetails] = useState(false);

  useEffect(() => {
    if (!selectedTicket) {
      setSelectedTrip(null);
      setSelectedCompany(null);
      return;
    }

    const fetchDetails = async () => {
      setFetchingDetails(true);
      try {
        const tripSnap = await getDoc(doc(db, 'trips', selectedTicket.tripId));
        if (tripSnap.exists()) {
          const tripData = { id: tripSnap.id, ...tripSnap.data() } as Trip;
          setSelectedTrip(tripData);
          
          const companySnap = await getDoc(doc(db, 'companies', selectedTicket.companyId));
          if (companySnap.exists()) {
            setSelectedCompany({ id: companySnap.id, ...companySnap.data() } as Company);
          }
        }
      } catch (err) {
        console.error("Error fetching ticket details:", err);
      } finally {
        setFetchingDetails(false);
      }
    };

    fetchDetails();
  }, [selectedTicket]);

  useEffect(() => {
    if (!auth.currentUser) return;

    const ticketsRef = collection(db, 'tickets');
    const q = query(
      ticketsRef,
      where('userId', '==', auth.currentUser.uid),
      orderBy('createdAt', 'desc')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const ticketsData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Ticket[];
      setTickets(ticketsData);
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'tickets');
    });

    return () => unsubscribe();
  }, []);

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between px-2">
        <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
          <TicketIcon className="w-5 h-5 text-primary" />
          Mes Billets
        </h2>
        <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Total: {tickets.length}</span>
      </div>

      {loading ? (
        <div className="py-20 flex justify-center"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>
      ) : tickets.length === 0 ? (
        <div className="bg-white rounded-xl p-16 text-center border border-dashed border-slate-200">
          <div className="w-20 h-20 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-6 border border-slate-100">
            <TicketIcon className="w-10 h-10 text-slate-300" />
          </div>
          <h3 className="text-lg font-bold text-slate-800 mb-2">Aucun billet trouvé</h3>
          <p className="text-slate-500 text-sm mb-8 max-w-xs mx-auto font-medium">Vous n'avez pas encore réservé de voyage sur FasoTrans.</p>
          <button 
            onClick={() => onSelectTrip('')}
            className="px-8 py-4 bg-primary text-white rounded-lg font-bold hover:bg-dark transition-all shadow-lg shadow-primary/10"
          >
            Réserver un voyage
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {tickets.map((ticket) => (
            <motion.div
              key={ticket.id}
              whileHover={{ y: -4 }}
              onClick={() => setSelectedTicket(ticket)}
              className="bg-white rounded-xl shadow-md border border-slate-200 hover:border-primary overflow-hidden cursor-pointer flex flex-col group transition-all"
            >
              {/* Ticket Header */}
              <div className="bg-primary p-4 text-white flex justify-between items-center relative overflow-hidden shrink-0">
                <div className="absolute -right-4 -top-4 w-16 h-16 bg-white/10 rounded-full blur-xl group-hover:animate-pulse"></div>
                <div className="relative z-10 flex items-center gap-2">
                   <div className="w-8 h-8 bg-white/10 rounded-lg flex items-center justify-center">
                     <Bus className="w-4 h-4" />
                   </div>
                   <div>
                     <p className="text-[9px] font-black uppercase tracking-widest opacity-60">Passager</p>
                     <p className="font-bold text-xs tracking-tight truncate max-w-[120px]">{ticket.passengerName}</p>
                   </div>
                </div>
                <div className="text-right relative z-10">
                  <p className="text-[9px] font-black uppercase tracking-widest opacity-60">Siège</p>
                  <p className="font-black text-secondary text-xl">{ticket.seatNumber}</p>
                </div>
              </div>

              {/* Ticket Summary Section */}
              <div className="p-5 flex-1 flex flex-col justify-between">
                <div>
                   <div className="flex items-center gap-3 mb-4">
                     <div className="flex-1">
                        <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Trajet</p>
                        <p className="font-black text-slate-700 uppercase leading-none truncate underline decoration-primary decoration-4 underline-offset-4">
                          {ticket.from} ➔ {ticket.to}
                        </p>
                     </div>
                   </div>

                   <div className="grid grid-cols-2 gap-4 pb-4 border-b border-slate-100">
                      <div>
                        <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-1">Date</p>
                        <div className="flex items-center gap-2 text-[11px] font-bold text-slate-600">
                          <Calendar className="w-3 h-3 text-primary" />
                          24 Mai 2024
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-1">Heure</p>
                        <div className="flex items-center gap-2 text-[11px] font-bold text-slate-600 justify-end">
                          <Clock className="w-3 h-3 text-primary" />
                          07:30
                        </div>
                      </div>
                   </div>
                </div>

                <div className="pt-4 flex items-center justify-between">
                  <div>
                    <span className={`text-[9px] font-black uppercase tracking-widest px-2 py-1 rounded border ${
                      ticket.status === 'paid' ? 'bg-green-50 text-green-600 border-green-100' : 
                      ticket.status === 'used' ? 'bg-slate-50 text-slate-400 border-slate-200' : 
                      'bg-red-50 text-red-600 border-red-100'
                    }`}>
                      {ticket.status === 'paid' ? 'Valide' : ticket.status === 'used' ? 'Utilisé' : 'Annulé'}
                    </span>
                  </div>
                  <div className="p-1.5 bg-slate-50 rounded border border-slate-100 group-hover:bg-primary/5 transition-colors">
                     <QRCodeSVG value={ticket.id} size={40} level="M" />
                  </div>
                </div>
              </div>

              {/* Perforation Divider */}
              <div className="flex relative items-center">
                 <div className="absolute left-[-8px] w-4 h-4 rounded-full bg-surface border-r border-slate-200"></div>
                 <div className="w-full border-t border-dashed border-slate-200 mx-4"></div>
                 <div className="absolute right-[-8px] w-4 h-4 rounded-full bg-surface border-l border-slate-200"></div>
              </div>

              <div className="p-3 bg-slate-50 flex items-center justify-center text-[9px] font-black uppercase tracking-[0.2em] text-slate-400">
                 Détails du Billet ➔
              </div>
            </motion.div>
          ))}
        </div>
      )}

      {/* Ticket QR Modal */}
      <AnimatePresence>
        {selectedTicket && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-dark/60 backdrop-blur-md">
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white w-full max-w-sm rounded-2xl overflow-hidden shadow-2xl relative border-t-8 border-primary"
            >
              <button 
                onClick={() => setSelectedTicket(null)}
                className="absolute top-4 right-4 p-2 bg-slate-100 text-slate-400 rounded-full hover:bg-slate-200 hover:text-slate-600 transition-all z-10"
              >
                <X className="w-4 h-4" />
              </button>

              <div className="p-10 space-y-8 flex flex-col items-center">
                <div className="text-center">
                   <h3 className="text-xl font-black text-primary uppercase tracking-wider mb-1">Pass pour le Voyage</h3>
                   <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em]">Transport Excellence</p>
                </div>

                <div className="p-4 bg-white border-2 border-slate-200 rounded-2xl shadow-sm relative group">
                   <QRCodeSVG 
                    value={selectedTicket.qrCode} 
                    size={220} 
                    level="H"
                    includeMargin={true}
                    className="group-hover:scale-105 transition-transform"
                  />
                  <div className="absolute -bottom-3 left-1/2 -translate-x-1/2 bg-primary text-white px-3 py-1 rounded-full whitespace-nowrap shadow-md">
                    <p className="text-[10px] font-black tracking-widest uppercase">Scanner à bord</p>
                  </div>
                </div>

                <div className="w-full grid grid-cols-2 gap-8 pt-4">
                  <div className="space-y-1">
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Place No.</p>
                    <p className="text-3xl font-black text-slate-800">{selectedTicket.seatNumber}</p>
                  </div>
                  <div className="space-y-1 text-right">
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Date/Heure</p>
                    <p className="text-lg font-bold text-slate-800">24 Mai</p>
                    <p className="text-xs font-bold text-primary">07:30 AM</p>
                  </div>
                </div>

                <div className="w-full p-4 bg-slate-50 border border-slate-100 rounded-xl space-y-3">
                   <div className="flex justify-between items-center text-[10px] font-bold">
                      <span className="text-slate-400 uppercase tracking-widest">Passager</span>
                      <span className="text-slate-800 truncate max-w-[150px]">{selectedTicket.passengerName}</span>
                   </div>
                   <div className="flex justify-between items-center text-[10px] font-bold">
                      <span className="text-slate-400 uppercase tracking-widest">ID Ticket</span>
                      <span className="text-slate-800 tabular-nums">#{selectedTicket.id.slice(-8).toUpperCase()}</span>
                   </div>
                   {selectedTicket.physicalSerialNumber && (
                     <div className="flex justify-between items-center text-[10px] font-bold">
                        <span className="text-slate-400 uppercase tracking-widest">Matricule Physique</span>
                        <span className="text-primary font-black tracking-widest">{selectedTicket.physicalSerialNumber}</span>
                     </div>
                   )}
                   <div className="flex justify-between items-center pt-2 border-t border-slate-200">
                      <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Statut</span>
                      <span className={`text-[10px] font-black uppercase tracking-widest ${selectedTicket.status === 'paid' ? 'text-green-600' : 'text-slate-400'}`}>
                        {selectedTicket.status === 'paid' ? 'PRÊT À L\'EMBARQUEMENT' : 'DÉJÀ VALIDÉ'}
                      </span>
                   </div>
                </div>
              </div>

              <button 
                onClick={() => {
                  if (selectedTicket) {
                    generateTicketPDF(selectedTicket, selectedTrip || undefined, selectedCompany || undefined);
                  }
                }}
                disabled={fetchingDetails}
                className="w-full py-4 bg-slate-100 text-slate-500 font-bold uppercase text-[11px] tracking-widest hover:bg-slate-200 transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {fetchingDetails ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Download className="w-4 h-4" />
                )}
                Télécharger le Billet (PDF)
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

function Loader2({ className }: { className?: string }) {
  return (
    <svg className={className} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 12a9 9 0 1 1-6.219-8.56" />
    </svg>
  );
}
