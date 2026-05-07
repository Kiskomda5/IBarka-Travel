import React, { useState, useEffect } from 'react';
import { db, auth, handleFirestoreError, OperationType } from '../lib/firebase';
import { Transaction, Ticket, Trip } from '../types';
import { collection, query, where, getDocs, orderBy } from 'firebase/firestore';
import { motion } from 'motion/react';
import { CreditCard, ArrowLeft, Clock, CheckCircle2, XCircle, AlertCircle, Loader2, Landmark, MapPin } from 'lucide-react';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';

export default function TransactionHistory({ onBack }: { onBack: () => void }) {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [routes, setRoutes] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchTransactionsAndRoutes = async () => {
      if (!auth.currentUser) return;
      try {
        const q = query(
          collection(db, 'transactions'),
          where('userId', '==', auth.currentUser.uid),
          orderBy('createdAt', 'desc')
        );
        const snapshot = await getDocs(q);
        const txs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Transaction));
        setTransactions(txs);

        // Resolve routes
        const ticketIds = [...new Set(txs.map(tx => tx.ticketId).filter(Boolean))];
        if (ticketIds.length > 0) {
          // Fetch all tickets for the user to map transactions to trips
          const userTicketsQ = query(collection(db, 'tickets'), where('userId', '==', auth.currentUser.uid));
          const userTicketsSnap = await getDocs(userTicketsQ);
          const ticketsMap = Object.fromEntries(userTicketsSnap.docs.map(doc => [doc.id, doc.data() as Ticket]));
          
          const tripIds = [...new Set(Object.values(ticketsMap).map(t => t.tripId))];
          const newRoutes: Record<string, string> = {};

          if (tripIds.length > 0) {
            // Fetch trips to get the from/to names
            const tripsSnap = await getDocs(collection(db, 'trips'));
            const tripsMap = Object.fromEntries(tripsSnap.docs.map(doc => [doc.id, doc.data() as Trip]));

            txs.forEach(tx => {
              const ticket = ticketsMap[tx.ticketId];
              if (ticket) {
                const trip = tripsMap[ticket.tripId];
                if (trip) {
                  newRoutes[tx.id] = `${trip.from} - ${trip.to}`;
                }
              }
            });
          }
          setRoutes(newRoutes);
        }
      } catch (error) {
        handleFirestoreError(error, OperationType.LIST, 'transactions');
      } finally {
        setLoading(false);
      }
    };

    fetchTransactionsAndRoutes();
  }, []);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed': return 'text-green-600 bg-green-50';
      case 'failed': return 'text-red-600 bg-red-50';
      default: return 'text-orange-600 bg-orange-50';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed': return <CheckCircle2 className="w-4 h-4" />;
      case 'failed': return <XCircle className="w-4 h-4" />;
      default: return <Clock className="w-4 h-4" />;
    }
  };

  if (loading) return <div className="py-20 flex justify-center"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;

  return (
    <div className="space-y-8 pb-20">
      <div className="flex items-center gap-4">
        <button 
          onClick={onBack}
          className="w-10 h-10 flex items-center justify-center bg-white border border-slate-200 rounded-full hover:bg-slate-50 transition-all shadow-sm"
        >
          <ArrowLeft className="w-4 h-4 text-slate-600" />
        </button>
        <div>
          <h2 className="text-xl font-black text-slate-800 tracking-tight uppercase tracking-[0.2em]">Historique des Paiements</h2>
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em] mt-1">Vos transactions récentes</p>
        </div>
      </div>

      <div className="grid gap-4">
        {transactions.length === 0 ? (
          <div className="py-20 text-center space-y-4">
            <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mx-auto">
              <Landmark className="w-8 h-8 text-slate-300" />
            </div>
            <p className="text-sm font-bold text-slate-400 uppercase tracking-widest italic">Aucune transaction trouvée</p>
          </div>
        ) : (
          transactions.map((tx, index) => (
            <motion.div
              key={tx.id}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: index * 0.05 }}
              className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm flex items-center justify-between group hover:border-primary/20 transition-all"
            >
              <div className="flex items-center gap-6">
                <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${getStatusColor(tx.status)}`}>
                  {getStatusIcon(tx.status)}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-black uppercase tracking-widest text-slate-400">{tx.provider}</span>
                    <span className="text-[10px] text-slate-300 tabular-nums">#{tx.id.slice(-8).toUpperCase()}</span>
                  </div>
                  <h4 className="text-sm font-bold text-slate-800 mt-0.5 flex items-center gap-2">
                    {routes[tx.id] ? (
                      <>
                        <MapPin className="w-3 h-3 text-primary" />
                        {routes[tx.id]}
                      </>
                    ) : (
                      tx.status === 'completed' ? 'Paiement de billet' : 'Tentative de paiement'
                    )}
                  </h4>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">
                    {tx.createdAt?.toDate ? format(tx.createdAt.toDate(), "d MMM yyyy 'à' HH:mm", { locale: fr }) : 'Date inconnue'}
                  </p>
                </div>
              </div>

              <div className="text-right">
                <p className="text-base font-black text-slate-800 tracking-tight italic">
                  {tx.amount.toLocaleString()} <span className="text-[10px] uppercase font-bold not-italic">FCFA</span>
                </p>
                <div className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-widest mt-2 ${getStatusColor(tx.status)}`}>
                  {tx.status === 'completed' ? 'Succès' : tx.status === 'failed' ? 'Échoué' : 'En attente'}
                </div>
              </div>
            </motion.div>
          ))
        )}
      </div>
    </div>
  );
}
