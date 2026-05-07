import { useState, useCallback, useEffect, useRef } from 'react';
import { doc, getDoc, updateDoc, serverTimestamp, getDocFromCache, getDocFromServer } from 'firebase/firestore';
import { db, auth, handleFirestoreError, OperationType } from '../lib/firebase';
import { Ticket } from '../types';
import { motion, AnimatePresence } from 'motion/react';
import { QrCode, ClipboardList, CheckCircle2, XCircle, Loader2, User, Ticket as TicketIcon, Search, Bell, Camera, StopCircle, Wifi, WifiOff, Upload, RefreshCw } from 'lucide-react';
import { Html5Qrcode } from 'html5-qrcode';

interface OfflineValidation {
  ticketId: string;
  validatedBy: string;
  timestamp: string;
  retries?: number;
  lastError?: string;
}

// Sound utility using Web Audio API to avoid external assets
const playScannerSound = (type: 'success' | 'error') => {
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    
    osc.connect(gain);
    gain.connect(ctx.destination);
    
    if (type === 'success') {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, ctx.currentTime); // A5
      osc.frequency.exponentialRampToValueAtTime(1320, ctx.currentTime + 0.1);
      gain.gain.setValueAtTime(0.1, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);
      osc.start();
      osc.stop(ctx.currentTime + 0.3);
    } else {
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(220, ctx.currentTime);
      gain.gain.setValueAtTime(0.1, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.5);
      osc.start();
      osc.stop(ctx.currentTime + 0.5);
    }
  } catch (e) {
    console.warn("Audio feedback failed:", e);
  }
};

export default function AgentScanner() {
  const [ticketId, setTicketId] = useState('');
  const [loading, setLoading] = useState(false);
  const [validating, setValidating] = useState(false);
  const [flash, setFlash] = useState<'success' | 'error' | null>(null);
  const [result, setResult] = useState<{ success: boolean, message: string, ticket?: Ticket, needsValidation?: boolean } | null>(null);
  const [isScannerActive, setIsScannerActive] = useState(false);
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const [scannerError, setScannerError] = useState<string | null>(null);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [offlineQueue, setOfflineQueue] = useState<OfflineValidation[]>([]);
  const [isSyncing, setIsSyncing] = useState(false);

  // Connectivity monitoring
  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Initial load of offline queue
    const savedQueue = localStorage.getItem('offline_validations');
    if (savedQueue) {
      try {
        setOfflineQueue(JSON.parse(savedQueue));
      } catch (e) {
        console.error("Failed to parse offline queue", e);
      }
    }

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Auto-sync when coming back online
  useEffect(() => {
    if (isOnline && offlineQueue.length > 0 && !isSyncing) {
      syncOfflineValidations();
    }
  }, [isOnline]);

  const syncOfflineValidations = async () => {
    if (isSyncing || offlineQueue.length === 0) return;
    setIsSyncing(true);
    
    const currentQueue = [...offlineQueue];
    const failedSync: OfflineValidation[] = [];

    for (const item of currentQueue) {
      try {
        const ticketRef = doc(db, 'tickets', item.ticketId);
        await updateDoc(ticketRef, {
          status: 'used',
          validatedBy: item.validatedBy,
          updatedAt: serverTimestamp(),
          offlineValidatedAt: item.timestamp
        });
      } catch (err) {
        console.error(`Failed to sync ticket ${item.ticketId}:`, err);
        failedSync.push({
          ...item,
          retries: (item.retries || 0) + 1,
          lastError: err instanceof Error ? err.message : String(err)
        });
      }
    }

    setOfflineQueue(failedSync);
    localStorage.setItem('offline_validations', JSON.stringify(failedSync));
    setIsSyncing(false);
    
    if (failedSync.length < currentQueue.length) {
      playScannerSound('success');
    }

    // Auto-retry mechanism for failed items if we are still online
    if (failedSync.length > 0 && navigator.onLine) {
      console.log(`Scheduling retry for ${failedSync.length} items in 30 seconds...`);
      setTimeout(() => {
        if (navigator.onLine) {
          syncOfflineValidations();
        }
      }, 30000); // Retry after 30 seconds
    }
  };

  const handleCheck = async (idToCheck: string) => {
    if (!idToCheck || loading) return;
    setLoading(true);
    setResult(null);

    // If offline, we perform "Pre-validation"
    if (!isOnline) {
      playScannerSound('success');
      setFlash('success');
      setResult({
        success: true,
        message: "Mode Hors-ligne : Ticket prêt pour enregistrement local.",
        ticket: { 
          id: idToCheck, 
          status: 'paid', 
          passengerName: 'Inconnu (Hors-ligne)', 
          from: '?', 
          to: '?', 
          seatNumber: '?' 
        } as any,
        needsValidation: true
      });
      setTimeout(() => setFlash(null), 500);
      setLoading(false);
      setTicketId('');
      return;
    }

    try {
      const ticketRef = doc(db, 'tickets', idToCheck);
      const ticketSnap = await getDoc(ticketRef);

      if (!ticketSnap.exists()) {
        playScannerSound('error');
        setFlash('error');
        setResult({ success: false, message: "Ticket invalide ou non trouvé." });
        setTimeout(() => setFlash(null), 500);
        return;
      }

      const ticket = { id: ticketSnap.id, ...ticketSnap.data() } as Ticket;

      if (ticket.status === 'used') {
        playScannerSound('error');
        setFlash('error');
        setResult({ success: false, message: "Ce ticket a déjà été utilisé.", ticket, needsValidation: false });
        setTimeout(() => setFlash(null), 500);
        return;
      }

      if (ticket.status === 'cancelled') {
        playScannerSound('error');
        setFlash('error');
        setResult({ success: false, message: "Ce ticket a été annulé.", ticket, needsValidation: false });
        setTimeout(() => setFlash(null), 500);
        return;
      }

      // Ticket is valid (paid) and needs validation
      playScannerSound('success');
      setFlash('success');
      setResult({ 
        success: true, 
        message: "Ticket valide. Prêt pour l'embarquement.", 
        ticket, 
        needsValidation: true 
      });
      
      // Stop scanner on success to focus on validation
      if (isScannerActive) {
        stopScanner();
      }

      setTimeout(() => setFlash(null), 500);
    } catch (error) {
      handleFirestoreError(error, OperationType.GET, `tickets/${idToCheck}`);
      setResult({ success: false, message: "Erreur lors de la vérification." });
    } finally {
      setLoading(false);
      setTicketId('');
    }
  };

  const startScanner = async () => {
    try {
      setScannerError(null);
      const html5QrCode = new Html5Qrcode("scanner-container");
      scannerRef.current = html5QrCode;
      
      const config = { fps: 10, qrbox: { width: 250, height: 250 } };
      
      await html5QrCode.start(
        { facingMode: "environment" },
        config,
        (decodedText) => {
          handleCheck(decodedText);
        },
        (errorMessage) => {
          // ignore normal scan errors like "not detected"
        }
      );
      
      setIsScannerActive(true);
    } catch (err) {
      console.error("Scanner start error:", err);
      setScannerError("Impossible d'accéder à la caméra. Veuillez vérifier les permissions.");
    }
  };

  const stopScanner = async () => {
    if (scannerRef.current && scannerRef.current.isScanning) {
      try {
        await scannerRef.current.stop();
        scannerRef.current = null;
        setIsScannerActive(false);
      } catch (err) {
        console.error("Scanner stop error:", err);
      }
    }
  };

  useEffect(() => {
    return () => {
      // Cleanup scanner on unmount
      if (scannerRef.current && scannerRef.current.isScanning) {
        scannerRef.current.stop().catch(console.error);
      }
    };
  }, []);

  const handleConfirmValidation = async () => {
    if (!result?.ticket) return;
    setValidating(true);

    if (!isOnline) {
      // Offline implementation
      const offlineVal: OfflineValidation = {
        ticketId: result.ticket.id,
        validatedBy: auth.currentUser?.uid || 'anonymous',
        timestamp: new Date().toISOString()
      };

      const newQueue = [...offlineQueue, offlineVal];
      setOfflineQueue(newQueue);
      localStorage.setItem('offline_validations', JSON.stringify(newQueue));

      playScannerSound('success');
      setFlash('success');
      setResult({ 
        success: true, 
        message: "Enregistré localement. Sera synchronisé dès la reconnexion.", 
        ticket: { ...result.ticket, status: 'used' }, 
        needsValidation: false 
      });
      setValidating(false);
      setTimeout(() => setFlash(null), 500);
      return;
    }

    try {
      const ticketRef = doc(db, 'tickets', result.ticket.id);
      await updateDoc(ticketRef, {
        status: 'used',
        validatedBy: auth.currentUser?.uid,
        updatedAt: serverTimestamp()
      });

      playScannerSound('success');
      setFlash('success');
      setResult({ 
        success: true, 
        message: "Ticket validé avec succès ! Bon voyage.", 
        ticket: { ...result.ticket, status: 'used' }, 
        needsValidation: false 
      });
      setTimeout(() => setFlash(null), 500);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `tickets/${result.ticket.id}`);
      alert("Échec de la validation. Veuillez réessayer.");
    } finally {
      setValidating(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-8 pb-12">
      <div className="flex items-center justify-center gap-4 mb-4">
        <div className={`flex items-center gap-2 px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest ${isOnline ? 'bg-green-100 text-green-600' : 'bg-red-100 text-red-600'}`}>
          {isOnline ? <Wifi className="w-3 h-3" /> : <WifiOff className="w-3 h-3" />}
          {isOnline ? 'En ligne' : 'Hors-ligne'}
        </div>
        
        {offlineQueue.length > 0 && (
          <button 
            onClick={syncOfflineValidations}
            disabled={!isOnline || isSyncing}
            className={`flex items-center gap-2 px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest ${isOnline ? 'bg-blue-100 text-blue-600' : 'bg-slate-100 text-slate-400'}`}
          >
            {isSyncing ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Upload className="w-3 h-3" />}
            {offlineQueue.length} Scan{offlineQueue.length > 1 ? 's' : ''} en attente
          </button>
        )}
      </div>

      <div className="text-center space-y-2">
        <h2 className="text-xl font-black text-slate-800 tracking-tight uppercase tracking-[0.2em]">Validation d'Embarquement</h2>
        <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em]">Module Agent de Gare</p>
      </div>

      {/* Scanner Area */}
      <div className="space-y-4">
        <motion.div 
          animate={{ 
            borderColor: flash === 'success' ? '#22c55e' : flash === 'error' ? '#ef4444' : '#e2e8f0',
            scale: flash ? 1.02 : 1
          }}
          className="aspect-square w-full max-w-[400px] mx-auto bg-dark rounded-2xl shadow-2xl relative overflow-hidden group border-4 p-1 flex flex-col items-center justify-center"
        >
          <div id="scanner-container" className="w-full h-full bg-slate-900 rounded-xl relative overflow-hidden flex flex-col items-center justify-center">
              {/* Flash Effect Layer */}
              <AnimatePresence>
                {flash && (
                  <motion.div 
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 0.3 }}
                    exit={{ opacity: 0 }}
                    className={`absolute inset-0 z-20 ${flash === 'success' ? 'bg-green-500' : 'bg-red-500'}`}
                  />
                )}
              </AnimatePresence>

              {!isScannerActive && (
                <div className="absolute inset-0 flex flex-col items-center justify-center p-8 text-white text-center space-y-6 z-10 bg-slate-900">
                  <div className="w-24 h-24 rounded-full bg-slate-800 flex items-center justify-center border-4 border-slate-700 animate-pulse">
                    <QrCode className="w-12 h-12 text-primary" />
                  </div>
                  <div className="space-y-2">
                    <p className="text-sm font-bold tracking-tight">Prêt pour le scan ?</p>
                    <p className="text-[10px] font-black uppercase tracking-[0.2em] opacity-40">Activez la caméra pour valider les tickets</p>
                  </div>
                  {scannerError && (
                    <p className="text-xs font-bold text-red-500 px-4 py-2 bg-red-500/10 rounded-lg border border-red-500/20">
                      {scannerError}
                    </p>
                  )}
                  <button 
                    onClick={startScanner}
                    className="flex items-center gap-3 px-8 py-4 bg-primary text-white rounded-xl text-[10px] font-black uppercase tracking-[0.2em] hover:bg-blue-600 transition-all shadow-lg shadow-primary/20"
                  >
                    <Camera className="w-4 h-4" />
                    Activer la Caméra
                  </button>
                </div>
              )}

              {isScannerActive && (
                <>
                  {/* Animated Scan Line */}
                  <div className="absolute left-0 right-0 h-1 bg-primary shadow-[0_0_15px_rgba(30,58,138,0.8)] animate-scan" style={{ zIndex: 5 }} />
                  
                  <div className="absolute top-4 right-4 z-10">
                    <button 
                      onClick={stopScanner}
                      className="p-3 bg-red-600 text-white rounded-full hover:bg-black transition-all shadow-lg"
                    >
                      <StopCircle className="w-5 h-5" />
                    </button>
                  </div>

                  <div className="absolute bottom-4 left-0 right-0 flex justify-center z-10">
                    <p className="px-4 py-2 bg-black/50 backdrop-blur-md rounded-full text-[8px] font-black uppercase tracking-widest text-white/80 border border-white/10">
                      Veuillez cadrer le QR Code du ticket
                    </p>
                  </div>
                </>
              )}
          </div>
        </motion.div>
        
        {isScannerActive && (
          <div className="flex justify-center">
            <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
              <span className="w-2 h-2 bg-green-500 rounded-full animate-ping" />
              Caméra en cours d'utilisation
            </p>
          </div>
        )}
      </div>

      {/* Manual Input Section */}
      <section className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
        <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-4 text-center">Ou saisie manuelle de l'ID</p>
        
        <div className="flex gap-2">
          <input 
            type="text" 
            value={ticketId}
            onChange={(e) => setTicketId(e.target.value.toUpperCase())}
            placeholder="Ex: abc-123..."
            className="flex-1 h-12 px-4 bg-slate-50 border border-slate-200 rounded-lg focus:border-primary font-mono font-bold text-sm outline-none"
          />
          <button 
            disabled={loading || !ticketId}
            onClick={() => handleCheck(ticketId)}
            className="px-6 h-12 bg-dark text-white rounded-lg font-bold hover:bg-black transition-all flex items-center gap-2 text-[10px] font-black uppercase tracking-widest disabled:opacity-50"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
            Vérifier
          </button>
        </div>
      </section>

      {/* Result Display */}
      <AnimatePresence>
        {result && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className={`p-6 rounded-xl border-2 shadow-xl ${result.success ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'} space-y-6`}
          >
            <div className="flex items-start gap-4">
              <div className={`w-12 h-12 rounded-lg flex items-center justify-center shrink-0 ${result.success ? 'bg-green-600' : 'bg-red-600'} text-white shadow-lg`}>
                {result.success ? <CheckCircle2 className="w-7 h-7" /> : <XCircle className="w-7 h-7" />}
              </div>
              <div className="flex-1 pt-1">
                <h4 className={`text-[10px] font-black uppercase tracking-widest mb-1 ${result.success ? 'text-green-800' : 'text-red-800'}`}>
                  {result.success ? 'Identification' : 'Erreur'}
                </h4>
                <p className={`text-lg font-bold leading-tight ${result.success ? 'text-green-900' : 'text-red-900'}`}>
                  {result.message}
                </p>
                
                {result.ticket && (
                  <div className="mt-4 bg-white/60 border border-white p-4 rounded-lg space-y-3">
                    <div className="flex justify-between items-center text-[10px] font-bold">
                      <span className="text-slate-400 uppercase tracking-widest">Passager</span>
                      <span className="text-slate-800">{result.ticket.passengerName}</span>
                    </div>
                    <div className="flex justify-between items-center text-[10px] font-bold space-x-1">
                      <span className="text-slate-400 uppercase tracking-widest leading-none">Destination</span>
                      <span className="text-slate-800 flex-1 text-right truncate italic">{result.ticket.from} ➔ {result.ticket.to}</span>
                    </div>
                    <div className="flex justify-between items-center pt-2 border-t border-white/40">
                      <span className="text-slate-400 text-[10px] font-black uppercase tracking-widest">Siège No.</span>
                      <span className="text-2xl font-black text-primary">{result.ticket.seatNumber}</span>
                    </div>
                    {result.ticket.physicalSerialNumber && (
                      <div className="flex justify-between items-center pt-2 border-t border-white/40">
                        <span className="text-slate-400 text-[10px] font-black uppercase tracking-widest">Matricule Ticket</span>
                        <span className="text-xs font-black text-slate-700">{result.ticket.physicalSerialNumber}</span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            {result.needsValidation && (
              <button 
                disabled={validating}
                onClick={handleConfirmValidation} 
                className="w-full py-4 bg-primary text-white rounded-lg text-[10px] font-black uppercase tracking-widest hover:bg-dark transition-all shadow-lg shadow-primary/20 flex items-center justify-center gap-2"
              >
                {validating ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                Valider l'Embarquement
              </button>
            )}

            {!result.needsValidation && result.success && (
              <button 
                onClick={() => {
                  setResult(null);
                  startScanner(); // Restart scanner for next passenger
                }} 
                className="w-full py-4 bg-slate-800 text-white rounded-lg text-[10px] font-black uppercase tracking-widest hover:bg-black transition-all shadow-lg"
              >
                Passager Suivant ➔
              </button>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      <style>{`
        #scanner-container video {
          object-fit: cover !important;
          width: 100% !important;
          height: 100% !important;
        }
        @keyframes scan {
          0% { top: 10%; }
          50% { top: 90%; }
          100% { top: 10%; }
        }
        .animate-scan {
          animation: scan 3s linear infinite;
        }
        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          25% { transform: translateX(-5px); }
          75% { transform: translateX(5px); }
        }
        .animate-shake {
          animation: shake 0.2s ease-in-out infinite;
        }
      `}</style>
    </div>
  );
}
