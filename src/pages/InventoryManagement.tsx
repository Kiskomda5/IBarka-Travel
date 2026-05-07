import React, { useState, useEffect } from 'react';
import { db, auth, handleFirestoreError, OperationType } from '../lib/firebase';
import { PhysicalTicket, TicketBatch, Company } from '../types';
import { collection, query, where, getDocs, addDoc, serverTimestamp, writeBatch, doc } from 'firebase/firestore';
import { motion, AnimatePresence } from 'motion/react';
import { Package, Plus, Import, AlertTriangle, Layers, Tag, Loader2, ChevronRight, CheckCircle2 } from 'lucide-react';

export default function InventoryManagement() {
  const [batches, setBatches] = useState<TicketBatch[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [stocks, setStocks] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [showBatchModal, setShowBatchModal] = useState(false);

  // Form states
  const [selectedCompanyId, setSelectedCompanyId] = useState('');
  const [prefix, setPrefix] = useState('');
  const [startNum, setStartNum] = useState('');
  const [endNum, setEndNum] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetchInventoryData();
  }, []);

  const fetchInventoryData = async () => {
    try {
      setLoading(true);
      const [companiesSnap, batchesSnap, ticketsSnap] = await Promise.all([
        getDocs(collection(db, 'companies')),
        getDocs(collection(db, 'ticketBatches')),
        getDocs(query(collection(db, 'physicalTickets'), where('status', '==', 'available')))
      ]);

      const comps = companiesSnap.docs.map(d => ({ id: d.id, ...d.data() } as Company));
      const bats = batchesSnap.docs.map(d => ({ id: d.id, ...d.data() } as TicketBatch));
      
      const stockCount: Record<string, number> = {};
      ticketsSnap.docs.forEach(d => {
        const t = d.data() as PhysicalTicket;
        stockCount[t.companyId] = (stockCount[t.companyId] || 0) + 1;
      });

      setCompanies(comps);
      setBatches(bats);
      setStocks(stockCount);
    } catch (error) {
      handleFirestoreError(error, OperationType.LIST, 'inventory');
    } finally {
      setLoading(false);
    }
  };

  const handleImportBatch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCompanyId || !prefix || !startNum || !endNum) return;

    try {
      setSubmitting(true);
      const start = parseInt(startNum);
      const end = parseInt(endNum);
      const count = end - start + 1;

      if (count <= 0 || count > 500) {
        alert("La plage doit être comprise entre 1 et 500 tickets à la fois.");
        return;
      }

      // Create Batch record
      const batchRef = await addDoc(collection(db, 'ticketBatches'), {
        companyId: selectedCompanyId,
        prefix,
        startNumber: start,
        endNumber: end,
        count,
        createdAt: serverTimestamp()
      });

      // Create individual tickets using batch writes (Firestore limited to 500 ops per transaction)
      const firestoreBatch = writeBatch(db);
      for (let i = start; i <= end; i++) {
        const serial = `${prefix}-${i.toString().padStart(5, '0')}`;
        const ticketRef = doc(collection(db, 'physicalTickets'));
        firestoreBatch.set(ticketRef, {
          companyId: selectedCompanyId,
          serialNumber: serial,
          batchId: batchRef.id,
          status: 'available',
          createdAt: serverTimestamp()
        });
      }

      await firestoreBatch.commit();
      setShowBatchModal(false);
      await fetchInventoryData();
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'physicalTickets');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <div className="py-20 flex justify-center"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;

  return (
    <div className="space-y-8 pb-20">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-black text-slate-800 tracking-tight uppercase tracking-[0.2em]">Gestion de l'Inventaire</h2>
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em] mt-1">Stock de tickets physiques</p>
        </div>
        <button 
          onClick={() => setShowBatchModal(true)}
          className="flex items-center justify-center gap-2 px-6 py-3 bg-dark text-white rounded-lg text-[10px] font-black uppercase tracking-widest hover:bg-black transition-all shadow-lg"
        >
          <Import className="w-4 h-4" />
          Importer Lot
        </button>
      </div>

      {/* Stock Levels */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {companies.map(company => {
          const count = stocks[company.id] || 0;
          const isLow = count < 50;

          return (
            <motion.div 
              key={company.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm relative overflow-hidden"
            >
              {isLow && (
                <div className="absolute top-0 right-0 p-2 bg-red-50 text-red-600 rounded-bl-xl border-l border-b border-red-100 flex items-center gap-1">
                  <AlertTriangle className="w-3 h-3" />
                  <span className="text-[8px] font-black uppercase tracking-widest">Stock Bas</span>
                </div>
              )}
              
              <div className="flex items-center gap-4 mb-6">
                <div className="w-12 h-12 bg-slate-100 rounded-lg flex items-center justify-center">
                  <Package className="w-6 h-6 text-slate-400" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-800 text-sm">{company.name}</h3>
                  <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">{count} tickets dispos</p>
                </div>
              </div>

              <div className="space-y-4">
                <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
                  <div 
                    className={`h-full rounded-full transition-all duration-1000 ${isLow ? 'bg-red-500' : 'bg-primary'}`}
                    style={{ width: `${Math.min((count / 200) * 100, 100)}%` }}
                  />
                </div>
                <div className="flex justify-between items-center text-[10px] font-black uppercase tracking-widest">
                  <span className="text-slate-400">Capacité de réserve</span>
                  <span className={isLow ? 'text-red-600' : 'text-slate-700'}>{count}/200+</span>
                </div>
              </div>
            </motion.div>
          );
        })}
      </div>

      {/* Recent Batches */}
      <section className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50">
          <h3 className="text-[10px] font-black uppercase tracking-widest text-slate-500 tracking-[0.2em]">Historique des Importations</h3>
          <Layers className="w-4 h-4 text-slate-400" />
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr>
                <th className="px-8 py-4 text-[10px] font-black uppercase tracking-widest text-slate-400 border-b border-slate-100">Compagnie</th>
                <th className="px-8 py-4 text-[10px] font-black uppercase tracking-widest text-slate-400 border-b border-slate-100">Série</th>
                <th className="px-8 py-4 text-[10px] font-black uppercase tracking-widest text-slate-400 border-b border-slate-100">Plage</th>
                <th className="px-8 py-4 text-[10px] font-black uppercase tracking-widest text-slate-400 border-b border-slate-100">Quantité</th>
                <th className="px-8 py-4 text-[10px] font-black uppercase tracking-widest text-slate-400 border-b border-slate-100">Actions</th>
              </tr>
            </thead>
            <tbody>
              {batches.length === 0 ? (
                <tr><td colSpan={5} className="p-12 text-center text-slate-400 italic text-xs">Aucune importation enregistrée</td></tr>
              ) : batches.map(batch => (
                <tr key={batch.id} className="group hover:bg-slate-50 transition-colors">
                  <td className="px-8 py-5 border-b border-slate-50">
                    <p className="text-xs font-bold text-slate-700">{companies.find(c => c.id === batch.companyId)?.name}</p>
                  </td>
                  <td className="px-8 py-5 border-b border-slate-50">
                    <span className="px-2 py-1 bg-slate-100 rounded text-[10px] font-mono font-bold text-slate-500">{batch.prefix}</span>
                  </td>
                  <td className="px-8 py-5 border-b border-slate-50">
                    <p className="text-xs font-bold text-slate-700">{batch.startNumber} ➔ {batch.endNumber}</p>
                  </td>
                  <td className="px-8 py-5 border-b border-slate-50">
                    <p className="text-xs font-black text-primary">{batch.count}</p>
                  </td>
                  <td className="px-8 py-5 border-b border-slate-50">
                    <button className="text-[10px] font-black uppercase tracking-widest text-slate-400 hover:text-primary transition-colors">Détails</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Import Modal */}
      <AnimatePresence>
        {showBatchModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }} 
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white w-full max-w-md rounded-2xl p-8 shadow-2xl space-y-6"
            >
              <div className="flex justify-between items-center mb-2">
                <h3 className="text-sm font-black text-slate-800 uppercase tracking-[0.2em]">Nouveau Lot de Tickets</h3>
                <button onClick={() => setShowBatchModal(false)} className="text-slate-400 hover:text-slate-600 font-bold">×</button>
              </div>

              <form onSubmit={handleImportBatch} className="space-y-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Compagnie de Transport</label>
                  <select 
                    required 
                    value={selectedCompanyId} 
                    onChange={e => setSelectedCompanyId(e.target.value)}
                    className="w-full h-12 px-4 bg-slate-50 border border-slate-200 rounded-lg text-sm font-bold outline-none focus:border-primary appearance-none"
                  >
                    <option value="">Sélectionner la compagnie</option>
                    {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Préfixe (ex: TSR)</label>
                    <input 
                      required 
                      type="text" 
                      value={prefix} 
                      onChange={e => setPrefix(e.target.value.toUpperCase())}
                      className="w-full h-12 px-4 bg-slate-50 border border-slate-200 rounded-lg text-sm font-bold outline-none focus:border-primary"
                      placeholder="ABC"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Nombre de tickets</label>
                    <div className="w-full h-12 flex items-center justify-center bg-slate-100 rounded-lg text-xs font-black text-slate-500">
                      {startNum && endNum ? Math.max(0, parseInt(endNum) - parseInt(startNum) + 1) : 0}
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">N° de début</label>
                    <input 
                      required 
                      type="number" 
                      value={startNum} 
                      onChange={e => setStartNum(e.target.value)}
                      className="w-full h-12 px-4 bg-slate-50 border border-slate-200 rounded-lg text-sm font-bold outline-none focus:border-primary"
                      placeholder="1001"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">N° de fin</label>
                    <input 
                      required 
                      type="number" 
                      value={endNum} 
                      onChange={e => setEndNum(e.target.value)}
                      className="w-full h-12 px-4 bg-slate-50 border border-slate-200 rounded-lg text-sm font-bold outline-none focus:border-primary"
                      placeholder="1500"
                    />
                  </div>
                </div>

                <div className="pt-4 flex gap-3">
                  <button 
                    type="button" 
                    onClick={() => setShowBatchModal(false)}
                    className="flex-1 h-12 bg-slate-100 text-slate-600 rounded-lg text-[10px] font-black uppercase tracking-widest hover:bg-slate-200"
                  >
                    Annuler
                  </button>
                  <button 
                    type="submit" 
                    disabled={submitting}
                    className="flex-1 h-12 bg-primary text-white rounded-lg text-[10px] font-black uppercase tracking-widest hover:bg-dark disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                    Générer Stock
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
